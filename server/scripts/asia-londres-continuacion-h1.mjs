// Misma regla de continuación con velas H1 (2024-05 → 2026-10) para tener un tramo ANTERIOR e independiente (antes de 2025-06-13),
// y control: comprar todos los días al cierre de la vela de las 09/10/11 con el mismo stop (medio rango de Asia), sin condición.
import { readFileSync } from 'node:fs';
// Uso: node server/scripts/asia-londres-continuacion-h1.mjs [--archivo data/mt5-largo/US30_H1.csv --spread 3 --desde 2022-10-19]
// Acepta el CSV propio (time,open,high,low,close) y la exportación de MT5 con tabuladores.
const arg = (k, d) => { const x = process.argv.indexOf(k); return x >= 0 ? process.argv[x + 1] : d; };
const FILE = arg('--archivo', 'data/mt5/NAS100F_PERIOD_H1.csv'); const SPREAD = Number(arg('--spread', '1.5')); const FROM = arg('--desde', '2000-01-01'), TO = arg('--hasta', '2100-01-01');
const days = new Map();
for (const l of readFileSync(FILE, 'utf8').trim().split(/\r?\n/)) {
  if (/^[<a-z]/i.test(l)) continue; let d, hour, mm, o, h, lo, c;
  if (l.includes('\t')) { const f = l.split('\t'); d = f[0].replace(/\./g, '-'); hour = +f[1].slice(0, 2); mm = f[1].slice(3, 5); [o, h, lo, c] = f.slice(2, 6).map(Number); }
  else { const f = l.split(','); d = f[0].slice(0, 10).replace(/\./g, '-'); hour = +f[0].slice(11, 13); mm = f[0].slice(14, 16); [o, h, lo, c] = f.slice(1, 5).map(Number); }
  if (mm !== '00' || d < FROM || d > TO) continue;
  (days.get(d) || days.set(d, []).get(d)).push({ hour, o, h, l: lo, c });
}
const D = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars }));
const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN); const f2 = (v) => (Number.isNaN(v) ? ' — ' : (v >= 0 ? '+' : '') + v.toFixed(2));
function sim(seq, from, dir, entry, stop) { const risk = Math.abs(entry - stop); const out = {}; for (let j = from; j < seq.length; j++) { const b = seq[j]; const s = dir > 0 ? b.l <= stop : b.h >= stop; for (const k of [1, 2, 3]) { if (out[k] !== undefined) continue; const t = entry + dir * k * risk; if (s) out[k] = -1; else if (dir > 0 ? b.h >= t + SPREAD : b.l <= t - SPREAD) out[k] = k; } if (s) break; } for (const k of [1, 2, 3]) if (out[k] === undefined) out[k] = Math.max(-1, (dir * (seq.at(-1).c - entry)) / risk); return out; }
const EV = [], CT = [];
for (const d of D) {
  const seq = d.bars.filter((b) => b.hour >= 2); const i0 = seq.findIndex((b) => b.hour >= 9); if (i0 < 5 || seq.length - i0 < 8) continue;
  const asia = seq.slice(0, i0); const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), mid = (aH + aL) / 2, half = (aH - aL) / 2;
  let done = false;
  for (let j = i0; j < seq.length && seq[j].hour <= 11; j++) {
    const b = seq[j];
    for (const dir of [1, -1]) CT.push({ date: d.date, dir, hour: b.hour, v: sim(seq, j + 1, dir, b.c, b.c - dir * half) }); // control: misma hora, mismo riesgo, sin condición
    if (done || !(b.h > aH || b.l < aL)) continue; done = true;
    const dir = b.c > aH ? 1 : b.c < aL ? -1 : 0; if (!dir) continue;
    const level = dir > 0 ? aH : aL; const row = { date: d.date, dir, v: { M: sim(seq, j + 1, dir, b.c, mid) } };
    for (let q = j + 1; q < Math.min(seq.length, j + 4); q++) { const x = seq[q]; if (dir > 0 ? x.l <= level : x.h >= level) { row.v.R = (dir > 0 ? x.l <= mid : x.h >= mid) ? { 1: -1, 2: -1, 3: -1 } : sim(seq, q + 1, dir, level, mid); break; } }
    EV.push(row);
  }
}
const rep = (lab, S, key) => { const v = S.map((e) => (key ? e.v[key] : e.v)).filter(Boolean); console.log(`${lab.padEnd(58)} n ${String(v.length).padStart(4)} | 1R ${String(Math.round(100 * v.filter((r) => r[1] >= 1).length / v.length)).padStart(3)} % ${f2(avg(v.map((r) => r[1])))} | 2R ${String(Math.round(100 * v.filter((r) => r[2] >= 2).length / v.length)).padStart(3)} % ${f2(avg(v.map((r) => r[2])))} | 3R ${f2(avg(v.map((r) => r[3])))}`); };
const years = [...new Set(EV.map((e) => e.date.slice(0, 4)))];
console.log(`\n######## ${FILE} · ${D[0].date} → ${D.at(-1).date} · ${D.length} días · spread ${SPREAD}`);
for (const [lab, fn] of [['TODO', () => true], ...years.map((y) => [y, (e) => e.date.startsWith(y)])]) {
  console.log(`== ${lab} ==`);
  rep('rotura al ALZA cierra fuera · retest del alto, stop medio', EV.filter((e) => fn(e) && e.dir > 0), 'R');
  rep('rotura al ALZA cierra fuera · mercado al cierre', EV.filter((e) => fn(e) && e.dir > 0), 'M');
  if (lab === 'TODO') { rep('rotura a la BAJA cierra fuera · retest', EV.filter((e) => fn(e) && e.dir < 0), 'R'); rep('rotura a la BAJA cierra fuera · mercado', EV.filter((e) => fn(e) && e.dir < 0), 'M'); }
  rep('CONTROL comprar sin condición (09–11 h), mismo riesgo', CT.filter((e) => fn(e) && e.dir > 0));
}
