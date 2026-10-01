// Fórmulas cuantitativas con respaldo en la literatura y en las mesas de divisas, añadidas al motor del radar
// (docs/FORMULAS-CUANT.md). Todas son funciones puras sobre datos ya descargados y aceptan un "a fecha de" para que el
// backtest las evalúe point-in-time.
//
//   1. Valor (PPP / tipo de cambio real): Rogoff 1996; Asness, Moskowitz y Pedersen 2013; Menkhoff et al. 2017.
//      log RER_t = log S_t + log P_ccy,t − log P_usd,t ; señal = −z(log RER_t frente a su media de 3 años).
//   2. Tendencia (time-series momentum): Moskowitz, Ooi y Pedersen 2012. Retorno a 3 y 12 meses / volatilidad anualizada.
//   3. Índice de sorpresas (estilo Citi Economic Surprise Index): suma de sorpresas estandarizadas con decaimiento
//      (vida media 45 días) y peso = impacto medido de cada indicador en el precio (β de calibrar-impacto.mjs).
//   4. Probabilidad calibrada (Platt 1999): regresión logística P(a favor | diferencia de puntuación) por horizonte
//      y por par (con contracción hacia el global), ajustada con el historial del propio backtest.
import { readFileSync } from 'node:fs';
import { CURRENCIES, PAIRS, FRED_BY_CURRENCY, CPI_EVENT_TITLES, CATEGORY_WEIGHTS, IMPACT_WEIGHTS, splitPair } from './constants.js';
import { getSeries } from './sources/fred.js';

/** Serie interanual completa a partir de un índice mensual: [{ date, value }] (valor = % frente a 12 meses antes). */
function yoySeriesFromIndex(rows) {
  const byMonth = new Map(rows.map((r) => [monthKey(r.date), r.value]));
  const out = [];
  for (const r of rows) {
    const [y, m] = r.date.split('-').map(Number);
    const prev = byMonth.get(`${y - 1}-${String(m).padStart(2, '0')}`);
    if (prev) out.push({ date: r.date, value: (r.value / prev - 1) * 100 });
  }
  return out;
}
import { surpriseOf, categorize } from './sources/calendar.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const std = (xs) => {
  if (xs.length < 2) return null;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
const monthKey = (d) => String(d).slice(0, 7);

// ---------- 1. Valor (PPP) ----------

const VALUE_WINDOW = 756; // ~3 años de días hábiles (lo que cubre nuestro historial de inflación)
const VALUE_MIN_POINTS = 250;
let inflCache = { at: 0, map: null };

/**
 * Inflación interanual mensual por divisa [{ month: 'YYYY-MM', yoy }], uniendo FRED (índice o interanual) y el
 * calendario económico (dato real de "Inflation Rate YoY"). Caché de 30 min; se filtra por fecha al usarla.
 */
export function inflationHistory(db) {
  if (inflCache.map && Date.now() - inflCache.at < 30 * 60_000) return inflCache.map;
  const map = {};
  for (const c of CURRENCIES) {
    const byMonth = new Map();
    const cfg = FRED_BY_CURRENCY[c];
    // El IPC del mes M se publica a mediados de M+1: se marca disponible 45 días después para el point-in-time.
    const published = (d) => new Date(new Date(`${d}T00:00:00Z`).getTime() + 45 * 86400000).toISOString().slice(0, 10);
    if (cfg.cpi_index) for (const r of yoySeriesFromIndex(getSeries(db, cfg.cpi_index))) byMonth.set(monthKey(r.date), { yoy: r.value, at: published(r.date) });
    if (cfg.cpi_yoy) for (const r of getSeries(db, cfg.cpi_yoy)) byMonth.set(monthKey(r.date), { yoy: r.value, at: published(r.date) });
    const titles = (CPI_EVENT_TITLES[c] || []).filter((t) => /yoy|y\/y/i.test(t));
    if (titles.length) {
      const rows = db.prepare(`SELECT at_utc, actual FROM radar_calendar WHERE country = ? AND title IN (${titles.map(() => '?').join(',')}) AND actual IS NOT NULL AND actual != '' ORDER BY at_utc`).all(c, ...titles);
      for (const r of rows) {
        const v = Number(String(r.actual).replace('%', '').replace(',', '.'));
        if (!Number.isFinite(v)) continue;
        // El dato publicado en el mes M corresponde al mes M−1.
        const d = new Date(r.at_utc);
        d.setUTCMonth(d.getUTCMonth() - 1);
        const k = monthKey(d.toISOString());
        if (!byMonth.has(k)) byMonth.set(k, { yoy: v, at: r.at_utc.slice(0, 10) });
      }
    }
    map[c] = [...byMonth.entries()].map(([month, v]) => ({ month, yoy: v.yoy, at: v.at })).sort((a, b) => (a.month < b.month ? -1 : 1));
  }
  inflCache = { at: Date.now(), map };
  return map;
}

