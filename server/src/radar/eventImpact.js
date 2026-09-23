// Impacto esperado de los próximos datos de alto impacto: cuánto y hacia dónde suele moverse cada par según la
// sorpresa (β calibrada por scripts/calibrar-impacto.mjs), qué descuenta el mercado para la Fed (futuros ZQ) y qué
// pistas hay antes del dato (nowcast de inflación de la Fed de Cleveland, ADP antes de las nóminas).
//
//   movimiento esperado (pips) = signo_par × β_1h × z        z = sorpresa / σ  (σ = RMS de las últimas 36 sorpresas)
//   decisión de tipos: sorpresa (pb) = decisión − lo descontado por los futuros
import { readFileSync } from 'node:fs';
import { CURRENCIES, POLICY_EVENT_TITLES, splitPair } from './constants.js';
import { eventsBetween, parseNumber, surpriseOf } from './sources/calendar.js';
import { fedProbabilities } from './sources/fedwatch.js';
import { inflationNowcast } from './sources/nowcast.js';

const CACHE_MS = 10 * 60_000;
const DAYS_AHEAD = 10;
const NOWCAST_TITLES = { 'Inflation Rate MoM': 'cpi', 'Core Inflation Rate MoM': 'core_cpi', 'Core PCE Price Index MoM': 'core_pce', 'PCE Price Index MoM': 'pce' };
const ADP_WEIGHT = 0.35; // correlación ADP→nóminas: pista débil
let calibration = null;
let cache = { at: 0, data: null };

function loadCalibration() {
  if (calibration) return calibration;
  try {
    calibration = JSON.parse(readFileSync(new URL('./data/event-impact.json', import.meta.url), 'utf8'));
  } catch {
    calibration = { events: {}, generated_at: null, pairs_with_bars: [] };
  }
  return calibration;
}

const round = (n, d = 1) => (n === null || n === undefined || !Number.isFinite(n) ? null : Number(n.toFixed(d)));
const fmtUnit = (v, unit) => {
  if (v === null || v === undefined) return null;
  if (unit === '%') return `${round(v, 2)}%`;
  if (unit === 'K') return `${round(v, 0)}K`;
  if (unit === 'M') return `${round(v, 2)}M`;
  return String(round(v, Math.abs(v) < 10 ? 2 : 1));
};
/** Una calibración se considera fiable si acierta la dirección ≥ 60 % y la correlación no es ruido. */
const reliable = (fit) => !!(fit && fit.beta !== null && fit.hit !== null && fit.hit >= 60 && Math.abs(fit.rho ?? 0) >= 0.2);

function pairsFor(calEvent, country) {
  const out = [];
  for (const [symbol, p] of Object.entries(calEvent.pairs || {})) {
    const { base, quote } = splitPair(symbol);
    const sign = country === base ? 1 : country === quote ? -1 : 0;
    if (!sign) continue;
    out.push({ symbol, sign, h1: p.h1 || null, h4: p.h4 || null, h24: p.h24 || null, typical: p.typical || null });
  }
  out.sort((a, b) => Math.abs((b.h1 && b.h1.beta) || 0) - Math.abs((a.h1 && a.h1.beta) || 0));
  return out;
}

/** Movimiento esperado del par (pips, signo del precio) para una sorpresa z en unidades de la divisa. */
function scenario(pairs, z) {
  return pairs
    .filter((p) => p.h1 && p.h1.beta !== null)
    .map((p) => ({
      symbol: p.symbol,
      pips_1h: round(p.sign * p.h1.beta * z, 0),
      pips_4h: p.h4 && p.h4.beta !== null ? round(p.sign * p.h4.beta * z, 0) : null,
      pips_24h: p.h24 && p.h24.beta !== null ? round(p.sign * p.h24.beta * z, 0) : null,
      hit_1h: p.h1.hit,
      hit_24h: p.h24 ? p.h24.hit : null,
      n: p.h1.n,
    }));
}

