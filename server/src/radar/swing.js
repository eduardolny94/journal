// Apartado "Swing" (09-10-2026): la operativa del usuario en H4 con el indicador C4L (EMA 8 azul, media simple 18 roja,
// EMA 200 morada) guiada por el radar. Medido en docs/ESTRATEGIA-SWING-H4.md: el cruce 8/18 solo pierde (−0,04R);
// con la semana 8/18 alineada y el sesgo del radar a favor (fuerza ≥ 2) gana +0,10/+0,18R (n=375), y con nivel A/B
// +0,42/+0,61R (n=46). Por eso la lista se ordena por el radar, no por "lo tendencial" (que empeora el resultado).
// Devuelve, por par: dirección del radar, estado 8/18 en semanal, diario y H4, último cruce H4, stops (estructura y
// día anterior) con el riesgo en pips y el tamaño para la cuenta configurada. Informa: la entrada es del trader.
import { PAIR_LIQUIDITY, pairPip, splitPair } from './constants.js';
import { aggregateH4, round } from './indicators.js';
import { isoWeekKey, currentTradingDay } from '../services/tradingDay.js';

export const SWING_ACCOUNT_USD = 500;
export const SWING_RISK_PCT = 1;
export const SWING_MAX_PAIRS = 4;
const FAST = 8, SLOW = 18, TREND = 200, STRUCT_BARS = 10, RECENT_BARS = 6;

function ema(values, n) {
  const k = 2 / (n + 1); const out = new Array(values.length).fill(null); let e = null;
  values.forEach((v, i) => { e = e === null ? v : v * k + e * (1 - k); out[i] = i >= n - 1 ? e : null; });
  return out;
}
function sma(values, n) {
  const out = new Array(values.length).fill(null); let s = 0;
  values.forEach((v, i) => { s += v; if (i >= n) s -= values[i - n]; if (i >= n - 1) out[i] = s / n; });
  return out;
}
/** Estado 8/18 de una serie de cierres COMPLETADOS: +1 azul sobre roja, −1 debajo, 0 sin datos; y velas desde el último cruce. */
function state(closes) {
  if (closes.length < SLOW + 1) return { dir: 0, since: null, e8: null, s18: null };
  const e8 = ema(closes, FAST); const s18 = sma(closes, SLOW);
  const i = closes.length - 1;
  const dir = e8[i] > s18[i] ? 1 : e8[i] < s18[i] ? -1 : 0;
  let since = 0;
  for (let k = i; k >= SLOW; k--) { const d = e8[k] > s18[k] ? 1 : e8[k] < s18[k] ? -1 : 0; if (d !== dir) break; since = i - k + 1; }
  return { dir, since, e8: e8[i], s18: s18[i] };
}
/** ATR de Wilder (serie), como en el backtest. */
function atrSeries(bars, n = 14) {
  const out = new Array(bars.length).fill(null); let a = null;
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
    a = a === null ? tr : (a * (n - 1) + tr) / n;
    if (i >= n) out[i] = a;
  }
  return out;
}
/** ADX de Wilder al cierre de la última vela (fuerza de la tendencia, sin dirección). */
function adxLast(bars, n = 14) {
  if (bars.length < 2 * n + 2) return null;
  let trS = null, pS = null, nS = null, a = null;
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].high - bars[i - 1].high, dn = bars[i - 1].low - bars[i].low;
    const pdm = up > dn && up > 0 ? up : 0, ndm = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(bars[i].high - bars[i].low, Math.abs(bars[i].high - bars[i - 1].close), Math.abs(bars[i].low - bars[i - 1].close));
    if (trS === null) { trS = tr; pS = pdm; nS = ndm; } else { trS += tr - trS / n; pS += pdm - pS / n; nS += ndm - nS / n; }
    if (i < n) continue;
    const pdi = trS ? (100 * pS) / trS : 0, ndi = trS ? (100 * nS) / trS : 0;
    const dx = pdi + ndi ? (100 * Math.abs(pdi - ndi)) / (pdi + ndi) : 0;
    a = a === null ? dx : (a * (n - 1) + dx) / n;
  }
  return a;
}
// Filtros de "entrada temprana" medidos el 10-10-2026 (docs/ESTRATEGIA-SWING-H4.md): los tres mejoran el R a 2R en
// 2024, 2025 y 2026 sobre "semanal + radar". Con 2 de 3: 55 % a 2R (+0,65R), 60 % a 1,5R (+0,50R), n=80.
export const EARLY_ADX_MAX = 20;        // ADX diario (14) por debajo: la tendencia diaria aún no está "hecha"
export const EARLY_CROSS_ATR_MAX = 0.5; // cierre del cruce a menos de 0,5 ATR H4 de la media 18: cruce suave, no persecución
export const EARLY_DAILY_MAX_DAYS = 10; // diario 8/18 a favor desde hace ≤ 10 días: tendencia diaria joven
export const BE_TRIGGER_R = 1.1;        // regla del usuario: stop a la entrada al tocar +1,1R
export const TARGETS_R = [1.5, 2];

