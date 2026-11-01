// ¿Qué combinación de pilares da el sesgo fundamental más acertado, y es estable? Usa los valores de pilar por divisa y
// día del radar histórico (radar_hist_pilares.json, 2011→2026) y mide, para cada juego de pesos, si el signo del sesgo
// (base − cotizada) acierta la dirección del precio a 5, 10 y 20 días, por nivel de fuerza (|diff| ≥ 2, ≥ 4) y por
// bloque de años (regla de la casa: una variante solo vale si mejora al radar actual en TODOS los bloques).
// Uso: node server/scripts/radar-bias-optimizar.mjs [--h 20]
process.env.SIN_SALIDA = '1';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { loadBars, agg } = await import('./tendencia-8-18.mjs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const H = path.join(ROOT, 'data', 'historico');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const PAIRS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'EURAUD', 'EURCAD', 'EURNZD', 'EURCHF', 'GBPAUD', 'GBPCAD', 'GBPNZD', 'GBPCHF', 'AUDCAD', 'AUDNZD', 'AUDCHF', 'NZDJPY', 'NZDCAD', 'NZDCHF', 'CADCHF', 'CHFJPY'];
const PIL = ['tasas', 'expectativas', 'inflacion', 'crecimiento', 'posicionamiento', 'riesgo', 'momentum'];
const OFICIAL = { tasas: 20, expectativas: 15, inflacion: 10, crecimiento: 15, posicionamiento: 10, riesgo: 10, momentum: 15 };
const HS = [5, 10, 20];
const BLOQUES = [['2011', '2015'], ['2016', '2020'], ['2021', '2026']];

const pil = JSON.parse(readFileSync(path.join(H, 'radar_hist_pilares.json'), 'utf8')); // [[date, {CCY: {pilar: v}}]]
// retornos futuros por par y fecha
const fut = {}; // pair → Map(date → {5: r, 10: r, 20: r})
for (const p of PAIRS) { const h1 = loadBars(p); if (!h1) continue; const d1 = agg(h1, (b) => b.date); const m = new Map(); for (let i = 0; i < d1.length; i++) { const o = {}; for (const h of HS) if (i + h < d1.length) o[h] = d1[i + h].c / d1[i].c - 1; m.set(d1[i].date, o); } fut[p] = m; }
const pairsOk = PAIRS.filter((p) => fut[p]);
const year = (d) => d.slice(0, 4);

function evaluar(W, { minAbs = 2, h = 20 } = {}) {
  const den = PIL.reduce((a, k) => a + (W[k] || 0), 0) || 1;
  const porBloque = BLOQUES.map(() => ({ n: 0, hit: 0 })); const porAno = {}; let n = 0, hit = 0, nF = 0, hitF = 0;
  for (const [date, byC] of pil) {
    const score = {}; for (const c of Object.keys(byC)) { let num = 0; for (const k of PIL) num += (W[k] || 0) * (byC[c][k] || 0); score[c] = (5 * num) / den; }
    const bi = BLOQUES.findIndex(([a, b]) => year(date) >= a && year(date) <= b); const y = year(date);
    for (const p of pairsOk) { const f = fut[p].get(date); if (!f || f[h] === undefined) continue; const diff = score[p.slice(0, 3)] - score[p.slice(3)]; if (Math.abs(diff) < minAbs) continue; const ok = Math.sign(diff) === Math.sign(f[h]); n++; if (ok) hit++; if (Math.abs(diff) >= 4) { nF++; if (ok) hitF++; } if (bi >= 0) { porBloque[bi].n++; if (ok) porBloque[bi].hit++; } (porAno[y] ||= { n: 0, hit: 0 }).n++; if (ok) porAno[y].hit++; }
  }
  return { n, hr: n ? hit / n : 0, nF, hrF: nF ? hitF / nF : 0, bloques: porBloque.map((b) => (b.n ? b.hit / b.n : 0)), bloquesN: porBloque.map((b) => b.n), anos: porAno };
}
const pct = (x) => `${(100 * x).toFixed(1)} %`;
const H_ = Number(arg('--h', '20'));
const cands = { oficial: OFICIAL };
for (const k of PIL) cands[`solo ${k}`] = { [k]: 1 };
for (const k of PIL) cands[`sin ${k}`] = Object.fromEntries(Object.entries(OFICIAL).filter(([kk]) => kk !== k));
cands['tipos (tasas 40 + expectativas 30 + inflación 10) + momentum 20'] = { tasas: 40, expectativas: 30, inflacion: 10, momentum: 20 };
cands['solo tipos (tasas 50 + expectativas 50)'] = { tasas: 50, expectativas: 50 };
cands['tipos + posicionamiento'] = { tasas: 35, expectativas: 25, posicionamiento: 20, momentum: 20 };
cands['macro puro (sin momentum ni riesgo)'] = { tasas: 25, expectativas: 20, inflacion: 15, crecimiento: 20, posicionamiento: 20 };
cands['momentum + tipos a partes iguales'] = { tasas: 25, expectativas: 25, momentum: 50 };
cands['sin momentum ni expectativas'] = { tasas: 20, inflacion: 10, crecimiento: 15, posicionamiento: 10, riesgo: 10 };
cands['sin momentum, riesgo 20'] = { tasas: 20, expectativas: 15, inflacion: 10, crecimiento: 15, posicionamiento: 10, riesgo: 20 };
cands['sin momentum ni expectativas, riesgo 20'] = { tasas: 20, inflacion: 10, crecimiento: 15, posicionamiento: 10, riesgo: 20 };
cands['tasas 30 + inflación 10 + crecimiento 20 + COT 10 + riesgo 20'] = { tasas: 30, inflacion: 10, crecimiento: 20, posicionamiento: 10, riesgo: 20 };
cands['riesgo 40 + tasas 20 + crecimiento 20 + inflación 10 + COT 10'] = { tasas: 20, inflacion: 10, crecimiento: 20, posicionamiento: 10, riesgo: 40 };
cands['riesgo 50 + tasas 25 + inflación 25'] = { tasas: 25, inflacion: 25, riesgo: 50 };
const base = evaluar(OFICIAL, { h: H_ });
console.log(`Acierto del signo del sesgo a ${H_} días, pares-día con |diff| ≥ 2 (fuerte = ≥ 4). Bloques: 2011-15 / 2016-20 / 2021-26. Regla: mejora en los TRES bloques frente al oficial.\n`);
console.log('variante'.padEnd(62) + ' n       acierto   fuerte(n)        2011-15  2016-20  2021-26');
const rows = Object.entries(cands).map(([name, W]) => ({ name, ...evaluar(W, { h: H_ }) }));
for (const r of rows.sort((a, b) => b.hr - a.hr)) { const mejora = r.bloques.every((b, i) => b > base.bloques[i]) && r.name !== 'oficial'; console.log(`${r.name.padEnd(62)} ${String(r.n).padStart(6)}  ${pct(r.hr).padStart(7)}  ${pct(r.hrF).padStart(7)} (${String(r.nF).padStart(5)})   ${r.bloques.map((b) => pct(b).padStart(7)).join('  ')} ${mejora ? ' ← mejora en los 3' : ''}`); }
for (const name of ['sin momentum', 'sin momentum ni expectativas', 'sin momentum ni expectativas, riesgo 20']) { const e = { ...evaluar(cands[name], { h: H_ }) }; const ys = Object.entries(e.anos); const wins = ys.filter(([y, v]) => v.hit / v.n > base.anos[y].hit / base.anos[y].n).length; console.log(`\n${name} por año: ${ys.map(([y, v]) => `${y.slice(2)}:${pct(v.hit / v.n)}`).join(' ')} → mejor que el oficial en ${wins} de ${ys.length} años`); for (const h of HS) { const e2 = evaluar(cands[name], { h, minAbs: 2 }), e4 = evaluar(cands[name], { h, minAbs: 4 }), e6 = evaluar(cands[name], { h, minAbs: 6 }); console.log(`  ${h} d: |diff|≥2 ${pct(e2.hr)} (n=${e2.n}) · ≥4 ${pct(e4.hr)} (n=${e4.n}) · ≥6 ${pct(e6.hr)} (n=${e6.n})`); } }
console.log('\nOficial por año (acierto |diff| ≥ 2, n):'); console.log(Object.entries(base.anos).map(([y, v]) => `${y.slice(2)}:${pct(v.hit / v.n)}(${v.n})`).join(' '));
console.log('\nOficial por horizonte y fuerza:'); for (const h of HS) { const e2 = evaluar(OFICIAL, { h, minAbs: 2 }), e4 = evaluar(OFICIAL, { h, minAbs: 4 }), e6 = evaluar(OFICIAL, { h, minAbs: 6 }); console.log(`  ${h} d: |diff|≥2 ${pct(e2.hr)} (n=${e2.n}) · ≥4 ${pct(e4.hr)} (n=${e4.n}) · ≥6 ${pct(e6.hr)} (n=${e6.n})`); }
