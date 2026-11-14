// Los dos patrones del yen convertidos en operaciones (14-11-2026). M5 del bróker, 2020–2026; se entra al precio real
// (compra al precio de compra, venta al de venta) y en cada vela se mira primero el stop.
//  1) LUNES: compra del par con yen a las 09:00 de servidor (08:00 España), cierre a las 18:00 (17:00 España).
//  2) ROTURA: si la primera hora europea (09:00–10:00) rompe solo un lado del rango de Asia (02:00–09:00), entrada a las
//     10:00 a favor de la rotura, cierre a las 18:00.
// Stops: fijo en % del precio, o estructural. R = resultado / distancia al stop. Hora de servidor = España + 1.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); };
const ts = (a) => (a.length > 10 ? mean(a) / (sd(a) / Math.sqrt(a.length)) : NaN); const f = (v, d = 2) => (Number.isNaN(v) || v === undefined ? '  — ' : (v >= 0 ? '+' : '') + v.toFixed(d));
const T = (h, m) => h * 60 + m; const dowOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
const POINT = (p) => (p.endsWith('JPY') ? 0.001 : 0.00001); const PIP = (p) => (p.endsWith('JPY') ? 0.01 : 0.0001);
function load(pair) { const m = new Map(); const pt = POINT(pair); for (const line of readFileSync(path.join(ROOT, 'data/mt5-largo/fx', `${pair}_M5.csv`), 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const x = line.split('\t'); if (x.length < 9) continue; const date = x[0].replace(/\./g, '-'); (m.get(date) || m.set(date, []).get(date)).push({ t: +x[1].slice(0, 2) * 60 + +x[1].slice(3, 5), o: +x[2], h: +x[3], l: +x[4], c: +x[5], sp: +x[8] * pt }); } return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars })).filter((d) => d.bars.length > 200); }
/** Operación: entra en la vela que abre en tIn, sale en la apertura de tOut; stop a `dist` del precio de entrada. */
function trade(bars, dir, tIn, tOut, distFn, tp = null) {
  const i = bars.findIndex((b) => b.t >= tIn); const j = bars.findIndex((b) => b.t >= tOut); if (i < 0 || j <= i || bars[i].t > tIn + 20) return null;
  const entry = dir > 0 ? bars[i].o + bars[i].sp : bars[i].o; const dist = distFn(entry, i); if (dist !== null && !(dist > 0)) return null;
  const stop = dist === null ? null : entry - dir * dist; const target = tp !== null && dist !== null ? entry + dir * tp * dist : null;
  for (let k = i; k < j; k++) { const b = bars[k]; const lo = dir > 0 ? b.l : b.l + b.sp, hi = dir > 0 ? b.h : b.h + b.sp; // venta: se recompra al precio de compra
    if (stop !== null && (dir > 0 ? lo <= stop : hi >= stop)) return { pts: -dist, dist, entry };
    if (target !== null && (dir > 0 ? b.h >= target : b.l + b.sp <= target)) return { pts: tp * dist, dist, entry }; }
  const exit = dir > 0 ? bars[j].o : bars[j].o + bars[j].sp; return { pts: dir * (exit - entry), dist, entry };
}
function resumen(lab, R, pair) {
  if (!R.length) return; const years = [...new Set(R.map((x) => x.y))]; const pip = PIP(pair); const pips = R.map((x) => x.pts / pip); const hasR = R[0].dist !== null; const rr = hasR ? R.map((x) => x.pts / x.dist) : null;
  let streak = 0, worst = 0; for (const x of R) { if (x.pts < 0) { streak++; worst = Math.max(worst, streak); } else streak = 0; }
  const py = years.map((y) => { const A = R.filter((x) => x.y === y); return hasR ? A.reduce((s, x) => s + x.pts / x.dist, 0) : A.reduce((s, x) => s + x.pts / pip, 0); });
  console.log(`  ${lab.padEnd(44)} n ${String(R.length).padStart(4)} · en positivo ${String(Math.round((100 * pips.filter((x) => x > 0).length) / pips.length)).padStart(2)} % · ${f(mean(pips), 1)} pips/op (t ${f(ts(pips), 1)})${hasR ? ` · stop ${mean(R.map((x) => x.dist / pip)).toFixed(0)} pips · ${f(mean(rr))}R/op` : ''} · años + ${py.filter((v) => v > 0).length}/${years.length} · por año (${hasR ? 'R' : 'pips'}): ${py.map((v) => f(v, hasR ? 1 : 0)).join(' ')} · peor racha ${worst}`);
}
const DATA = {}; const get = (p) => (DATA[p] ||= load(p));

