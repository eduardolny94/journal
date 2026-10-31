// ¿El radar «ve venir» los rallys? Para cada tramo diario 8/18 (cada cruce diario) se mira el sesgo del radar del día
// anterior (point-in-time, radar_daily_bias) alineado con la dirección del tramo: a favor (≥ 2), en contra (≤ −2) o
// neutro. Se compara cuánto duró el tramo y cuánto recorrió, y cómo rindió la entrada H4 (2R) según el radar.
// Uso: node server/scripts/rallys-radar.mjs
process.env.SIN_SALIDA = '1';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const { analizar } = await import('./tendencia-8-18.mjs');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const med = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');

const bias = new Map(); let minDate = '9999';
{ const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true }); for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) { (bias.get(r.symbol) || bias.set(r.symbol, []).get(r.symbol)).push(r); if (r.date < minDate) minDate = r.date; } }
function biasBefore(sym, date) { const rows = bias.get(sym); if (!rows) return null; let lo = 0, hi = rows.length - 1, ans = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { ans = rows[m]; lo = m + 1; } else hi = m - 1; } return ans && (new Date(date) - new Date(ans.date)) / 86400000 <= 5 ? Number(ans.diff) : null; }
const clase = (diff, dir) => (diff === null ? null : Math.sign(diff) === dir && Math.abs(diff) >= 2 ? 'favor' : Math.sign(diff) === -dir && Math.abs(diff) >= 2 ? 'contra' : 'neutro');

const dirs = ['mt5-largo', 'mt5-fxcm', 'mt5'].map((d) => path.join(ROOT, 'data', d)).filter(existsSync);
const syms = [...new Set(dirs.flatMap((d) => readdirSync(d).map((f) => f.match(/^([A-Z0-9]+)_(PERIOD_H1|M30)\.csv$/)?.[1]).filter(Boolean)))].filter((s) => bias.has(s)).sort();
const tramos = { favor: [], contra: [], neutro: [] }, entradas = { favor: [], contra: [], neutro: [] }, entradasYen = { favor: [], contra: [], neutro: [] };
const porPar = {};
for (const sym of syms) {
  const R = analizar(sym); if (!R) continue; const d1 = R.d1;
  const tr = d1.slice(1).map((b, i) => Math.max(b.h - b.l, Math.abs(b.h - d1[i].c), Math.abs(b.l - d1[i].c))); const atr = (i) => avg(tr.slice(Math.max(0, i - 15), i - 1)) || 1;
  for (const t of R.tramos) { const a = d1[t.start]; if (a.date < minDate || t.end >= d1.length - 1) continue; const c = clase(biasBefore(sym, a.date), t.dir); if (!c) continue; tramos[c].push({ sym, len: t.len, move: (t.dir * (d1[t.end].c - a.c)) / atr(t.start) }); }
  for (const e of R.T) { if (e.date < minDate) continue; const c = clase(biasBefore(sym, e.date), e.dir); if (!c) continue; entradas[c].push(e.r2); if (/JPY$/.test(sym)) entradasYen[c].push(e.r2); (porPar[sym] ||= { favor: [], contra: [], neutro: [] })[c].push(e.r2); }
}
console.log(`Radar point-in-time desde ${minDate}. Tramos diarios 8/18 según el sesgo del radar el día del cruce:\n`);
console.log('radar     tramos   duración mediana   ≥ 20 d   ≥ 40 d   recorrido medio (ATR)');
for (const k of ['favor', 'neutro', 'contra']) { const X = tramos[k]; console.log(`${k.padEnd(9)} ${String(X.length).padStart(5)}      ${String(med(X.map((x) => x.len))).padStart(3)} d          ${pct(X.filter((x) => x.len >= 20).length, X.length).padStart(5)}    ${pct(X.filter((x) => x.len >= 40).length, X.length).padStart(5)}    ${avg(X.map((x) => x.move)).toFixed(1).padStart(5)}`); }
console.log('\nEntrada H4 al cruce a favor del diario, objetivo 2R, según el radar (todos los pares / yenes):');
for (const k of ['favor', 'neutro', 'contra']) { const X = entradas[k], Y = entradasYen[k]; console.log(`${k.padEnd(9)} todos n=${String(X.length).padStart(4)} acierto ${pct(X.filter((v) => v > 0).length, X.length).padStart(5)} R̄ ${(avg(X) >= 0 ? '+' : '') + avg(X).toFixed(2)}   | yenes n=${String(Y.length).padStart(3)} acierto ${pct(Y.filter((v) => v > 0).length, Y.length).padStart(5)} R̄ ${(avg(Y) >= 0 ? '+' : '') + avg(Y).toFixed(2)}`); }
console.log('\nPor par, radar a favor frente a en contra (2R):');
for (const [sym, v] of Object.entries(porPar).sort((a, b) => avg(b[1].favor) - avg(a[1].favor))) if (v.favor.length >= 8) console.log(`  ${sym.padEnd(8)} favor n=${String(v.favor.length).padStart(3)} ${pct(v.favor.filter((x) => x > 0).length, v.favor.length).padStart(5)} ${(avg(v.favor) >= 0 ? '+' : '') + avg(v.favor).toFixed(2)}   | contra n=${String(v.contra.length).padStart(3)} ${pct(v.contra.filter((x) => x > 0).length, v.contra.length).padStart(5)} ${(avg(v.contra) >= 0 ? '+' : '') + avg(v.contra).toFixed(2)}   | neutro n=${String(v.neutro.length).padStart(3)} ${(avg(v.neutro) >= 0 ? '+' : '') + avg(v.neutro).toFixed(2)}`);
