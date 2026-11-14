// Compra tras la barrida del bajo de Asia en Londres, con y sin GEX alto: ¿qué entrada rinde más?
// Lee los eventos de `asia-ict.mjs --json` (cambio de estructura alcista tras barrer el bajo) y les cruza el régimen de
// GEX del día anterior. Entradas: M (a mercado al cierre del cambio de estructura), O (OTE 70,5 %), F (borde del FVG),
// Fc (mitad del FVG), todas con stop tras la barrida. Objetivos 1:1, 1:1,5 y 1:2, por años.
// Uso: node server/scripts/asia-compra-gex.mjs eventos.json "Nombre"
import { readFileSync } from 'node:fs';
const [, , file, name] = process.argv;
const GEX = readFileSync('data/historico/gex/DIX.csv', 'utf8').trim().split('\n').slice(1).map((l) => { const [date, , , gex] = l.split(','); return { date, value: +gex }; });
const gexAt = (date) => { let i = -1; for (let k = GEX.length - 1; k >= 0; k--) if (GEX[k].date < date) { i = k; break; } if (i < 252) return null; const w = GEX.slice(i - 252, i); const p = w.filter((r) => r.value < GEX[i].value).length / w.length; return GEX[i].value < 0 ? 'negativo' : p >= 2 / 3 ? 'alto' : p <= 1 / 3 ? 'bajo' : 'medio'; };
const EV = JSON.parse(readFileSync(file, 'utf8')).filter((e) => e.mss && e.kz === 'Londres' && e.dir > 0).map((e) => ({ ...e, gex: gexAt(e.date) }));
const years = [...new Set(EV.map((e) => e.date.slice(0, 4)))]; const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const f = (v) => (Number.isNaN(v) ? '  —  ' : (v >= 0 ? '+' : '') + v.toFixed(2));
const med = (x) => { const s = [...x].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
console.log(`\n######## ${name} · compras tras barrer el bajo de Asia en Londres · ${EV.length} cambios de estructura (${EV[0].date} → ${EV.at(-1).date})`);
for (const [lab, fn] of [['TODAS', () => true], ['GEX ALTO', (e) => e.gex === 'alto'], ['GEX medio', (e) => e.gex === 'medio'], ['GEX bajo o negativo', (e) => e.gex === 'bajo' || e.gex === 'negativo']]) {
  console.log(`  ${lab}`);
  for (const key of ['M', 'O', 'F', 'Fc']) {
    const R = EV.filter(fn).map((e) => ({ y: e.date.slice(0, 4), r: e.v[key] })).filter((x) => x.r); if (!R.length) continue;
    const w = (k, m) => Math.round((100 * R.filter((x) => x.r[k] >= m - 0.001).length) / R.length);
    const ys = years.map((y) => { const A = R.filter((x) => x.y === y); return A.length >= 4 ? f(mean(A.map((x) => x.r.r15))) : '  —  '; });
    const pos = years.filter((y) => { const A = R.filter((x) => x.y === y); return A.length >= 4 && mean(A.map((x) => x.r.r15)) > 0; }).length;
    console.log(`    ${({ M: 'a mercado', O: 'OTE 70,5 %', F: 'borde FVG', Fc: 'mitad FVG' })[key].padEnd(11)} n ${String(R.length).padStart(3)} · stop ${med(R.map((x) => x.r.risk)).toFixed(0).padStart(3)} pts | 1:1 ${w('r1', 1)} % ${f(mean(R.map((x) => x.r.r1)))} | 1:1,5 ${w('r15', 1.5)} % ${f(mean(R.map((x) => x.r.r15)))} | 1:2 ${w('r2', 2)} % ${f(mean(R.map((x) => x.r.r2)))} | años + ${pos}/${years.length} | ${ys.join(' ')}`);
  }
}