function weeklyCloses(d1) {
  const weeks = [];
  for (const b of d1) {
    const key = isoWeekKey(new Date(b.time * 1000).toISOString().slice(0, 10));
    const w = weeks[weeks.length - 1];
    if (!w || w.key !== key) weeks.push({ key, close: b.close }); else w.close = b.close;
  }
  return weeks;
}
/** Valor de un pip en USD por lote estándar, con las cotizaciones del radar. */
function pipValueUsd(sym, symbols) {
  const { base, quote } = splitPair(sym);
  const pip = pairPip(sym);
  const px = (s) => (symbols[s] && symbols[s].bid) || null;
  if (quote === 'USD') return 10;
  if (base === 'USD') { const p = px(sym); return p ? (100000 * pip) / p : null; }
  // Cruce: el pip vale 100000·pip en la divisa cotizada → a USD
  const inQuote = 100000 * pip;
  if (quote === 'JPY') { const p = px('USDJPY'); return p ? inQuote / p : null; }
  if (quote === 'CHF') { const p = px('USDCHF'); return p ? inQuote / p : null; }
  if (quote === 'CAD') { const p = px('USDCAD'); return p ? inQuote / p : null; }
  if (quote === 'GBP') { const p = px('GBPUSD'); return p ? inQuote * p : null; }
  if (quote === 'AUD') { const p = px('AUDUSD'); return p ? inQuote * p : null; }
  if (quote === 'NZD') { const p = px('NZDUSD'); return p ? inQuote * p : null; }
  if (quote === 'EUR') { const p = px('EURUSD'); return p ? inQuote * p : null; }
  return null;
}

/**
 * @param {object} prices  salida de getPrices (symbols[sym] = { bid, h1, d1, digits, pip })
 * @param {Array} pairs    pares del radar ya calculados (con diff, conviction, structure, fluidity)
 * @param {{ now?: number, accountUsd?: number, riskPct?: number }} o
 */
