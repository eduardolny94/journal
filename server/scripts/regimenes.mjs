// Regímenes de mercado: ¿cuál detector separa mejor cuándo funciona el radar? (13-10-2026)
// Todos los detectores se ajustan SOLO con datos anteriores a la fecha (walk-forward, reajuste cada 20 días) y etiquetan
// cada día con la información hasta el día anterior. Serie base: "cesta dólar" = media de los log-rendimientos diarios
// del USD contra EUR, GBP, AUD, NZD, CAD, JPY y CHF (Yahoo, 5 años), y VIX.
//   R1 VIX        : tensión si VIX > 25 (lo que ya usa el radar).
//   R2 Vol        : volatilidad realizada de la cesta a 20 días frente a su mediana de 1 año.
//   R3 HMM        : Gaussian HMM de 2 estados sobre la cesta (Baum-Welch); probabilidad filtrada del estado volátil.
//   R4 Salto      : statistical jump model (Nystrup et al. 2020): k-medias con penalización λ por cambiar de estado,
//                   resuelto con programación dinámica; rasgos = media y |rendimiento| exponenciales y vol a 60 d.
//   R5 Wasserstein: k-medias de Wasserstein (Horvath, Issa y Muguruza 2021) sobre ventanas de 20 rendimientos.
//   R6 Hurst      : exponente de Hurst por par (R/S, 120 días): persistente > 0,55, antipersistente < 0,45.
//   R7 Topología  : homología persistente de la nube de puntos de 40 días × 7 divisas (Gidea y Katz 2018):
//                   persistencia total de H1 (ciclos, "números de Betti 1") y su z-score frente a 1 año.
// Evaluación: señales del radar (fuerza ≥ 2, sesgo del día anterior) a 5 días en ATR, la reversión a la media (≥ 2 ATR
// de la EMA 20, contra, 10 días) y la operativa C4L (backtest-c4l-swing.json, semana + radar, 2R), por régimen;
// p-valor de la diferencia entre regímenes por desplazamiento circular de la serie de etiquetas.
// Uso: node server/scripts/regimenes.mjs [--perm 500]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const NPERM = (() => { const i = process.argv.indexOf('--perm'); return i >= 0 ? Number(process.argv[i + 1]) : 500; })();
let seed = 5; const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
const f2 = (v) => (Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(3)}` : '  —  ');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const t0 = Date.now(); const lap = (s) => console.log(`  [${((Date.now() - t0) / 1000).toFixed(0)} s] ${s}`);

async function yahoo(sym) {
  for (let k = 0; k < 3; k++) {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5y`, { headers: { 'User-Agent': 'Mozilla/5.0 (GlobalTradersFX)' } });
    if (res.ok) { const r = (await res.json()).chart.result[0]; const m = new Map(); r.timestamp.forEach((t, i) => { const c = r.indicators.quote[0].close[i]; if (c != null) m.set(new Date(t * 1000).toISOString().slice(0, 10), c); }); return m; }
    await sleep(3000);
  }
  throw new Error(`Yahoo ${sym}`);
}
// ---------- Serie base ----------
const LEGS = [['EURUSD=X', -1], ['GBPUSD=X', -1], ['AUDUSD=X', -1], ['NZDUSD=X', -1], ['CAD=X', 1], ['JPY=X', 1], ['CHF=X', 1]];
const Y = []; for (const [s] of LEGS) { Y.push(await yahoo(s)); await sleep(1200); }
const VIX = await yahoo('^VIX');
const MD = [...Y[0].keys()].filter((d) => Y.every((m) => m.has(d)) && new Date(`${d}T12:00:00Z`).getUTCDay() % 6 !== 0).sort();
const legRet = []; const basket = [];
for (let i = 1; i < MD.length; i++) {
  const r = LEGS.map(([, sgn], k) => sgn * Math.log(Y[k].get(MD[i]) / Y[k].get(MD[i - 1])));
  if (r.some((v) => !Number.isFinite(v) || Math.abs(v) > 0.1)) { legRet.push(null); basket.push(0); continue; }
  legRet.push(r); basket.push(mean(r));
}
const BD = MD.slice(1); const NB = BD.length; // fechas de la cesta (rendimiento del día BD[i])
lap(`cesta dólar: ${NB} días ${BD[0]} → ${BD[NB - 1]}`);
const idxBefore = (d) => { let lo = 0, hi = NB - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (BD[m] < d) { a = m; lo = m + 1; } else hi = m - 1; } return a; };
const REFIT = 20; const MINTRAIN = 250;