function adpTilt(db, ev) {
  if (!/non farm payrolls/i.test(ev.title) || ev.country !== 'USD') return null;
  const from = new Date(new Date(ev.at_utc).getTime() - 7 * 86400_000).toISOString();
  const rows = eventsBetween(db, from, ev.at_utc, { countries: ['USD'] }).filter((e) => /^ADP Employment Change$/i.test(e.title) && e.actual);
  const adp = rows[rows.length - 1];
  if (!adp) return null;
  const s = surpriseOf(adp, db);
  if (s.z === null) return null;
  const z = Math.max(-3, Math.min(3, ADP_WEIGHT * s.z));
  return {
    source: 'adp',
    weak: true,
    z: round(z, 2),
    text: `ADP salió ${adp.actual} frente a ${adp.forecast} (${s.z > 0 ? '+' : ''}${s.z}σ). Es una pista débil (ADP y nóminas coinciden poco): inclina hacia ${z > 0 ? 'una sorpresa positiva' : z < 0 ? 'una sorpresa negativa' : 'nada'}.`,
  };
}

function nowcastTilt(ev, nc, cal) {
  const key = NOWCAST_TITLES[ev.title];
  if (!key || ev.country !== 'USD' || !nc || !nc.ok || !nc.current || !nc.current.nowcast[key]) return null;
  const forecast = parseNumber(ev.forecast);
  const n = nc.current.nowcast[key];
  const sigma = cal && cal.sigma ? cal.sigma : null;
  const diff = forecast === null ? null : n.value - forecast;
  const z = diff !== null && sigma ? Math.max(-3, Math.min(3, diff / sigma)) : null;
  const prev = nc.previous && nc.previous.nowcast[key] && nc.previous.actual[key] ? `El mes pasado el nowcast dijo ${nc.previous.nowcast[key].value}% y el dato fue ${nc.previous.actual[key].value}%.` : '';
  return {
    source: 'nowcast',
    weak: false,
    value: n.value,
    asof: n.asof,
    z: round(z, 2),
    text: forecast === null
      ? `Nowcast de la Fed de Cleveland (${n.asof}): ${n.value}% mensual. Sin consenso todavía. ${prev}`.trim()
      : `Nowcast de la Fed de Cleveland (${n.asof}): ${n.value}% frente al consenso ${ev.forecast} (${z !== null ? `${z > 0 ? '+' : ''}${round(z, 1)}σ` : 'sin σ'}) → ${z === null ? '' : Math.abs(z) < 0.5 ? 'sin sesgo claro.' : z > 0 ? 'riesgo de sorpresa al alza (USD ↑).' : 'riesgo de sorpresa a la baja (USD ↓).'} ${prev}`.trim(),
  };
}

function policyBlock(ev, fed) {
  if (ev.country !== 'USD' || !fed || !fed.ok) return null;
  const day = ev.at_utc.slice(0, 10);
  const m = fed.meetings.find((x) => x.ok && x.date === day) || fed.meetings.find((x) => x.ok && x.date >= day) || null;
  if (!m) return null;
  return {
    effr: fed.effr,
    effr_date: fed.effr_date,
    meeting: m,
    surprise_if: { hold: round(-m.change_bp, 1), hike_25: round(25 - m.change_bp, 1), cut_25: round(-25 - m.change_bp, 1) },
    text: m.change_bp > 12.5
      ? `Los futuros descuentan una subida de 25 pb con ${Math.round(m.p_hike_25 * 100)} % (tipo esperado ${m.rate_after}% desde ${m.rate_before}%). Si la Fed mantiene, la sorpresa es de ${round(-m.change_bp, 0)} pb → USD ↓.`
      : m.change_bp < -12.5
        ? `Los futuros descuentan una bajada de 25 pb con ${Math.round(m.p_cut_25 * 100)} % (tipo esperado ${m.rate_after}% desde ${m.rate_before}%). Si la Fed mantiene, la sorpresa es de +${round(-m.change_bp, 0)} pb → USD ↑.`
        : `Los futuros descuentan que la Fed mantiene (${Math.round(m.p_hold * 100)} %). Una subida sería una sorpresa de +${round(25 - m.change_bp, 0)} pb → USD ↑; una bajada, de ${round(-25 - m.change_bp, 0)} pb → USD ↓.`,
  };
}

