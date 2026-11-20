// ORO Y GEOPOLÍTICA (20-11-2026, pregunta del usuario por el estrecho de Ormuz). No hay un índice de riesgo geopolítico en los datos de la
// casa, así que se usa lo que sí deja huella en el precio: un SUSTO DE PETRÓLEO (el crudo salta en 1 o 5 días), solo o con el VIX subiendo.
// Se mide qué hizo el oro (y el propio petróleo y la bolsa) en las 1, 5 y 20 sesiones siguientes, 2007–2026, en 3 cortes.
// Uso: node server/scripts/oro-geopolitica.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const f1 = (v) => (Number.isNaN(v) ? ' — ' : v.toFixed(1)); const f2 = (v) => (Number.isNaN(v) ? ' — ' : (v >= 0 ? '+' : '') + v.toFixed(2));
const yahoo = (n) => { const r = JSON.parse(readFileSync(path.join(ROOT, 'data/yahoo', `${n}_1d_largo.json`), 'utf8')).chart.result[0]; const q = r.indicators.quote[0]; const off = r.meta.gmtoffset || 0; return new Map(r.timestamp.map((t, i) => [new Date((t + off) * 1000).toISOString().slice(0, 10), q.close[i]]).filter(([, v]) => Number.isFinite(v) && v > 5)); };
const GC = yahoo('GC'), CL = yahoo('CL'), SP = yahoo('GSPC'), VX = yahoo('VIX'), DX = yahoo('DXY');
const dates = [...GC.keys()].filter((d) => d >= '2007-01-01' && CL.has(d) && SP.has(d) && VX.has(d) && DX.has(d)).sort(); const n = dates.length; const g = (M, i) => M.get(dates[i]);
const rows = []; for (let i = 25; i < n - 20; i++) { const ret = (M, a, b) => 100 * (g(M, b) / g(M, a) - 1); rows.push({ d: dates[i], cl1: ret(CL, i - 1, i), cl5: ret(CL, i - 5, i), cl20: ret(CL, i - 20, i), vx5: g(VX, i) - g(VX, i - 5), vix: g(VX, i), dx5: ret(DX, i - 5, i), gc1prev: ret(GC, i - 1, i), gc5prev: ret(GC, i - 5, i),
  gc: [ret(GC, i, i + 1), ret(GC, i, i + 5), ret(GC, i, i + 20)], cl: [ret(CL, i, i + 1), ret(CL, i, i + 5), ret(CL, i, i + 20)], sp: [ret(SP, i, i + 1), ret(SP, i, i + 5), ret(SP, i, i + 20)] }); }
const n3 = Math.ceil(rows.length / 3); rows.forEach((r, i) => (r.b = Math.min(2, Math.floor(i / n3))));
const up = (A, k, h) => (A.length ? (100 * A.filter((r) => r[k][h] > 0).length) / A.length : NaN);
const episodes = (A) => { let c = 0, last = null; for (const r of A) { if (!last || (Date.parse(r.d) - Date.parse(last)) / 864e5 > 10) c++; last = r.d; } return c; };
const line = (lab, A) => { if (A.length < 20) { console.log(`   ${lab.padEnd(58)} n ${A.length} (pocos casos)`); return; } console.log(`   ${lab.padEnd(58)} n ${String(A.length).padStart(4)} (${episodes(A)} episodios) · ORO sube: 1 s ${f1(up(A, 'gc', 0))} % · 5 s ${f1(up(A, 'gc', 1))} % (${[0, 1, 2].map((b) => f1(up(A.filter((r) => r.b === b), 'gc', 1))).join(' / ')}), ${f2(mean(A.map((r) => r.gc[1])))} % · 20 s ${f1(up(A, 'gc', 2))} %, ${f2(mean(A.map((r) => r.gc[2])))} % · PETRÓLEO 5 s ${f1(up(A, 'cl', 1))} %, ${f2(mean(A.map((r) => r.cl[1])))} % · 20 s ${f2(mean(A.map((r) => r.cl[2])))} % · BOLSA 5 s ${f1(up(A, 'sp', 1))} %`); };
console.log(`Oro tras sustos de petróleo · ${dates[25]} → ${dates[n - 21]} · ${rows.length} días · cortes ≈ ${rows[0].d.slice(0, 4)}–${rows[n3].d.slice(0, 4)} / ${rows[n3].d.slice(0, 4)}–${rows[2 * n3].d.slice(0, 4)} / ${rows[2 * n3].d.slice(0, 4)}–${rows.at(-1).d.slice(0, 4)}`);
line('TODOS LOS DÍAS (referencia)', rows);
console.log('   --- el petróleo salta ---');
line('petróleo +4 % o más en un día', rows.filter((r) => r.cl1 >= 4)); line('petróleo +10 % o más en 5 días', rows.filter((r) => r.cl5 >= 10)); line('petróleo +20 % o más en 20 días', rows.filter((r) => r.cl20 >= 20));
console.log('   --- susto: petróleo salta Y el miedo sube ---');
line('petróleo +4 % en un día y VIX sube ≥ 2 en 5 días', rows.filter((r) => r.cl1 >= 4 && r.vx5 >= 2)); line('petróleo +10 % en 5 días y VIX sube ≥ 2', rows.filter((r) => r.cl5 >= 10 && r.vx5 >= 2)); line('petróleo +5 % en 5 días y VIX sube ≥ 3', rows.filter((r) => r.cl5 >= 5 && r.vx5 >= 3));
line('petróleo +5 % en 5 días, VIX sube ≥ 2 y el oro ya subió ≥ 2 %', rows.filter((r) => r.cl5 >= 5 && r.vx5 >= 2 && r.gc5prev >= 2)); line('petróleo +5 % en 5 días, VIX sube ≥ 2 y el oro NO ha subido', rows.filter((r) => r.cl5 >= 5 && r.vx5 >= 2 && r.gc5prev < 0.5));
console.log('   --- el susto se deshace ---');
line('petróleo −10 % o más en 5 días', rows.filter((r) => r.cl5 <= -10)); line('petróleo −20 % o más en 20 días', rows.filter((r) => r.cl20 <= -20)); line('petróleo −20 % en 20 días y VIX > 25', rows.filter((r) => r.cl20 <= -20 && r.vix > 25));
console.log('   --- el oro salta con el miedo (compra de refugio) ---');
line('oro +2 % o más en un día', rows.filter((r) => r.gc1prev >= 2)); line('oro +2 % en un día y VIX sube ≥ 2 en 5 días', rows.filter((r) => r.gc1prev >= 2 && r.vx5 >= 2)); line('oro +4 % o más en 5 días', rows.filter((r) => r.gc5prev >= 4));