// ---------- R2: volatilidad realizada ----------
const rv20 = basket.map((_, i) => (i >= 19 ? std(basket.slice(i - 19, i + 1)) : null));
const R2 = rv20.map((v, i) => { if (v === null || i < 270) return null; const past = rv20.slice(i - 250, i + 1).filter((x) => x !== null).sort((a, b) => a - b); return v > past[Math.floor(past.length / 2)] ? 'vol alta' : 'vol baja'; });

// ---------- R3: HMM gaussiano de 2 estados ----------
function fitHMM(x) {
  let mu = [0, 0]; const v0 = std(x) ** 2; let sg = [v0 * 0.5, v0 * 2]; let A = [[0.97, 0.03], [0.05, 0.95]]; let pi = [0.6, 0.4];
  const N = x.length;
  for (let it = 0; it < 40; it++) {
    const pdf = (k, v) => Math.exp(-((v - mu[k]) ** 2) / (2 * sg[k])) / Math.sqrt(2 * Math.PI * sg[k]) + 1e-300;
    const al = new Array(N), be = new Array(N), c = new Array(N);
    al[0] = [pi[0] * pdf(0, x[0]), pi[1] * pdf(1, x[0])]; c[0] = al[0][0] + al[0][1]; al[0] = al[0].map((v) => v / c[0]);
    for (let t = 1; t < N; t++) { const a = [0, 1].map((j) => (al[t - 1][0] * A[0][j] + al[t - 1][1] * A[1][j]) * pdf(j, x[t])); c[t] = a[0] + a[1]; al[t] = a.map((v) => v / c[t]); }
    be[N - 1] = [1, 1];
    for (let t = N - 2; t >= 0; t--) be[t] = [0, 1].map((i) => (A[i][0] * pdf(0, x[t + 1]) * be[t + 1][0] + A[i][1] * pdf(1, x[t + 1]) * be[t + 1][1]) / c[t + 1]);
    const g = al.map((a, t) => { const v = [a[0] * be[t][0], a[1] * be[t][1]]; const s = v[0] + v[1]; return [v[0] / s, v[1] / s]; });
    const xi = [[0, 0], [0, 0]];
    for (let t = 0; t < N - 1; t++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) xi[i][j] += (al[t][i] * A[i][j] * pdf(j, x[t + 1]) * be[t + 1][j]) / c[t + 1];
    for (let i = 0; i < 2; i++) { const s = xi[i][0] + xi[i][1]; A[i] = [xi[i][0] / s, xi[i][1] / s]; }
    for (let k = 0; k < 2; k++) { const w = g.reduce((s, v) => s + v[k], 0); mu[k] = g.reduce((s, v, t) => s + v[k] * x[t], 0) / w; sg[k] = Math.max(1e-10, g.reduce((s, v, t) => s + v[k] * (x[t] - mu[k]) ** 2, 0) / w); }
    pi = g[0];
  }
  if (sg[0] > sg[1]) { mu = [mu[1], mu[0]]; sg = [sg[1], sg[0]]; A = [[A[1][1], A[1][0]], [A[0][1], A[0][0]]]; pi = [pi[1], pi[0]]; }
  return { mu, sg, A, pi };
}
const R3 = new Array(NB).fill(null); const R3p = new Array(NB).fill(null);
{
  let model = null; let al = null;
  for (let i = MINTRAIN; i < NB; i++) {
    if ((i - MINTRAIN) % REFIT === 0) { model = fitHMM(basket.slice(0, i)); al = [model.pi[0], model.pi[1]]; for (let t = 0; t < i; t++) al = step(al, basket[t]); }
    // etiqueta del día i con la información hasta i−1 (al = filtro hasta i−1), luego se incorpora el día i
    R3p[i] = al[1]; R3[i] = al[1] > 0.5 ? 'HMM volátil' : 'HMM tranquilo';
    al = step(al, basket[i]);
  }
  function step(a, v) { const pdf = (k) => Math.exp(-((v - model.mu[k]) ** 2) / (2 * model.sg[k])) / Math.sqrt(2 * Math.PI * model.sg[k]) + 1e-300; const p = [0, 1].map((j) => (a[0] * model.A[0][j] + a[1] * model.A[1][j]) * pdf(j)); const s = p[0] + p[1]; return [p[0] / s, p[1] / s]; }
}
lap('HMM listo');

