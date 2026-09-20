// Indicadores y agregaciones del radar. Velas: { time (epoch s UTC), open, high, low, close, volume }.
import { tradingDayFor, isoWeekKey, localParts } from '../services/tradingDay.js';

export const NY = { timezone: 'America/New_York', day_reset_hour: 17 };

// Día de trading y hora de Nueva York de cada vela. Formatear con Intl es lo más caro del cálculo, y crear un
// Intl.DateTimeFormat por vela reserva memoria nativa que Node tarda en liberar (llegó a tumbar el servidor por falta
// de memoria). Las mismas marcas de tiempo se repiten en todos los símbolos y en cada pasada: se memorizan.
const nyCache = new Map();
const NY_CACHE_MAX = 60_000;
function nyInfo(timeSec) {
  let v = nyCache.get(timeSec);
  if (!v) {
    const d = new Date(timeSec * 1000);
    v = { key: tradingDayFor(d, NY), hour: localParts(d, NY.timezone).hour };
    if (nyCache.size >= NY_CACHE_MAX) nyCache.clear();
    nyCache.set(timeSec, v);
  }
  return v;
}

export function ema(values, period) {
  if (!values.length) return [];
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

export function atr(bars, period = 14) {
  if (bars.length < 2) return null;
  const trs = [];
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i];
    const pc = bars[i - 1].close;
    trs.push(Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)));
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

/** Eficiencia de Kaufman sobre los últimos n cierres: |neto| / suma de |cambios|. */
export function efficiencyRatio(closes, n = 20) {
  if (closes.length < n + 1) return null;
  const c = closes.slice(-(n + 1));
  let noise = 0;
  for (let i = 1; i < c.length; i++) noise += Math.abs(c[i] - c[i - 1]);
  return noise ? Math.abs(c[c.length - 1] - c[0]) / noise : 0;
}

/** Agrupa velas H1 en días de trading de Nueva York (17:00 → 17:00 ET). */
export function aggregateNyDays(h1) {
  const days = [];
  let cur = null;
  for (const b of h1) {
    const { key } = nyInfo(b.time);
    if (!cur || cur.key !== key) {
      if (cur) days.push(cur);
      cur = { key, time: b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume || 0, bars: 1 };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
      cur.volume += b.volume || 0;
      cur.bars++;
    }
  }
  if (cur) days.push(cur);
  return days;
}

/** Agrupa H1 en bloques de 4 h alineados al inicio del día NY (17:00 ET). */
export function aggregateH4(h1) {
  const out = [];
  let cur = null;
  for (const b of h1) {
    // horas desde el inicio del día de trading (17:00 ET = 21:00 o 22:00 UTC según horario de verano): usar hora NY
    const { key, hour: hourNy } = nyInfo(b.time);
    const sinceReset = (hourNy - NY.day_reset_hour + 24) % 24;
    const block = `${key}-${Math.floor(sinceReset / 4)}`;
    if (!cur || cur.key !== block) {
      if (cur) out.push(cur);
      cur = { key: block, time: b.time, open: b.open, high: b.high, low: b.low, close: b.close };
    } else {
      cur.high = Math.max(cur.high, b.high);
      cur.low = Math.min(cur.low, b.low);
      cur.close = b.close;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Agrupa velas diarias (con `key` 'YYYY-MM-DD' o time) en semanas ISO. */
export function aggregateWeeks(days) {
  const out = [];
  let cur = null;
  for (const d of days) {
    const dateStr = d.key || new Date(d.time * 1000).toISOString().slice(0, 10);
    const wk = isoWeekKey(dateStr);
    if (!cur || cur.key !== wk) {
      if (cur) out.push(cur);
      cur = { key: wk, start: dateStr, end: dateStr, open: d.open, high: d.high, low: d.low, close: d.close };
    } else {
      cur.high = Math.max(cur.high, d.high);
      cur.low = Math.min(cur.low, d.low);
      cur.close = d.close;
      cur.end = dateStr;
    }
  }
  if (cur) out.push(cur);
  return out;
}

/** Tendencia por EMA20/EMA50 y pendiente de la EMA20. */
export function trendByEma(closes, fast = 20, slow = 50) {
  if (closes.length < slow + 5) return 'lateral';
  const f = ema(closes, fast);
  const s = ema(closes, slow);
  const lf = f[f.length - 1];
  const ls = s[s.length - 1];
  const slope = lf - f[f.length - 6];
  if (lf > ls && slope > 0) return 'alcista';
  if (lf < ls && slope < 0) return 'bajista';
  return 'lateral';
}

/** Tendencia semanal: cierre frente a EMA10 semanal y pendiente. */
export function trendWeekly(weekCloses) {
  if (weekCloses.length < 12) return 'lateral';
  const e = ema(weekCloses, 10);
  const last = weekCloses[weekCloses.length - 1];
  const slope = e[e.length - 1] - e[e.length - 4];
  if (last > e[e.length - 1] && slope > 0) return 'alcista';
  if (last < e[e.length - 1] && slope < 0) return 'bajista';
  return 'lateral';
}

/** Estructura por oscilaciones (pivotes de 2 velas): HH/HL alcista, LH/LL bajista, si no lateral. */
export function trendBySwings(bars, lookback = 60) {
  const b = bars.slice(-lookback);
  if (b.length < 12) return 'lateral';
  const highs = [];
  const lows = [];
  for (let i = 2; i < b.length - 2; i++) {
    if (b[i].high > b[i - 1].high && b[i].high > b[i - 2].high && b[i].high > b[i + 1].high && b[i].high > b[i + 2].high) highs.push(b[i].high);
    if (b[i].low < b[i - 1].low && b[i].low < b[i - 2].low && b[i].low < b[i + 1].low && b[i].low < b[i + 2].low) lows.push(b[i].low);
  }
  if (highs.length < 2 || lows.length < 2) return 'lateral';
  const hh = highs[highs.length - 1] > highs[highs.length - 2];
  const hl = lows[lows.length - 1] > lows[lows.length - 2];
  const lh = highs[highs.length - 1] < highs[highs.length - 2];
  const ll = lows[lows.length - 1] < lows[lows.length - 2];
  if (hh && hl) return 'alcista';
  if (lh && ll) return 'bajista';
  return 'lateral';
}

/** Retorno de las últimas n velas normalizado por ATR (unidades de ATR, recortado ±3). */
export function momentumAtr(bars, n, atrPeriod = 14) {
  if (bars.length < Math.max(n + 1, atrPeriod + 2)) return 0;
  const a = atr(bars, atrPeriod);
  if (!a) return 0;
  const last = bars[bars.length - 1].close;
  const ref = bars[bars.length - 1 - n].close;
  return Math.max(-3, Math.min(3, (last - ref) / (a * Math.sqrt(n))));
}

export function zscores(values) {
  const valid = values.filter((v) => v !== null && Number.isFinite(v));
  if (valid.length < 2) return values.map(() => 0);
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const sd = Math.sqrt(valid.reduce((a, b) => a + (b - mean) ** 2, 0) / (valid.length - 1));
  return values.map((v) => (v === null || !Number.isFinite(v) || !sd ? 0 : Math.max(-2, Math.min(2, (v - mean) / sd))));
}

export const round = (x, k = 2) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(k)));
export const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
