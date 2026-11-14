// ¿Qué par de divisas tiene un patrón claro en la sesión europea? (pedido del usuario, 14-11-2026). Se prueban los
// patrones documentados en la literatura y un barrido general, par por par, con tres muestras independientes:
//   A = 2015–2019 (FXCM, H1, solo los pares que hay) · B = 2020–2023 · C = 2024–2026 (bróker del usuario, M5).
// Hora de servidor = Nueva York + 7 = Londres + 2 = España + 1. Movimientos en puntos básicos (1 pb = 0,01 %).
// 1) Hora del día (Breedon y Ranaldo, JMCB 2013): las divisas se deprecian en su propio horario de trabajo.
//    Ventanas: Asia 02:00–09:00 · Europa 09:00–17:00 · EE. UU. tras el cierre europeo 17:00–23:00.
// 2) Fijación de Londres de las 16:00 (servidor 18:00): reversión tras la fijación (Evans; Melvin y Prins), con fin de mes.
// 3) Impulso intradía (Gao et al. 2018; Elaut et al. 2018): la primera media hora anticipa la última.
// 4) Barrido general de señales de Londres (las mismas que en el Nasdaq y el oro).
// Sobrevive lo que tiene el mismo signo en las tres muestras (o en B y C si no hay A) con |t| ≥ 2 en al menos dos.
// Uso: node server/scripts/fx-londres-patrones.mjs
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP', 'AUDJPY'];
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const ts = (a) => (a.length > 20 ? mean(a) / (sd(a) / Math.sqrt(a.length)) : NaN); const f = (v, d = 1) => (Number.isNaN(v) || v === undefined ? '  — ' : (v >= 0 ? '+' : '') + v.toFixed(d));
const T = (h, m) => h * 60 + m; const bp = (a, b) => (1e4 * (b - a)) / a;
function loadM5(pair) { const m = new Map(); for (const line of readFileSync(path.join(ROOT, 'data/mt5-largo/fx', `${pair}_M5.csv`), 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const x = line.split('\t'); if (x.length < 6) continue; const date = x[0].replace(/\./g, '-'); (m.get(date) || m.set(date, new Map()).get(date)).set(+x[1].slice(0, 2) * 60 + +x[1].slice(3, 5), { o: +x[2], h: +x[3], l: +x[4], c: +x[5] }); } return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars })).filter((d) => d.bars.size > 200); }
function loadH1Old(pair) { const fl = path.join(ROOT, 'data/mt5-fxcm', `${pair}_PERIOD_H1.csv`); if (!existsSync(fl)) return []; const m = new Map(); for (const l of readFileSync(fl, 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, lo, c] = l.split(','); const date = t.slice(0, 10).replace(/\./g, '-'); if (date >= '2020-01-01') continue; (m.get(date) || m.set(date, new Map()).get(date)).set(+t.slice(11, 13) * 60, { o: +o, h: +h, l: +lo, c: +c }); } return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars })).filter((d) => d.bars.size > 18); }
// precio de apertura de la vela que empieza en t (o la primera posterior dentro de 30 min)
const openAt = (bars, t, step) => { for (let k = 0; k <= 30; k += step) { const b = bars.get(t + k); if (b) return b.o; } return null; };
const win = (d, t0, t1, step) => { const a = openAt(d.bars, t0, step), b = openAt(d.bars, t1, step); return a !== null && b !== null ? bp(a, b) : null; };
const sampleOf = (date) => (date < '2020-01-01' ? 'A' : date < '2024-01-01' ? 'B' : 'C');
const tri = (vals) => ['A', 'B', 'C'].map((s) => { const v = vals.filter((x) => x.s === s).map((x) => x.v); return { n: v.length, m: mean(v), t: ts(v), up: v.length ? (100 * v.filter((x) => x > 0).length) / v.length : NaN }; });
const verdict = (r) => { const have = r.filter((x) => x.n > 100); if (have.length < 2) return ''; const sg = Math.sign(have[0].m); if (!have.every((x) => Math.sign(x.m) === sg)) return ''; const strong = have.filter((x) => Math.abs(x.t) >= 2).length; return strong >= 2 ? '  ★' : strong === 1 && have.every((x) => Math.abs(x.t) >= 1) ? '  ·' : ''; };
const cell = (x) => (x.n > 100 ? `${f(x.m)} (t ${f(x.t)})` : '      —      ').padEnd(15);