export function computeSwing(prices, pairs, { now = Date.now(), accountUsd = SWING_ACCOUNT_USD, riskPct = SWING_RISK_PCT } = {}) {
  const symbols = prices.symbols || {};
  const today = currentTradingDay({ timezone: 'America/New_York', day_reset_hour: 17 });
  const thisWeek = isoWeekKey(today);
  const rows = [];
  for (const p of pairs) {
    const s = symbols[p.symbol];
    if (!s || !Array.isArray(s.h1) || s.h1.length < 100 || !Array.isArray(s.d1) || s.d1.length < 40) continue;
    const level = Math.min(5, Math.round(Math.abs(p.diff) / 2));
    const dir = p.diff > 0 ? 1 : p.diff < 0 ? -1 : 0;
    // Marcos completados (point-in-time): semana anterior, día anterior y vela H4 cerrada.
    const weeks = weeklyCloses(s.d1).filter((w) => w.key !== thisWeek);
    const days = s.d1.filter((b) => new Date(b.time * 1000).toISOString().slice(0, 10) < today);
    const h4all = aggregateH4(s.h1);
    const h4 = h4all.slice(0, -1); // la última está en curso
    const w1 = state(weeks.map((w) => w.close));
    const d1 = state(days.map((b) => b.close));
    const h4Closes = h4.map((b) => b.close);
    const H = state(h4Closes);
    const e200 = h4.length >= TREND ? ema(h4Closes, TREND)[h4.length - 1] : null;
    // Calidad de la entrada (point-in-time): ADX diario, suavidad del cruce en H4 y edad de la tendencia diaria.
    const adxD = adxLast(days, 14);
    const s18Series = sma(h4Closes, SLOW); const atr4 = atrSeries(h4, 14);
    // Suavidad del último cruce H4 solo si ese cruce va a favor del radar (si no, no es la entrada que se mide).
    const crossIdx = H.since !== null && H.since > 0 && H.dir !== 0 && H.dir === dir ? h4.length - H.since : -1;
    const crossAtr = crossIdx >= 0 && s18Series[crossIdx] !== null && atr4[crossIdx] ? (H.dir > 0 ? h4[crossIdx].close - s18Series[crossIdx] : s18Series[crossIdx] - h4[crossIdx].close) / atr4[crossIdx] : null;
    const price = s.bid;
    const pip = s.pip;
    const digits = s.digits;
    const recentWin = h4.slice(-STRUCT_BARS);
    const lv = p.structure && p.structure.levels ? p.structure.levels : null;
    const stops = dir === 0 ? null : {
      estructura: recentWin.length ? round(dir > 0 ? Math.min(...recentWin.map((b) => b.low)) : Math.max(...recentWin.map((b) => b.high)), digits) : null,
      diario: lv ? round(dir > 0 ? lv.pd_low : lv.pd_high, digits) : null,
    };
    const riskPips = (stop) => (stop === null || !price ? null : round(Math.abs(price - stop) / pip, 1));
    const pv = pipValueUsd(p.symbol, symbols);
    const sizing = (stop) => {
      const rp = riskPips(stop);
      if (rp === null || !pv || rp <= 0) return null;
      const lots = Math.max(0.01, Math.floor(((accountUsd * riskPct) / 100 / (rp * pv)) * 100) / 100);
      return { risk_pips: rp, lots, risk_usd: round(lots * rp * pv, 2) };
    };
    const semanalOk = dir !== 0 && w1.dir === dir;
    const diarioOk = dir !== 0 && d1.dir === dir;
    const h4Ok = dir !== 0 && H.dir === dir;
    const tier = p.conviction ? p.conviction.tier : null;
    let estado;
    if (dir === 0 || level < 2) estado = 'sin_sesgo';
    else if (!semanalOk) estado = 'semanal_en_contra';
    else if (h4Ok && H.since !== null && H.since <= RECENT_BARS) estado = 'entrada';
    else if (h4Ok) estado = 'en_curso';
    else estado = 'esperando_cruce';
    const adxOk = adxD === null ? null : adxD < EARLY_ADX_MAX;
    const cruceSuave = crossAtr === null ? null : crossAtr < EARLY_CROSS_ATR_MAX;
    const diarioJoven = dir === 0 ? null : diarioOk && d1.since !== null && d1.since <= EARLY_DAILY_MAX_DAYS;
    const puntos = [adxOk, cruceSuave, diarioJoven].filter((x) => x === true).length;
    const calidad = { adx_d: round(adxD, 1), adx_ok: adxOk, cruce_atr: round(crossAtr, 2), cruce_suave: cruceSuave, diario_dias: diarioOk ? d1.since : null, diario_joven: diarioJoven, puntos, temprana: puntos >= 2 };
    // Objetivos de la regla del usuario (1,5R y 2R) y precio de +1,1R para pasar el stop a la entrada, desde el precio actual.
    const objetivos = (stop) => {
      if (stop === null || !price) return null;
      const risk = Math.abs(price - stop); if (!(risk > 0)) return null;
      const at = (k) => round(dir > 0 ? price + k * risk : price - k * risk, digits);
      return { r15: at(1.5), r2: at(2), be: at(BE_TRIGGER_R) };
    };
    rows.push({
      symbol: p.symbol, base: p.base, quote: p.quote, synthetic: !!p.synthetic, price, digits,
      bias: p.bias, diff: p.diff, level, tier, p5: p.conviction ? p.conviction.p5 : null,
      trend: p.structure ? p.structure.trend : null, er20: p.fluidity ? p.fluidity.er20 : null, liquidity: PAIR_LIQUIDITY[p.symbol] ?? 0.5,
      weekly: { dir: w1.dir, since: w1.since, ok: semanalOk },
      daily: { dir: d1.dir, since: d1.since, ok: diarioOk },
      h4: { dir: H.dir, since: H.since, ok: h4Ok, ema200: e200 === null ? null : (dir > 0 ? price > e200 : price < e200), last_bar: h4.length ? new Date(h4[h4.length - 1].time * 1000).toISOString() : null },
      stops: stops ? { estructura: stops.estructura, diario: stops.diario, estructura_sizing: sizing(stops.estructura), diario_sizing: sizing(stops.diario), estructura_objetivos: objetivos(stops.estructura), diario_objetivos: objetivos(stops.diario) } : null,
      atr_pips: p.conviction ? p.conviction.atr_pips : null,
      calidad,
      estado,
      warnings: (p.warnings || []).map((w) => w.text),
    });
  }
  const order = { entrada: 0, en_curso: 1, esperando_cruce: 2, semanal_en_contra: 3, sin_sesgo: 4 };
  const tierRank = { A: 0, B: 1, C: 2 };
  rows.sort((a, b) => (order[a.estado] - order[b.estado]) || (b.calidad.puntos - a.calidad.puntos) || ((tierRank[a.tier] ?? 3) - (tierRank[b.tier] ?? 3)) || (b.level - a.level) || (b.liquidity - a.liquidity));
  const selected = rows.filter((r) => ['entrada', 'en_curso', 'esperando_cruce'].includes(r.estado)).slice(0, SWING_MAX_PAIRS);
  return {
    as_of: new Date(now).toISOString(),
    account: { usd: accountUsd, risk_pct: riskPct, max_pairs: SWING_MAX_PAIRS },
    rules: { be_trigger_r: BE_TRIGGER_R, targets_r: TARGETS_R, early: { adx_max: EARLY_ADX_MAX, cross_atr_max: EARLY_CROSS_ATR_MAX, daily_max_days: EARLY_DAILY_MAX_DAYS } },
    evidence: { text: 'Cruce 8/18 en H4 con semanal 8/18 alineada y sesgo del radar a favor, stop en el día anterior y objetivo 2R: 40 % de acierto, +0,21R (n=374, 2024-2026, 14 pares). Con 2 de 3 señales de entrada temprana (ADX diario < 20, cruce suave < 0,5 ATR, diario a favor desde ≤ 10 días): 55 % a 2R (+0,65R) y 60 % a 1,5R (+0,50R), n=80, positivo los tres años. Pasar el stop a la entrada en +1,1R cuesta entre 5 y 8 puntos de acierto y deja el R igual. El cruce sin el radar pierde (−0,04R).' },
    selected: selected.map((r) => r.symbol),
    pairs: rows,
  };
}
