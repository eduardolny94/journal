// Batería de preguntas «quant» sobre Asia → Londres en 15 activos (14-11-2026), a partir de la lista del usuario:
// tamaño de Asia y expansión de Londres, qué lado se rompe primero y si aguanta, reversión, día de la semana, tendencia
// diaria, distancia a niveles semanales/mensuales, ventanas de 15 minutos, roturas rápidas/lentas, secuencias de velas.
// Velas M5 de MT5 (servidor = España + 1 = Londres + 2). Asia 02:00–08:55; Londres 09:00–15:30 (antes de los datos de
// EE. UU.); fin del día 21:55. Precio medio (venta + spread/2). 1 pb = 0,01 %.
// Regla: cada pregunta direccional es una serie de resultados con signo; se mira en 2020–2023 (descubrir) y en 2024–2026
// (validar). Solo cuenta si tiene el mismo signo y |t| ≥ 2 en las dos mitades. Se informa de cuántas pruebas se hicieron
// y cuántas pasarían por puro azar.
// Uso: node server/scripts/preguntas-quant.mjs [--activos US100,XAUUSD] [--json salida.json] [--todo]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const ts = (a) => (a.length > 10 ? mean(a) / (sd(a) / Math.sqrt(a.length)) : NaN); const med = (xs) => { const s = xs.filter((v) => Number.isFinite(v)).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
const f = (v, d = 1) => (Number.isNaN(v) || v === undefined || v === null ? '  — ' : (v >= 0 ? '+' : '') + v.toFixed(d)); const pc = (a) => (a.length ? (100 * a.filter(Boolean).length) / a.length : NaN);
const T = (h, m = 0) => h * 60 + m; const bp = (a, b) => (1e4 * (b - a)) / a; const hhmm = (t) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
const FX = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY'];
const ASSETS = [['US100', 'data/mt5-largo/US100_M5_largo.csv', 0.01], ['US30', 'data/mt5-largo/US30_M5_largo.csv', 0.01], ['US500', 'data/mt5-largo/US500_M5_largo.csv', 0.01], ['XAUUSD', 'data/mt5-largo/XAUUSD_M5_largo.csv', 0.01],
  ...FX.map((p) => [p, `data/mt5-largo/fx/${p}_M5.csv`, p.endsWith('JPY') ? 0.001 : 0.00001])];
const ONLY = arg('--activos', '') ? arg('--activos', '').split(',') : null; const SPLIT = '2024-01-01';
const dowOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay(); const DOW = ['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes'];
const weekKey = (date) => { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
function load(file, pt) {
  const m = new Map();
  for (const line of readFileSync(path.join(ROOT, file), 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const x = line.split('\t'); if (x.length < 9) continue; const date = x[0].replace(/\./g, '-'); (m.get(date) || m.set(date, []).get(date)).push({ t: +x[1].slice(0, 2) * 60 + +x[1].slice(3, 5), o: +x[2], h: +x[3], l: +x[4], c: +x[5], sp: +x[8] * pt }); }
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars })).filter((d) => d.bars.length > 150 && dowOf(d.date) >= 1 && dowOf(d.date) <= 5);
}
const spearman = (xs, ys) => { const rk = (a) => { const o = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]); const r = []; o.forEach(([, i], k) => { r[i] = k; }); return r; }; const a = rk(xs), b = rk(ys); const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); };