const DATA = {}; for (const p of PAIRS) DATA[p] = { m5: loadM5(p), old: loadH1Old(p) };
console.log(`Pares: ${PAIRS.join(', ')} · M5 ${DATA.EURUSD.m5[0].date} → ${DATA.EURUSD.m5.at(-1).date} · muestra A (2015–2019, H1) para ${PAIRS.filter((p) => DATA[p].old.length).join(', ')}`);

// ---------- 1) Hora del día ----------
console.log('\n1) HORA DEL DÍA (pb por ventana; media y t) · A 2015–19 · B 2020–23 · C 2024–26 · ★ = mismo signo en todas y |t| ≥ 2 en dos');
const WIN = [['Asia 02:00–09:00', T(2, 0), T(9, 0)], ['Europa 09:00–17:00', T(9, 0), T(17, 0)], ['EE. UU. 17:00–23:00', T(17, 0), T(23, 0)], ['Mañana europea 09:00–12:00', T(9, 0), T(12, 0)], ['Mediodía 12:00–15:00', T(12, 0), T(15, 0)], ['Solape 15:00–18:00', T(15, 0), T(18, 0)]];
for (const p of PAIRS) for (const [lab, t0, t1] of WIN) {
  const vals = []; for (const d of DATA[p].old) { const v = win(d, t0, t1, 60); if (v !== null) vals.push({ s: 'A', v }); } for (const d of DATA[p].m5) { const v = win(d, t0, t1, 5); if (v !== null) vals.push({ s: sampleOf(d.date), v }); }
  const r = tri(vals); const v = verdict(r); if (v || lab.startsWith('Europa')) console.log(`  ${p} ${lab.padEnd(28)} A ${cell(r[0])} B ${cell(r[1])} C ${cell(r[2])}${v}`);
}
console.log('\n   Por hora (pb por hora, solo las que sobreviven):');
for (const p of PAIRS) for (let h = 1; h < 23; h++) {
  const vals = []; for (const d of DATA[p].old) { const v = win(d, T(h, 0), T(h + 1, 0), 60); if (v !== null) vals.push({ s: 'A', v }); } for (const d of DATA[p].m5) { const v = win(d, T(h, 0), T(h + 1, 0), 5); if (v !== null) vals.push({ s: sampleOf(d.date), v }); }
  const r = tri(vals); if (verdict(r) === '  ★') console.log(`  ${p} ${String(h).padStart(2, '0')}:00–${String(h + 1).padStart(2, '0')}:00 servidor (${String(h - 1).padStart(2, '0')}:00 España)   A ${cell(r[0])} B ${cell(r[1])} C ${cell(r[2])}  ★`);
}

// ---------- 2) Fijación de las 16:00 de Londres (18:00 servidor) ----------
console.log('\n2) FIJACIÓN DE LONDRES (18:00 servidor = 17:00 España): reversión = lo que se movió de 17:30 a 18:00 se deshace después (pb a favor de la reversión)');
for (const p of PAIRS) {
  const rows = []; const days = DATA[p].m5;
  days.forEach((d, i) => { const pre = win(d, T(17, 30), T(18, 0), 5), post30 = win(d, T(18, 0), T(18, 30), 5), post60 = win(d, T(18, 0), T(19, 0), 5); if (pre === null || post30 === null || post60 === null || pre === 0) return; const eom = i + 1 < days.length && days[i + 1].date.slice(5, 7) !== d.date.slice(5, 7); rows.push({ s: sampleOf(d.date), eom, r30: -Math.sign(pre) * post30, r60: -Math.sign(pre) * post60, big: Math.abs(pre) }); });
  const q = [...rows.map((r) => r.big)].sort((a, b) => a - b)[Math.floor(rows.length * 0.75)];
  const line = (lab, S, k) => { const r = tri(S.map((x) => ({ s: x.s, v: x[k] }))); return `${lab} B ${cell(r[1])} C ${cell(r[2])}${verdict(r)}`; };
  console.log(`  ${p}  30 min: ${line('', rows, 'r30')} | 60 min: ${line('', rows, 'r60')} | movimiento previo grande, 30 min: ${line('', rows.filter((r) => r.big >= q), 'r30')} | fin de mes (n ${rows.filter((r) => r.eom).length}): ${f(mean(rows.filter((r) => r.eom).map((r) => r.r30)))} pb (t ${f(ts(rows.filter((r) => r.eom).map((r) => r.r30)))})`);
}

