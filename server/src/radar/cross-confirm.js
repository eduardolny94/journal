// Confirmación cruzada (guía introductoria DCM FX Protrader, secciones 4 y 5, 19-10-2026): "si vas largo EUR/USD, el
// bono, el DXY y los equities deberían contar la misma historia; si discrepan, la operación tiene grieta".
// Para una señal del radar (par + sentido) mide, en los últimos N días de mercado y solo con datos conocidos a la fecha:
//   · diferencial de bonos: cambio del bono a 2 años de la base menos el de la cotizada (pb). A favor si sube en el
//     sentido de la señal (yields ↔ divisas: el capital va a la divisa cuyo diferencial mejora).
//   · dólar: cambio del DXY, solo en pares con USD, leído desde el lado del dólar en el par.
//   · riesgo: cambio del S&P 500 ponderado por la exposición del par al apetito por riesgo (AUD/NZD pro-riesgo, JPY/CHF
//     refugio). Pares sin exposición (p. ej. EURGBP) no cuentan.
// Devuelve cada componente en [−1, 1] (a favor positivo) y la media de los disponibles. Entra en la capa de convicción
// como candidata (`confirmacion_cruzada`, y el diferencial solo como `diferencial_2a`); se adopta solo si mejora el
// nivel A fuera de muestra en los tres cortes (regla de la casa, cycle.js).
import { yieldSeries } from './sources/yields.js';
import { riskBeta } from './conviction.js';

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/** Escalas: 25 pb de diferencial, 1 % de DXY y 2 % de S&P en una semana valen ±1. */
const SCALE = { yield_bp: 25, dxy_pct: 1, spx_pct: 2 };

const cache = new WeakMap(); // db → Map(ccy → filas ascendentes del bono)
function yieldRows(db, ccy) {
  let m = cache.get(db);
  if (!m) { m = new Map(); cache.set(db, m); }
  if (!m.has(ccy)) {
    let rows = [];
    try { rows = yieldSeries(db, ccy).rows || []; } catch { rows = []; }
    m.set(ccy, rows);
  }
  return m.get(ccy);
}
/** Borra la caché (el motor la llama tras refrescar bonos). */
export function resetCrossConfirmCache(db) { cache.delete(db); }

/** Cambio en pb del bono de `ccy` entre la última fecha ≤ date y n filas antes (null si falta histórico o está viejo). */
function yieldChange(db, ccy, date, n) {
  const rows = yieldRows(db, ccy);
  if (rows.length < n + 1) return null;
  let lo = 0, hi = rows.length - 1, i = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date <= date) { i = m; lo = m + 1; } else hi = m - 1; }
  if (i < n) return null;
  if (daysBetween(rows[i].date, date) > 10) return null; // sin dato reciente: no se usa
  return (rows[i].value - rows[i - n].value) * 100;
}
function daysBetween(a, b) { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000); }
function pctChange(closes, n) {
  if (!Array.isArray(closes) || closes.length < n + 1) return null;
  const last = closes[closes.length - 1], prev = closes[closes.length - 1 - n];
  return Number.isFinite(last) && Number.isFinite(prev) && prev ? ((last - prev) / prev) * 100 : null;
}

/**
 * @param {object} db
 * @param {{symbol:string, sign:number, date:string, dxyCloses?:number[], spxCloses?:number[], n?:number}} o
 *   sign = +1 si el sesgo favorece a la base, −1 si favorece a la cotizada. date = YYYY-MM-DD (datos ≤ date).
 * @returns {{ confirm:number|null, yieldDiff:number|null, dxy:number|null, risk:number|null, parts:number }}
 */
export function crossConfirm(db, { symbol, sign, date, dxyCloses, spxCloses, n = 5 }) {
  const out = { confirm: null, yieldDiff: null, dxy: null, risk: null, parts: 0 };
  if (!symbol || symbol.length < 6 || !sign) return out;
  const base = symbol.slice(0, 3), quote = symbol.slice(3, 6);
  const yb = yieldChange(db, base, date, n), yq = yieldChange(db, quote, date, n);
  if (yb !== null && yq !== null) out.yieldDiff = clamp((sign * (yb - yq)) / SCALE.yield_bp, -1, 1);
  const usdSide = base === 'USD' ? 1 : quote === 'USD' ? -1 : 0;
  const dDxy = pctChange(dxyCloses, n);
  if (usdSide && dDxy !== null) out.dxy = clamp((sign * usdSide * dDxy) / SCALE.dxy_pct, -1, 1);
  const beta = riskBeta(symbol);
  const dSpx = pctChange(spxCloses, n);
  if (beta && dSpx !== null) out.risk = clamp((sign * Math.sign(beta) * dSpx) / SCALE.spx_pct, -1, 1);
  const parts = [out.yieldDiff, out.dxy, out.risk].filter((v) => v !== null);
  out.parts = parts.length;
  out.confirm = parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
  return out;
}

/** Cambio del bono a 2 años de `ccy` en el último día de mercado conocido a `date` (pb), o null. Para "sorpresa confirmada por el bono". */
export function yieldMove1d(db, ccy, date) { return yieldChange(db, ccy, date, 1); }

/** Texto corto para la UI: qué confirma y qué discrepa. */
export function crossConfirmText(cc) {
  if (!cc || !cc.parts) return null;
  const tag = (v, name) => (v === null ? null : `${name} ${v > 0.15 ? 'a favor' : v < -0.15 ? 'en contra' : 'neutro'}`);
  return [tag(cc.yieldDiff, 'bonos 2a'), tag(cc.dxy, 'dólar'), tag(cc.risk, 'riesgo')].filter(Boolean).join(' · ');
}
