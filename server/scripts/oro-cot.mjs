// ORO Y PLATA: ¿el COT anticipa la dirección? ¿Y la estacionalidad? (pedido del usuario, 15-11-2026)
// COT desagregado de la CFTC (futuros de COMEX, 2009 → 2026, semanal): fondos («managed money»), comerciales (productores +
// swap dealers) y pequeños. El informe es del martes y se publica el viernes: aquí se usa desde el lunes siguiente (+6 días).
// Percentil = posición neta (% del interés abierto) frente a sus 3 años anteriores. Se mide la SEPARACIÓN (% de subidas con
// la señal a favor − % en contra) a 20 y 60 sesiones, por bloques 2010–15 / 2016–21 / 2022–26.
// Uso: node server/scripts/oro-cot.mjs [--activo oro|plata]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; }; const ACT = arg('--activo', 'oro');
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const pc = (a) => (a.length ? (100 * a.filter(Boolean).length) / a.length : NaN); const f1 = (v) => (Number.isNaN(v) ? ' — ' : v.toFixed(1)); const sg = (v, d = 1) => (Number.isNaN(v) ? ' — ' : (v >= 0 ? '+' : '') + v.toFixed(d));
const yahoo = (n) => { const r = JSON.parse(readFileSync(path.join(ROOT, 'data/yahoo', `${n}_1d_largo.json`), 'utf8')).chart.result[0]; const q = r.indicators.quote[0]; const off = r.meta.gmtoffset || 0; return r.timestamp.map((t, i) => ({ date: new Date((t + off) * 1000).toISOString().slice(0, 10), v: q.close[i] })).filter((b) => Number.isFinite(b.v)); };
const G = yahoo(ACT === 'oro' ? 'GC' : 'SI'); const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const C = JSON.parse(readFileSync(path.join(ROOT, 'data/historico/cot-metales', `${ACT === 'oro' ? 'gold' : 'silver'}.json`), 'utf8')).map((r) => { const n = (k) => Number(r[k]) || 0; const oi = n('open_interest_all'); return { date: r.report_date_as_yyyy_mm_dd.slice(0, 10), avail: addDays(r.report_date_as_yyyy_mm_dd.slice(0, 10), 6), oi, mm: (n('m_money_positions_long_all') - n('m_money_positions_short_all')) / oi, mmL: n('m_money_positions_long_all') / oi, mmS: n('m_money_positions_short_all') / oi, com: (n('prod_merc_positions_long') + n('swap_positions_long_all') - n('prod_merc_positions_short') - n('swap__positions_short_all')) / oi, small: (n('nonrept_positions_long_all') - n('nonrept_positions_short_all')) / oi }; }).sort((a, b) => (a.date < b.date ? -1 : 1));
const pctl = (k, i, w = 156) => { if (i < w) return NaN; const win = C.slice(i - w, i).map((r) => r[k]); return win.filter((v) => v < C[i][k]).length / w; };
C.forEach((r, i) => { r.p_mm = pctl('mm', i); r.p_mmS = pctl('mmS', i); r.p_mmL = pctl('mmL', i); r.p_com = pctl('com', i); r.p_small = pctl('small', i); r.p_oi = pctl('oi', i); r.f4 = i >= 4 ? r.mm - C[i - 4].mm : NaN; r.f1 = i >= 1 ? r.mm - C[i - 1].mm : NaN; r.f13 = i >= 13 ? r.mm - C[i - 13].mm : NaN; });
const cotAt = (date) => { let lo = 0, hi = C.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (C[m].avail <= date) { a = m; lo = m + 1; } else hi = m - 1; } return a >= 0 ? C[a] : null; };
const BLK = (d) => (d < '2016-01-01' ? 0 : d < '2022-01-01' ? 1 : 2); const BN = ['2010–15', '2016–21', '2022–26'];
const ROWS = []; for (let i = 260; i < G.length - 60; i++) { const d = G[i].date; const c = cotAt(d); if (!c || !Number.isFinite(c.p_mm)) continue; const fut = {}; for (const h of [5, 20, 60]) fut[h] = 100 * (G[i + h].v / G[i].v - 1); const m20 = 100 * (G[i].v / G[i - 20].v - 1);
  ROWS.push({ d, b: BLK(d), y: d.slice(0, 4), mo: +d.slice(5, 7), fut, c, m20 }); }
