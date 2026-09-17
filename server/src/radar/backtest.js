// Reconstrucción histórica del radar "a fecha" (point-in-time) y medición de aciertos.
// Para cada día hábil de los últimos N años recalcula la puntuación de las 8 divisas solo con lo que se sabía
// ese día (bonos, calendario con datos reales, COT con 3 días de retraso, FRED con retraso de publicación,
// precios diarios de Yahoo) y mira qué hizo cada par 1, 3, 5 y 10 días después.
import { PAIRS, CURRENCIES, PILLARS, PILLAR_WEIGHTS, YAHOO_PAIR_SYMBOLS, YAHOO_MARKET_SYMBOLS, FRED_BY_CURRENCY, POLICY_EVENT_TITLES, REGIMES, regimeOf, splitPair, pairPip } from './constants.js';
import { computeCurrencies } from './score.js';
import { parseYahooChart } from './sources/prices.js';
import { fetchJson, mapLimit } from './sources/http.js';
import { getSeries, seriesAsOf, shiftDays } from './sources/fred.js';
import { cotRows } from './sources/cot.js';
import { eventsBetween, latestActual } from './sources/calendar.js';
import { atr, round } from './indicators.js';
import { setMeta, getMetaJson } from './store.js';

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart/';
const MONTHLY_LAG_DAYS = 40; // retraso de publicación asumido para series mensuales (IPC, paro, tasa 3 meses)
const SURPRISE_DAYS = 60;

/** Conjuntos de pesos que se comparan (el primero es el vigente). */
export const WEIGHT_CANDIDATES = {
  vigente: PILLAR_WEIGHTS,
  sin_expectativas: { tasas: 25, expectativas: 0, inflacion: 15, crecimiento: 15, posicionamiento: 10, riesgo: 10, momentum: 20, tono: 5 },
  macro: { tasas: 25, expectativas: 25, inflacion: 10, crecimiento: 15, posicionamiento: 5, riesgo: 10, momentum: 10, tono: 0 },
  momentum: { tasas: 15, expectativas: 20, inflacion: 5, crecimiento: 10, posicionamiento: 5, riesgo: 10, momentum: 35, tono: 0 },
  iguales: { tasas: 1, expectativas: 1, inflacion: 1, crecimiento: 1, posicionamiento: 1, riesgo: 1, momentum: 1, tono: 0 },
  riesgo_alto: { tasas: 10, expectativas: 10, inflacion: 5, crecimiento: 10, posicionamiento: 10, riesgo: 35, momentum: 20, tono: 0 },
  // Divisas refugio: el nivel de tasas (carry) no predice a corto plazo (USDCHF "alcista fuerte" 268 días, 49 %).
  sin_carry_refugio: { ...PILLAR_WEIGHTS, per_currency: { CHF: { tasas: 0 }, JPY: { tasas: 0 } } },
};

/** Elige los pesos de un régimen solo con evidencia fuera de muestra (n ≥ 60, ≥ 55 % y ≥ 3 puntos mejor que los vigentes). */
function pickRegimeWeights(list) {
  const base = list.find((w) => w.name === 'vigente') || list[0];
  let best = base;
  for (const w of list) {
    const o = w.out_of_sample;
    const i = w.in_sample;
    if (o.n >= 60 && o.hit_rate !== null && o.hit_rate >= 55 && o.hit_rate >= (base.out_of_sample.hit_rate ?? 0) + 3 && i.hit_rate !== null && i.hit_rate >= 52) {
      if (best === base || o.hit_rate > (best.out_of_sample.hit_rate ?? 0)) best = w;
    }
  }
  return best;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const ymdOf = (unixSec) => new Date(unixSec * 1000).toISOString().slice(0, 10);
const levelOf = (diff) => Math.min(5, Math.round(Math.abs(diff) / 2));

async function fetchDaily(symbol) {
  const json = await fetchJson(`${YAHOO_BASE}${encodeURIComponent(symbol)}?interval=1d&range=5y`, { label: `Yahoo ${symbol}`, timeoutMs: 30_000 });
  const { bars } = parseYahooChart(json);
  // Un cierre por fecha UTC (Yahoo puede repetir la vela del día en curso).
  const byDate = new Map();
  for (const b of bars) byDate.set(ymdOf(b.time), b);
  return [...byDate.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, b]) => ({ ...b, date }));
}

function momentumAt(bars, i) {
  const window = bars.slice(Math.max(0, i - 45), i + 1);
  const atrD = window.length > 15 ? atr(window, 14) : null;
  const close = bars[i].close;
  const atrPct = atrD && close ? atrD / close : null;
  const mk = (k) => {
    if (i - k < 0 || !atrPct) return 0;
    const r = close / bars[i - k].close - 1;
    return clamp(r / (atrPct * Math.sqrt(k)), -3, 3);
  };
  return { m1: mk(1), m5: mk(5), m20: mk(20) };
}

