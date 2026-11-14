// Resumen por años de las entradas de `asia-ict.mjs --json` en Londres: a favor / en contra de la vela de ayer, 1:2.
// Uso: node server/scripts/asia-ict-resumen.mjs eventos.json "Nombre" "O,O%0.11,Or%0.07" [--kz Londres|Nueva York|todas]
import { readFileSync } from 'node:fs';
const [, , file, name, keysArg] = process.argv; const KZ = process.argv.includes('--kz') ? process.argv[process.argv.indexOf('--kz') + 1] : 'Londres';
const EV = JSON.parse(readFileSync(file, 'utf8')).filter((e) => e.mss && (KZ === 'todas' || e.kz === KZ));
const keys = (keysArg || 'O').split(','); const years = [...new Set(EV.map((e) => e.date.slice(0, 4)))];
const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN); const f = (v) => (Number.isNaN(v) ? '  —  ' : (v >= 0 ? '+' : '') + v.toFixed(2));
const med = (x) => { const s = [...x].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
// --objetivo r15 | r2 | r1 | r3 (por defecto r2). Empate: 1:1 50 %, 1:1,5 40 %, 1:2 33 %, 1:3 25 %.
const OBJ = process.argv.includes('--objetivo') ? process.argv[process.argv.indexOf('--objetivo') + 1] : 'r2'; const MULT = { r1: 1, r15: 1.5, r2: 2, r3: 3 }[OBJ];
const stat = (S, key) => { const R = S.map((e) => e.v[key]).filter(Boolean); const v = R.map((r) => r[OBJ]).filter((x) => x !== null && x !== undefined && !Number.isNaN(x)); return { n: v.length, win: v.length ? Math.round((100 * v.filter((x) => x >= MULT - 0.001).length) / v.length) : NaN, m: avg(v), risk: med(R.map((r) => r.risk)) }; };
console.log(`\n######## ${name} · ${KZ} · ${EV.length} cambios de estructura (${EV[0].date} → ${EV.at(-1).date})`);
for (const [lab, fn] of [['A FAVOR de la vela de ayer', (e) => e.dir === e.prev], ['EN CONTRA de la vela de ayer', (e) => e.dir === -e.prev], ['TODAS', () => true]]) {
  console.log(`  ${lab}`);
  for (const key of keys) {
    const all = stat(EV.filter(fn), key); const se = all.n ? Math.sqrt((all.win / 100) * (1 - all.win / 100) / all.n) * 100 : NaN;
    const ys = years.map((y) => { const s = stat(EV.filter((e) => fn(e) && e.date.startsWith(y)), key); return `${y} ${String(s.win).padStart(3)} % ${f(s.m)} (${s.n})`; }).join(' · ');
    const pos = years.filter((y) => stat(EV.filter((e) => fn(e) && e.date.startsWith(y)), key).m > 0).length;
    console.log(`    ${key.padEnd(8)} n ${String(all.n).padStart(4)} | gana 1:${String(MULT).replace('.', ',')} ${String(all.win).padStart(3)} % (±${(1.96 * se).toFixed(0)}) | medio ${f(all.m)}R | años positivos ${pos}/${years.length} | ${ys}`);
  }
}