console.log(`${ACT.toUpperCase()} · COT ${C[0].date} → ${C.at(-1).date} (${C.length} informes) · ${ROWS.length} sesiones con señal (${ROWS[0].d} → ${ROWS.at(-1).d}) · última lectura: fondos netos ${(100 * C.at(-1).mm).toFixed(1)} % del interés abierto, percentil ${(100 * C.at(-1).p_mm).toFixed(0)} de 3 años; cambio en 4 semanas ${sg(100 * C.at(-1).f4)} puntos`);
const SIG = [ // [nombre, a favor (alcista), en contra]
  ['fondos MUY CORTOS (percentil ≤ 20) frente a muy largos (≥ 80) · lectura contraria', (r) => r.c.p_mm <= 0.2, (r) => r.c.p_mm >= 0.8],
  ['fondos muy largos (≥ 80) frente a muy cortos (≤ 20) · lectura de tendencia', (r) => r.c.p_mm >= 0.8, (r) => r.c.p_mm <= 0.2],
  ['fondos en extremo largo (≥ 90) → ¿techo? (a favor = NO extremo)', (r) => r.c.p_mm < 0.9, (r) => r.c.p_mm >= 0.9],
  ['fondos en extremo corto (≤ 10) → ¿suelo?', (r) => r.c.p_mm <= 0.1, (r) => r.c.p_mm > 0.1],
  ['fondos comprando (posición neta sube en 4 semanas ≥ 2 pts) frente a vendiendo', (r) => r.c.f4 >= 0.02, (r) => r.c.f4 <= -0.02],
  ['fondos comprando en 13 semanas (≥ 4 pts) frente a vendiendo', (r) => r.c.f13 >= 0.04, (r) => r.c.f13 <= -0.04],
  ['fondos comprando la última semana (≥ 1 pt) frente a vendiendo', (r) => r.c.f1 >= 0.01, (r) => r.c.f1 <= -0.01],
  ['cortos de los fondos en máximos (≥ 80) → posible cierre de cortos', (r) => r.c.p_mmS >= 0.8, (r) => r.c.p_mmS <= 0.2],
  ['comerciales poco cortos (percentil ≥ 80) frente a muy cortos (≤ 20)', (r) => r.c.p_com >= 0.8, (r) => r.c.p_com <= 0.2],
  ['pequeños muy cortos (≤ 20) frente a muy largos (≥ 80) · contraria', (r) => r.c.p_small <= 0.2, (r) => r.c.p_small >= 0.8],
  ['interés abierto alto (≥ 80) frente a bajo (≤ 20)', (r) => r.c.p_oi >= 0.8, (r) => r.c.p_oi <= 0.2],
  ['fondos vendiendo 4 semanas PERO el precio sube en 20 s (precio aguanta)', (r) => r.c.f4 <= -0.02 && r.m20 > 0, (r) => r.c.f4 >= 0.02 && r.m20 < 0],
  ['fondos muy largos Y comprando (euforia) → a favor = lo contrario', (r) => !(r.c.p_mm >= 0.8 && r.c.f4 >= 0.02), (r) => r.c.p_mm >= 0.8 && r.c.f4 >= 0.02],
  ['fondos muy cortos Y vendiendo (capitulación)', (r) => r.c.p_mm <= 0.2 && r.c.f4 <= -0.02, (r) => !(r.c.p_mm <= 0.2 && r.c.f4 <= -0.02)],
];
for (const h of [20, 60]) { console.log(`\n— a ${h} sesiones · base: sube el ${f1(pc(ROWS.map((r) => r.fut[h] > 0)))} % (bloques ${[0, 1, 2].map((b) => f1(pc(ROWS.filter((r) => r.b === b).map((r) => r.fut[h] > 0)))).join(' / ')}) · ★ separa ≥ 4 en los 3 bloques · ✗ al revés en los 3 —`);
  for (const [lab, up, dn] of SIG) { const U = ROWS.filter(up), D = ROWS.filter(dn); const sep = (fn) => pc(U.filter(fn).map((r) => r.fut[h] > 0)) - pc(D.filter(fn).map((r) => r.fut[h] > 0)); const bl = [0, 1, 2].map((b) => sep((r) => r.b === b)); const nb = [0, 1, 2].map((b) => Math.min(U.filter((r) => r.b === b).length, D.filter((r) => r.b === b).length)); const ok = nb.every((n) => n >= 40);
    console.log(`  ${(ok && bl.every((v) => v >= 4) ? '★ ' : ok && bl.every((v) => v <= -4) ? '✗ ' : '  ') + lab.padEnd(78)} a favor ${f1(pc(U.map((r) => r.fut[h] > 0)))} % (n ${String(U.length).padStart(4)}, ${sg(mean(U.map((r) => r.fut[h])), 2)} %) · en contra ${f1(pc(D.map((r) => r.fut[h] > 0)))} % (n ${String(D.length).padStart(4)}, ${sg(mean(D.map((r) => r.fut[h])), 2)} %) · sep ${sg(sep(() => true))} · bloques ${bl.map((v) => sg(v)).join(' / ')} (n mín ${nb.join('/')})`); } }
// estacionalidad: rendimiento del mes natural siguiente, por mes de entrada
console.log('\n— ESTACIONALIDAD · rendimiento de cada mes natural (cierre a cierre) · % de años que sube · por bloques —'); const byM = {}; for (let i = 1; i < G.length; i++) { const k = G[i].date.slice(0, 7); (byM[k] ||= { first: G[i - 1].v, last: G[i].v }).last = G[i].v; } const MS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
for (let m = 1; m <= 12; m++) { const X = Object.entries(byM).filter(([k]) => +k.slice(5) === m && k < '2026-11').map(([k, v]) => ({ y: k.slice(0, 4), r: 100 * (v.last / v.first - 1) })); const bl = [['2010', '2015'], ['2016', '2021'], ['2022', '2026']].map(([a, b]) => X.filter((o) => o.y >= a && o.y <= b)); console.log(`  ${MS[m - 1]}: sube ${f1(pc(X.map((o) => o.r > 0)))} % de ${X.length} años · media ${sg(mean(X.map((o) => o.r)), 2)} % · bloques ${bl.map((B) => `${B.filter((o) => o.r > 0).length}/${B.length} (${sg(mean(B.map((o) => o.r)), 1)})`).join(' · ')}`); }
