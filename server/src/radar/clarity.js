// CLARIDAD DEL SESGO (14-11-2026, docs/CONVICCION.md «Claridad con 15 años», server/scripts/radar-sesgo-15a.mjs).
// Medido en los 8 pares fijos del radar, 2011 → 2026 (17.747 pares-día con |sesgo| ≥ 2, radar reconstruido point-in-time):
// el sesgo fundamental acierta la dirección a 20 días el 57,5 % de las veces. Cinco condiciones conocidas ese día lo
// mueven ≥ 2 puntos en los TRES bloques (2011–15, 2016–20, 2021–26), y son las mismas cinco que salen al elegirlas con
// dos bloques y probarlas en el tercero:
//   a favor   · el sesgo ha crecido en 20 sesiones               (60,8 %: 67,4 / 54,5 / 60,9)
//             · el bono a 2 años aún no acompaña al sesgo        (61,3 %: 64,7 / 58,0 / 62,0)
//   en contra · precio ≥ 1,5 ATR más allá de su media de 20 días, a favor del sesgo   (53,3 %: 59,9 / 43,2 / 54,6)
//             · precio en máximos (o mínimos) de 20 días a favor del sesgo            (52,8 %: 59,4 / 44,4 / 53,4)
//             · mercado en tendencia limpia (eficiencia de 20 días ≥ 0,4)             (53,3 %: 60,0 / 49,9 / 50,4)
// Lectura: el sesgo rinde cuando se está formando y el precio todavía no lo ha corrido; rinde poco cuando el precio ya
// se ha ido. NO cambia la puntuación del sesgo ni el modelo de convicción: es una lectura de evidencia aparte.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Acierto a 20 días por nivel (8 pares, 2011–2026). `indep` = contando una señal por par cada 20 sesiones (sin solapes). */
export const CLARITY_EVIDENCE = {
  base: { hit: 57.5, n: 17747, indep: 56.6, n_indep: 1070, blocks: [62.2, 52.4, 58.4] },
  alta: { hit: 66.4, n: 2174, indep: 62.3, n_indep: 332, blocks: [67.3, 63.0, 69.6], h5: 59.2, h10: 63.0, atr: 1.12, years_good: 13, years: 16 },
  media: { hit: 59.5, n: 6646, blocks: [66.0, 54.7, 59.2], h5: 55.1, h10: 56.8, atr: 0.5 },
  normal: { hit: 55.2, n: 5784, blocks: [59.2, 48.8, 57.5], h5: 54.7, h10: 54.7, atr: 0.36 },
  baja: { hit: 51.3, n: 3143, indep: 54.1, n_indep: 519, h5: 53.3, h10: 52.9, atr: 0.19 },
};
/** Acierto del sesgo a 20 días por par (|sesgo| ≥ 2, 2011–2026): [%, n, bloques]. USDCHF y USDCAD: sin ventaja estable. */
export const PAIR_BIAS_EVIDENCE = {
  EURUSD: [63.3, 1252, [75.1, 57.9, 62.1]], EURJPY: [62.7, 1908, [69.4, 56.7, 64.1]], USDJPY: [60.7, 2602, [66.7, 52.2, 65.0]], AUDJPY: [58.9, 2954, [66.1, 52.5, 58.7]],
  GBPUSD: [58.1, 1641, [54.5, 60.6, 60.6]], EURGBP: [55.7, 1731, [55.8, 47.0, 62.4]], USDCAD: [54.7, 2295, [63.3, 51.9, 50.9]], USDCHF: [51.2, 3364, [59.8, 47.3, 49.9]],
};
export const CLARITY_HORIZON_D = 20;
const TEXT = {
  creciendo: 'el sesgo ha crecido en el último mes',
  bono: 'el bono a 2 años aún no lo acompaña (queda por descontar)',
  extendido: 'el precio ya está extendido a favor del sesgo',
  maximos: 'el precio está en extremos de 20 días a favor del sesgo',
  tendencia: 'el precio ya viene en tendencia limpia',
};

function atr14(bars) {
  if (bars.length < 15) return null;
  let s = 0;
  for (let i = bars.length - 14; i < bars.length; i++) {
    const b = bars[i]; const pc = bars[i - 1].close;
    const hi = b.high ?? Math.max(b.open ?? b.close, b.close); const lo = b.low ?? Math.min(b.open ?? b.close, b.close);
    s += Math.max(hi, pc) - Math.min(lo, pc);
  }
  return s / 14;
}