// ---------- R4: statistical jump model ----------
const ewm = (x, hl) => { const a = 1 - Math.pow(0.5, 1 / hl); const o = []; let e = x[0]; for (const v of x) { e = a * v + (1 - a) * e; o.push(e); } return o; };
const F = (() => { const m = ewm(basket, 10), ab = ewm(basket.map(Math.abs), 10), ab60 = ewm(basket.map(Math.abs), 60); return basket.map((_, i) => [m[i], ab[i], ab60[i]]); })();
function jmFit(X, lambda) {
  const K = 2, D = X[0].length; let s = X.map((x) => (x[1] > X.map((y) => y[1]).sort((a, b) => a - b)[Math.floor(X.length / 2)] ? 1 : 0));
  let th = [];
  for (let it = 0; it < 15; it++) {
    th = [0, 1].map((k) => { const L = X.filter((_, t) => s[t] === k); return L.length ? [...Array(D).keys()].map((d) => mean(L.map((x) => x[d]))) : X[Math.floor(rnd() * X.length)]; });
    s = jmDecode(X, th, lambda);
  }
  if (th[0][1] > th[1][1]) { th = [th[1], th[0]]; }
  return th;
}
function jmDecode(X, th, lambda) {
  const N = X.length; const cost = (t, k) => X[t].reduce((s, v, d) => s + (v - th[k][d]) ** 2, 0);
  const V = [[cost(0, 0), cost(0, 1)]]; const B = [[0, 0]];
  for (let t = 1; t < N; t++) { V.push([0, 1].map((k) => { const a = V[t - 1][k], b = V[t - 1][1 - k] + lambda; return Math.min(a, b) + cost(t, k); })); B.push([0, 1].map((k) => (V[t - 1][k] <= V[t - 1][1 - k] + lambda ? k : 1 - k))); }
  const s = new Array(N); s[N - 1] = V[N - 1][0] <= V[N - 1][1] ? 0 : 1; for (let t = N - 1; t > 0; t--) s[t - 1] = B[t][s[t]]; return s;
}
const R4 = new Array(NB).fill(null);
{
  let th = null, mu = null, sd = null; const LAMBDA = 8;
  for (let i = MINTRAIN; i < NB; i++) {
    if ((i - MINTRAIN) % REFIT === 0) {
      const tr = F.slice(0, i); mu = [0, 1, 2].map((d) => mean(tr.map((x) => x[d]))); sd = [0, 1, 2].map((d) => std(tr.map((x) => x[d])) || 1);
      th = jmFit(tr.map((x) => x.map((v, d) => (v - mu[d]) / sd[d])), LAMBDA);
    }
    const Z = F.slice(0, i).map((x) => x.map((v, d) => (v - mu[d]) / sd[d])); // hasta i−1
    const s = jmDecode(Z, th, LAMBDA); R4[i] = s[s.length - 1] === 1 ? 'salto: turbulento' : 'salto: calma';
  }
}
lap('modelo de salto listo');

// ---------- R5: k-medias de Wasserstein ----------
const W = 20; const win = basket.map((_, i) => (i >= W ? basket.slice(i - W, i).sort((a, b) => a - b) : null)); // ventana que termina en i−1
const w1 = (a, b) => mean(a.map((v, k) => Math.abs(v - b[k])));
const R5 = new Array(NB).fill(null);
{
  let C = null;
  for (let i = MINTRAIN; i < NB; i++) {
    if ((i - MINTRAIN) % REFIT === 0) {
      const S = win.slice(W, i).filter(Boolean); const sdv = S.map((w) => std(w));
      C = [S[sdv.indexOf(Math.min(...sdv))], S[sdv.indexOf(Math.max(...sdv))]];
      for (let it = 0; it < 20; it++) { const lab = S.map((w) => (w1(w, C[0]) <= w1(w, C[1]) ? 0 : 1)); C = [0, 1].map((k) => { const L = S.filter((_, j) => lab[j] === k); return L.length ? L[0].map((_, q) => mean(L.map((w) => w[q]))) : C[k]; }); }
      if (std(C[0]) > std(C[1])) C = [C[1], C[0]];
    }
    R5[i] = w1(win[i], C[0]) <= w1(win[i], C[1]) ? 'Wasserstein: normal' : 'Wasserstein: turbulento';
  }
}
lap('Wasserstein listo');

