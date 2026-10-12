// Validación estadística del radar (13-10-2026), dentro del backtest semanal: para todos los usuarios.
// ¿Bate el sesgo al azar? Para cada conjunto de señales (fuerza ≥ 2, fuerza ≥ 3, convicción A/B y A fuera de muestra)
// y horizonte:
//   - acierto y R medio (movimiento en ATR a favor del sesgo, sin spread ni gestión);
//   - IC 90 % por bootstrap de bloques mensuales (los días seguidos están correlacionados);
//   - p-valor por desplazamiento circular: la serie de señales se desplaza en el tiempo (mismo desfase para todos los
//     pares) y se mide contra los mismos rendimientos. Conserva la autocorrelación del sesgo y la correlación entre
//     pares; solo rompe el alineamiento con el futuro. p = probabilidad de que el azar con esa estructura lo iguale.
//   - veredicto: "demostrada" (p < 0,05 e IC por encima de 0), "indicios" (p < 0,10) o "sin ventaja demostrada".
// Además, la superficie umbral de fuerza × horizonte (sin permutaciones) para ver si el resultado es una meseta o un pico.
// Coste: ~1 s con 400 permutaciones; memoria: unas matrices Float64 de pares × días.
import { predictProb, tierOf } from './conviction.js';

function rng(seed) {
  let s = seed | 0;
  return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const r2 = (v, k = 3) => (Number.isFinite(v) ? Number(v.toFixed(k)) : null);

/**
 * @param {Array} rows filas de la capa de convicción: { date, sym, diff, x, r: {h: R a favor del sesgo} }
 * @param {object|null} conviction { h1, h5, h20 } de buildConvictionModel
 */
export function validateRadar(rows, conviction, { horizons = [1, 5, 20], nPerm = 400, nBoot = 800, seed = 20261013 } = {}) {
  const usable = rows.filter((r) => Number.isFinite(r.diff) && r.diff !== 0);
  if (usable.length < 500) return null;
  const rnd = rng(seed);
  const dates = [...new Set(usable.map((r) => r.date))].sort();
  const syms = [...new Set(usable.map((r) => r.sym))];
  const T = dates.length; const P = syms.length; const N = P * T;
  const di = new Map(dates.map((d, i) => [d, i])); const si = new Map(syms.map((s, i) => [s, i]));
  const month = dates.map((d) => d.slice(0, 7));
  const diff = new Float64Array(N).fill(NaN);
  const U = {}; for (const h of horizons) U[h] = new Float64Array(N).fill(NaN); // rendimiento en ATR sin signo (hacia arriba)
  const rowAt = new Array(N).fill(null);
  for (const r of usable) {
    const k = si.get(r.sym) * T + di.get(r.date);
    diff[k] = r.diff; rowAt[k] = r;
    for (const h of horizons) if (r.r && Number.isFinite(r.r[h])) U[h][k] = r.r[h] * Math.sign(r.diff);
  }
  // Convicción fuera de muestra por horizonte: niveles con el modelo entrenado antes del corte.
  const tiers = {};
  for (const h of horizons) {
    const m = conviction && conviction[`h${h}`];
    if (!m || !m.model_test || !m.test) continue;
    const mask = m.mask;
    const arr = new Int8Array(N); // 0 = no, 1 = B, 2 = A
    for (let k = 0; k < N; k++) {
      const r = rowAt[k]; if (!r || r.date < m.test.from) continue;
      const x = mask ? r.x.map((v, i) => (mask.includes(i) ? v : 0)) : r.x;
      const t = tierOf(predictProb(m.model_test, x));
      arr[k] = t === 'A' ? 2 : t === 'B' ? 1 : 0;
    }
    tiers[h] = { arr, from: m.test.from, t0: dates.findIndex((d) => d >= m.test.from) };
  }
  // Estadístico: media del rendimiento a favor de la señal desplazada `shift` días dentro de [w0, T).
  const stat = (h, sel, shift = 0, w0 = 0) => {
    const u = U[h]; const W = T - w0; let s = 0, n = 0, w = 0;
    for (let p = 0; p < P; p++) {
      const base = p * T;
      for (let t = w0; t < T; t++) {
        const ts = w0 + ((t - w0 + shift) % W); const dir = sel(base + ts); if (!dir) continue;
        const v = u[base + t]; if (!Number.isFinite(v)) continue;
        const x = dir * v; s += x; n++; if (x > 0) w++;
      }
    }
    return { mean: n ? s / n : NaN, n, hit: n ? w / n : NaN };
  };
  const boot = (h, sel, w0 = 0) => {
    const byMonth = new Map();
    for (let p = 0; p < P; p++) for (let t = w0; t < T; t++) { const k = p * T + t; const dir = sel(k); const v = U[h][k]; if (!dir || !Number.isFinite(v)) continue; const m = month[t]; if (!byMonth.has(m)) byMonth.set(m, [0, 0]); const b = byMonth.get(m); b[0] += dir * v; b[1]++; }
    const blocks = [...byMonth.values()]; if (blocks.length < 4) return [null, null];
    const means = [];
    for (let i = 0; i < nBoot; i++) { let s = 0, n = 0; for (let j = 0; j < blocks.length; j++) { const b = blocks[Math.floor(rnd() * blocks.length)]; s += b[0]; n += b[1]; } means.push(s / n); }
    means.sort((a, b) => a - b);
    return [means[Math.floor(0.05 * nBoot)], means[Math.floor(0.95 * nBoot)]];
  };
  const evaluate = (h, sel, w0 = 0) => {
    const o = stat(h, sel, 0, w0); if (o.n < 60) return { n: o.n };
    const W = T - w0; const null_ = [];
    for (let i = 0; i < nPerm; i++) null_.push(stat(h, sel, 10 + Math.floor(rnd() * (W - 20)), w0).mean);
    const p = (null_.filter((v) => v >= o.mean).length + 1) / (nPerm + 1);
    null_.sort((a, b) => a - b);
    const [lo, hi] = boot(h, sel, w0);
    const verdict = p < 0.05 && lo !== null && lo > 0 ? 'demostrada' : p < 0.1 ? 'indicios' : 'sin_ventaja';
    return { n: o.n, hit_rate: r2(100 * o.hit, 1), avg_r: r2(o.mean), ci90: [r2(lo), r2(hi)], p_value: r2(p), null_p95: r2(null_[Math.floor(0.95 * nPerm)]), verdict };
  };
  const byStrength = (min) => (k) => (Math.abs(diff[k]) >= min ? Math.sign(diff[k]) : 0);
  const sets = [];
  for (const h of horizons) {
    sets.push({ key: 'fuerza2', label: 'Fuerza ≥ 2', horizon_d: h, ...evaluate(h, byStrength(3)) });
    sets.push({ key: 'fuerza3', label: 'Fuerza ≥ 3', horizon_d: h, ...evaluate(h, byStrength(5)) });
    const tz = tiers[h];
    if (tz && tz.t0 > 0) {
      sets.push({ key: 'convAB', label: 'Convicción A/B (fuera de muestra)', horizon_d: h, from: tz.from, ...evaluate(h, (k) => (tz.arr[k] >= 1 ? Math.sign(diff[k]) : 0), tz.t0) });
      sets.push({ key: 'convA', label: 'Convicción A (fuera de muestra)', horizon_d: h, from: tz.from, ...evaluate(h, (k) => (tz.arr[k] === 2 ? Math.sign(diff[k]) : 0), tz.t0) });
    }
  }
  const surface = [];
  for (const min of [1, 2, 3, 4, 5, 6, 7]) for (const h of horizons) { const o = stat(h, byStrength(min)); surface.push({ min_diff: min, horizon_d: h, n: o.n, hit_rate: r2(100 * o.hit, 1), avg_r: r2(o.mean) }); }
  return {
    computed_at: new Date().toISOString(),
    from: dates[0], to: dates[T - 1], pairs: P, permutations: nPerm, bootstrap: nBoot,
    sets,
    surface,
    method: [
      'R = movimiento del cierre N días después en ATR diario, a favor del sesgo; sin spread ni gestión.',
      'p-valor: la serie de señales se desplaza en el tiempo (mismo desfase en todos los pares) y se compara con los mismos rendimientos; conserva la estructura del sesgo y solo rompe su relación con el futuro.',
      'IC 90 %: bootstrap por bloques de un mes. "Demostrada" exige p < 0,05 y el IC por encima de cero.',
      'La convicción A/B se mide solo en su periodo fuera de muestra, con el modelo entrenado antes del corte.',
    ],
  };
}
