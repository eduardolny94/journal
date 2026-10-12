// ¿Mejora el radar con modelos más complejos? (13-10-2026) Mismas filas de la capa de convicción (día × par, 3 años,
// sin mirar el futuro), mismo objetivo (¿el par se mueve a favor del sesgo a h días?), mismos cortes temporales.
// Modelos: (1) logístico con L2 (el del radar), (2) gradient boosting de árboles de profundidad 2, (3) red neuronal
// densa (23 → 16 → 1, Adam, L2, parada temprana con validación temporal). Métricas fuera de muestra: AUC, y acierto y
// R de las señales con mayor probabilidad (top 2 % y top 10 %, el equivalente a los niveles A y A+B).
// Uso: node server/scripts/modelos-ml.mjs [--h 5]
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
const { getDb } = await import('../src/db.js');
const { runBacktest } = await import('../src/radar/backtest.js');
const { fitLogitMulti, predictProb, FEATURE_NAMES } = await import('../src/radar/conviction.js');
const H = (() => { const i = process.argv.indexOf('--h'); return i >= 0 ? Number(process.argv[i + 1]) : 5; })();

let seed = 3; const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const rep = await runBacktest(getDb(), { keepRows: true });
const rows = rep.conv_rows.filter((r) => r.signed_pips[H] !== undefined && Number.isFinite(r.r[H]));
const dates = [...new Set(rows.map((r) => r.date))].sort();
const D = FEATURE_NAMES.length;
console.log(`\n${rows.length} filas · ${dates[0]} → ${dates[dates.length - 1]} · ${D} rasgos · horizonte ${H} días\n`);

function auc(p, y) { const idx = p.map((v, i) => i).sort((a, b) => p[a] - p[b]); let rank = 0, pos = 0, sum = 0; idx.forEach((i, k) => { rank = k + 1; if (y[i]) { pos++; sum += rank; } }); const neg = y.length - pos; return pos && neg ? (sum - (pos * (pos + 1)) / 2) / (pos * neg) : NaN; }
function top(p, test, frac) { const idx = p.map((v, i) => i).sort((a, b) => p[b] - p[a]).slice(0, Math.max(10, Math.round(frac * p.length))); const L = idx.map((i) => test[i]); return { n: L.length, hit: (100 * L.filter((r) => r.signed_pips[H] > 0).length) / L.length, r: L.reduce((s, r) => s + r.r[H], 0) / L.length }; }

