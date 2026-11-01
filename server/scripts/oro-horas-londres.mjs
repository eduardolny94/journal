// Horas de Londres en las que más se mueve el oro, en hora local de Londres real (DST de Londres y de Nueva York por separado).
// Velas M15 (2022-08 → 2026-10) y M5 (2025-06 → 2026-10) de XAUUSD exportadas de MT5 (hora de servidor = Nueva York + 7).
// Por hora/media hora de Londres: rango medio y neto (% del ATR diario de 14 días) y % de días en que esa hora marca el alto o
// el bajo de la sesión 07:00–17:00 Londres. Corte por año. Uso: node server/scripts/oro-horas-londres.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const load = (f) => readFileSync(path.join(ROOT, 'data', 'mt5-largo', f), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => { const c = l.split('\t'); return { d: c[0].replace(/\./g, '-'), t: c[1], o: +c[2], h: +c[3], l: +c[4], c: +c[5] }; });
const fmtNy = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const fmtLon = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const parts = (f, dt) => Object.fromEntries(f.formatToParts(dt).map((p) => [p.type, p.value]));
// hora de servidor → instante UTC: la hora de NY es servidor − 7 h; se busca el instante UTC cuya hora de NY coincide (prueba los offsets −4/−5)
function toUtc(d, t) {
  const [H, M] = t.split(':').map(Number); const nyMs = Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10), H, M) - 7 * 3600_000;
  for (const off of [4, 5]) { const dt = new Date(nyMs + off * 3600_000); const p = parts(fmtNy, dt); if (Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute) === nyMs) return dt; }
  return new Date(nyMs + 4 * 3600_000);
}
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const hhmm = (k, bm) => `${String(Math.floor((k * bm) / 60)).padStart(2, '0')}:${String((k * bm) % 60).padStart(2, '0')}`;

function study(bars, bm) {
  const NB = 1440 / bm; const key = (min) => Math.floor(min / bm);
  const byDay = new Map(); // día de servidor → velas con minuto de Londres
  for (const b of bars) { const u = toUtc(b.d, b.t); const p = parts(fmtLon, u); (byDay.get(b.d) || byDay.set(b.d, []).get(b.d)).push({ ...b, lm: +p.hour * 60 + +p.minute, ld: `${p.year}-${p.month}-${p.day}` }); }
  const days = [...byDay.entries()].filter(([, v]) => v.length >= NB * 0.8).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const ranges = days.map(([, v]) => Math.max(...v.map((x) => x.h)) - Math.min(...v.map((x) => x.l)));
  const S = Array.from({ length: NB }, () => ({ range: [], net: [], hi: 0, lo: 0 })); const byYear = {}; let n = 0;
  for (let i = 14; i < days.length; i++) {
    const [date, v] = days[i]; const atr = avg(ranges.slice(i - 14, i)); if (!(atr > 0)) continue;
    // sesión de Londres del día de servidor: velas con fecha de Londres = fecha de servidor y 07:00 ≤ hora < 17:00
    const lon = v.filter((x) => x.ld === date && x.lm >= 7 * 60 && x.lm < 17 * 60); if (lon.length < (600 / bm) * 0.8) continue; n++;
    const Y = (byYear[date.slice(0, 4)] ||= { n: 0, range: Array.from({ length: NB }, () => []), hilo: Array(NB).fill(0) }); Y.n++;
    const bk = Array.from({ length: NB }, () => []); for (const x of lon) bk[key(x.lm)].push(x);
    for (let k = 0; k < NB; k++) { const xs = bk[k]; if (!xs.length) continue; const r = (Math.max(...xs.map((x) => x.h)) - Math.min(...xs.map((x) => x.l))) / atr; S[k].range.push(r); Y.range[k].push(r); S[k].net.push(Math.abs(xs.at(-1).c - xs[0].o) / atr); }
    let hi = -Infinity, lo = Infinity, kh = -1, kl = -1; for (const x of lon) { if (x.h > hi) { hi = x.h; kh = key(x.lm); } if (x.l < lo) { lo = x.l; kl = key(x.lm); } } S[kh].hi++; S[kl].lo++; Y.hilo[kh]++; Y.hilo[kl]++;
  }
  return { S, n, bm, byYear, from: days[14]?.[0], to: days.at(-1)?.[0] };
}
const m15 = study(load('XAUUSD_M15.csv'), 60);
console.log(`XAUUSD, sesión de Londres 07:00–17:00 hora local de Londres. M15 ${m15.from} → ${m15.to}, ${m15.n} días. Rango y neto en % del ATR diario.\n`);
console.log('Londres   rango   neto   marca alto/bajo de la sesión');
const rows = []; for (let k = 7; k < 17; k++) { const s = m15.S[k]; rows.push({ k, r: avg(s.range), n: avg(s.net), hl: (s.hi + s.lo) / (2 * m15.n) }); console.log(`${hhmm(k, 60)}     ${(100 * avg(s.range)).toFixed(1).padStart(5)} %  ${(100 * avg(s.net)).toFixed(1).padStart(5)} %   ${pct(s.hi + s.lo, 2 * m15.n).padStart(5)}`); }
console.log('\nRanking por rango: ' + [...rows].sort((a, b) => b.r - a.r).map((x) => `${hhmm(x.k, 60)} (${(100 * x.r).toFixed(0)} %)`).join(' > '));
console.log('\nPor año (rango medio por hora, % ATR):'); console.log('año    n   ' + Array.from({ length: 10 }, (_, i) => hhmm(i + 7, 60).padStart(7)).join(''));
for (const [y, Y] of Object.entries(m15.byYear)) console.log(`${y}  ${String(Y.n).padStart(3)} ` + Array.from({ length: 10 }, (_, i) => `${(100 * avg(Y.range[i + 7])).toFixed(0)} %`.padStart(7)).join(''));
const m5 = study(load('XAUUSD_M5.csv'), 30);
console.log(`\nPor media hora con M5 (${m5.from} → ${m5.to}, ${m5.n} días):`); console.log('Londres   rango   neto   marca alto/bajo');
for (let k = 14; k < 34; k++) { const s = m5.S[k]; console.log(`${hhmm(k, 30)}     ${(100 * avg(s.range)).toFixed(1).padStart(5)} %  ${(100 * avg(s.net)).toFixed(1).padStart(5)} %   ${pct(s.hi + s.lo, 2 * m5.n).padStart(5)}`); }