/**
 * Condiciones de claridad de un par. Todo lo que recibe es conocido hoy.
 * @param {{ symbol: string, diff: number, prevDiff20: number|null, expectDiff: number|null, bars: Array<{open?:number, high?:number, low?:number, close:number}> }} ctx
 *   prevDiff20 = sesgo del par hace 20 sesiones; expectDiff = pilar «expectativas» (bono a 2 años) de la base menos el de la cotizada.
 * @returns {null | { tier: 'alta'|'media'|'normal'|'baja', score: number, pros: string[], cons: string[], hit: number, hit_indep: number|null, base: number, horizon_d: number, n: number, text: string, pair: null | { hit: number, n: number, weak: boolean } }}
 */
export function clarityFor(ctx) {
  const diff = Number(ctx.diff);
  if (!Number.isFinite(diff) || Math.abs(diff) < 2) return null;
  const s = diff > 0 ? 1 : -1;
  const bars = (ctx.bars || []).filter((b) => b && Number.isFinite(b.close) && b.close > 0);
  const flags = { creciendo: false, bono: false, extendido: false, maximos: false, tendencia: false };
  if (ctx.prevDiff20 !== null && ctx.prevDiff20 !== undefined && Number.isFinite(ctx.prevDiff20)) flags.creciendo = Math.abs(diff) > Math.abs(ctx.prevDiff20) + 0.5;
  if (ctx.expectDiff !== null && ctx.expectDiff !== undefined && Number.isFinite(ctx.expectDiff)) flags.bono = s * ctx.expectDiff < -0.25;
  const atr = atr14(bars);
  if (atr && bars.length >= 21) {
    const last = bars[bars.length - 1].close; const w = bars.slice(-20);
    const sma = w.reduce((a, b) => a + b.close, 0) / 20;
    flags.extendido = (s * (last - sma)) / atr >= 1.5;
    const hi = Math.max(...w.map((b) => b.high ?? b.close)), lo = Math.min(...w.map((b) => b.low ?? b.close));
    flags.maximos = s > 0 ? last >= hi - 0.25 * atr : last <= lo + 0.25 * atr;
    let path = 0; for (let i = bars.length - 20; i < bars.length; i++) path += Math.abs(bars[i].close - bars[i - 1].close);
    flags.tendencia = path > 0 && Math.abs(last - bars[bars.length - 21].close) / path >= 0.4;
  }
  const pros = ['creciendo', 'bono'].filter((k) => flags[k]); const cons = ['extendido', 'maximos', 'tendencia'].filter((k) => flags[k]);
  const score = clamp(pros.length - cons.length, -3, 2);
  const tier = score >= 2 ? 'alta' : score === 1 ? 'media' : score === 0 ? 'normal' : 'baja';
  const ev = CLARITY_EVIDENCE[tier]; const pe = PAIR_BIAS_EVIDENCE[ctx.symbol] || null;
  const dir = s > 0 ? 'alcista' : 'bajista';
  const text = tier === 'alta'
    ? `Sesgo ${dir} con claridad ALTA: en 15 años, así fue a favor el ${Math.round(ev.indep)}–${Math.round(ev.hit)} % de las veces a 20 días (lo normal es ${Math.floor(CLARITY_EVIDENCE.base.hit)} %).`
    : tier === 'media'
      ? `Sesgo ${dir} con claridad MEDIA: así fue a favor el ${Math.round(ev.hit)} % de las veces a 20 días (lo normal es ${Math.floor(CLARITY_EVIDENCE.base.hit)} %).`
      : tier === 'normal'
        ? `Sesgo ${dir} sin nada que lo refuerce: así fue a favor el ${Math.round(ev.hit)} % de las veces a 20 días.`
        : `Sesgo ${dir}, pero mal momento para seguirlo: así fue a favor solo el ${Math.round(ev.hit)}–${Math.round(ev.indep)} % de las veces a 20 días. Mejor esperar un retroceso.`;
  return {
    tier, score, pros: pros.map((k) => TEXT[k]), cons: cons.map((k) => TEXT[k]),
    hit: ev.hit, hit_indep: ev.indep ?? null, base: CLARITY_EVIDENCE.base.hit, horizon_d: CLARITY_HORIZON_D, n: ev.n, text,
    pair: pe ? { hit: pe[0], n: pe[1], weak: pe[0] < 55 } : null,
  };
}