// ---------- R7: homología persistente H1 (Vietoris-Rips) ----------
function h1Persistence(P) {
  const n = P.length; const E = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) E.push([Math.sqrt(P[i].reduce((s, v, d) => s + (v - P[j][d]) ** 2, 0)), i, j]);
  E.sort((a, b) => a[0] - b[0]); const eid = new Map(); E.forEach((e, k) => eid.set(e[1] * n + e[2], k));
  const ed = (i, j) => eid.get(Math.min(i, j) * n + Math.max(i, j));
  const T = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) { const a = ed(i, j), b = ed(i, k), c = ed(j, k); const m = Math.max(a, b, c); T.push([m, [a, b, c].sort((x, y) => x - y)]); }
  T.sort((x, y) => x[0] - y[0] || x[1][1] - y[1][1]);
  const pivotOf = new Map(); let total = 0; let count = 0;
  const xor = (a, b) => { const o = []; let i = 0, j = 0; while (i < a.length || j < b.length) { if (j >= b.length || (i < a.length && a[i] < b[j])) o.push(a[i++]); else if (i >= a.length || b[j] < a[i]) o.push(b[j++]); else { i++; j++; } } return o; };
  for (const [, col0] of T) {
    let col = col0;
    while (col.length) { const low = col[col.length - 1]; const other = pivotOf.get(low); if (!other) break; col = xor(col, other); }
    if (col.length) { const low = col[col.length - 1]; pivotOf.set(low, col); const birth = E[low][0]; const death = E[col0[2]][0]; if (death > birth) { total += death - birth; count++; } }
  }
  return { total, count };
}
const R7 = new Array(NB).fill(null); const tp = new Array(NB).fill(null);
{
  const WIN = 40; const z = legRet.map((r) => r);
  for (let i = WIN + 60; i < NB; i++) {
    const L = z.slice(i - WIN, i).filter(Boolean); if (L.length < WIN - 3) continue;
    const sd = [0, 1, 2, 3, 4, 5, 6].map((d) => std(z.slice(i - 250 > 0 ? i - 250 : 0, i).filter(Boolean).map((r) => r[d])) || 1);
    tp[i] = h1Persistence(L.map((r) => r.map((v, d) => v / sd[d]))).total;
  }
  for (let i = 0; i < NB; i++) { if (tp[i] === null || i < 300) continue; const past = tp.slice(i - 250, i).filter((v) => v !== null); const m = mean(past), s = std(past); R7[i] = s && (tp[i] - m) / s > 1 ? 'topología: estrés (H1 alto)' : 'topología: normal'; }
}
lap('topología lista');
const R1 = BD.map((d, i) => { const k = [...VIX.keys()].filter((x) => x < d); const v = k.length ? VIX.get(k[k.length - 1]) : null; return v === null || i < MINTRAIN ? null : v > 25 ? 'VIX > 25' : 'VIX ≤ 25'; });