/** @returns {Promise<object>} DTO para el cliente (ver docs/IMPACTO-EVENTOS.md). */
export async function upcomingImpacts(db, { now = new Date() } = {}) {
  if (cache.data && Date.now() - cache.at < CACHE_MS) return cache.data;
  const cal = loadCalibration();
  const from = now.toISOString();
  const to = new Date(now.getTime() + DAYS_AHEAD * 86400_000).toISOString();
  const upcoming = eventsBetween(db, from, to, { countries: CURRENCIES }).filter((e) => e.impact === 'High');
  const fedDates = upcoming.filter((e) => e.country === 'USD' && POLICY_EVENT_TITLES.USD.includes(e.title)).map((e) => e.at_utc.slice(0, 10));
  const [fed, nc] = await Promise.all([
    fedProbabilities({ meetingDates: fedDates, now }).catch((e) => ({ ok: false, error: e.message, meetings: [] })),
    inflationNowcast({ now }).catch((e) => ({ ok: false, error: e.message })),
  ]);

  const events = upcoming.map((ev) => {
    const c = cal.events[`${ev.country}|${ev.title}`] || null;
    const forecast = parseNumber(ev.forecast);
    const policy = Object.values(POLICY_EVENT_TITLES).flat().includes(ev.title) || (c && c.policy);
    const pairs = c ? pairsFor(c, ev.country) : [];
    const hasFit = !!(c && c.currency && pairs.some((p) => p.h1 && p.h1.beta !== null));
    // Solo se enseñan escenarios cuando la relación sorpresa → movimiento es fiable en la primera hora.
    const calibrated = hasFit && reliable(c.currency.h1);
    const sigma = c && !c.policy ? c.sigma : null;
    const better = sigma !== null && forecast !== null ? (c.inverted ? forecast - sigma : forecast + sigma) : null;
    const worse = sigma !== null && forecast !== null ? (c.inverted ? forecast + sigma : forecast - sigma) : null;
    const scenarioLabel = (dir) => {
      const sign = (dir === 'mejor') !== !!(c && c.inverted) ? '+' : '−';
      const value = dir === 'mejor' ? better : worse;
      return `Sale ${dir} (${sign}1σ${value !== null ? `: ${fmtUnit(value, c.unit)}` : ', aún sin consenso'})`;
    };
    const tilt = nowcastTilt(ev, nc, c) || adpTilt(db, ev);
    const typical = pairs.length ? pairs.map((p) => ({ symbol: p.symbol, h1: p.typical ? p.typical.h1 : p.h1 ? p.h1.avg_abs : null, h24: p.typical ? p.typical.h24 : p.h24 ? p.h24.avg_abs : null })).filter((t) => t.h1 !== null) : [];
    return {
      id: ev.id,
      title: ev.title,
      country: ev.country,
      at_utc: ev.at_utc,
      minutes: Math.round((new Date(ev.at_utc).getTime() - now.getTime()) / 60000),
      forecast: ev.forecast,
      previous: ev.previous,
      category: ev.category,
      policy: !!policy,
      calibrated,
      weak_fit: hasFit && !calibrated,
      n: c ? c.n : 0,
      since: c ? c.since : null,
      unit: c ? c.unit : '',
      inverted: !!(c && c.inverted),
      sigma: sigma,
      sigma_label: sigma !== null ? fmtUnit(sigma, c.unit) : null,
      currency: c && c.currency ? c.currency : null,
      scenarios: calibrated && !policy ? [
        { key: 'mejor', label: scenarioLabel('mejor'), currency_dir: 'up', value: fmtUnit(better, c.unit), pairs: scenario(pairs, 1) },
        { key: 'peor', label: scenarioLabel('peor'), currency_dir: 'down', value: fmtUnit(worse, c.unit), pairs: scenario(pairs, -1) },
      ] : [],
      typical,
      tilt,
      fed: policy ? policyBlock(ev, fed) : null,
    };
  });

  const data = {
    generated_at: now.toISOString(),
    days_ahead: DAYS_AHEAD,
    calibration: { generated_at: cal.generated_at, indicators: Object.keys(cal.events).length, pairs: cal.pairs_with_bars || [] },
    fed: { ok: !!fed.ok, effr: fed.effr ?? null, effr_date: fed.effr_date ?? null, meetings: fed.meetings || [], error: fed.error || null },
    nowcast: nc && nc.ok ? { month: nc.current.month, current: nc.current.nowcast, previous: nc.previous } : { month: null, current: null, previous: null, error: (nc && nc.error) || null },
    events,
  };
  cache = { at: Date.now(), data };
  return data;
}

export function invalidateImpactCache() {
  cache = { at: 0, data: null };
  calibration = null;
}
