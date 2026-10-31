// ¿Qué pares dan «rallys» como el de AUDJPY (oct-2025 → abr-2026): tramos largos con la EMA 8 diaria al mismo lado
// de la SMA 18? Por par: tramos ≥ 40 y ≥ 60 días por año, el más largo (fechas), recorrido del tramo en ATR diarios, y
// cómo rinde la entrada H4 al cruce a favor DENTRO de esos tramos largos (objetivo 2R), frente al resto.
// Uso: node server/scripts/rallys-8-18.mjs [--min 40]
process.env.SIN_SALIDA = '1';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { analizar } = await import('./tendencia-8-18.mjs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const MIN = Number(arg('--min', '40'));
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (a, b) => (b === undefined ? `${(100 * a).toFixed(0)} %` : b ? `${((100 * a) / b).toFixed(0)} %` : '—');

const dirs = ['mt5-largo', 'mt5-fxcm', 'mt5'].map((d) => path.join(ROOT, 'data', d)).filter(existsSync);
const syms = [...new Set(dirs.flatMap((d) => readdirSync(d).map((f) => f.match(/^([A-Z0-9]+)_(PERIOD_H1|M30)\.csv$/)?.[1]).filter(Boolean)))].sort();
const rows = []; const rallys = [];
for (const sym of syms) {
  const R = analizar(sym); if (!R) continue;
  const d1 = R.d1; const tr = d1.slice(1).map((b, i) => Math.max(b.h - b.l, Math.abs(b.h - d1[i].c), Math.abs(b.l - d1[i].c))); const atr = (i) => avg(tr.slice(Math.max(0, i - 15), i - 1)) || 1;
  const largos = R.tramos.filter((t) => t.len >= MIN);
  for (const t of largos) { const a = d1[t.start], b = d1[t.end]; const move = (t.dir * (b.c - a.c)) / atr(t.start); rallys.push({ sym, desde: a.date, hasta: b.date, len: t.len, dir: t.dir > 0 ? 'alcista' : 'bajista', moveAtr: move }); }
  const inLong = (t) => largos.some((l) => t.date >= d1[l.start].date && t.date <= d1[l.end].date);
  const Tin = R.T.filter(inLong), Tout = R.T.filter((t) => !inLong(t));
  const longest = [...largos].sort((a, b) => b.len - a.len)[0];
  rows.push({ sym, years: R.years, n40: largos.length / R.years, n60: R.tramos.filter((t) => t.len >= 60).length / R.years, longest: longest ? `${longest.len} d (${d1[longest.start].date.slice(0, 7)} → ${d1[longest.end].date.slice(0, 7)})` : '—', moveAtr: avg(largos.map((l) => (l.dir * (d1[l.end].c - d1[l.start].c)) / atr(l.start))), inN: Tin.length, inWr: Tin.filter((t) => t.r2 > 0).length / (Tin.length || 1), inR: avg(Tin.map((t) => t.r2)), outN: Tout.length, outWr: Tout.filter((t) => t.r2 > 0).length / (Tout.length || 1), outR: avg(Tout.map((t) => t.r2)) });
}
console.log(`Tramos diarios 8/18 de ≥ ${MIN} días («rallys»), por par. Entrada H4 a favor con objetivo 2R dentro de esos tramos frente a fuera.\n`);
console.log('par       años   ≥40 d/año  ≥60 d/año  más largo                        recorrido medio   | dentro: n  2R   R̄     | fuera: n  2R   R̄');
for (const r of rows.sort((a, b) => b.n40 - a.n40)) console.log(`${r.sym.padEnd(9)} ${r.years.toFixed(1).padStart(4)}   ${r.n40.toFixed(1).padStart(6)}     ${r.n60.toFixed(1).padStart(6)}    ${r.longest.padEnd(32)} ${r.moveAtr.toFixed(1).padStart(5)} ATR         | ${String(r.inN).padStart(4)}  ${pct(r.inWr).padStart(4)} ${(r.inR >= 0 ? '+' : '') + r.inR.toFixed(2)}   | ${String(r.outN).padStart(4)}  ${pct(r.outWr).padStart(4)} ${(r.outR >= 0 ? '+' : '') + r.outR.toFixed(2)}`);
console.log(`\nLos 20 rallys más largos de toda la muestra:`);
for (const r of rallys.sort((a, b) => b.len - a.len).slice(0, 20)) console.log(`  ${r.sym.padEnd(8)} ${r.dir.padEnd(8)} ${String(r.len).padStart(3)} d  ${r.desde} → ${r.hasta}  recorrido ${r.moveAtr.toFixed(1)} ATR`);
const all = rows.reduce((a, r) => a + r.inN, 0), allOut = rows.reduce((a, r) => a + r.outN, 0);
console.log(`\nTotal: dentro de rallys n=${all}, fuera n=${allOut}.`);

// ---------- filtro conocido a tiempo: días que lleva el diario alineado al entrar ----------
const B = [[0, 9], [10, 19], [20, 39], [40, 999]]; const acc = {}; const accYen = {};
for (const sym of syms) { const R = analizar(sym); if (!R) continue; for (const t of R.T) { const k = B.find(([a, b]) => t.age >= a && t.age <= b).join('-'); (acc[k] ||= []).push(t.r2); if (/JPY$/.test(sym)) (accYen[k] ||= []).push(t.r2); } }
console.log('\nEntrada H4 a favor, objetivo 2R, según los DÍAS que lleva el diario 8/18 alineado al entrar (todos los pares / solo yenes):');
for (const [a, b] of B) { const k = `${a}-${b}`; const x = acc[k] || [], y = accYen[k] || []; console.log(`  ${(a + '–' + (b === 999 ? '∞' : b) + ' días').padEnd(12)} todos n=${String(x.length).padStart(4)} acierto ${pct(x.filter((v) => v > 0).length, x.length)} R̄ ${(avg(x) >= 0 ? '+' : '') + avg(x).toFixed(2)}   | yenes n=${String(y.length).padStart(3)} acierto ${pct(y.filter((v) => v > 0).length, y.length)} R̄ ${(avg(y) >= 0 ? '+' : '') + avg(y).toFixed(2)}`); }