/**
 * Nivel de precios (log, salvo constante) por mes, integrando la inflación interanual: L(m) = Σ yoy/12/100.
 * Los meses sin dato (series trimestrales, huecos) arrastran la última inflación conocida (point-in-time).
 */
function logPriceLevels(hist, asOfYmd) {
  const out = new Map();
  const known = hist.filter((r) => !r.at || r.at <= asOfYmd);
  if (!known.length) return out;
  const byMonth = new Map(known.map((r) => [r.month, r.yoy]));
  const first = known[0].month;
  const last = asOfYmd.slice(0, 7);
  let [y, m] = first.split('-').map(Number);
  let acc = 0;
  let yoy = known[0].yoy || 0;
  for (let guard = 0; guard < 600; guard++) {
    const key = `${y}-${String(m).padStart(2, '0')}`;
    if (key > last) break;
    if (byMonth.has(key)) yoy = byMonth.get(key) || 0;
    acc += yoy / 12 / 100;
    out.set(key, acc);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/**
 * Señal de valor por divisa (z de la desviación del tipo de cambio real frente a su media de 3 años, con el signo
 * invertido: positivo = infravalorada). USD = media de las demás con el signo contrario.
 * @param {(sym:string)=>Array<{date:string, close:number}>} closesAsOf  cierres diarios hasta la fecha (ascendentes)
 */
export function valueByCurrency(db, closesAsOf, now) {
  const asOf = new Date(now).toISOString().slice(0, 10);
  const infl = inflationHistory(db);
  const levelUsd = logPriceLevels(infl.USD || [], asOf);
  const out = {};
  const zs = [];
  for (const c of CURRENCIES) {
    if (c === 'USD') continue;
    const direct = PAIRS.includes(`${c}USD`) ? `${c}USD` : PAIRS.includes(`USD${c}`) ? `USD${c}` : null;
    if (!direct) { out[c] = { raw: null, z: null, n: 0 }; continue; }
    const closes = (closesAsOf(direct) || []).slice(-VALUE_WINDOW);
    const levelC = logPriceLevels(infl[c] || [], asOf);
    const series = [];
    for (const b of closes) {
      const m = monthKey(b.date);
      const lc = levelC.get(m);
      const lu = levelUsd.get(m);
      if (lc === undefined || lu === undefined || !(b.close > 0)) continue;
      const s = direct.startsWith('USD') ? 1 / b.close : b.close; // USD por unidad de la divisa
      series.push(Math.log(s) + lc - lu);
    }
    if (series.length < VALUE_MIN_POINTS) { out[c] = { raw: null, z: null, n: series.length }; continue; }
    const m = mean(series);
    const sd = std(series);
    const z = sd ? clamp((series[series.length - 1] - m) / sd, -3, 3) : 0;
    out[c] = { raw: -z, z, n: series.length, deviation_pct: Math.round((series[series.length - 1] - m) * 1000) / 10 };
    zs.push(z);
  }
  out.USD = zs.length ? { raw: mean(zs), z: -mean(zs), n: zs.length, deviation_pct: null } : { raw: null, z: null, n: 0 };
  return out;
}

// ---------- 2. Tendencia (time-series momentum) ----------

/**
 * Tendencia por divisa: retorno a 3 y 12 meses dividido por la volatilidad anualizada (señal de Moskowitz–Ooi–Pedersen),
 * promediada sobre los pares de la divisa con el signo de la divisa.
 */
export function trendByCurrency(closesAsOf) {
  const acc = Object.fromEntries(CURRENCIES.map((c) => [c, { s3: [], s12: [] }]));
  const perPair = {};
  for (const sym of PAIRS) {
    const closes = (closesAsOf(sym) || []).slice(-262).map((b) => b.close).filter((x) => x > 0);
    if (closes.length < 70) continue;
    const rets = [];
    for (let i = 1; i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
    const sd = std(rets.slice(-252));
    if (!sd) continue;
    const vol = sd * Math.sqrt(252);
    const last = closes[closes.length - 1];
    const r3 = Math.log(last / closes[Math.max(0, closes.length - 1 - 63)]);
    const s3 = clamp(r3 / (vol * Math.sqrt(63 / 252)), -3, 3);
    const s12 = closes.length >= 253 ? clamp(Math.log(last / closes[closes.length - 1 - 252]) / vol, -3, 3) : null;
    perPair[sym] = { s3, s12 };
    const { base, quote } = splitPair(sym);
    acc[base].s3.push(s3);
    acc[quote].s3.push(-s3);
    if (s12 !== null) { acc[base].s12.push(s12); acc[quote].s12.push(-s12); }
  }
  const out = {};
  for (const c of CURRENCIES) {
    const s3 = mean(acc[c].s3);
    const s12 = mean(acc[c].s12);
    out[c] = { s3, s12, raw: s3 === null ? null : s12 === null ? s3 : 0.5 * s3 + 0.5 * s12 };
  }
  return { byCurrency: out, perPair };
}

// ---------- 3. Índice de sorpresas (CESI) ----------

const CESI_WINDOW_DAYS = 90;
const CESI_HALF_LIFE_DAYS = 45;
let betaCache = null;
function impactBetas() {
  if (betaCache) return betaCache;
  try {
    const j = JSON.parse(readFileSync(new URL('./data/event-impact.json', import.meta.url), 'utf8'));
    betaCache = {};
    for (const [k, e] of Object.entries(j.events || {})) if (e.currency && e.currency.h1 && e.currency.h1.beta !== null) betaCache[k] = Math.abs(e.currency.h1.beta);
  } catch {
    betaCache = {};
  }
  return betaCache;
}

/**
 * Índice de sorpresas de una divisa: Σ w·z·decay / Σ w·decay sobre 90 días, con vida media de 45 días y
 * w = impacto medido del indicador (β, pips por σ) o, si no está calibrado, peso por categoría e impacto.
 * @param {Array} events  eventos ya cargados (con actual y forecast), o null para consultarlos
 */
export function surpriseIndex(db, ccy, now, events, eventsBetween) {
  const from = new Date(now - CESI_WINDOW_DAYS * 86400000).toISOString();
  const list = (events ? events.filter((e) => e.country === ccy) : eventsBetween(db, from, new Date(now).toISOString(), { countries: [ccy] })).filter((e) => e.at_utc >= from);
  const betas = impactBetas();
  let num = 0;
  let den = 0;
  let n = 0;
  for (const ev of list) {
    if (!ev.actual || !ev.forecast) continue;
    const s = surpriseOf(ev, db);
    const z = s.z !== null ? s.z : s.norm === null ? null : 2 * s.norm;
    if (z === null) continue;
    const beta = betas[`${ev.country}|${ev.title}`];
    const cw = CATEGORY_WEIGHTS[ev.category || categorize(ev.title)];
    const w = beta !== undefined ? beta : (IMPACT_WEIGHTS[ev.impact] || 1) * (cw === undefined ? 0.5 : cw) * 2;
    if (!w) continue;
    const ageDays = (now - new Date(ev.at_utc).getTime()) / 86400000;
    const decay = Math.pow(0.5, ageDays / CESI_HALF_LIFE_DAYS);
    num += w * z * decay;
    den += w * decay;
    n++;
  }
  return { raw: den ? clamp(num / den, -3, 3) : null, n };
}

// ---------- 4. Probabilidad calibrada (regresión logística) ----------

const sigmoid = (t) => 1 / (1 + Math.exp(-t));

/** Ajuste P(y=1) = σ(a + b·x) por Newton–Raphson con una regularización mínima. */
export function fitLogit(xs, ys, iters = 25) {
  const n = xs.length;
  if (n < 30) return null;
  let a = 0;
  let b = 0;
  const lambda = 1e-3;
  for (let it = 0; it < iters; it++) {
    let g0 = 0; let g1 = 0; let h00 = lambda; let h01 = 0; let h11 = lambda;
    for (let i = 0; i < n; i++) {
      const p = sigmoid(a + b * xs[i]);
      const r = p - ys[i];
      g0 += r; g1 += r * xs[i];
      const w = p * (1 - p);
      h00 += w; h01 += w * xs[i]; h11 += w * xs[i] * xs[i];
    }
    g1 += lambda * b;
    const det = h00 * h11 - h01 * h01;
    if (!det) break;
    const da = (h11 * g0 - h01 * g1) / det;
    const db = (h00 * g1 - h01 * g0) / det;
    a -= da; b -= db;
    if (Math.abs(da) < 1e-7 && Math.abs(db) < 1e-7) break;
  }
  return { a: Number(a.toFixed(5)), b: Number(b.toFixed(5)), n };
}

/**
 * Calibración por horizonte a partir de las filas del backtest: { diff, h: { [h]: pips } }.
 * Global (x = diff, y = sube) y por par con contracción hacia el global (K = 300 observaciones).
 */
export function calibrateLogit(records, horizons) {
  const out = { method: 'P(sube) = σ(a + b·diff); por par: b contraído hacia el global con K=300', horizons: {} };
  for (const h of horizons) {
    const xs = []; const ys = [];
    const byPair = {};
    for (const r of records) {
      if (r.h[h] === undefined) continue;
      xs.push(r.diff); ys.push(r.h[h] > 0 ? 1 : 0);
      (byPair[r.sym] ||= { xs: [], ys: [] });
      byPair[r.sym].xs.push(r.diff); byPair[r.sym].ys.push(r.h[h] > 0 ? 1 : 0);
    }
    const global = fitLogit(xs, ys);
    if (!global) continue;
    const pairs = {};
    for (const [sym, d] of Object.entries(byPair)) {
      const f = fitLogit(d.xs, d.ys);
      if (!f) continue;
      const K = 300;
      pairs[sym] = { a: f.a, b: Number(((f.n * f.b + K * global.b) / (f.n + K)).toFixed(5)), b_raw: f.b, n: f.n };
    }
    out.horizons[h] = { global, pairs };
  }
  return out;
}

/** Probabilidad de que el precio vaya a favor del sesgo (diff) en el horizonte h, según la calibración. */
export function probFavor(calib, sym, diff, h) {
  const H = calib && calib.horizons && calib.horizons[h];
  if (!H || !diff) return null;
  const g = H.global;
  const p = H.pairs && H.pairs[sym] ? H.pairs[sym] : null;
  const a = p ? p.a : g.a;
  const b = p ? p.b : g.b;
  const pUp = sigmoid(a + b * diff);
  const pf = diff > 0 ? pUp : 1 - pUp;
  return { horizon_d: h, p: Math.round(pf * 1000) / 10, n: p ? p.n : g.n, per_pair: !!p };
}
