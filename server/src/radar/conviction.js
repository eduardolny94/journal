// Capa de convicción: ¿cuándo merece la pena operar un sesgo? Un modelo logístico con todas las condiciones que
// hemos ido midiendo (fuerza, novedad, tendencia, vela de ayer, extensión, régimen, COT, noticias, sorpresas, pilares
// cuantitativos), ajustado con el historial del backtest y validado fuera de muestra (walk-forward: se entrena con los
// dos primeros tercios y se mide en el último). El resultado es una probabilidad por par y día y un nivel:
//   A ≥ 60 % · B 55–60 % · C < 55 % (no operar). Los niveles se enseñan con su acierto REAL fuera de muestra.
// Las mismas funciones sirven en vivo (finishRadar) y en el backtest, para que lo medido sea lo que se muestra.

export const FEATURE_NAMES = [
  'fuerza', 'extremo', 'crecimiento', 'tendencia20', 'vela_ayer', 'extension_ema', 'eficiencia',
  'vix_tension', 'cot_extremo', 'noticia_24h', 'ultima_sorpresa', 'valor', 'tendencia_larga', 'sorpresas', 'par_usd', 'par_jpy',
  'taylor', 'descontado', 'real', 'tot',
];
/** Cambia cuando cambian las condiciones: el motor recalcula el modelo si el guardado es de otra versión. */
export const FEATURE_VERSION = 3;
/**
 * Condiciones base (las 16 validadas en la fase 1). Las demás son candidatas: se miden en cada backtest y el ciclo de
 * mejora (cycle.js) las adopta o retira por reglas fijas; el conjunto activo vive en radar_meta 'ciclo_mejora'.
 */
export const BASE_FEATURES = FEATURE_NAMES.filter((n) => !['taylor', 'descontado', 'real', 'tot'].includes(n));
export const CANDIDATE_FEATURES = FEATURE_NAMES.filter((n) => !BASE_FEATURES.includes(n));
export const indexesOf = (names) => names.map((n) => FEATURE_NAMES.indexOf(n)).filter((i) => i >= 0);
/** Regularización L2 del modelo (más alto = pesos más pequeños, menos sobreajuste). */
export const LAMBDA = 2;
export const TIER_A = 0.6;
export const TIER_B = 0.55;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const sigmoid = (t) => 1 / (1 + Math.exp(-t));

