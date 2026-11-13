// Hipótesis contraria a la «vuelta» (Osler 2003: los stops propagan la tendencia): en Londres, cuando la vela H1 que
// supera un lado de Asia CIERRA FUERA del rango, seguir la rotura. Reglas fijadas antes de medir (13-11-2026):
//   Asia = 02:00–08:59 servidor (NY + 7). Evento = primera vela H1 de 09, 10 u 11 h que supera un lado y cierra fuera.
//   R  retest: orden límite en el nivel roto (válida 3 h), stop en el medio del rango de Asia.
//   M  mercado al cierre de esa vela H1, stop en el medio del rango.
//   Objetivos 1R, 2R, 3R con spread; en la vela de la entrada solo se mira el stop; cierre al final del día.
//   Filtros: día anterior (vela de ayer) a favor/en contra de la rotura; sesgo diario (cierre de ayer frente al rango de anteayer).
// Uso: node server/scripts/asia-londres-continuacion.mjs --archivo data/mt5-largo/US100_M5.csv --spread 1
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FILE = path.resolve(ROOT, arg('--archivo', 'data/mt5-largo/US100_M5.csv')); const SPREAD = Number(arg('--spread', '1'));
const days = new Map();
for (const line of readFileSync(FILE, 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const f = line.split('\t'); if (f.length < 6) continue; const [o, h, l, c] = f.slice(2, 6).map(Number); const date = f[0].replace(/\./g, '-'); (days.get(date) || days.set(date, []).get(date)).push({ hour: +f[1].slice(0, 2), min: +f[1].slice(3, 5), o, h, l, c }); }
const D = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars, o: bars[0].o, c: bars.at(-1).c, h: Math.max(...bars.map((b) => b.h)), l: Math.min(...bars.map((b) => b.l)) }));
const b0 = D[5].bars; const PH = Math.round(60 / Math.max(1, (b0[1].hour * 60 + b0[1].min) - (b0[0].hour * 60 + b0[0].min)));
const avg = (x) => (x.length ? x.reduce((a, b) => a + b, 0) / x.length : NaN); const f2 = (v) => (Number.isNaN(v) ? '  —  ' : (v >= 0 ? '+' : '') + v.toFixed(2));
function sim(seq, from, dir, entry, stop) {
  const risk = Math.abs(entry - stop); const out = {};
  for (let j = from; j < seq.length; j++) { const b = seq[j]; const s = dir > 0 ? b.l <= stop : b.h >= stop; for (const k of [1, 2, 3]) { if (out[k] !== undefined) continue; const t = entry + dir * k * risk; if (s) out[k] = -1; else if (dir > 0 ? b.h >= t + SPREAD : b.l <= t - SPREAD) out[k] = k; } if (s) break; }
  for (const k of [1, 2, 3]) if (out[k] === undefined) out[k] = Math.max(-1, (dir * (seq.at(-1).c - entry)) / risk);
  return out;
}
const EV = [];
for (let i = 2; i < D.length; i++) {
  const d = D[i], p1 = D[i - 1], p2 = D[i - 2]; const seq = d.bars.filter((b) => b.hour >= 2); const i0 = seq.findIndex((b) => b.hour >= 9);
  if (i0 < 5 * PH || seq.length - i0 < 8 * PH) continue;
  const asia = seq.slice(0, i0); const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), mid = (aH + aL) / 2;
  for (const hr of [9, 10, 11]) {
    const idx = seq.map((b, j) => (b.hour === hr ? j : -1)).filter((j) => j >= 0); if (!idx.length) continue;
    const hi = Math.max(...idx.map((j) => seq[j].h)), lo = Math.min(...idx.map((j) => seq[j].l)), cl = seq[idx.at(-1)].c;
    if (!(hi > aH || lo < aL)) continue; // primera H1 que supera un lado
    const dir = cl > aH ? 1 : cl < aL ? -1 : 0; const end = idx.at(-1);
    if (dir !== 0) {
      const level = dir > 0 ? aH : aL; const row = { date: d.date, dir, prev: Math.sign(p1.c - p1.o), bias: p1.c > p2.h ? 1 : p1.c < p2.l ? -1 : 0, v: {} };
      row.v.M = sim(seq, end + 1, dir, cl, mid);
      for (let j = end + 1; j < Math.min(seq.length, end + 1 + 3 * PH); j++) { const b = seq[j]; if (dir > 0 ? b.l <= level : b.h >= level) { row.v.R = (dir > 0 ? b.l <= mid : b.h >= mid) ? { 1: -1, 2: -1, 3: -1 } : sim(seq, j + 1, dir, level, mid); break; } }
      EV.push(row);
    }
    break;
  }
}
console.log(`\n${path.basename(FILE)} · Londres, vela H1 de la rotura cierra FUERA: ${EV.length} eventos (${EV[0]?.date} → ${EV.at(-1)?.date})`);
const n3 = Math.ceil(EV.length / 3);
const line = (lab, fn) => { for (const key of ['R', 'M']) { const S = EV.filter(fn); const v = S.map((e) => e.v[key]).filter(Boolean); if (!v.length) continue; const b = [0, 1, 2].map((i) => { const x = EV.slice(i * n3, (i + 1) * n3).filter(fn).map((e) => e.v[key]).filter(Boolean); return `${f2(avg(x.map((r) => r[2])))} (${x.length})`; }).join(' · '); console.log(`${lab.padEnd(34)} ${key === 'R' ? 'retest ' : 'mercado'} n ${String(v.length).padStart(3)} | 1R ${String(Math.round(100 * v.filter((r) => r[1] >= 1).length / v.length)).padStart(3)} % ${f2(avg(v.map((r) => r[1])))} | 2R ${String(Math.round(100 * v.filter((r) => r[2] >= 2).length / v.length)).padStart(3)} % ${f2(avg(v.map((r) => r[2])))} | 3R ${f2(avg(v.map((r) => r[3])))} | 2R por bloques ${b}`); } };
line('todas', () => true); line('rotura al alza', (e) => e.dir > 0); line('rotura a la baja', (e) => e.dir < 0);
line('a favor del día anterior', (e) => e.dir === e.prev); line('en contra del día anterior', (e) => e.dir === -e.prev);
line('sesgo diario a favor', (e) => e.bias === e.dir); line('sesgo diario en contra', (e) => e.bias === -e.dir); line('sesgo neutro', (e) => e.bias === 0);
