// Cruces sintéticos: los pares que no se descargan se calculan a partir de sus dos patas contra el dólar
// (EURCHF = EURUSD / USDCHF). Así el radar cubre las 28 combinaciones del G8 sin multiplicar las peticiones a Yahoo.
// Las velas sintéticas son aproximadas: apertura y cierre exactos; máximo y mínimo suponen que las patas se mueven
// a la vez (es lo habitual en un cruce), así que el rango real puede ser algo mayor.
import { MAJOR_PAIRS, SYNTHETIC_CROSS_PAIRS, pairDigits, pairPip, splitPair } from './constants.js';

/** Pata contra el dólar de una divisa: { sym, invert } (invert = el par es USDxxx y hay que invertirlo). */
export function usdLeg(ccy) {
  if (ccy === 'USD') return null;
  const direct = MAJOR_PAIRS.find((p) => p === `${ccy}USD`);
  if (direct) return { sym: direct, invert: false };
  const inverse = MAJOR_PAIRS.find((p) => p === `USD${ccy}`);
  return inverse ? { sym: inverse, invert: true } : null;
}

export function legsOf(sym) {
  const { base, quote } = splitPair(sym);
  return { base: usdLeg(base), quote: usdLeg(quote) };
}

const val = (x, invert) => (invert ? 1 / x : x);
const rnd = (x, d) => Number(x.toFixed(d));

/** Vela del cruce a partir de las velas de las dos patas en el mismo instante. */
function crossBar(a, b, invA, invB, digits) {
  // En dólares por unidad: la pata base y la pata cotizada; el cruce es base / cotizada.
  const o = val(a.open, invA) / val(b.open, invB);
  const c = val(a.close, invA) / val(b.close, invB);
  const hh = val(invA ? a.low : a.high, invA) / val(invB ? b.low : b.high, invB);
  const ll = val(invA ? a.high : a.low, invA) / val(invB ? b.high : b.low, invB);
  const high = Math.max(o, c, hh, ll);
  const low = Math.min(o, c, hh, ll);
  return { time: a.time, open: rnd(o, digits), high: rnd(high, digits), low: rnd(low, digits), close: rnd(c, digits), volume: Math.round(((a.volume || 0) + (b.volume || 0)) / 2) };
}

/** Alinea dos series de velas por `time` y devuelve las velas del cruce (ordenadas). */
export function synthBars(barsA, barsB, invA, invB, digits) {
  if (!Array.isArray(barsA) || !Array.isArray(barsB)) return [];
  const byTime = new Map(barsB.map((b) => [b.time, b]));
  const out = [];
  for (const a of barsA) {
    const b = byTime.get(a.time);
    if (!b || !(a.close > 0) || !(b.close > 0)) continue;
    out.push(crossBar(a, b, invA, invB, digits));
  }
  return out;
}

/** Velas diarias del cruce alineadas por fecha ('date'), para el backtest y la tabla de cierres. */
export function synthDaily(dailyA, dailyB, invA, invB, digits) {
  if (!Array.isArray(dailyA) || !Array.isArray(dailyB)) return [];
  const byDate = new Map(dailyB.map((b) => [b.date, b]));
  const out = [];
  for (const a of dailyA) {
    const b = byDate.get(a.date);
    if (!b || !(a.close > 0) || !(b.close > 0)) continue;
    out.push({ ...crossBar(a, b, invA, invB, digits), date: a.date });
  }
  return out;
}

/** Añade al bloque `symbols` los cruces sintéticos que se puedan construir con las patas presentes. */
export function addSyntheticSymbols(symbols) {
  for (const sym of SYNTHETIC_CROSS_PAIRS) {
    if (symbols[sym]) continue;
    const { base, quote } = legsOf(sym);
    if (!base || !quote) continue;
    const A = symbols[base.sym];
    const B = symbols[quote.sym];
    if (!A || !B || !A.h1 || !B.h1 || !A.h1.length || !B.h1.length) continue;
    const digits = pairDigits(sym);
    const h1 = synthBars(A.h1, B.h1, base.invert, quote.invert, digits);
    const d1 = synthBars(A.d1 || [], B.d1 || [], base.invert, quote.invert, digits);
    if (h1.length < 30) continue;
    const price = val(A.bid, base.invert) / val(B.bid, quote.invert);
    symbols[sym] = {
      symbol: sym,
      digits,
      pip: pairPip(sym),
      bid: rnd(price, digits),
      ask: rnd(price, digits),
      spread_pips: null,
      price_time: A.price_time < B.price_time ? A.price_time : B.price_time,
      h1,
      d1,
      synthetic: true,
    };
  }
  return symbols;
}
