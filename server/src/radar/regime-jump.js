// Régimen de mercado por "statistical jump model" (Nystrup, Lindström y Madsen 2020; Bemporad et al. 2018).
// Elegido el 13-10-2026 tras comparar 7 detectores (scripts/regimenes.mjs): VIX, volatilidad realizada, HMM gaussiano,
// k-medias de Wasserstein, Hurst, topología (H1) y este. Fue el único que separó con significación cuándo funciona
// el radar (estado turbulento: 39 % a 5 días frente a 52 %, p = 0,05) y la operativa swing C4L (−0,22R frente a
// +0,21R a 2R, p = 0,04), siempre etiquetando cada día solo con datos anteriores.
// Serie: "cesta dólar" = media de los log-rendimientos diarios del USD contra 7 divisas. Rasgos: media exponencial del
// rendimiento (vida media 10 d), de su valor absoluto (10 d) y del valor absoluto a 60 d, estandarizados.
// Modelo: k-medias de 2 estados con penalización λ por cada cambio de estado, resuelto con programación dinámica.

export const JUMP_LEGS = [['EURUSD', -1], ['GBPUSD', -1], ['AUDUSD', -1], ['NZDUSD', -1], ['USDCAD', 1], ['USDJPY', 1], ['USDCHF', 1]];
export const JUMP_LAMBDA = 8;
export const JUMP_EVIDENCE = 'En 2024-2026, con el régimen turbulento del modelo de salto el sesgo del radar acertó el 39 % a 5 días (calma: 52 %; p = 0,05) y la operativa swing dio −0,22R a 2R (calma: +0,21R; p = 0,04).';

const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))) || 1; };

/** Cesta dólar a partir de cierres diarios por par ({ sym: [{ date, close }] }); solo fechas con las 7 patas. */
export function dollarBasket(seriesBySym) {
  const maps = JUMP_LEGS.map(([s]) => new Map((seriesBySym[s] || []).filter((b) => b && b.close > 0).map((b) => [b.date, b.close])));
  if (maps.some((m) => m.size < 80)) return { dates: [], ret: [] };
  const dates = [...maps[0].keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  const outD = [], ret = [];
  for (let i = 1; i < dates.length; i++) {
    const r = JUMP_LEGS.map(([, sgn], k) => sgn * Math.log(maps[k].get(dates[i]) / maps[k].get(dates[i - 1])));
    if (r.some((v) => !Number.isFinite(v) || Math.abs(v) > 0.1)) continue;
    outD.push(dates[i]); ret.push(mean(r));
  }
  return { dates: outD, ret };
}

function features(ret) {
  const ew = (x, hl) => { const a = 1 - Math.pow(0.5, 1 / hl); const o = []; let e = x[0] || 0; for (const v of x) { e = a * v + (1 - a) * e; o.push(e); } return o; };
  const m = ew(ret, 10), ab = ew(ret.map(Math.abs), 10), ab60 = ew(ret.map(Math.abs), 60);
  return ret.map((_, i) => [m[i], ab[i], ab60[i]]);
}
function decode(X, th, lambda) {
  const N = X.length; if (!N) return [];
  const cost = (t, k) => X[t].reduce((s, v, d) => s + (v - th[k][d]) ** 2, 0);
  let prev = [cost(0, 0), cost(0, 1)]; const back = [[0, 0]];
  for (let t = 1; t < N; t++) {
    const cur = [0, 0]; const b = [0, 0];
    for (let k = 0; k < 2; k++) { const stay = prev[k], sw = prev[1 - k] + lambda; cur[k] = Math.min(stay, sw) + cost(t, k); b[k] = stay <= sw ? k : 1 - k; }
    back.push(b); prev = cur;
  }
  const s = new Array(N); s[N - 1] = prev[0] <= prev[1] ? 0 : 1;
  for (let t = N - 1; t > 0; t--) s[t - 1] = back[t][s[t]];
  return s;
}
function fit(X, lambda) {
  const med = [...X.map((x) => x[1])].sort((a, b) => a - b)[Math.floor(X.length / 2)];
  let s = X.map((x) => (x[1] > med ? 1 : 0)); let th = [[0, 0, 0], [0, 0, 0]];
  for (let it = 0; it < 15; it++) {
    th = [0, 1].map((k) => { const L = X.filter((_, t) => s[t] === k); return L.length ? [0, 1, 2].map((d) => mean(L.map((x) => x[d]))) : th[k]; });
    s = decode(X, th, lambda);
  }
  return th[0][1] > th[1][1] ? [th[1], th[0]] : th; // estado 1 = turbulento (más |rendimiento|)
}
/**
 * Etiquetas por día, walk-forward: el modelo se reajusta cada `refit` días con los datos hasta ese día y el estado del
 * día i se decodifica con los datos hasta i (incluido). 1 = turbulento, 0 = calma, −1 = sin modelo todavía.
 */
export function jumpLabels(ret, { lambda = JUMP_LAMBDA, refit = 20, minTrain = 250 } = {}) {
  const F = features(ret); const out = new Int8Array(ret.length).fill(-1);
  let th = null, mu = null, sd = null;
  for (let i = minTrain; i < ret.length; i++) {
    if ((i - minTrain) % refit === 0) {
      const tr = F.slice(0, i + 1); mu = [0, 1, 2].map((d) => mean(tr.map((x) => x[d]))); sd = [0, 1, 2].map((d) => std(tr.map((x) => x[d])));
      th = fit(tr.map((x) => x.map((v, d) => (v - mu[d]) / sd[d])), lambda);
    }
    const Z = F.slice(Math.max(0, i - 400), i + 1).map((x) => x.map((v, d) => (v - mu[d]) / sd[d]));
    const s = decode(Z, th, lambda); out[i] = s[s.length - 1];
  }
  return out;
}
/** Estado actual con todo el historial: { state: 'turbulento' | 'calma', since, days }. */
export function currentJumpRegime(seriesBySym) {
  const { dates, ret } = dollarBasket(seriesBySym);
  if (ret.length < 260) return null;
  const F = features(ret); const mu = [0, 1, 2].map((d) => mean(F.map((x) => x[d]))); const sd = [0, 1, 2].map((d) => std(F.map((x) => x[d])));
  const Z = F.map((x) => x.map((v, d) => (v - mu[d]) / sd[d]));
  const s = decode(Z, fit(Z, JUMP_LAMBDA), JUMP_LAMBDA);
  const last = s[s.length - 1]; let k = s.length - 1; while (k > 0 && s[k - 1] === last) k--;
  return { state: last === 1 ? 'turbulento' : 'calma', since: dates[k], days: s.length - k, as_of: dates[dates.length - 1], evidence: JUMP_EVIDENCE };
}
