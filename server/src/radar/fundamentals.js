// Fundamentales reforzados (fase 2 de docs/CONVICCION.md): lo que cada banco central "debería" hacer y lo que el
// mercado ya descuenta, tipos reales y términos de intercambio. Funciones puras y point-in-time (reciben `now`).
//
//   Regla de Taylor (Taylor 1993; Molodtsova y Papell 2009 para divisas):
//     i* = r* + π + 0,5·(π − 2) + 0,5·brecha           r* = 0,5 ; brecha de actividad = PMI y paro
//     taylor_gap = i* − tasa de política                 (positivo: el banco central va por detrás → divisa al alza)
//   Descontado frente a debido = z(taylor_gap) − z(cambio del bono a 2 años en 3 meses): oportunidad donde el
//     mercado aún no ha puesto en precio lo que piden los datos.
//   Tipo real = tasa de política − inflación interanual.
//   Términos de intercambio: petróleo para CAD (+) y JPY (−), cobre para AUD (+) y NZD (+, menor), 20 días.
import { CURRENCIES, FRED_BY_CURRENCY } from './constants.js';
import { getSeries, seriesAsOf, shiftDays, ymd, changeOverDays } from './sources/fred.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const R_STAR = 0.5;
const PMI_MAX_AGE_DAYS = 60;

let pmiCache = { at: 0, map: null };
/** PMI publicados por divisa [{ at, value, kind }] (manufacturas y servicios), caché de 30 min. */
export function pmiHistory(db) {
  if (pmiCache.map && Date.now() - pmiCache.at < 30 * 60_000) return pmiCache.map;
  const map = Object.fromEntries(CURRENCIES.map((c) => [c, []]));
  const rows = db.prepare(`SELECT country, title, at_utc, actual FROM radar_calendar
    WHERE actual IS NOT NULL AND actual != '' AND (title LIKE '%Manufacturing PMI%' OR title LIKE '%Services PMI%' OR title LIKE '%Composite PMI%')
    AND title NOT LIKE '%Final%' ORDER BY at_utc`).all();
  for (const r of rows) {
    if (!map[r.country]) continue;
    const v = Number(String(r.actual).replace(',', '.'));
    if (!Number.isFinite(v) || v < 20 || v > 80) continue;
    const kind = /Services/i.test(r.title) ? 'services' : /Composite/i.test(r.title) ? 'composite' : 'manufacturing';
    map[r.country].push({ at: r.at_utc, value: v, kind });
  }
  pmiCache = { at: Date.now(), map };
  return map;
}

/** Último PMI conocido a fecha (media de manufacturas y servicios si ambos están dentro de 60 días). */
export function pmiAsOf(hist, nowMs) {
  const limit = nowMs - PMI_MAX_AGE_DAYS * 86400000;
  const last = {};
  for (const r of hist) {
    const t = new Date(r.at).getTime();
    if (t > nowMs) break;
    if (t < limit) continue;
    last[r.kind] = r.value;
  }
  const vals = Object.values(last);
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

/**
 * Taylor, tipo real y "descontado frente a debido" de una divisa.
 * @param {object} o { policy (tasa, %), inflation (interanual, %), d60 (cambio del bono a 2 años en 3 meses, pb|null), now, lagDays, pmi (db) }
 */
export function fundamentalsFor(db, ccy, { policy, inflation, now, lagDays = 0 }) {
  if (policy === null || policy === undefined || inflation === null || inflation === undefined) return { taylor_gap: null, real: null, pmi: null, unemp12: null, gap: null };
  const pmi = pmiAsOf(pmiHistory(db)[ccy] || [], now);
  const cfg = FRED_BY_CURRENCY[ccy];
  let unemp12 = null;
  if (cfg.unemployment) {
    const rows = seriesAsOf(getSeries(db, cfg.unemployment), lagDays ? shiftDays(ymd(now), -lagDays) : null);
    const ch = changeOverDays(rows, cfg.unemployment_quarterly ? 400 : 370);
    if (ch) unemp12 = ch.value;
  }
  // Brecha de actividad en "puntos de PIB" aproximados: PMI por encima de 50 y paro cayendo = economía por encima de tendencia.
  const gapPmi = pmi === null ? null : clamp((pmi - 50) / 2.5, -2, 2);
  const gapUnemp = unemp12 === null ? null : clamp(-unemp12 * 2, -2, 2);
  const gap = gapPmi !== null && gapUnemp !== null ? 0.6 * gapPmi + 0.4 * gapUnemp : gapPmi !== null ? gapPmi : gapUnemp;
  const taylorRate = R_STAR + inflation + 0.5 * (inflation - 2) + 0.5 * (gap ?? 0);
  return {
    taylor_rate: Math.round(taylorRate * 100) / 100,
    taylor_gap: Math.round((taylorRate - policy) * 100) / 100,
    real: Math.round((policy - inflation) * 100) / 100,
    pmi: pmi === null ? null : Math.round(pmi * 10) / 10,
    unemp12: unemp12 === null ? null : Math.round(unemp12 * 100) / 100,
    gap: gap === null ? null : Math.round(gap * 100) / 100,
  };
}

/** Coeficiente de términos de intercambio por divisa: [petróleo, cobre]. */
export const TOT_COEFFS = {
  USD: [0, 0], EUR: [-0.2, 0], GBP: [0, 0], JPY: [-0.4, 0], CHF: [-0.1, 0], CAD: [1, 0], AUD: [0, 1], NZD: [0, 0.5],
};

/** Variación a 20 días de petróleo y cobre (en %), y señal por divisa. */
export function termsOfTrade(market) {
  const ret20 = (m) => (m && m.closes && m.closes.length > 20 ? (m.closes[m.closes.length - 1] / m.closes[m.closes.length - 21] - 1) * 100 : null);
  const oil = ret20(market && market.oil);
  const copper = ret20(market && market.copper);
  const out = {};
  for (const c of CURRENCIES) {
    const [ko, kc] = TOT_COEFFS[c];
    let v = 0;
    let has = false;
    if (ko && oil !== null) { v += ko * clamp(oil / 8, -2, 2); has = true; }
    if (kc && copper !== null) { v += kc * clamp(copper / 6, -2, 2); has = true; }
    out[c] = { raw: has ? clamp(v, -2, 2) : null, oil, copper };
  }
  return out;
}
