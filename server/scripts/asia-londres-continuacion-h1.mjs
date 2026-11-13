// Misma regla de continuación con velas H1 (2024-05 → 2026-10) para tener un tramo ANTERIOR e independiente (antes de 2025-06-13),
// y control: comprar todos los días al cierre de la vela de las 09/10/11 con el mismo stop (medio rango de Asia), sin condición.
import { readFileSync } from 'node:fs';
const SPREAD = 1.5; const days = new Map();
for (const l of readFileSync('data/mt5/NAS100F_PERIOD_H1.csv', 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, lo, c] = l.split(','); if (t.slice(14, 16) !== '00') continue; const d = t.slice(0, 10).replace(/\./g, '-'); (days.get(d) || days.set(d, []).get(d)).push({ hour: +t.slice(11, 13), o: +o, h: +h, l: +lo, c: +c }); }
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
for (const [lab, fn] of [['ANTES de 2025-06-13 (tramo independiente)', (e) => e.date < '2025-06-13'], ['DESDE 2025-06-13 (mismo periodo que el M5)', (e) => e.date >= '2025-06-13'], ['2024', (e) => e.date < '2025-01-01'], ['2025', (e) => e.date >= '2025-01-01' && e.date < '2026-01-01'], ['2026', (e) => e.date >= '2026-01-01']]) {
  console.log(`\n== ${lab} ==`);
  rep('rotura al ALZA cierra fuera · retest del alto, stop medio', EV.filter((e) => fn(e) && e.dir > 0), 'R');
  rep('rotura al ALZA cierra fuera · mercado al cierre', EV.filter((e) => fn(e) && e.dir > 0), 'M');
  rep('rotura a la BAJA cierra fuera · retest', EV.filter((e) => fn(e) && e.dir < 0), 'R');
  rep('rotura a la BAJA cierra fuera · mercado', EV.filter((e) => fn(e) && e.dir < 0), 'M');
  rep('CONTROL comprar sin condición (09–11 h), mismo riesgo', CT.filter((e) => fn(e) && e.dir > 0));
  rep('CONTROL vender sin condición', CT.filter((e) => fn(e) && e.dir < 0));
}