function policyAsOf(db, date) {
  const now = new Date(`${date}T23:59:59Z`);
  const out = {};
  for (const c of CURRENCIES) {
    const cal = latestActual(db, c, POLICY_EVENT_TITLES[c] || [], { maxAgeDays: 400, now });
    if (cal) {
      out[c] = { currency: c, rate: cal.value, source: 'calendario', effective_date: cal.date };
      continue;
    }
    const cfg = FRED_BY_CURRENCY[c];
    const pol = cfg.policy ? seriesAsOf(getSeries(db, cfg.policy), date) : [];
    if (pol.length) {
      out[c] = { currency: c, rate: pol[pol.length - 1].value, source: 'FRED', effective_date: pol[pol.length - 1].date };
      continue;
    }
    const r3 = cfg.rate3m ? seriesAsOf(getSeries(db, cfg.rate3m), shiftDays(date, -MONTHLY_LAG_DAYS)) : [];
    if (r3.length) out[c] = { currency: c, rate: r3[r3.length - 1].value, source: 'aprox.', effective_date: r3[r3.length - 1].date };
  }
  return out;
}

function newBucket() {
  return { n: 0, hits: 0, sum: 0, win_sum: 0, win_n: 0, loss_sum: 0, loss_n: 0 };
}
function addTo(b, signedPips) {
  b.n++;
  b.sum += signedPips;
  if (signedPips > 0) {
    b.hits++;
    b.win_sum += signedPips;
    b.win_n++;
  } else {
    b.loss_sum += signedPips;
    b.loss_n++;
  }
}
function finish(b, extra = {}) {
  return {
    ...extra,
    n: b.n,
    hits: b.hits,
    hit_rate: b.n ? round((100 * b.hits) / b.n, 1) : null,
    avg_pips: b.n ? round(b.sum / b.n, 1) : null,
    avg_win_pips: b.win_n ? round(b.win_sum / b.win_n, 1) : null,
    avg_loss_pips: b.loss_n ? round(b.loss_sum / b.loss_n, 1) : null,
  };
}

/**
 * Ejecuta la reconstrucción. Devuelve el informe (y lo guarda en radar_meta 'backtest').
 * @param {object} db
 * @param {{ years?: number, horizons?: number[], now?: number, log?: (s: string) => void }} opts
 */
