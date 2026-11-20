// LOS MÉTODOS SWING MÁS FAMOSOS, PROBADOS EN LOS 8 PARES Y COMBINADOS CON EL SESGO FUNDAMENTAL (20-11-2026, pedido del usuario).
// Reglas publicadas, fijadas antes de mirar resultados:
//   Tortugas (Dennis/Eckhardt; «Way of the Turtle»): ruptura del máximo de 20 días (sistema 1, salida al mínimo de 10) y de 55 días
//     (sistema 2, salida al mínimo de 20), stop a 2 N (N = ATR de 20 días).
//   Tendencia de 12 y 3 meses (Moskowitz, Ooi y Pedersen, JFE 2012): signo del rendimiento pasado, se revisa cada 21 sesiones.
//   Donchian 5/20 (cruce de medias simples) y cruce de EMA 20/50 (seguidores de tendencia clásicos).
//   Raschke «Holy Grail» (Street Smarts, 1995): ADX(14) > 30 y subiendo, retroceso a la EMA 20, entrada al superar el máximo de esa vela,
//     stop tras su mínimo, objetivo en el máximo reciente.
//   Media de 200 días (Paul Tudor Jones): con el precio encima solo compras, debajo solo ventas.
//   Carry (diferencial de tipos oficiales, Lustig–Verdelhan y otros): comprar la divisa de tipo más alto, revisar cada 21 sesiones.
// Velas diarias (de las de 15 min del bróker), entrada a la apertura siguiente, stop primero si un día toca stop y objetivo, coste 1 pip,
// sin swap. Cada sistema: una posición por par. «A favor» = el sesgo del radar (≥ 2, víspera) va en el mismo sentido. 2011-07 → 2026.
// Uso: node --max-old-space-size=6000 server/scripts/swing-famosos.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const PAIRS = ['USDJPY', 'AUDJPY', 'EURJPY', 'USDCHF', 'EURGBP', 'EURUSD', 'GBPUSD', 'USDCAD'];
const W = { tasas: 20, inflacion: 10, crecimiento: 15, posicionamiento: 10, riesgo: 20, commo: 20 }; const DEN = Object.values(W).reduce((a, b) => a + b, 0);
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const sum = (a) => a.reduce((s, v) => s + v, 0); const f1 = (v) => (Number.isNaN(v) ? ' — ' : v.toFixed(1)); const f2 = (v) => (Number.isNaN(v) ? ' — ' : (v >= 0 ? '+' : '') + v.toFixed(2));
const BLK = (d) => (d < '2016-01-01' ? 0 : d < '2021-01-01' ? 1 : 2);
const HIST = JSON.parse(readFileSync(path.join(ROOT, 'data/historico/radar_hist_pilares_cand.json'), 'utf8')); const hIdx = new Map(HIST.map(([d], i) => [d, i]));
const scoreOf = (byC, c) => { let n = 0; for (const k of Object.keys(W)) n += W[k] * (byC[c][k] || 0); return (5 * n) / DEN; };
const fred = (id) => { try { return JSON.parse(readFileSync(path.join(ROOT, 'data/historico/fred', `${id}.json`), 'utf8')).observations.filter((o) => o.value !== '.').map((o) => ({ date: o.date, v: +o.value })); } catch { return []; } };
const RATE = { USD: fred('DFEDTARU'), EUR: fred('ECBDFR'), GBP: fred('IRSTCB01GBM156N'), JPY: fred('IRSTCB01JPM156N'), CHF: fred('IRSTCB01CHM156N'), CAD: fred('IRSTCB01CAM156N'), AUD: fred('IRSTCB01AUM156N') };
const shift = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const rateAt = (ccy, date) => { const rows = RATE[ccy]; const lim = shift(date, ccy === 'USD' || ccy === 'EUR' ? -1 : -45); let lo = 0, hi = rows.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date <= lim) { a = m; lo = m + 1; } else hi = m - 1; } return a >= 0 ? rows[a].v : null; };
const TR = {}; const add = (sys, t) => (TR[sys] ||= []).push(t);
for (const p of PAIRS) {
  const pip = p.endsWith('JPY') ? 0.01 : 0.0001; const b3 = p.slice(0, 3), q3 = p.slice(3); const m = new Map();
  for (const line of readFileSync(path.join(ROOT, `data/mt5-largo/fx-largo/${p}_M15.csv`), 'utf8').split(/\r?\n/)) { if (!line || line[0] === '<') continue; const x = line.split('\t'); const date = x[0].replace(/\./g, '-'); const wd = new Date(`${date}T12:00:00Z`).getUTCDay(); if (wd === 0 || wd === 6) continue; const e = m.get(date); const h = +x[3], l = +x[4], c = +x[5]; if (!e) m.set(date, { date, o: +x[2], h, l, c, n: 1 }); else { if (h > e.h) e.h = h; if (l < e.l) e.l = l; e.c = c; e.n++; } }
  const D = [...m.values()].filter((d) => d.n >= 60); const n = D.length;
  // indicadores
  const sma = (i, k) => { if (i - k + 1 < 0) return NaN; let s = 0; for (let j = i - k + 1; j <= i; j++) s += D[j].c; return s / k; }; const ema = (k) => { const out = []; let e = D[0].c; const a = 2 / (k + 1); for (const d of D) { e += a * (d.c - e); out.push(e); } return out; };
  const E20 = ema(20), E50 = ema(50); const atr = (i, k) => { if (i < k) return NaN; let s = 0; for (let j = i - k + 1; j <= i; j++) s += Math.max(D[j].h, D[j - 1].c) - Math.min(D[j].l, D[j - 1].c); return s / k; };
  const hh = (i, k) => { let v = -Infinity; for (let j = i - k; j < i; j++) if (D[j].h > v) v = D[j].h; return v; }, ll = (i, k) => { let v = Infinity; for (let j = i - k; j < i; j++) if (D[j].l < v) v = D[j].l; return v; };
  // ADX 14 (Wilder)
  const ADX = new Array(n).fill(NaN), PDI = new Array(n).fill(NaN), MDI = new Array(n).fill(NaN); { let trS = 0, pS = 0, mS = 0, adx = 0; const dxs = []; for (let i = 1; i < n; i++) { const up = D[i].h - D[i - 1].h, dn = D[i - 1].l - D[i].l; const pdm = up > dn && up > 0 ? up : 0, mdm = dn > up && dn > 0 ? dn : 0; const tr = Math.max(D[i].h, D[i - 1].c) - Math.min(D[i].l, D[i - 1].c); if (i <= 14) { trS += tr; pS += pdm; mS += mdm; } else { trS = trS - trS / 14 + tr; pS = pS - pS / 14 + pdm; mS = mS - mS / 14 + mdm; } if (i >= 14) { const pdi = (100 * pS) / trS, mdi = (100 * mS) / trS; PDI[i] = pdi; MDI[i] = mdi; const dx = (100 * Math.abs(pdi - mdi)) / (pdi + mdi || 1); dxs.push(dx); if (dxs.length === 14) adx = mean(dxs); else if (dxs.length > 14) adx = (adx * 13 + dx) / 14; if (dxs.length >= 14) ADX[i] = adx; } } }
  const bias = (i) => { const hk = hIdx.get(D[i].date); if (hk === undefined) return null; const byC = HIST[hk][1]; return scoreOf(byC, b3) - scoreOf(byC, q3); };
  const start = D.findIndex((d) => d.date >= '2011-07-01');
  // motor: entra a la apertura de i+1; exitFn(k) evaluado al cierre del día k → salir a la apertura de k+1
  const run = (sys, i, s, sd, opts = {}) => { if (i + 1 >= n || !(sd > 0)) return i + 1; const px = opts.entryPx ?? D[i + 1].o; const tgt = opts.target ?? null; let res = null, end = i + 1; const max = opts.max ?? 400;
    for (let k = i + 1; k < n && k <= i + max; k++) { end = k; const adv = s > 0 ? px - D[k].l : D[k].h - px; if (adv >= sd) { res = -sd; break; } if (tgt !== null && (s > 0 ? D[k].h >= tgt : D[k].l <= tgt)) { res = s * (tgt - px); break; } if (opts.exit && k > i + 1 - 1 && opts.exit(k) && k + 1 < n) { res = s * (D[k + 1].o - px); end = k + 1; break; } }
    if (res === null) res = s * (D[end].c - px); const b = bias(i); add(sys, { p, date: D[i + 1].date, end: D[end].date, b: BLK(D[i + 1].date), r: (res - pip) / sd, days: end - i, ag: b === null || Math.abs(b) < 2 ? 0 : Math.sign(b) === s ? 1 : -1 }); return end + 1; };
  // 1) Tortugas
  for (const [sys, inN, outN] of [['Tortugas 20/10', 20, 10], ['Tortugas 55/20', 55, 20]]) { let free = start; for (let i = Math.max(start, 60); i < n - 1; i++) { if (i < free) continue; const N = atr(i, 20); const s = D[i].c > hh(i, inN) ? 1 : D[i].c < ll(i, inN) ? -1 : 0; if (!s) continue; free = run(sys, i, s, 2 * N, { exit: (k) => (s > 0 ? D[k].c < ll(k, outN) : D[k].c > hh(k, outN)) }); } }
  // 2) tendencia de 12 y 3 meses (cada 21 sesiones)
  for (const [sys, lb] of [['Tendencia 12 meses', 252], ['Tendencia 3 meses', 63]]) for (let i = Math.max(start, lb + 1); i < n - 22; i += 21) { const s = Math.sign(D[i].c / D[i - lb].c - 1); if (!s) continue; run(sys, i, s, 3 * atr(i, 20), { max: 21 }); }
  // 3) cruces de medias
  { let free = start; for (let i = Math.max(start, 30); i < n - 1; i++) { if (i < free) continue; const a = sma(i, 5) - sma(i, 20), b = sma(i - 1, 5) - sma(i - 1, 20); const s = a > 0 && b <= 0 ? 1 : a < 0 && b >= 0 ? -1 : 0; if (!s) continue; free = run('Donchian 5/20', i, s, 2 * atr(i, 20), { exit: (k) => s * (sma(k, 5) - sma(k, 20)) < 0 }); } }
  { let free = start; for (let i = Math.max(start, 60); i < n - 1; i++) { if (i < free) continue; const a = E20[i] - E50[i], b = E20[i - 1] - E50[i - 1]; const s = a > 0 && b <= 0 ? 1 : a < 0 && b >= 0 ? -1 : 0; if (!s) continue; free = run('Cruce EMA 20/50', i, s, 2 * atr(i, 20), { exit: (k) => s * (E20[k] - E50[k]) < 0 }); } }
  // 4) Holy Grail de Raschke
  { let free = start; for (let i = Math.max(start, 60); i < n - 2; i++) { if (i < free) continue; if (!(ADX[i] > 30 && ADX[i] >= ADX[i - 3])) continue; const s = PDI[i] > MDI[i] ? 1 : -1; const touch = s > 0 ? D[i].l <= E20[i] && D[i].c >= E20[i] * 0.995 : D[i].h >= E20[i] && D[i].c <= E20[i] * 1.005; if (!touch) continue;
      const trig = s > 0 ? D[i].h : D[i].l; const nx = D[i + 1]; if (s > 0 ? nx.h <= trig : nx.l >= trig) continue; const px = s > 0 ? Math.max(nx.o, trig) : Math.min(nx.o, trig); const stop = s > 0 ? Math.min(D[i].l, nx.l > px ? nx.l : D[i].l) : Math.max(D[i].h, D[i].h); const sd = Math.abs(px - (s > 0 ? D[i].l : D[i].h)); const tgt = s > 0 ? hh(i, 20) : ll(i, 20); if (!(sd > 0) || s * (tgt - px) < 0.8 * sd) continue; free = run('Raschke Holy Grail', i, s, sd, { entryPx: px, target: tgt, max: 20 }); } }
  // 5) media de 200 días
  { let free = start; for (let i = Math.max(start, 201); i < n - 1; i++) { if (i < free) continue; const a = D[i].c - sma(i, 200), b = D[i - 1].c - sma(i - 1, 200); const s = a > 0 && b <= 0 ? 1 : a < 0 && b >= 0 ? -1 : 0; if (!s) continue; free = run('Media de 200 días', i, s, 3 * atr(i, 20), { exit: (k) => s * (D[k].c - sma(k, 200)) < 0 }); } }
  // 6) carry
  for (let i = Math.max(start, 30); i < n - 22; i += 21) { const rb = rateAt(b3, D[i].date), rq = rateAt(q3, D[i].date); if (rb === null || rq === null || Math.abs(rb - rq) < 0.5) continue; run('Carry (tipos oficiales)', i, Math.sign(rb - rq), 3 * atr(i, 20), { max: 21 }); }
}
const YEARS = 15.37; const st = (A) => { if (!A.length) return 'n    0'; const r = A.map((t) => t.r); const bl = [0, 1, 2].map((b) => mean(A.filter((t) => t.b === b).map((t) => t.r))); const w = r.filter((v) => v > 0), l = r.filter((v) => v <= 0); const seq = [...A].sort((a, b) => (a.end < b.end ? -1 : 1)); let eq = 0, peak = 0, dd = 0, run = 0, worst = 0; for (const t of seq) { eq += t.r; if (eq > peak) peak = eq; if (peak - eq > dd) dd = peak - eq; if (t.r <= 0) { run++; if (run > worst) worst = run; } else run = 0; } const yrs = {}; for (const t of A) (yrs[t.date.slice(0, 4)] ||= []).push(t.r); const pos = Object.values(yrs).filter((v) => sum(v) > 0).length;
  return `n ${String(A.length).padStart(4)} (${(A.length / (YEARS * 12)).toFixed(1)}/mes) · gana ${f1((100 * w.length) / A.length)} % · ${f2(mean(r))} R (${bl.map(f2).join(' / ')}) · factor ${(sum(w) / Math.abs(sum(l) || 1)).toFixed(2)} · ${f2(sum(r) / YEARS)} R/año · años + ${pos}/${Object.keys(yrs).length} · racha ${worst} · caída ${dd.toFixed(0)} R · ${f1(mean(A.map((t) => t.days)))} d`; };
console.log('MÉTODOS SWING FAMOSOS EN LOS 8 PARES · 2011-07 → 2026 · coste 1 pip, sin swap · R = lo arriesgado · bloques 2011–15 / 2016–20 / 2021–26');
for (const sys of Object.keys(TR)) { const A = TR[sys]; console.log(`\n${sys}`); console.log(`   todas las señales            ${st(A)}`); console.log(`   con el sesgo del radar A FAVOR ${st(A.filter((t) => t.ag === 1))}`); console.log(`   con el sesgo EN CONTRA         ${st(A.filter((t) => t.ag === -1))}`); console.log(`   sin sesgo claro                ${st(A.filter((t) => t.ag === 0))}`); }
console.log('\nPOR PAR · solo señales con el sesgo a favor · R medio (n)'); for (const sys of Object.keys(TR)) console.log(`   ${sys.padEnd(24)} ` + PAIRS.map((p) => { const S = TR[sys].filter((t) => t.p === p && t.ag === 1); return `${p} ${f2(mean(S.map((t) => t.r)))} (${S.length})`; }).join(' · '));