// ---------- Observaciones del radar ----------
const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
const bias = {}; for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias').all()) (bias[r.symbol] ||= new Map()).set(r.date, r.diff);
const prevBias = (s, date) => { for (let b = 1; b <= 4; b++) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - b); const k = d.toISOString().slice(0, 10); if (bias[s]?.has(k)) return bias[s].get(k); } return null; };
const syms = readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => /^[A-Z]{6}$/.test(s));
const obs = [];
for (const s of syms) {
  const m = new Map();
  for (const line of readFileSync(path.join(DATA, `${s}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue; const date = d.replace(/\./g, '-'); (m.get(date) || m.set(date, []).get(date)).push({ hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c }); }
  const A = [...m.entries()].filter(([d, b]) => b.length >= 12 && new Date(`${d}T12:00:00Z`).getUTCDay() % 6 !== 0).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, b]) => ({ date, H: Math.max(...b.map((x) => x.h)), L: Math.min(...b.map((x) => x.l)), C: b[b.length - 1].c, entry: (b.find((x) => x.hour >= 3) || b[0]).o }));
  let at = null, e = null;
  A.forEach((x, i) => { const tr = i ? Math.max(x.H - x.L, Math.abs(x.H - A[i - 1].C), Math.abs(x.L - A[i - 1].C)) : x.H - x.L; at = at === null ? tr : (at * 13 + tr) / 14; x.atr = i >= 14 ? at : null; e = e === null ? x.C : x.C * (2 / 21) + e * (19 / 21); x.ema = i >= 19 ? e : null; });
  const lr = A.map((x, i) => (i ? Math.log(x.C / A[i - 1].C) : 0));
  for (let i = 125; i < A.length; i++) {
    const p = A[i - 1]; if (!p.atr) continue;
    const fwd = {}; for (const h of [5, 10]) if (i + h < A.length) fwd[h] = (A[i + h].entry - A[i].entry) / p.atr;
    // Hurst R/S con los 120 rendimientos hasta el día anterior
    const x = lr.slice(i - 120, i); const pts = [];
    for (const n of [8, 15, 30, 60]) { const rs = []; for (let k = 0; k + n <= x.length; k += n) { const seg = x.slice(k, k + n); const m0 = mean(seg); let c = 0, mx = -Infinity, mn = Infinity; for (const v of seg) { c += v - m0; mx = Math.max(mx, c); mn = Math.min(mn, c); } const sdv = std(seg); if (sdv > 0) rs.push((mx - mn) / sdv); } if (rs.length) pts.push([Math.log(n), Math.log(mean(rs))]); }
    const mx = mean(pts.map((q) => q[0])), my = mean(pts.map((q) => q[1])); const hurst = pts.reduce((s, q) => s + (q[0] - mx) * (q[1] - my), 0) / pts.reduce((s, q) => s + (q[0] - mx) ** 2, 0);
    obs.push({ s, date: A[i].date, bi: idxBefore(A[i].date), fwd, diff: prevBias(s, A[i].date), zEMA: (p.C - p.ema) / p.atr, hurst });
  }
}
// Hurst esperado para un paseo aleatorio con R/S en muestras cortas (sesgo de Anis-Lloyd): se calibra con el reparto.
const hs = obs.map((o) => o.hurst).filter(Number.isFinite).sort((a, b) => a - b);
const hLo = hs[Math.floor(hs.length / 3)], hHi = hs[Math.floor((hs.length * 2) / 3)];
lap(`observaciones ${obs.length} · Hurst R/S mediana ${hs[Math.floor(hs.length / 2)].toFixed(2)} (tercios < ${hLo.toFixed(2)} / > ${hHi.toFixed(2)})`);
const R6 = (o) => (Number.isFinite(o.hurst) ? (o.hurst >= hHi ? 'Hurst alto (persistente)' : o.hurst <= hLo ? 'Hurst bajo (antipersistente)' : 'Hurst medio') : null);

// ---------- Evaluación ----------
const sigRadar = (o) => (o.diff !== null && Math.abs(o.diff) >= 3 && o.fwd[5] !== undefined ? Math.sign(o.diff) * o.fwd[5] : null);
const sigRev = (o) => (o.zEMA !== null && Math.abs(o.zEMA) >= 2 && o.fwd[10] !== undefined ? -Math.sign(o.zEMA) * o.fwd[10] : null);
const c4l = existsSync(path.join(DATA, 'backtest-c4l-swing.json')) ? JSON.parse(readFileSync(path.join(DATA, 'backtest-c4l-swing.json'), 'utf8')).filter((t) => t.entryKind === 'cruce' && t.stopKind === 'diario' && t.w1ok === true && t.radarOk === true).map((t) => ({ date: t.date, bi: idxBefore(t.date), v: t.r2_puro, s: t.sym })) : [];
const DETECTORS = [['R1 VIX', R1], ['R2 Vol realizada', R2], ['R3 HMM', R3], ['R4 Salto estadístico', R4], ['R5 Wasserstein', R5], ['R7 Topología H1', R7]];
function evalSplit(name, items, valOf, labOfIdx) {
  // labOfIdx(item, shift) → etiqueta; diferencia entre el mejor y el peor régimen; p por desplazamiento circular
  const groups = (shift) => { const g = {}; for (const it of items) { const v = valOf(it); if (v === null) continue; const l = labOfIdx(it, shift); if (!l) continue; (g[l] ||= []).push(v); } return g; };
  const g0 = groups(0); const labs = Object.keys(g0).sort(); if (labs.length < 2) return;
  const MIN = 15;
  const spread = (g) => { const ms = Object.values(g).filter((a) => a.length >= MIN).map(mean); return ms.length >= 2 ? Math.max(...ms) - Math.min(...ms) : NaN; };
  const obsS = spread(g0); const dist = []; for (let k = 0; k < NPERM; k++) { const v = spread(groups(30 + Math.floor(rnd() * (NB - 60)))); if (Number.isFinite(v)) dist.push(v); }
  const p = Number.isFinite(obsS) && dist.length >= 50 ? (dist.filter((v) => v >= obsS).length + 1) / (dist.length + 1) : NaN;
  const years = (l) => ['2024', '2025', '2026'].map((y) => { const v = items.filter((it) => it.date.startsWith(y) && labOfIdx(it, 0) === l).map(valOf).filter((x) => x !== null); return v.length >= 10 ? f2(mean(v)) : '—'; }).join('/');
  console.log(`  ${name.padEnd(24)} ${labs.map((l) => `${l}: ${f2(mean(g0[l]))} ${(100 * g0[l].filter((v) => v > 0).length / g0[l].length).toFixed(0)}% (${g0[l].length}) [${years(l)}]`).join(' · ')} · p ${Number.isFinite(p) ? p.toFixed(3) : '— (muestra insuficiente)'}`);
}
const shifted = (R) => (it, sh) => { if (it.bi < 0) return null; const j = it.bi + sh; return j < NB ? R[j] : R[MINTRAIN + ((j - MINTRAIN) % (NB - MINTRAIN))]; };
for (const [titulo, items, valOf] of [['Radar, fuerza ≥ 2, 5 días (ATR)', obs, sigRadar], ['Reversión a la media (≥ 2 ATR de la EMA 20, contra, 10 días)', obs, sigRev], ['Operativa C4L (semana + radar, 2R)', c4l, (t) => t.v]]) {
  console.log(`\n${titulo} · media · acierto · (n) · [por año 2024/2025/2026] · p = probabilidad de una separación igual por azar`);
  for (const [name, R] of DETECTORS) evalSplit(name, items, valOf, shifted(R));
  if (items === obs) {
    const hz = obs.map(R6); const idx = new Map(obs.map((o, k) => [o, k]));
    evalSplit('R6 Hurst por par', obs, valOf, (o, sh) => { if (!sh) return hz[idx.get(o)]; const k = (idx.get(o) + Math.floor(sh * 29)) % obs.length; return hz[k]; });
  }
}
const cnt = (R) => { const c = {}; R.forEach((l) => { if (l) c[l] = (c[l] || 0) + 1; }); return Object.entries(c).map(([k, v]) => `${k} ${v}`).join(' · '); };
console.log('\nDías por régimen:'); for (const [n, R] of DETECTORS) console.log(`  ${n.padEnd(24)} ${cnt(R)}`);
const agree = (A, B) => { let s = 0, n = 0; for (let i = 0; i < NB; i++) if (A[i] && B[i]) { n++; if (/turbul|volátil|alta|estrés|> 25/.test(A[i]) === /turbul|volátil|alta|estrés|> 25/.test(B[i])) s++; } return n ? `${Math.round((100 * s) / n)} %` : '—'; };
console.log(`Coincidencia "turbulento" HMM–salto ${agree(R3, R4)} · HMM–Wasserstein ${agree(R3, R5)} · salto–Wasserstein ${agree(R4, R5)} · Vol–HMM ${agree(R2, R3)} · topología–Vol ${agree(R7, R2)}`);
lap('fin');