function ema(values, period) {
  if (!values.length) return null;
  const k = 2 / (period + 1);
  let e = values[0];
  for (let i = 1; i < values.length; i++) e = values[i] * k + e * (1 - k);
  return e;
}
function atrOf(bars, period = 14) {
  if (bars.length < period + 1) return null;
  const trs = [];
  for (let i = bars.length - period; i < bars.length; i++) {
    const b = bars[i];
    const pc = bars[i - 1].close;
    const hi = b.high ?? Math.max(b.open ?? b.close, b.close);
    const lo = b.low ?? Math.min(b.open ?? b.close, b.close);
    trs.push(Math.max(hi - lo, Math.abs(hi - pc), Math.abs(lo - pc)));
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}
function efficiency(closes, n = 20) {
  if (closes.length < n + 1) return null;
  const c = closes.slice(-(n + 1));
  let noise = 0;
  for (let i = 1; i < c.length; i++) noise += Math.abs(c[i] - c[i - 1]);
  return noise ? Math.abs(c[c.length - 1] - c[0]) / noise : 0;
}

/**
 * Vector de condiciones de una señal (todas en el sentido del sesgo: positivo = a favor).
 * @param {object} ctx { diff, prevDiff5, bars (diarias OHLC ascendentes, la última = hoy cerrada), vix, cotExtreme,
 *                       newsSoon, lastSurprise (−1|0|1 ya alineado), pillarDiff {valor, tendencia, sorpresas}, symbol }
 */
export function signalFeatures(ctx) {
  const s = ctx.diff > 0 ? 1 : -1;
  const bars = ctx.bars || [];
  const closes = bars.map((b) => b.close);
  const last = bars[bars.length - 1];
  const atr = atrOf(bars, 14);
  const level = Math.min(5, Math.round(Math.abs(ctx.diff) / 2));
  const prev = ctx.prevDiff5;
  const growth = prev === null || prev === undefined ? 0 : clamp((Math.abs(ctx.diff) - Math.abs(prev)) / 4, -1, 1);
  const trend20 = atr && closes.length > 21 ? clamp(((closes[closes.length - 1] - closes[closes.length - 21]) / (atr * Math.sqrt(20))) * s, -3, 3) / 3 : 0;
  const candle = atr && last && last.open ? clamp(((last.close - last.open) / atr) * s, -2, 2) / 2 : 0;
  const e20 = closes.length >= 20 ? ema(closes.slice(-60), 20) : null;
  const extension = atr && e20 !== null ? clamp(((closes[closes.length - 1] - e20) / atr) * s, -3, 3) / 3 : 0;
  const er = efficiency(closes, 20);
  const pd = ctx.pillarDiff || {};
  const x = [
    level / 5,
    level >= 4 ? 1 : 0,
    growth,
    trend20,
    candle,
    extension,
    er === null ? 0.3 : er,
    ctx.vix !== null && ctx.vix !== undefined && ctx.vix > 25 ? 1 : 0,
    ctx.cotExtreme ? 1 : 0,
    ctx.newsSoon ? 1 : 0,
    clamp(ctx.lastSurprise || 0, -1, 1),
    clamp(((pd.valor || 0) * s) / 2, -1, 1),
    clamp(((pd.tendencia || 0) * s) / 2, -1, 1),
    clamp(((pd.sorpresas || 0) * s) / 2, -1, 1),
    ctx.symbol && ctx.symbol.includes('USD') ? 1 : 0,
    ctx.symbol && ctx.symbol.includes('JPY') ? 1 : 0,
    clamp(((pd.taylor || 0) * s) / 2, -1, 1),
    clamp(((pd.descontado || 0) * s) / 2, -1, 1),
    clamp(((pd.real || 0) * s) / 2, -1, 1),
    clamp(((pd.tot || 0) * s) / 2, -1, 1),
  ];
  return { x, atr, level };
}

// ---------- Regresión logística multivariable (Newton con L2) ----------

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    [M[c], M[piv]] = [M[piv], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) return null;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Ajusta w (con intercepto en la posición 0) por Newton–Raphson con penalización L2 (no sobre el intercepto). */
export function fitLogitMulti(X, y, lambda = 2, iters = 30) {
  const n = X.length;
  if (n < 100) return null;
  const d = X[0].length + 1;
  let w = new Array(d).fill(0);
  for (let it = 0; it < iters; it++) {
    const g = new Array(d).fill(0);
    const H = Array.from({ length: d }, () => new Array(d).fill(0));
    for (let i = 0; i < n; i++) {
      const xi = [1, ...X[i]];
      let t = 0;
      for (let k = 0; k < d; k++) t += w[k] * xi[k];
      const p = sigmoid(t);
      const r = p - y[i];
      const v = p * (1 - p);
      for (let a = 0; a < d; a++) {
        g[a] += r * xi[a];
        for (let b = a; b < d; b++) H[a][b] += v * xi[a] * xi[b];
      }
    }
    for (let a = 0; a < d; a++) {
      for (let b = 0; b < a; b++) H[a][b] = H[b][a];
      if (a > 0) { g[a] += lambda * w[a]; H[a][a] += lambda; }
    }
    const step = solve(H, g);
    if (!step) break;
    let maxStep = 0;
    for (let k = 0; k < d; k++) { w[k] -= step[k]; maxStep = Math.max(maxStep, Math.abs(step[k])); }
    if (maxStep < 1e-6) break;
  }
  return { w: w.map((v) => Number(v.toFixed(5))), n };
}

export function predictProb(model, x) {
  if (!model || !model.w) return null;
  let t = model.w[0];
  for (let k = 0; k < x.length; k++) t += (model.w[k + 1] || 0) * x[k];
  return sigmoid(t);
}

export const tierOf = (p) => (p === null ? 'C' : p >= TIER_A ? 'A' : p >= TIER_B ? 'B' : 'C');

const REASON_TEXT = {
  fuerza: ['sesgo claro', 'sesgo débil'],
  extremo: ['divergencia extrema (suele revertir)', 'divergencia extrema (suele revertir)'],
  crecimiento: ['sesgo creciendo', 'sesgo menguando'],
  tendencia20: ['tendencia de 20 días a favor', 'tendencia de 20 días en contra'],
  vela_ayer: ['vela de ayer a favor', 'vela de ayer en contra'],
  extension_ema: ['precio ya extendido', 'precio sin extender'],
  eficiencia: ['mercado en tendencia', 'mercado lateral'],
  vix_tension: ['régimen de tensión (VIX > 25)', 'régimen de calma'],
  cot_extremo: ['COT en extremo', 'COT sin extremo'],
  noticia_24h: ['dato de alto impacto en 24 h', 'sin datos fuertes en 24 h'],
  ultima_sorpresa: ['último dato a favor', 'último dato en contra'],
  valor: ['valor (PPP) a favor', 'valor (PPP) en contra'],
  tendencia_larga: ['tendencia de meses a favor', 'tendencia de meses en contra'],
  sorpresas: ['sorpresas macro a favor', 'sorpresas macro en contra'],
  par_usd: ['par con dólar', 'cruce sin dólar'],
  par_jpy: ['par con yen', 'par sin yen'],
  taylor: ['regla de Taylor a favor (el banco central va por detrás)', 'regla de Taylor en contra'],
  descontado: ['el mercado aún no descuenta lo que piden los datos', 'el mercado ya lo descuenta'],
  real: ['tipo real a favor', 'tipo real en contra'],
  tot: ['materias primas a favor', 'materias primas en contra'],
};

/** Las 3 condiciones que más suman y las 2 que más restan, en castellano, para explicar un nivel. */
export function explain(model, x) {
  if (!model || !model.w) return { pros: [], cons: [] };
  const contrib = FEATURE_NAMES.map((name, k) => ({ name, c: (model.w[k + 1] || 0) * x[k], x: x[k] }));
  const text = (c) => {
    const t = REASON_TEXT[c.name];
    if (!t) return c.name;
    // El texto describe el estado observado; si la condición es binaria y vale 0, se usa la segunda frase.
    return c.x >= 0.15 ? t[0] : c.x <= -0.15 ? t[1] : t[1];
  };
  const pros = contrib.filter((c) => c.c > 0.04).sort((a, b) => b.c - a.c).slice(0, 3).map(text);
  const cons = contrib.filter((c) => c.c < -0.04).sort((a, b) => a.c - b.c).slice(0, 2).map(text);
  return { pros, cons };
}

function bucket() { return { n: 0, hits: 0, pips: 0, r: 0 }; }
function add(b, pips, r) { b.n++; if (pips > 0) b.hits++; b.pips += pips; b.r += r; }
function fin(b) { return { n: b.n, hit_rate: b.n ? Math.round((1000 * b.hits) / b.n) / 10 : null, avg_pips: b.n ? Math.round((10 * b.pips) / b.n) / 10 : null, avg_r: b.n ? Math.round((100 * b.r) / b.n) / 100 : null }; }

/**
 * Construye el modelo de convicción para un horizonte con validación walk-forward.
 * @param {Array} rows [{ date, sym, x, signed_pips: {h: pips}, r: {h: pips/ATR} }]
 */
export function buildConvictionModel(rows, { horizon, splitIndexFraction = 2 / 3, lambda = LAMBDA, mask = indexesOf(BASE_FEATURES), candidates = false } = {}) {
  // `mask`: índices de condiciones que entran en el modelo; el resto se anula (peso 0) sin cambiar la forma del vector,
  // así `predictProb` y `explain` funcionan con el vector completo. `null` = todas.
  const xOf = mask ? (r) => r.x.map((v, i) => (mask.includes(i) ? v : 0)) : (r) => r.x;
  const usable = rows.filter((r) => r.signed_pips[horizon] !== undefined);
  if (usable.length < 300) return null;
  const dates = [...new Set(usable.map((r) => r.date))].sort();
  const splitDate = dates[Math.floor(dates.length * splitIndexFraction)];
  const train = usable.filter((r) => r.date < splitDate);
  const test = usable.filter((r) => r.date >= splitDate);
  const fit = (set) => fitLogitMulti(set.map(xOf), set.map((r) => (r.signed_pips[horizon] > 0 ? 1 : 0)), lambda);
  const trainModel = fit(train);
  if (!trainModel) return null;
  const tiers = { A: bucket(), B: bucket(), C: bucket() };
  const byPair = {};
  for (const r of test) {
    const p = predictProb(trainModel, xOf(r));
    const t = tierOf(p);
    add(tiers[t], r.signed_pips[horizon], r.r[horizon]);
    if (t === 'A') {
      byPair[r.sym] ||= bucket();
      add(byPair[r.sym], r.signed_pips[horizon], r.r[horizon]);
    }
  }
  const all = bucket();
  for (const r of test) add(all, r.signed_pips[horizon], r.r[horizon]);
  const finalModel = fit(usable);
  // Vigilancia: las condiciones candidatas (una a una y todas) y la robustez del modelo activo con otro corte temporal
  // (entrenar con la primera mitad y probar con la segunda), para no fiarse de un solo periodo de prueba.
  let candidatos = null;
  let robustez = null;
  if (candidates) {
    const oos = (opts) => {
      const m = buildConvictionModel(rows, { horizon, lambda, candidates: false, ...opts });
      return m ? { A: m.test.tiers.A, B: m.test.tiers.B, from: m.test.from } : null;
    };
    const activeNames = mask ? FEATURE_NAMES.filter((_, i) => mask.includes(i)) : FEATURE_NAMES;
    candidatos = { todas: oos({ mask: null }) };
    for (const c of FEATURE_NAMES) if (!activeNames.includes(c)) candidatos[`con_${c}`] = oos({ mask: indexesOf([...activeNames, c]) });
    robustez = { corte_1_2: oos({ mask, splitIndexFraction: 0.5 }), corte_1_3: oos({ mask, splitIndexFraction: 1 / 3 }) };
  }
  return {
    horizon_d: horizon,
    feature_version: FEATURE_VERSION,
    features: FEATURE_NAMES,
    features_active: mask ? FEATURE_NAMES.filter((_, i) => mask.includes(i)) : FEATURE_NAMES,
    thresholds: { A: TIER_A, B: TIER_B },
    lambda,
    mask,
    candidatos,
    robustez,
    train: { from: dates[0], to: splitDate, n: train.length },
    test: { from: splitDate, to: dates[dates.length - 1], n: test.length, all: fin(all), tiers: { A: fin(tiers.A), B: fin(tiers.B), C: fin(tiers.C) }, tier_a_by_pair: Object.fromEntries(Object.entries(byPair).map(([k, b]) => [k, fin(b)])) },
    model_test: trainModel,
    model: finalModel,
  };
}