// ---------- 3) Impulso intradía ----------
console.log('\n3) IMPULSO INTRADÍA: la primera media hora europea (09:00–09:30) → última media hora antes del cierre de Londres (17:30–18:00) y de Nueva York (22:30–23:00) · pb a favor');
for (const p of PAIRS) {
  const A = [], B = []; for (const d of DATA[p].m5) { const fst = win(d, T(9, 0), T(9, 30), 5), l1 = win(d, T(17, 30), T(18, 0), 5), l2 = win(d, T(22, 30), T(23, 0), 5); if (fst === null || fst === 0) continue; if (l1 !== null) A.push({ s: sampleOf(d.date), v: Math.sign(fst) * l1 }); if (l2 !== null) B.push({ s: sampleOf(d.date), v: Math.sign(fst) * l2 }); }
  const a = tri(A), b = tri(B); console.log(`  ${p}  → cierre de Londres: B ${cell(a[1])} C ${cell(a[2])}${verdict(a)} | → cierre de NY: B ${cell(b[1])} C ${cell(b[2])}${verdict(b)}`);
}

// ---------- 4) Barrido general ----------
console.log('\n4) BARRIDO DE SEÑALES DE LONDRES (resultado en pb a favor de la señal · B 2020–23 · C 2024–26) · solo se listan las que sobreviven');
let tested = 0; const surv = [];
for (const p of PAIRS) {
  const days = DATA[p].m5; const R = [];
  for (let i = 3; i < days.length; i++) {
    const d = days[i], p1 = days[i - 1], p2 = days[i - 2]; const B = d.bars; const O = (t) => openAt(B, t, 5);
    const o2 = O(T(2, 0)), o9 = O(T(9, 0)), o930 = O(T(9, 30)), o10 = O(T(10, 0)), o12 = O(T(12, 0)), o15 = O(T(15, 0)), o17 = O(T(17, 0)), o18 = O(T(18, 0)), o23 = O(T(22, 55));
    if ([o2, o9, o930, o10, o12, o15, o17, o18].some((x) => x === null)) continue;
    const pv = [...p1.bars.values()], pv2 = [...p2.bars.values()]; const pc = pv.at(-1).c, po = pv[0].o, p2c = pv2.at(-1).c; const pH = Math.max(...pv.map((b) => b.h)), pL = Math.min(...pv.map((b) => b.l));
    const asiaK = [...B.keys()].filter((t) => t >= T(2, 0) && t < T(9, 0)); const aH = Math.max(...asiaK.map((t) => B.get(t).h)), aL = Math.min(...asiaK.map((t) => B.get(t).l));
    const h1K = [...B.keys()].filter((t) => t >= T(9, 0) && t < T(10, 0)); const h1H = Math.max(...h1K.map((t) => B.get(t).h)), h1L = Math.min(...h1K.map((t) => B.get(t).l));
    const dt = new Date(`${d.date}T12:00:00Z`);
    R.push({ s: sampleOf(d.date), dow: dt.getUTCDay(), firstOfMonth: p1.date.slice(5, 7) !== d.date.slice(5, 7), L: bp(o9, o18), Lam: bp(o9, o12), L1: bp(o9, o10), Lrest: bp(o10, o18), Lmid: bp(o12, o15), Lpm: bp(o15, o18), US: o23 !== null ? bp(o18, o23) : null, L915: bp(o9, o15),
      prev: Math.sign(pc - po), prev2: Math.sign(pc - p2c), asia: Math.sign(o9 - o2), asiaBig: Math.abs(bp(o2, o9)) >= 15 ? Math.sign(o9 - o2) : 0, gap: Math.sign(o9 - pc), closeLoc: pH > pL ? ((pc - pL) / (pH - pL) >= 2 / 3 ? 1 : (pc - pL) / (pH - pL) <= 1 / 3 ? -1 : 0) : 0,
      f30: Math.sign(o930 - o9), f60: Math.sign(o10 - o9), f60big: Math.abs(bp(o9, o10)) >= 10 ? Math.sign(o10 - o9) : 0, am: Math.sign(o12 - o9), lon: Math.sign(o18 - o9), lon15: Math.sign(o15 - o9),
      sweep: h1L < aL && !(h1H > aH) ? 1 : h1H > aH && !(h1L < aL) ? -1 : 0, brk: o10 > aH ? 1 : o10 < aL ? -1 : 0 });
  }
  const SIG = [['Siempre compra en Europa', () => 1, 'L'], ['Siempre compra 09:00–12:00', () => 1, 'Lam'], ['Siempre compra 15:00–18:00', () => 1, 'Lpm'], ['Siempre compra tras el cierre europeo (18–23)', () => 1, 'US'],
    ['Vela de ayer → Europa sigue', (r) => r.prev, 'L'], ['Dos últimos días → Europa sigue', (r) => r.prev2, 'L'], ['Ayer cerró en un extremo → sigue', (r) => r.closeLoc, 'L'], ['Asia → Europa sigue', (r) => r.asia, 'L'], ['Asia fuerte → Europa sigue', (r) => r.asiaBig, 'L'], ['Asia → mañana europea sigue', (r) => r.asia, 'Lam'],
    ['Hueco frente al cierre de ayer → sigue', (r) => r.gap, 'L'], ['Primeros 30 min → resto de Europa sigue', (r) => r.f30, 'Lrest'], ['Primera hora → resto sigue', (r) => r.f60, 'Lrest'], ['Primera hora fuerte → resto sigue', (r) => r.f60big, 'Lrest'],
    ['Mañana (09–12) → mediodía sigue', (r) => r.am, 'Lmid'], ['Mañana (09–12) → tarde (15–18) sigue', (r) => r.am, 'Lpm'], ['Europa hasta las 15 → solape con NY sigue', (r) => r.lon15, 'Lpm'], ['Europa → tras el cierre (18–23) sigue', (r) => r.lon, 'US'],
    ['1.ª hora barre solo un lado de Asia → resto al contrario', (r) => r.sweep, 'Lrest'], ['1.ª hora cierra fuera de Asia → resto sigue', (r) => r.brk, 'Lrest'],
    ...[1, 2, 3, 4, 5].map((dw) => [`${['', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes'][dw]}: compra en Europa`, (r) => (r.dow === dw ? 1 : 0), 'L']), ['Primer día del mes: compra en Europa', (r) => (r.firstOfMonth ? 1 : 0), 'L']];
  for (const [lab, fn, key] of SIG) {
    tested++; const vals = R.map((r) => ({ s: r.s, x: fn(r), y: r[key] })).filter((x) => x.x && x.y !== null).map((x) => ({ s: x.s, v: x.x * x.y }));
    const r = tri(vals); const minN = lab.includes(':') ? 60 : 100; const have = [r[1], r[2]].filter((x) => x.n >= minN); if (have.length < 2) continue;
    const ok = Math.sign(r[1].m) === Math.sign(r[2].m) && Math.abs(r[1].t) >= 2 && Math.abs(r[2].t) >= 1.5;
    if (ok) surv.push(`  ${p} · ${lab.padEnd(50)} B n ${String(r[1].n).padStart(4)} ${f(r[1].m)} pb (acierta ${r[1].up.toFixed(0)} %, t ${f(r[1].t)}) · C n ${String(r[2].n).padStart(4)} ${f(r[2].m)} pb (acierta ${r[2].up.toFixed(0)} %, t ${f(r[2].t)})`);
  }
}
console.log(surv.length ? surv.join('\n') : '  ninguna'); console.log(`  (probadas ${tested} combinaciones par × señal; por azar puro se esperaría que pasaran ≈ ${(tested * 0.0455 * 0.5 * 0.134).toFixed(1)})`);