const ALL = []; let nTests = 0; const DESC = [];
for (const [name, file, pt] of ASSETS) {
  if (ONLY && !ONLY.includes(name)) continue;
  const days = load(file, pt); const tests = new Map(); const add = (k, date, v) => { if (Number.isFinite(v)) (tests.get(k) || tests.set(k, []).get(k)).push({ date, v }); };
  // resumen diario para las variables de contexto
  const D = days.map((d) => { const use = d.bars.filter((b) => b.t >= T(2) && b.t <= T(21, 55)); return { date: d.date, hi: Math.max(...use.map((b) => b.h)), lo: Math.min(...use.map((b) => b.l)), close: use.at(-1).c, wk: weekKey(d.date), mo: d.date.slice(0, 7) }; });
  const grp = (key) => { const g = new Map(); for (const d of D) { const e = g.get(d[key]) || g.set(d[key], { hi: -Infinity, lo: Infinity }).get(d[key]); e.hi = Math.max(e.hi, d.hi); e.lo = Math.min(e.lo, d.lo); } const keys = [...g.keys()].sort(); const prev = new Map(); keys.forEach((k, i) => { if (i) prev.set(k, g.get(keys[i - 1])); }); return prev; };
  const prevWk = grp('wk'), prevMo = grp('mo'); const R = []; // filas por día
  for (let i = 0; i < days.length; i++) {
    const d = days[i]; const A = d.bars.filter((b) => b.t >= T(2) && b.t < T(9)); const L = d.bars.filter((b) => b.t >= T(9) && b.t < T(15, 30)); const N = d.bars.filter((b) => b.t >= T(15, 30) && b.t <= T(21, 55));
    if (A.length < 60 || L.length < 70 || L[0].t > T(9, 5)) continue; const mid = (b) => b.o + b.sp / 2; const midc = (b) => b.c + b.sp / 2;
    const aHi = Math.max(...A.map((b) => b.h)), aLo = Math.min(...A.map((b) => b.l)); const p9 = mid(L[0]); const pLon = N.length ? mid(N[0]) : midc(L.at(-1)); const pDay = N.length >= 50 ? midc(N.at(-1)) : NaN;
    const r = { date: d.date, i, dow: dowOf(d.date), aR: (100 * (aHi - aLo)) / p9, aRet: bp(mid(A[0]), p9), lonRet: bp(p9, pLon), dayRet: bp(p9, pDay), lonR: (100 * (Math.max(...L.map((b) => b.h)) - Math.min(...L.map((b) => b.l)))) / p9, cost: (1e4 * L[0].sp) / p9, aHi, aLo, p9, A, L, N, mid, midc, pLon, pDay };
    R.push(r);
  }
  for (let k = 0; k < R.length; k++) {
    const r = R[k]; const prev = R.slice(Math.max(0, k - 120), k); r.pctl = prev.length >= 100 ? prev.filter((x) => x.aR < r.aR).length / prev.length : NaN; const p20 = R.slice(Math.max(0, k - 20), k); r.lonRel = p20.length >= 20 ? r.lonR / med(p20.map((x) => x.lonR)) : NaN;
    const i = r.i; if (i < 22) continue; const w = D.slice(i - 20, i); r.atr = mean(w.map((x) => x.hi - x.lo)); r.ma20 = mean(w.map((x) => x.close)); r.yRet = D[i - 1].close - D[i - 2].close; r.pw = prevWk.get(D[i].wk); r.pm = prevMo.get(D[i].mo);
  }
  // ---------- preguntas ----------
  const brk = [];
  for (const r of R) {
    const { date, L, A, aHi, aLo, p9 } = r; const range = aHi - aLo; const S = A.concat(L); const off = A.length;
    // contexto → dirección de Londres
    add(`Londres · ${DOW[r.dow]}`, date, r.lonRet); add('Londres · a favor de Asia', date, Math.sign(r.aRet) * r.lonRet);
    if (r.yRet !== undefined) { add('Londres · a favor de la vela de ayer', date, Math.sign(r.yRet) * r.lonRet); add('Londres · a favor de la media de 20 días', date, (p9 > r.ma20 ? 1 : -1) * r.lonRet); }
    if (r.pctl <= 0.1) add('Londres · Asia muy estrecha (10 %), a favor de Asia', date, Math.sign(r.aRet) * r.lonRet); if (r.pctl >= 0.9) add('Londres · Asia muy ancha (10 %), a favor de Asia', date, Math.sign(r.aRet) * r.lonRet);
    if (r.atr) for (const [lbl, lv] of [['semana pasada', r.pw], ['mes pasado', r.pm]]) { if (!lv) continue; const dh = (lv.hi - p9) / r.atr, dl = (p9 - lv.lo) / r.atr; if (dh >= 0 && dh <= 0.25) add(`Londres · a ≤ ¼ de rango diario bajo el máximo de la ${lbl} (compra)`, date, r.lonRet); if (dl >= 0 && dl <= 0.25) add(`Londres · a ≤ ¼ de rango diario sobre el mínimo de la ${lbl} (compra)`, date, r.lonRet); if (dh < 0) add(`Londres · ya por encima del máximo de la ${lbl} (compra)`, date, r.lonRet); if (dl < 0) add(`Londres · ya por debajo del mínimo de la ${lbl} (compra)`, date, r.lonRet); }
    // ventanas de 15 minutos (09:00–13:00 servidor = 07:00–11:00 Londres)
    const at = new Map(d2(r)); let prevW = (() => { const a = at.get(T(8, 45)), b = at.get(T(9)); return a && b ? bp(r.mid(a), r.mid(b)) : NaN; })();
    for (let w = T(9); w < T(13); w += 15) { const a = at.get(w), b = at.get(w + 15); if (!a || !b) { prevW = NaN; continue; } const v = bp(r.mid(a), r.mid(b)); add(`Ventana ${hhmm(w)}–${hhmm(w + 15)} (compra)`, date, v); add(`Ventana ${hhmm(w)}–${hhmm(w + 15)} a favor de Asia`, date, Math.sign(r.aRet) * v); if (Number.isFinite(prevW)) add(`Ventana ${hhmm(w)}–${hhmm(w + 15)} a favor de los 15 min anteriores`, date, Math.sign(prevW) * v); prevW = v; }
    // secuencia de las 5 últimas velas H1 de Asia
    let seq = ''; for (let h = 4; h <= 8; h++) { const hb = A.filter((b) => b.t >= T(h) && b.t < T(h + 1)); if (!hb.length) { seq = ''; break; } seq += hb.at(-1).c > hb[0].o ? 'V' : 'R'; } if (seq.length === 5) add(`Secuencia de Asia ${seq} (compra)`, date, r.lonRet);
    // primera rotura del rango de Asia en Londres
    let k = -1, side = 0; for (let j = 0; j < L.length; j++) { const up = L[j].h > aHi, dn = L[j].l < aLo; if (up && dn) { k = -2; break; } if (up || dn) { k = j; side = up ? 1 : -1; break; } }
    const b = { date, r, side, k, none: k === -1 }; brk.push(b); if (k < 0) continue;
    const level = side > 0 ? aHi : aLo; const entry = r.midc(L[k]); b.contLon = side * bp(entry, r.pLon); b.contDay = side * bp(entry, r.pDay); b.held = side > 0 ? L.at(-1).c > aHi : L.at(-1).c < aLo;
    let back = -1, mfe = 0; for (let j = k; j < L.length; j++) { mfe = Math.max(mfe, side > 0 ? L[j].h - level : level - L[j].l); if (j > k && (side > 0 ? L[j].c < aHi : L[j].c > aLo)) { back = j; break; } }
    b.backMin = back < 0 ? null : (back - k) * 5; b.mfeR = mfe / range; b.mfeBp = (1e4 * mfe) / p9; b.other = L.slice(k).some((x) => (side > 0 ? x.l < aLo : x.h > aHi)); b.otherDay = b.other || r.N.some((x) => (side > 0 ? x.l < aLo : x.h > aHi));
    b.dayOpp = Number.isFinite(r.pDay) ? side * (r.pDay - p9) < 0 : null; b.early = L[k].t < T(10); const ref = S[off + k - 6]; b.imp = ref ? (side * (L[k].c - ref.c)) / range : NaN; b.t = L[k].t;
    const tag = side > 0 ? 'ALTO' : 'BAJO';
    add('Rotura de Asia · seguirla hasta el fin de Londres', date, b.contLon); add('Rotura de Asia · seguirla hasta el fin del día', date, b.contDay); add(`Rotura del ${tag} · seguirla hasta el fin de Londres`, date, b.contLon); add(`Rotura del ${tag} · seguirla hasta el fin del día`, date, b.contDay);
    add(`Rotura de Asia · ${DOW[r.dow]} · seguirla`, date, b.contLon); add(`Rotura de Asia · ${b.early ? 'antes de las 10:00' : 'después de las 10:00'} · seguirla`, date, b.contLon);
    if (r.pctl <= 0.2) add('Rotura de Asia · Asia estrecha (20 %) · seguirla', date, b.contLon); if (r.pctl >= 0.8) add('Rotura de Asia · Asia ancha (20 %) · seguirla', date, b.contLon);
    if (Number.isFinite(b.imp)) add(`Rotura de Asia · ${b.imp >= 0.5 ? 'rápida (≥ ½ rango en 30 min)' : b.imp <= 0.2 ? 'lenta (≤ ⅕ rango en 30 min)' : 'normal'} · seguirla`, date, b.contLon);
    add(`Rotura de Asia · ${side * r.aRet > 0 ? 'a favor' : 'en contra'} de la dirección de Asia · seguirla`, date, b.contLon); if (r.yRet !== undefined) add(`Rotura de Asia · ${side * r.yRet > 0 ? 'a favor' : 'en contra'} de la vela de ayer · seguirla`, date, b.contLon);
    if (r.ma20) add(`Rotura de Asia · ${side * (p9 - r.ma20) > 0 ? 'a favor' : 'en contra'} de la media de 20 días · seguirla`, date, b.contLon);
  }
  function d2(r) { return r.A.concat(r.L).map((x) => [x.t, x]); }
  // ---------- evaluación ----------
  for (const [k, rows] of tests) {
    const a = rows.filter((x) => x.date < SPLIT).map((x) => x.v), b = rows.filter((x) => x.date >= SPLIT).map((x) => x.v); const minN = k.startsWith('Secuencia') ? 20 : 30; if (a.length < minN || b.length < minN) continue; nTests++;
    const yrs = [...new Set(rows.map((x) => x.date.slice(0, 4)))].sort().map((y) => mean(rows.filter((x) => x.date.startsWith(y)).map((x) => x.v))); const all = rows.map((x) => x.v);
    ALL.push({ asset: name, test: k, nD: a.length, mD: mean(a), tD: ts(a), nV: b.length, mV: mean(b), tV: ts(b), m: mean(all), t: ts(all), yrsPos: yrs.filter((v) => v > 0).length, yrsNeg: yrs.filter((v) => v < 0).length, cost: mean(R.map((x) => x.cost)) });
  }
  // ---------- descriptivo ----------
  const ok = brk.filter((x) => x.k >= 0), hi = ok.filter((x) => x.side > 0), lo = ok.filter((x) => x.side < 0); const P = (S, fn) => pc(S.map(fn)).toFixed(0);
  const nar = R.filter((x) => x.pctl <= 0.1), wid = R.filter((x) => x.pctl >= 0.9), midR = R.filter((x) => x.pctl > 0.1 && x.pctl < 0.9); const wRel = R.filter((x) => Number.isFinite(x.lonRel));
  const fast = ok.filter((x) => x.imp >= 0.5), slow = ok.filter((x) => x.imp <= 0.2);
  DESC.push(`\n${name} · ${R.length} días (${R[0].date} → ${R.at(-1).date}) · spread medio a las 09:00 ≈ ${mean(R.map((x) => x.cost)).toFixed(1)} pb
  Qué lado de Asia se rompe primero en Londres: alto ${((100 * hi.length) / brk.length).toFixed(0)} % · bajo ${((100 * lo.length) / brk.length).toFixed(0)} % · ninguno ${P(brk, (x) => x.none)} % · tras romper uno, rompe también el otro: en Londres ${P(ok, (x) => x.other)} %, en el día ${P(ok, (x) => x.otherDay)} %
  ¿Aguanta? Londres cierra fuera del rango: alto ${P(hi, (x) => x.held)} % · bajo ${P(lo, (x) => x.held)} % · vuelve a cerrar una vela M5 dentro: ${P(ok, (x) => x.backMin !== null)} % (mediana ${med(ok.map((x) => x.backMin).filter((v) => v !== null))} min) · recorrido más allá del nivel antes de volver: mediana ${med(ok.map((x) => x.mfeBp)).toFixed(0)} pb (${(100 * med(ok.map((x) => x.mfeR))).toFixed(0)} % del rango de Asia)
  Reversión: rompe ALTO primero → el día acaba por debajo de la apertura de Londres ${P(hi.filter((x) => x.dayOpp !== null), (x) => x.dayOpp)} % · rompe BAJO primero → acaba por encima ${P(lo.filter((x) => x.dayOpp !== null), (x) => x.dayOpp)} % | seguir la rotura: alto ${f(mean(hi.map((x) => x.contLon)))} pb (t ${f(ts(hi.map((x) => x.contLon)))}) · bajo ${f(mean(lo.map((x) => x.contLon)))} pb (t ${f(ts(lo.map((x) => x.contLon)))})
  Rápidas frente a lentas: rápidas (n ${fast.length}) vuelven dentro ${P(fast, (x) => x.backMin !== null)} %, seguirlas ${f(mean(fast.map((x) => x.contLon)))} pb · lentas (n ${slow.length}) vuelven ${P(slow, (x) => x.backMin !== null)} %, seguirlas ${f(mean(slow.map((x) => x.contLon)))} pb
  Tamaño de Asia → rango de Londres (mediana, % del precio): Asia 10 % más estrecha ${med(nar.map((x) => x.lonR)).toFixed(2)} (Londres = ${med(nar.map((x) => x.lonR / x.aR)).toFixed(1)}× Asia; ${med(nar.map((x) => x.lonRel)).toFixed(2)}× su Londres habitual) · normal ${med(midR.map((x) => x.lonR)).toFixed(2)} (${med(midR.map((x) => x.lonR / x.aR)).toFixed(1)}×; ${med(midR.map((x) => x.lonRel)).toFixed(2)}×) · 10 % más ancha ${med(wid.map((x) => x.lonR)).toFixed(2)} (${med(wid.map((x) => x.lonR / x.aR)).toFixed(1)}×; ${med(wid.map((x) => x.lonRel)).toFixed(2)}×) · correlación de rangos ${spearman(R.map((x) => x.aR), R.map((x) => x.lonR)).toFixed(2)}
  Rango de Londres por día (× su habitual): ${[1, 2, 3, 4, 5].map((k) => `${DOW[k].slice(0, 2)} ${med(wRel.filter((x) => x.dow === k).map((x) => x.lonRel)).toFixed(2)}`).join(' · ')} · tras Asia estrecha (20 %): ${[1, 2, 3, 4, 5].map((k) => `${DOW[k].slice(0, 2)} ${med(wRel.filter((x) => x.dow === k && x.pctl <= 0.2).map((x) => x.lonRel)).toFixed(2)}`).join(' · ')}`);
}
console.log(DESC.join('\n'));
const surv = ALL.filter((x) => Math.sign(x.mD) === Math.sign(x.mV) && Math.abs(x.tD) >= 2 && Math.abs(x.tV) >= 2).sort((a, b) => Math.abs(b.t) - Math.abs(a.t));
console.log(`\n===== PREGUNTAS DIRECCIONALES: ${nTests} pruebas (activo × pregunta). Por puro azar pasarían ≈ ${(nTests * 0.05 * 0.025).toFixed(1)}. Pasan ${surv.length}: =====`);
console.log('activo   pregunta'.padEnd(88) + '2020–23 (pb, t, n)      2024–26 (pb, t, n)     total t  años ±   spread');
for (const x of surv) console.log(`${x.asset.padEnd(8)} ${x.test.padEnd(78)} ${f(x.mD).padStart(6)} ${f(x.tD).padStart(5)} ${String(x.nD).padStart(5)}    ${f(x.mV).padStart(6)} ${f(x.tV).padStart(5)} ${String(x.nV).padStart(5)}    ${f(x.t).padStart(5)}   ${x.yrsPos}/${x.yrsNeg}    ${x.cost.toFixed(1)}`);
if (process.argv.includes('--todo')) { console.log('\n===== Casi (|t| ≥ 3 en el total, mismo signo en las dos mitades) ====='); for (const x of ALL.filter((y) => !surv.includes(y) && Math.sign(y.mD) === Math.sign(y.mV) && Math.abs(y.t) >= 3).sort((a, b) => Math.abs(b.t) - Math.abs(a.t))) console.log(`${x.asset.padEnd(8)} ${x.test.padEnd(78)} ${f(x.mD).padStart(6)} ${f(x.tD).padStart(5)} ${String(x.nD).padStart(5)}    ${f(x.mV).padStart(6)} ${f(x.tV).padStart(5)} ${String(x.nV).padStart(5)}    ${f(x.t).padStart(5)}   ${x.yrsPos}/${x.yrsNeg}    ${x.cost.toFixed(1)}`); }
if (arg('--json', '')) writeFileSync(arg('--json', ''), JSON.stringify(ALL));