// ---- Gradient boosting (logloss), árboles de profundidad 2 sobre umbrales por cuantiles ----
function gbmFit(X, y, { rounds = 300, lr = 0.03, minLeaf = 200, bins = 16 } = {}) {
  const N = X.length; const th = []; for (let d = 0; d < D; d++) { const v = X.map((x) => x[d]).sort((a, b) => a - b); const t = new Set(); for (let b = 1; b < bins; b++) t.add(v[Math.floor((b * N) / bins)]); th.push([...t]); }
  const base = Math.log((y.reduce((s, v) => s + v, 0) + 1) / (N - y.reduce((s, v) => s + v, 0) + 1)); const F = new Float64Array(N).fill(base); const trees = [];
  // Índice de cubo por rasgo (histogramas): cada división cuesta O(n · D).
  const bin = X.map((x) => th.map((t, d) => { let k = 0; while (k < t.length && x[d] > t[k]) k++; return k; }));
  const bestSplit = (ids, g, h) => {
    let best = null; let G = 0, Hh = 0; for (const i of ids) { G += g[i]; Hh += h[i]; } const parent = (G * G) / (Hh + 1);
    for (let d = 0; d < D; d++) {
      const nb = th[d].length + 1; const sg = new Float64Array(nb), sh = new Float64Array(nb), sn = new Int32Array(nb);
      for (const i of ids) { const b = bin[i][d]; sg[b] += g[i]; sh[b] += h[i]; sn[b]++; }
      let gl = 0, hl = 0, nl = 0;
      for (let b = 0; b < nb - 1; b++) { gl += sg[b]; hl += sh[b]; nl += sn[b]; const nr = ids.length - nl; if (nl < minLeaf || nr < minLeaf) continue; const gain = (gl * gl) / (hl + 1) + ((G - gl) ** 2) / (Hh - hl + 1) - parent; if (!best || gain > best.gain) best = { d, t: th[d][b], gain }; }
    }
    return best;
  };
  const leaf = (ids, g, h) => -ids.reduce((s, i) => s + g[i], 0) / (ids.reduce((s, i) => s + h[i], 0) + 1);
  const all = [...Array(N).keys()];
  for (let r = 0; r < rounds; r++) {
    const p = Array.from(F, (f) => 1 / (1 + Math.exp(-f))); const g = p.map((pi, i) => pi - y[i]); const h = p.map((pi) => Math.max(1e-6, pi * (1 - pi)));
    const sub = all.filter(() => rnd() < 0.7);
    const s1 = bestSplit(sub, g, h); if (!s1) break;
    const L = sub.filter((i) => X[i][s1.d] <= s1.t), R = sub.filter((i) => X[i][s1.d] > s1.t);
    const sL = bestSplit(L, g, h), sR = bestSplit(R, g, h);
    const node = (ids, s) => (s ? { d: s.d, t: s.t, l: leaf(ids.filter((i) => X[i][s.d] <= s.t), g, h), r: leaf(ids.filter((i) => X[i][s.d] > s.t), g, h) } : { v: leaf(ids, g, h) });
    const tree = { d: s1.d, t: s1.t, L: node(L, sL), R: node(R, sR) }; trees.push(tree);
    for (let i = 0; i < N; i++) F[i] += lr * gbmTree(tree, X[i]);
  }
  return { base, trees, lr };
}
function gbmTree(t, x) { const n = x[t.d] <= t.t ? t.L : t.R; return n.v !== undefined ? n.v : x[n.d] <= n.t ? n.l : n.r; }
const gbmPred = (m, x) => 1 / (1 + Math.exp(-(m.base + m.lr * m.trees.reduce((s, t) => s + gbmTree(t, x), 0))));

// ---- Red neuronal densa con Adam y parada temprana ----
function mlpFit(X, y, { hidden = 16, epochs = 40, lr = 0.003, l2 = 1e-3 } = {}) {
  const nVal = Math.floor(X.length * 0.2); const Xt = X.slice(0, X.length - nVal), yt = y.slice(0, y.length - nVal), Xv = X.slice(X.length - nVal), yv = y.slice(y.length - nVal);
  const W1 = [...Array(hidden)].map(() => [...Array(D)].map(() => (rnd() - 0.5) * 0.3)); const b1 = new Array(hidden).fill(0); const W2 = [...Array(hidden)].map(() => (rnd() - 0.5) * 0.3); let b2 = 0;
  const P = [W1, b1, W2]; const m = JSON.parse(JSON.stringify({ W1, b1, W2, b2: 0 })), v = JSON.parse(JSON.stringify(m)); for (const o of [m, v]) { o.W1 = o.W1.map((r) => r.map(() => 0)); o.b1 = o.b1.map(() => 0); o.W2 = o.W2.map(() => 0); o.b2 = 0; }
  const fwd = (x) => { const a = W1.map((w, j) => Math.tanh(w.reduce((s, wi, k) => s + wi * x[k], b1[j]))); return { a, p: 1 / (1 + Math.exp(-(a.reduce((s, ai, j) => s + ai * W2[j], b2)))) }; };
  const loss = (Xs, ys) => -Xs.reduce((s, x, i) => { const p = Math.min(1 - 1e-9, Math.max(1e-9, fwd(x).p)); return s + (ys[i] ? Math.log(p) : Math.log(1 - p)); }, 0) / Xs.length;
  let best = Infinity, bestW = null, step = 0, bad = 0;
  for (let ep = 0; ep < epochs; ep++) {
    const order = [...Array(Xt.length).keys()].sort(() => rnd() - 0.5);
    for (let s = 0; s < order.length; s += 64) {
      const batch = order.slice(s, s + 64); const gW1 = W1.map((r) => r.map(() => 0)), gb1 = b1.map(() => 0), gW2 = W2.map(() => 0); let gb2 = 0;
      for (const i of batch) { const x = Xt[i]; const { a, p } = fwd(x); const e = p - yt[i]; gb2 += e; for (let j = 0; j < hidden; j++) { gW2[j] += e * a[j]; const da = e * W2[j] * (1 - a[j] * a[j]); gb1[j] += da; for (let k = 0; k < D; k++) gW1[j][k] += da * x[k]; } }
      step++; const B = batch.length; const upd = (w, g, mm, vv) => { const gg = g / B + l2 * w; const m1 = 0.9 * mm + 0.1 * gg, v1 = 0.999 * vv + 0.001 * gg * gg; const mh = m1 / (1 - 0.9 ** step), vh = v1 / (1 - 0.999 ** step); return [w - (lr * mh) / (Math.sqrt(vh) + 1e-8), m1, v1]; };
      for (let j = 0; j < hidden; j++) { for (let k = 0; k < D; k++) [W1[j][k], m.W1[j][k], v.W1[j][k]] = upd(W1[j][k], gW1[j][k], m.W1[j][k], v.W1[j][k]); [b1[j], m.b1[j], v.b1[j]] = upd(b1[j], gb1[j], m.b1[j], v.b1[j]); [W2[j], m.W2[j], v.W2[j]] = upd(W2[j], gW2[j], m.W2[j], v.W2[j]); }
      [b2, m.b2, v.b2] = upd(b2, gb2, m.b2, v.b2);
    }
    const lv = loss(Xv, yv); if (lv < best - 1e-5) { best = lv; bestW = JSON.parse(JSON.stringify({ W1, b1, W2, b2 })); bad = 0; } else if (++bad >= 4) break;
  }
  return bestW;
}
const mlpPred = (w, x) => { const a = w.W1.map((r, j) => Math.tanh(r.reduce((s, wi, k) => s + wi * x[k], w.b1[j]))); return 1 / (1 + Math.exp(-(a.reduce((s, ai, j) => s + ai * w.W2[j], w.b2)))); };