console.log('1) LUNES · compra a las 09:00 de servidor (08:00 España), cierre a las 18:00 (17:00 España)');
for (const p of ['AUDJPY', 'GBPJPY', 'EURJPY', 'USDJPY']) {
  console.log(` ${p}`);
  const run = (lab, distFn, tp = null, tOut = T(18, 0), filt = () => true) => { const R = []; for (const d of get(p)) { if (dowOf(d.date) !== 1 || !filt(d)) continue; const r = trade(d.bars, 1, T(9, 0), tOut, (e, i) => distFn(e, d, i), tp); if (r) R.push({ y: d.date.slice(0, 4), ...r }); } resumen(lab, R, p); };
  run('sin stop', () => null);
  run('stop 0,25 %', (e) => e * 0.0025); run('stop 0,35 %', (e) => e * 0.0035); run('stop 0,50 %', (e) => e * 0.005);
  run('stop bajo el mínimo de Asia del lunes', (e, d) => { const a = d.bars.filter((b) => b.t >= T(2, 0) && b.t < T(9, 0)); return a.length ? e - (Math.min(...a.map((b) => b.l)) - 2 * PIP(p)) : null; });
  run('stop 0,35 % y objetivo 1:1,5', (e) => e * 0.0035, 1.5);
  run('stop 0,35 %, cierre a las 22:55', (e) => e * 0.0035, null, T(22, 55));
}
console.log('\n   Control: la misma compra el resto de días (stop 0,35 %)');
for (const p of ['AUDJPY', 'GBPJPY', 'EURJPY', 'USDJPY']) { const R = []; for (const d of get(p)) { if (dowOf(d.date) === 1) continue; const r = trade(d.bars, 1, T(9, 0), T(18, 0), (e) => e * 0.0035); if (r) R.push({ y: d.date.slice(0, 4), ...r }); } resumen(`${p} martes a viernes`, R, p); }

console.log('\n2) ROTURA DE ASIA EN LA PRIMERA HORA EUROPEA · entrada a las 10:00 de servidor (09:00 España) a favor, cierre a las 18:00');
for (const p of ['USDJPY', 'EURJPY', 'GBPJPY', 'EURUSD']) {
  console.log(` ${p}`);
  const sig = (d) => { const a = d.bars.filter((b) => b.t >= T(2, 0) && b.t < T(9, 0)), h = d.bars.filter((b) => b.t >= T(9, 0) && b.t < T(10, 0)); if (a.length < 60 || h.length < 10) return null; const aH = Math.max(...a.map((b) => b.h)), aL = Math.min(...a.map((b) => b.l)), hH = Math.max(...h.map((b) => b.h)), hL = Math.min(...h.map((b) => b.l)); const dir = hH > aH && !(hL < aL) ? 1 : hL < aL && !(hH > aH) ? -1 : 0; return dir ? { dir, aH, aL, hH, hL } : null; };
  const run = (lab, distFn, tp = null, filt = () => true) => { const R = []; for (const d of get(p)) { const s = sig(d); if (!s || !filt(d, s)) continue; const r = trade(d.bars, s.dir, T(10, 0), T(18, 0), (e) => distFn(e, s), tp); if (r) R.push({ y: d.date.slice(0, 4), ...r }); } resumen(lab, R, p); };
  run('sin stop', () => null);
  run('stop 0,25 %', (e) => e * 0.0025); run('stop 0,35 %', (e) => e * 0.0035);
  run('stop al otro lado de la primera hora', (e, s) => (s.dir > 0 ? e - (s.hL - 2 * PIP(p)) : s.hH + 2 * PIP(p) - e));
  run('stop en el medio del rango de Asia', (e, s) => (s.dir > 0 ? e - (s.aH + s.aL) / 2 : (s.aH + s.aL) / 2 - e));
  run('stop 0,25 % y objetivo 1:1,5', (e) => e * 0.0025, 1.5);
  run('solo roturas al alza, stop 0,25 %', (e) => e * 0.0025, null, (d, s) => s.dir > 0); run('solo roturas a la baja, stop 0,25 %', (e) => e * 0.0025, null, (d, s) => s.dir < 0);
  run('sin lunes, stop 0,25 %', (e) => e * 0.0025, null, (d) => dowOf(d.date) !== 1);
}
