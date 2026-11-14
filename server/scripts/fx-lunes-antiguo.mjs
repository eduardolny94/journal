// El lunes del yen en años anteriores (M15 del bróker desde 2008): compra a las 09:00 de servidor, cierre a las 18:00.
// Sirve de muestra independiente de la de 2020–2026 con la que se encontró el patrón. Se entra al precio de compra.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN); const sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((x) => (x - m) ** 2))); }; const ts = (a) => (a.length > 10 ? mean(a) / (sd(a) / Math.sqrt(a.length)) : NaN);
const f = (v, d = 1) => (Number.isNaN(v) ? ' — ' : (v >= 0 ? '+' : '') + v.toFixed(d)); const T = (h, m) => h * 60 + m; const dowOf = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
for (const p of ['AUDJPY', 'GBPJPY', 'EURJPY', 'USDJPY']) {
  const fl = path.join(ROOT, 'data/mt5-largo/fx-antiguo', `${p}_M15.csv`); if (!existsSync(fl)) continue; const m = new Map();
  for (const line of readFileSync(fl, 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const x = line.split('\t'); if (x.length < 9) continue; const date = x[0].replace(/\./g, '-'); (m.get(date) || m.set(date, []).get(date)).push({ t: +x[1].slice(0, 2) * 60 + +x[1].slice(3, 5), o: +x[2], h: +x[3], l: +x[4], sp: +x[8] * 0.001 }); }
  const days = [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars })).filter((d) => d.bars.length > 70);
  const run = (dayFn, stopPct) => { const R = []; for (const d of days) { if (!dayFn(dowOf(d.date))) continue; const i = d.bars.findIndex((b) => b.t >= T(9, 0)), j = d.bars.findIndex((b) => b.t >= T(18, 0)); if (i < 0 || j <= i) continue; const entry = d.bars[i].o + d.bars[i].sp; const stop = stopPct ? entry * (1 - stopPct) : null; let exit = d.bars[j].o; if (stop) for (let k = i; k < j; k++) if (d.bars[k].l <= stop) { exit = stop; break; } R.push({ y: d.date.slice(0, 4), bp: (1e4 * (exit - entry)) / entry }); } return R; };
  const show = (lab, R, stopPct) => { const per = (A) => `${f(mean(A.map((x) => x.bp)))} pb (${Math.round((100 * A.filter((x) => x.bp > 0).length) / A.length)} %, t ${f(ts(A.map((x) => x.bp)))}, n ${A.length})`; const old = R.filter((x) => x.y < '2020'), neu = R.filter((x) => x.y >= '2020'); const ys = [...new Set(old.map((x) => x.y))]; console.log(`  ${lab.padEnd(34)} 2008–2019: ${per(old)}${stopPct ? ` = ${f(mean(old.map((x) => x.bp)) / (stopPct * 1e4), 2)}R/op` : ''} · años positivos ${ys.filter((y) => mean(old.filter((x) => x.y === y).map((x) => x.bp)) > 0).length}/${ys.length} · 2020–2026: ${per(neu)}\n${' '.repeat(38)}por años 2008 → 2019: ${ys.map((y) => f(mean(old.filter((x) => x.y === y).map((x) => x.bp)))).join(' ')}`); };
  console.log(`${p} · ${days[0].date} → ${days.at(-1).date}`);
  show('LUNES sin stop', run((k) => k === 1, null), null); show('LUNES con stop 0,35 %', run((k) => k === 1, 0.0035), 0.0035); show('martes a viernes, sin stop', run((k) => k >= 2 && k <= 5, null), null);
}

// Segundo patrón en la muestra antigua: la primera hora europea (09:00–10:00) rompe solo un lado de Asia → 10:00–18:00 sigue.
console.log('\nROTURA DE ASIA EN LA PRIMERA HORA → resto de la sesión (10:00 → 18:00), pb a favor, precio de venta (sin coste)');
for (const p of ['USDJPY', 'EURJPY', 'GBPJPY', 'AUDJPY']) {
  const fl = path.join(ROOT, 'data/mt5-largo/fx-antiguo', `${p}_M15.csv`); if (!existsSync(fl)) continue; const m = new Map();
  for (const line of readFileSync(fl, 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const x = line.split('\t'); if (x.length < 9) continue; const date = x[0].replace(/\./g, '-'); (m.get(date) || m.set(date, []).get(date)).push({ t: +x[1].slice(0, 2) * 60 + +x[1].slice(3, 5), o: +x[2], h: +x[3], l: +x[4] }); }
  const R = [];
  for (const [date, bars] of [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) { const a = bars.filter((b) => b.t >= T(2, 0) && b.t < T(9, 0)), h = bars.filter((b) => b.t >= T(9, 0) && b.t < T(10, 0)); const i = bars.find((b) => b.t >= T(10, 0)), j = bars.find((b) => b.t >= T(18, 0)); if (a.length < 20 || h.length < 4 || !i || !j) continue; const aH = Math.max(...a.map((b) => b.h)), aL = Math.min(...a.map((b) => b.l)), hH = Math.max(...h.map((b) => b.h)), hL = Math.min(...h.map((b) => b.l)); const dir = hH > aH && !(hL < aL) ? 1 : hL < aL && !(hH > aH) ? -1 : 0; if (dir) R.push({ y: date.slice(0, 4), bp: (dir * 1e4 * (j.o - i.o)) / i.o }); }
  const per = (A) => `${f(mean(A.map((x) => x.bp)))} pb (${Math.round((100 * A.filter((x) => x.bp > 0).length) / A.length)} %, t ${f(ts(A.map((x) => x.bp)))}, n ${A.length})`; const old = R.filter((x) => x.y < '2020'), neu = R.filter((x) => x.y >= '2020'); const ys = [...new Set(old.map((x) => x.y))];
  console.log(`  ${p}: 2008–2019 ${per(old)} · años positivos ${ys.filter((y) => mean(old.filter((x) => x.y === y).map((x) => x.bp)) > 0).length}/${ys.length} · por años ${ys.map((y) => f(mean(old.filter((x) => x.y === y).map((x) => x.bp)))).join(' ')} | 2020–2026 ${per(neu)}`);
}
