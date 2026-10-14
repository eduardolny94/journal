// ¿Marcan dirección los bonos? (14-10-2026) Bono a 10 y 2 años de EE. UU. (FRED DGS10/DGS2, cierre 15:30 NY) frente a
// la cesta dólar (media del movimiento a favor del dólar en 7 pares, velas H1 de MT5, día de servidor = 17:00 NY → 17:00 NY).
//   mismo día   : ¿sube el dólar el día que sube el bono? (acompaña)
//   día siguiente / 5 días : ¿anticipa? (predice)
//   volatilidad : ¿un día de bono movido anticipa un día de divisas movido?
// p-valor por desplazamiento circular de la serie del bono (1000 permutaciones).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
const PAIRS = [['EURUSD', -1], ['GBPUSD', -1], ['AUDUSD', -1], ['NZDUSD', -1], ['USDCAD', 1], ['USDJPY', 1], ['USDCHF', 1]];
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
let seed = 9; const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const corr = (x, y) => { const mx = mean(x), my = mean(y); let sxy = 0, sxx = 0, syy = 0; for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; } return sxy / Math.sqrt(sxx * syy); };

// Cesta dólar por día de servidor: rendimiento (ATR) y rango (ATR)
const basket = new Map(); const range = new Map();
for (const [s, usd] of PAIRS) {
  const m = new Map();
  for (const line of readFileSync(path.join(ROOT, 'data', 'mt5', `${s}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue; const date = d.replace(/\./g, '-'); (m.get(date) || m.set(date, []).get(date)).push({ o: +o, h: +h, l: +l, c: +c }); }
  const days = [...m.entries()].filter(([d, b]) => b.length >= 12 && new Date(`${d}T12:00:00Z`).getUTCDay() % 6).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let atr = null, pc = null;
  for (const [d, b] of days) { const H = Math.max(...b.map((x) => x.h)), L = Math.min(...b.map((x) => x.l)), C = b[b.length - 1].c; const tr = pc === null ? H - L : Math.max(H - L, Math.abs(H - pc), Math.abs(L - pc)); if (atr && pc) { (basket.get(d) || basket.set(d, []).get(d)).push((usd * (C - pc)) / atr); (range.get(d) || range.set(d, []).get(d)).push((H - L) / atr); } atr = atr === null ? tr : (atr * 13 + tr) / 14; pc = C; }
}
const D = [...basket.keys()].filter((d) => basket.get(d).length >= 5).sort();
const ret = D.map((d) => mean(basket.get(d))); const rng = D.map((d) => mean(range.get(d)));
const yl = (id) => { const m = new Map(); for (const r of db.prepare('SELECT date, value FROM radar_series WHERE series_id = ? ORDER BY date').all(id)) if (r.value !== null) m.set(r.date, r.value); return m; };
const Y10 = yl('DGS10'), Y2 = yl('DGS2');
const lastAt = (m, d) => { let v = null; for (let b = 0; b <= 4; b++) { const k = new Date(new Date(`${d}T12:00:00Z`).getTime() - b * 86400000).toISOString().slice(0, 10); if (m.has(k)) { v = m.get(k); break; } } return v; };
const prevOf = (m, d) => { let k = new Date(new Date(`${d}T12:00:00Z`).getTime() - 86400000); for (let b = 0; b < 6; b++) { const s = k.toISOString().slice(0, 10); if (m.has(s)) return m.get(s); k = new Date(k.getTime() - 86400000); } return null; };
// Cambios diarios del bono en la fecha de servidor d (cierre 15:30 NY de d, dentro del día de servidor d)
const d10 = D.map((d) => { const v = Y10.get(d), p = prevOf(Y10, d); return v !== undefined && p !== null ? (v - p) * 100 : null; }); // pb
const d2 = D.map((d) => { const v = Y2.get(d), p = prevOf(Y2, d); return v !== undefined && p !== null ? (v - p) * 100 : null; });
const curve = D.map((d) => { const a = Y10.get(d), b = Y2.get(d), pa = prevOf(Y10, d), pb = prevOf(Y2, d); return a !== undefined && b !== undefined && pa !== null && pb !== null ? ((a - b) - (pa - pb)) * 100 : null; });
const lvl10 = D.map((d, i) => { const v = Y10.get(d); const k = i >= 20 ? Y10.get(D[i - 20]) : undefined; return v !== undefined && k !== undefined ? (v - k) * 100 : null; });
const N = D.length;
const fwd = (h) => ret.map((_, i) => (i + h < N ? ret.slice(i + 1, i + 1 + h).reduce((s, v) => s + v, 0) : null));
const F1 = fwd(1), F5 = fwd(5);
const same = ret;
function test(name, x, y, perm = 1000) {
  const idx = []; for (let i = 0; i < N; i++) if (x[i] !== null && y[i] !== null && x[i] !== 0) idx.push(i);
  const hit = (sh) => { let w = 0, n = 0; for (const i of idx) { const j = (i + sh) % N; if (x[j] === null || x[j] === 0 || y[i] === null) continue; n++; if (Math.sign(x[j]) === Math.sign(y[i])) w++; } return n ? w / n : NaN; };
  const h0 = hit(0); const dist = []; for (let k = 0; k < perm; k++) dist.push(hit(20 + Math.floor(rnd() * (N - 40))));
  const p = (dist.filter((v) => v >= h0).length + 1) / (perm + 1);
  const xs = idx.map((i) => x[i]), ys = idx.map((i) => y[i]);
  console.log(`  ${name.padEnd(58)} mismo signo ${(100 * h0).toFixed(1)} % (n=${idx.length}) · correlación ${corr(xs, ys).toFixed(3)} · p ${p.toFixed(3)}`);
}
console.log(`\nCesta dólar ${D[0]} → ${D[N - 1]} · ${N} días · bonos FRED (DGS10 hasta ${[...Y10.keys()].pop()})\n`);
console.log('A) ¿Acompaña? (mismo día)');
test('Δ bono 10 años → dólar el mismo día', d10, same);
test('Δ bono 2 años → dólar el mismo día', d2, same);
test('Δ pendiente (10−2) → dólar el mismo día', curve, same);
console.log('\nB) ¿Anticipa? (dirección del dólar después)');
test('Δ 10 años hoy → dólar mañana', d10, F1);
test('Δ 10 años hoy → dólar 5 días', d10, F5);
test('Δ 2 años hoy → dólar mañana', d2, F1);
test('Δ 2 años hoy → dólar 5 días', d2, F5);
test('10 años: cambio en 20 días → dólar 5 días', lvl10, F5);
test('Δ pendiente hoy → dólar 5 días', curve, F5);
test('Δ 10 años grande (|Δ| ≥ 8 pb) → dólar mañana', d10.map((v) => (v !== null && Math.abs(v) >= 8 ? v : 0)), F1);
test('Δ 2 años grande (|Δ| ≥ 8 pb) → dólar mañana', d2.map((v) => (v !== null && Math.abs(v) >= 8 ? v : 0)), F1);
console.log('\nC) ¿Anticipa la volatilidad? (rango de las divisas al día siguiente, en ATR)');
const a10 = d10.map((v) => (v === null ? null : Math.abs(v)));
const nextR = rng.map((_, i) => (i + 1 < N ? rng[i + 1] : null));
const idx = []; for (let i = 0; i < N; i++) if (a10[i] !== null && nextR[i] !== null) idx.push(i);
const sorted = [...idx].sort((p, q) => a10[p] - a10[q]); const lo = sorted.slice(0, Math.floor(sorted.length / 3)), hi = sorted.slice(-Math.floor(sorted.length / 3));
console.log(`  |Δ 10 años| tercio bajo (≤ ${a10[lo[lo.length - 1]].toFixed(0)} pb): rango mañana ${mean(lo.map((i) => nextR[i])).toFixed(2)} ATR · tercio alto (≥ ${a10[hi[0]].toFixed(0)} pb): ${mean(hi.map((i) => nextR[i])).toFixed(2)} ATR · correlación |Δ10| con rango de mañana ${corr(idx.map((i) => a10[i]), idx.map((i) => nextR[i])).toFixed(3)} · con rango de hoy ${corr(idx.map((i) => a10[i]), idx.map((i) => rng[i])).toFixed(3)}`);
const prevR = rng.map((_, i) => (i > 0 ? rng[i - 1] : null)); const j = idx.filter((i) => prevR[i] !== null);
console.log(`  comparación: el rango de ayer de las propias divisas con el de mañana: correlación ${corr(j.map((i) => rng[i]), j.map((i) => nextR[i])).toFixed(3)}`);