for (const [cut, frac] of [['último tercio', 2 / 3], ['última mitad', 1 / 2], ['últimos dos tercios', 1 / 3]]) {
  const split = dates[Math.floor(dates.length * frac)];
  const train = rows.filter((r) => r.date < split), test = rows.filter((r) => r.date >= split);
  const Xtr = train.map((r) => r.x), ytr = train.map((r) => (r.signed_pips[H] > 0 ? 1 : 0)), Xte = test.map((r) => r.x), yte = test.map((r) => (r.signed_pips[H] > 0 ? 1 : 0));
  const t0 = Date.now();
  const lg = fitLogitMulti(Xtr, ytr, 2); const pL = Xte.map((x) => predictProb(lg, x));
  const gb = gbmFit(Xtr, ytr); const pG = Xte.map((x) => gbmPred(gb, x));
  const nn = mlpFit(Xtr, ytr); const pN = Xte.map((x) => mlpPred(nn, x));
  const base = (100 * yte.reduce((s, v) => s + v, 0)) / yte.length;
  console.log(`Corte "${cut}" (prueba desde ${split}, n=${test.length}, acierto de todas ${base.toFixed(1)} %) · ${Math.round((Date.now() - t0) / 1000)} s`);
  for (const [name, p] of [['Logístico (radar)', pL], ['Gradient boosting', pG], ['Red neuronal 16', pN], ['Promedio de los 3', pL.map((v, i) => (v + pG[i] + pN[i]) / 3)]]) {
    const t2 = top(p, test, 0.02), t10 = top(p, test, 0.1);
    console.log(`  ${name.padEnd(20)} AUC ${auc(p, yte).toFixed(3)} · top 2 %: ${t2.hit.toFixed(1)} % ${t2.r >= 0 ? '+' : ''}${t2.r.toFixed(2)}R (${t2.n}) · top 10 %: ${t10.hit.toFixed(1)} % ${t10.r >= 0 ? '+' : ''}${t10.r.toFixed(2)}R (${t10.n})`);
  }
}
process.exit(0);