export async function runBacktest(db, { years = 3, horizons = [1, 3, 5, 10, 20], now = Date.now(), log = () => {} } = {}) {
  const t0 = Date.now();
  const maxH = Math.max(...horizons);
  log('descargando precios diarios (Yahoo, 5 años)…');
  const symbols = [...PAIRS.map((p) => [p, YAHOO_PAIR_SYMBOLS[p]]), ...Object.entries(YAHOO_MARKET_SYMBOLS).map(([k, y]) => [`market:${k}`, y])];
  const fetched = await mapLimit(symbols, 3, async ([key, yahoo]) => [key, await fetchDaily(yahoo)]);
  const daily = {};
  const failed = [];
  fetched.forEach((r, i) => {
    if (r.status === 'fulfilled') daily[r.value[0]] = r.value[1];
    else failed.push(`${symbols[i][0]}: ${r.reason && r.reason.message}`);
  });
  const pairsOk = PAIRS.filter((p) => daily[p] && daily[p].length > 300);
  if (pairsOk.length < 6) throw new Error(`Precios insuficientes para el backtest (${failed.join('; ') || 'pocas velas'})`);
  const marketKeys = ['vix', 'sp500', 'oil', 'dxy'];
  const idx = {};
  for (const key of [...pairsOk, ...marketKeys.map((k) => `market:${k}`)]) {
    if (!daily[key]) continue;
    idx[key] = new Map(daily[key].map((b, i) => [b.date, i]));
  }
  // Último índice con fecha <= date (para series que no cotizan ese día).
  const lastIndexAt = (key, date) => {
    const bars = daily[key];
    if (!bars) return -1;
    if (idx[key].has(date)) return idx[key].get(date);
    let lo = 0;
    let hi = bars.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (bars[mid].date <= date) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  };

  const ref = daily.EURUSD || daily[pairsOk[0]];
  const start = new Date(now);
  start.setUTCFullYear(start.getUTCFullYear() - years);
  const startYmd = start.toISOString().slice(0, 10);
  const dates = ref.map((b) => b.date).filter((d) => d >= startYmd);
  // Se recalcula hasta hoy (para el sesgo diario en vivo); los resultados solo se miden donde cabe el horizonte.
  const usable = dates;
  const lastMeasured = dates[Math.max(0, dates.length - 1 - maxH)];
  log(`${usable.length} días hábiles desde ${usable[0]} hasta ${usable[usable.length - 1]} (medidos hasta ${lastMeasured})`);

  const buckets = {}; // `${h}|${level}`
  const pairBuckets = {}; // `${h}|${sym}|${minLevel}`
  const yearBuckets = {}; // `${year}|${h}`
  const regimeBuckets = { calma: newBucket(), tension: newBucket() };
  const perDate = []; // { date, pillars: {ccy: number[]}, outcomes: {sym: {h: pips}} }
  const records = []; // una fila por (día, par) para las variantes
  const diffHist = {}; // sym -> diff por índice de día
  const dailyRows = []; // [date, sym, diff, regime] para radar_daily_bias
  let samples = 0;
  let missingPillarCount = 0;
  let pillarObs = 0;
  const pillarKeys = PILLARS;

  for (let di = 0; di < usable.length; di++) {
    const date = usable[di];
    const asOfMs = new Date(`${date}T23:59:59Z`).getTime();
    const pairData = {};
    for (const sym of pairsOk) {
      const i = lastIndexAt(sym, date);
      if (i < 25) continue;
      pairData[sym] = { symbol: sym, mom: momentumAt(daily[sym], i) };
    }
    const mk = (key, withCloses) => {
      const k = `market:${key}`;
      const i = lastIndexAt(k, date);
      if (i < 0) return { value: null, prev: null, closes: [] };
      const bars = daily[k];
      return { value: bars[i].close, prev: i > 0 ? bars[i - 1].close : null, closes: withCloses ? bars.slice(Math.max(0, i - 30), i + 1).map((b) => b.close) : [] };
    };
    const market = { vix: mk('vix', false), sp500: mk('sp500', true), oil: mk('oil', true), dxy: mk('dxy', true) };
    const cot = cotRows(db, date);
    const policy = policyAsOf(db, date);
    const events = eventsBetween(db, new Date(asOfMs - SURPRISE_DAYS * 86400000).toISOString(), new Date(asOfMs).toISOString());
    const cur = computeCurrencies(db, { now: asOfMs, market, pairData, cot, policy, manual: {}, expectations: {}, events, lag_days: MONTHLY_LAG_DAYS });
    const pillarsByCcy = {};
    for (const c of cur.currencies) {
      pillarsByCcy[c.code] = pillarKeys.map((k) => c.pillars[k].value);
      for (const k of pillarKeys) {
        pillarObs++;
        if (c.pillars[k].missing) missingPillarCount++;
      }
    }
    const vix = market.vix.value;
    const regime = regimeOf(vix);
    const outcomes = {};
    for (const sym of pairsOk) {
      const i = lastIndexAt(sym, date);
      if (i < 25) continue;
      const bars = daily[sym];
      const pip = pairPip(sym);
      const { base, quote } = splitPair(sym);
      const diff = round(cur.byCode[base].score - cur.byCode[quote].score);
      if (diff === 0) continue;
      const sign = diff > 0 ? 1 : -1;
      const level = levelOf(diff);
      dailyRows.push([date, sym, diff, regime]);
      outcomes[sym] = { diff, h: {} };
      if (!diffHist[sym]) diffHist[sym] = [];
      diffHist[sym][di] = diff;
      records.push({ di, sym, level, sign, diff, mom20: pairData[sym].mom.m20, prevDiff: di >= 5 && diffHist[sym][di - 5] !== undefined ? diffHist[sym][di - 5] : null, h: outcomes[sym].h });
      for (const h of horizons) {
        if (i + h >= bars.length) continue;
        const pips = (bars[i + h].close - bars[i].close) / pip;
        outcomes[sym].h[h] = pips;
        const signed = pips * sign;
        samples++;
        const kb = `${h}|${level}`;
        if (!buckets[kb]) buckets[kb] = newBucket();
        addTo(buckets[kb], signed);
        for (const minLevel of [2, 3]) {
          if (level < minLevel) continue;
          const kp = `${h}|${sym}|${minLevel}`;
          if (!pairBuckets[kp]) pairBuckets[kp] = newBucket();
          addTo(pairBuckets[kp], signed);
        }
        if (level >= 3) {
          const ky = `${date.slice(0, 4)}|${h}`;
          if (!yearBuckets[ky]) yearBuckets[ky] = newBucket();
          addTo(yearBuckets[ky], signed);
          if (h === 5 && vix !== null) addTo(vix > 25 ? regimeBuckets.tension : regimeBuckets.calma, signed);
        }
      }
    }
    perDate.push({ date, pillars: pillarsByCcy, outcomes, regime });
    if (di % 25 === 0) {
      log(`${date} · ${di + 1}/${usable.length}`);
      await new Promise((r) => setImmediate(r));
    }
  }

  // Pesos candidatos: puntuación = 5·Σ w·v / Σ w, con fuerza ≥3 a 5 días; dentro y fuera de muestra (último tercio).
  const split = Math.floor(perDate.length * (2 / 3));
  const evalWeights = (w, regimeFilter = null) => {
    const wv = pillarKeys.map((k) => w[k] || 0);
    const den = wv.reduce((a, b) => a + b, 0) || 1;
    const wvFor = (c) => {
      const pc = w.per_currency && w.per_currency[c];
      if (!pc) return { v: wv, d: den };
      const v = pillarKeys.map((k) => (pc[k] !== undefined ? pc[k] : w[k] || 0));
      return { v, d: v.reduce((a, b) => a + b, 0) || 1 };
    };
    const inS = newBucket();
    const outS = newBucket();
    const all2 = newBucket();
    perDate.forEach((d, di) => {
      if (regimeFilter && d.regime !== regimeFilter) return;
      const score = {};
      for (const c of CURRENCIES) {
        const v = d.pillars[c];
        const { v: wc, d: dc } = wvFor(c);
        score[c] = v ? (5 * v.reduce((a, x, i) => a + x * wc[i], 0)) / dc : 0;
      }
      for (const [sym, o] of Object.entries(d.outcomes)) {
        if (o.h[5] === undefined) continue;
        const { base, quote } = splitPair(sym);
        const diff = score[base] - score[quote];
        if (diff === 0) continue;
        const level = levelOf(diff);
        const signed = o.h[5] * (diff > 0 ? 1 : -1);
        if (level >= 2) addTo(all2, signed);
        if (level < 3) continue;
        addTo(di < split ? inS : outS, signed);
      }
    });
    return { weights: w, in_sample: finish(inS), out_of_sample: finish(outS), level2_all: finish(all2) };
  };
  const weightsReport = Object.entries(WEIGHT_CANDIDATES).map(([name, w]) => ({ name, ...evalWeights(w) }));
  const weightsByRegime = {};
  const regimeWeights = { apply: true, computed_at: new Date(now).toISOString(), regimes: {} };
  for (const rk of Object.keys(REGIMES)) {
    const list = Object.entries(WEIGHT_CANDIDATES).map(([name, w]) => ({ name, ...evalWeights(w, rk) }));
    weightsByRegime[rk] = list;
    const pick = pickRegimeWeights(list);
    regimeWeights.regimes[rk] = { name: pick.name, weights: pick.weights, evidence: { in_sample: pick.in_sample, out_of_sample: pick.out_of_sample }, days: perDate.filter((d) => d.regime === rk).length };
  }

  // Variantes exploratorias: ¿cuándo sí acompaña el precio al sesgo?
  const VARIANTS = [
    { key: 'fuerza3', label: 'Fuerza ≥3 (base)', test: (r) => r.level >= 3 },
    { key: 'fuerza2', label: 'Fuerza ≥2', test: (r) => r.level >= 2 },
    { key: 'con_tendencia', label: 'Fuerza ≥2 y la tendencia de 20 días va a favor', test: (r) => r.level >= 2 && r.mom20 * r.sign > 0.3 },
    { key: 'contra_tendencia', label: 'Fuerza ≥2 y la tendencia de 20 días va en contra', test: (r) => r.level >= 2 && r.mom20 * r.sign < -0.3 },
    { key: 'sesgo_nuevo', label: 'Fuerza ≥2 recién aparecida (hace 5 días era <2)', test: (r) => r.level >= 2 && r.prevDiff !== null && Math.abs(r.prevDiff) < 4 },
    { key: 'sesgo_creciente', label: 'Fuerza ≥2 y creciendo (≥1 punto más que hace 5 días)', test: (r) => r.level >= 2 && r.prevDiff !== null && r.diff * r.prevDiff > 0 && Math.abs(r.diff) - Math.abs(r.prevDiff) >= 1 },
    { key: 'sesgo_menguante', label: 'Fuerza ≥2 y menguando (≥1 punto menos que hace 5 días)', test: (r) => r.level >= 2 && r.prevDiff !== null && r.diff * r.prevDiff > 0 && Math.abs(r.prevDiff) - Math.abs(r.diff) >= 1 },
    { key: 'fuerza4', label: 'Fuerza ≥4 (si baja de 50 %, el extremo es contrario)', test: (r) => r.level >= 4 },
    { key: 'usdjpy3', label: 'USDJPY con fuerza ≥3', test: (r) => r.sym === 'USDJPY' && r.level >= 3 },
    { key: 'sin_chf', label: 'Fuerza ≥3 sin pares de CHF', test: (r) => r.level >= 3 && !r.sym.includes('CHF') },
  ];
  const variants = VARIANTS.map((v) => {
    const per = horizons.map((h) => {
      const b = newBucket();
      for (const r of records) if (r.h[h] !== undefined && v.test(r)) addTo(b, r.h[h] * r.sign);
      return finish(b, { horizon_d: h });
    });
    return { key: v.key, label: v.label, horizons: per };
  });

  const levels = [];
  for (const h of horizons) for (let level = 0; level <= 5; level++) levels.push(finish(buckets[`${h}|${level}`] || newBucket(), { horizon_d: h, level }));
  const summary = horizons.map((h) => {
    const b3 = newBucket();
    const b2 = newBucket();
    for (let level = 2; level <= 5; level++) {
      const b = buckets[`${h}|${level}`];
      if (!b) continue;
      for (const k of Object.keys(b2)) b2[k] += b[k];
      if (level >= 3) for (const k of Object.keys(b3)) b3[k] += b[k];
    }
    return { horizon_d: h, level3: finish(b3), level2: finish(b2) };
  });
  const pairs = [];
  for (const [k, b] of Object.entries(pairBuckets)) {
    const [h, sym, minLevel] = k.split('|');
    pairs.push(finish(b, { horizon_d: Number(h), symbol: sym, min_level: Number(minLevel) }));
  }
  pairs.sort((a, b) => a.horizon_d - b.horizon_d || a.min_level - b.min_level || (b.hit_rate || 0) - (a.hit_rate || 0));
  const years_ = Object.entries(yearBuckets).map(([k, b]) => {
    const [year, h] = k.split('|');
    return finish(b, { year, horizon_d: Number(h) });
  }).sort((a, b) => a.year.localeCompare(b.year) || a.horizon_d - b.horizon_d);

  const report = {
    computed_at: new Date(now).toISOString(),
    duration_ms: Date.now() - t0,
    from: usable[0],
    to: lastMeasured,
    days: usable.length,
    pairs_used: pairsOk,
    samples,
    horizons,
    pillar_missing_pct: pillarObs ? round((100 * missingPillarCount) / pillarObs, 1) : null,
    summary,
    levels,
    pairs,
    years: years_,
    regimes: { calma: finish(regimeBuckets.calma, { label: 'VIX ≤ 25', horizon_d: 5 }), tension: finish(regimeBuckets.tension, { label: 'VIX > 25', horizon_d: 5 }) },
    weights: weightsReport,
    weights_by_regime: weightsByRegime,
    regime_weights: regimeWeights,
    variants,
    price_errors: failed,
    method: [
      'Puntuación recalculada cada día hábil solo con datos disponibles ese día (point-in-time).',
      `Series mensuales (IPC, paro, tasa 3 meses) con ${MONTHLY_LAG_DAYS} días de retraso de publicación; COT con 3 días; bonos y precios el mismo día.`,
      'Calendario económico histórico de TradingView (datos reales y consenso); sin ajustes manuales (tono, expectativas) en el pasado.',
      'Momentum sobre cierres diarios de Yahoo (en vivo se usa el día de trading de Nueva York): pequeñas diferencias posibles.',
      'Acierto = el cierre N días después se movió en la dirección del sesgo. Pips medios con signo respecto al sesgo (no incluyen spread ni gestión).',
      'Las muestras de días consecutivos están correlacionadas: los porcentajes son orientativos, no una probabilidad garantizada.',
    ],
  };
  setMeta(db, 'backtest', report, now);
  setMeta(db, 'regime_weights', regimeWeights, now);
  try {
    const ins = db.prepare('INSERT OR REPLACE INTO radar_daily_bias (date, symbol, diff, regime) VALUES (?, ?, ?, ?)');
    db.exec('BEGIN');
    db.prepare('DELETE FROM radar_daily_bias').run();
    for (const r of dailyRows) ins.run(r[0], r[1], r[2], r[3]);
    db.exec('COMMIT');
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch { /* sin transacción abierta */ }
    log(`no se pudo guardar el sesgo diario: ${e.message}`);
  }
  log(`listo en ${Math.round(report.duration_ms / 1000)} s · ${samples} comparaciones`);
  return report;
}

export function lastBacktest(db) {
  return getMetaJson(db, 'backtest', null);
}
