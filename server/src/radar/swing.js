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
    const H = state(h4.map((b) => b.close));
    const e200 = h4.length >= TREND ? ema(h4.map((b) => b.close), TREND)[h4.length - 1] : null;
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
    rows.push({
      symbol: p.symbol, base: p.base, quote: p.quote, synthetic: !!p.synthetic, price, digits,
      bias: p.bias, diff: p.diff, level, tier, p5: p.conviction ? p.conviction.p5 : null,
      trend: p.structure ? p.structure.trend : null, er20: p.fluidity ? p.fluidity.er20 : null, liquidity: PAIR_LIQUIDITY[p.symbol] ?? 0.5,
      weekly: { dir: w1.dir, since: w1.since, ok: semanalOk },
      daily: { dir: d1.dir, since: d1.since, ok: diarioOk },
      h4: { dir: H.dir, since: H.since, ok: h4Ok, ema200: e200 === null ? null : (dir > 0 ? price > e200 : price < e200), last_bar: h4.length ? new Date(h4[h4.length - 1].time * 1000).toISOString() : null },
      stops: stops ? { estructura: stops.estructura, diario: stops.diario, estructura_sizing: sizing(stops.estructura), diario_sizing: sizing(stops.diario) } : null,
      atr_pips: p.conviction ? p.conviction.atr_pips : null,
      estado,
      warnings: (p.warnings || []).map((w) => w.text),
    });
  }
  const order = { entrada: 0, en_curso: 1, esperando_cruce: 2, semanal_en_contra: 3, sin_sesgo: 4 };
  const tierRank = { A: 0, B: 1, C: 2 };
  rows.sort((a, b) => (order[a.estado] - order[b.estado]) || ((tierRank[a.tier] ?? 3) - (tierRank[b.tier] ?? 3)) || (b.level - a.level) || (b.liquidity - a.liquidity));
  const selected = rows.filter((r) => ['entrada', 'en_curso', 'esperando_cruce'].includes(r.estado)).slice(0, SWING_MAX_PAIRS);
  return {
    as_of: new Date(now).toISOString(),
    account: { usd: accountUsd, risk_pct: riskPct, max_pairs: SWING_MAX_PAIRS },
    evidence: { text: 'Cruce 8/18 en H4 con semanal 8/18 alineada y sesgo del radar a favor: +0,10R (stop de estructura) / +0,18R (stop en el día anterior), 39 % de acierto, n=375 (2024-2026, 14 pares). Con nivel A/B: +0,42R / +0,61R (n=46). El cruce sin el radar pierde (−0,04R) y filtrar por "pares tendenciales" empeora.' },
    selected: selected.map((r) => r.symbol),
    pairs: rows,
  };
}
