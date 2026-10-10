// Persistencia de tendencia en H4 por activo: tramos con la EMA 8 a un lado de la media 18 (velas H4 agregadas desde
// H1 de data/mt5), medidos en días de mercado (fechas distintas dentro del tramo). También el ratio de eficiencia a
// 60 días en diario y la parte del tiempo que el activo pasa en tramos de ≥ 4 días. Uso: node server/scripts/persistencia-h4.mjs
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(__dirname, '..', '..', 'data', 'mt5');
const db = new DatabaseSync(path.resolve(__dirname, '..', 'data', 'journal.db'), { readOnly: true });
const bias = {};
for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) (bias[r.symbol] ||= []).push(r);
const biasAt = (sym, date) => { const rows = bias[sym]; if (!rows) return null; let lo = 0, hi = rows.length - 1, a = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date <= date) { a = rows[m]; lo = m + 1; } else hi = m - 1; } return a && (new Date(date) - new Date(a.date)) / 86400000 <= 5 ? a.diff : null; };
const ema = (v, n) => { const k = 2 / (n + 1); const o = []; let e = null; v.forEach((x, i) => { e = e === null ? x : x * k + e * (1 - k); o[i] = i >= n - 1 ? e : null; }); return o; };
const sma = (v, n) => { const o = []; let s = 0; v.forEach((x, i) => { s += x; if (i >= n) s -= v[i - n]; o[i] = i >= n - 1 ? s / n : null; }); return o; };
const med = (a) => { if (!a.length) return null; const x = [...a].sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
const mean = (a) => (a.length ? a.reduce((p, q) => p + q, 0) / a.length : null);
const rows = [];
for (const f of readdirSync(DATA).filter((x) => x.endsWith('_PERIOD_H1.csv')).sort()) {
  const sym = f.replace('_PERIOD_H1.csv', '');
  const h1 = readFileSync(path.join(DATA, f), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => { const [t, o, h, lo, c] = l.split(','); const [d, hm] = t.split(' '); return { date: d.replace(/\./g, '-'), slot: Math.floor(Number(hm.slice(0, 2)) / 4), c: +c }; });
  const h4 = []; let cur = null;
  for (const b of h1) { const key = `${b.date}|${b.slot}`; if (!cur || cur.key !== key) { if (cur) h4.push(cur); cur = { key, date: b.date, c: b.c }; } else { cur.c = b.c; cur.date = b.date; } }
  if (cur) h4.push(cur);
  const closes = h4.map((b) => b.c); const e8 = ema(closes, 8); const s18 = sma(closes, 18);
  const segs = []; let dir = 0; let start = null;
  for (let i = 18; i < h4.length; i++) { const d = e8[i] > s18[i] ? 1 : e8[i] < s18[i] ? -1 : 0; if (d !== dir) { if (dir !== 0 && start !== null) segs.push({ dir, from: start, to: i - 1 }); dir = d; start = i; } }
  const info = segs.map((g) => { const dates = new Set(); for (let k = g.from; k <= g.to; k++) dates.add(h4[k].date); const diff = biasAt(sym, h4[g.from].date); return { days: dates.size, radar: diff !== null && Math.sign(diff) === g.dir && Math.abs(diff) >= 3 }; });
  const all = info.map((x) => x.days); const r = info.filter((x) => x.radar).map((x) => x.days);
  const timeIn4 = all.reduce((a, d) => a + (d >= 4 ? d : 0), 0) / all.reduce((a, d) => a + d, 0);
  // Eficiencia a 60 días en diario (cierres por fecha)
  const d1 = []; for (const b of h4) { const last = d1[d1.length - 1]; if (!last || last.date !== b.date) d1.push({ date: b.date, c: b.c }); else last.c = b.c; }
  const effs = []; for (let i = 60; i < d1.length; i++) { let noise = 0; for (let k = i - 59; k <= i; k++) noise += Math.abs(d1[k].c - d1[k - 1].c); effs.push(noise ? Math.abs(d1[i].c - d1[i - 60].c) / noise : 0); }
  rows.push({ sym, n: all.length, med: med(all), mean: mean(all), p4: Math.round((100 * all.filter((d) => d >= 4).length) / all.length), p7: Math.round((100 * all.filter((d) => d >= 7).length) / all.length), t4: Math.round(100 * timeIn4), eff: Math.round(1000 * mean(effs)) / 10, rn: r.length, rmed: med(r), rp7: r.length ? Math.round((100 * r.filter((d) => d >= 7).length) / r.length) : null });
}
rows.sort((a, b) => b.t4 - a.t4);
console.log('activo    tramos  mediana  media   ≥4 d   ≥7 d   tiempo en tramos ≥4 d   eficiencia 60 d  | con radar a favor: n  mediana  ≥7 d');
for (const x of rows) console.log(`${x.sym.padEnd(8)} ${String(x.n).padStart(6)}  ${x.med.toFixed(1).padStart(5)} d ${x.mean.toFixed(1).padStart(5)} d  ${String(x.p4).padStart(3)} %  ${String(x.p7).padStart(3)} %        ${String(x.t4).padStart(3)} %               ${String(x.eff).padStart(5)} %   | ${String(x.rn).padStart(4)}  ${x.rmed === null ? '   —' : x.rmed.toFixed(1).padStart(4)} d  ${x.rp7 === null ? '  —' : String(x.rp7).padStart(3)} %`);
