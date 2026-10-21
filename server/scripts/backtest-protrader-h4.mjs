// Entrada de Protrader 5 tal como la aclaran los mentores en la sesión 3 (03-06-2026), medida en H4 (21-10-2026):
//   · Dirección por macro (aquí: sesgo del radar ≥ 2, estado de tendencia por patrones, o sin filtro).
//   · Patrón que confirma: para comprar rojo-verde-verde; para vender verde-rojo-rojo (velas H4 cerradas).
//   · Punto de entrada: "por debajo buscamos lo contrario": la vela VERDE más cercana AL PRECIO (no en tiempo) seguida
//     de una o más rojas; la orden límite va en la mecha (mínimo) de esa verde. Para vender, el máximo de la ROJA más
//     cercana seguida de verdes. "No retrocedáis dos años": como mucho 40 velas H4.
//   · Stop fijo de 52,5 pips; en pares muy volátiles (ATR diario > 90 pips) ~el doble, 105. Oro e índices: no recomendado.
//   · Objetivo: "cazar un 1:1 o un 1:2". Se miden 1R, 1,5R y 2R. Una operación a la vez por par; la orden pendiente se
//     cancela a las 10 velas H4 (≈ 2 días) o si el precio se va 1 ATR a favor sin llenarla.
//   · Dentro de la semana solo se actualiza la entrada hacia el lado favorable; en semana nueva, el patrón más cercano
//     desde el precio actual (aquí: cada señal nueva sustituye a la orden pendiente).
// Uso: node server/scripts/backtest-protrader-h4.mjs [--dir data/mt5] [--desde 2024-01-01] [--pares AUDJPY,...]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5'));
const FROM = argOf('--desde', '2000-01-01');
const ONLY = argOf('--pares', null) ? argOf('--pares', '').split(',').map((x) => x.trim().toUpperCase()) : null;
const SPREAD = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5, GBPCAD: 2.5, EURNZD: 3, GBPNZD: 3.5 };
const SKIP = new Set(['XAUUSD', 'US500F', 'NAS100F', 'US30F']); // no recomendados por los mentores para esta estrategia
const pipOf = (s) => (s.endsWith('JPY') ? 0.01 : 0.0001);
const spreadOf = (s) => (SPREAD[s] ?? 2.5) * pipOf(s);
const MAX_H4 = 60, PENDING_H4 = 10, LOOKBACK = 40;

let biasBy = {};
try { const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true }); for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) (biasBy[r.symbol] ||= []).push(r); } catch { biasBy = {}; }
const biasAt = (sym, date) => { const rows = biasBy[sym]; if (!rows) return null; let lo = 0, hi = rows.length - 1, a = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { a = rows[m]; lo = m + 1; } else hi = m - 1; } return a ? a.diff : null; };

function load(sym) {
  const h1 = [];
  for (const line of readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) {
    const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue;
    h1.push({ date: d.replace(/\./g, '-'), hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  const h4 = [];
  h1.forEach((b, i) => { const key = `${b.date} ${Math.floor(b.hour / 4)}`; const last = h4[h4.length - 1]; if (last && last.key === key) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; last.end = i; } else h4.push({ key, date: b.date, o: b.o, h: b.h, l: b.l, c: b.c, start: i, end: i }); });
  let a = null; h4.forEach((x, i) => { const tr = i ? Math.max(x.h - x.l, Math.abs(x.h - h4[i - 1].c), Math.abs(x.l - h4[i - 1].c)) : x.h - x.l; a = a === null ? tr : (a * 13 + tr) / 14; x.atr = a; });
  // ATR diario mediano (para decidir 52,5 o 105 pips)
  const byDay = new Map(); for (const b of h1) { const d = byDay.get(b.date); if (!d) byDay.set(b.date, { h: b.h, l: b.l }); else { d.h = Math.max(d.h, b.h); d.l = Math.min(d.l, b.l); } }
  const ranges = [...byDay.values()].map((d) => d.h - d.l).sort((x, y) => x - y); const medDaily = ranges[Math.floor(ranges.length / 2)] || 0;
  return { h1, h4, medDaily };
}
function simR(h1, j0, jEnd, dir, entry, stop, target) {
  const risk = Math.abs(entry - stop);
  for (let j = j0; j <= jEnd; j++) { const b = h1[j]; if (dir > 0 ? b.l <= stop : b.h >= stop) return -1; if (dir > 0 ? b.h >= target : b.l <= target) return (dir > 0 ? target - entry : entry - target) / risk; }
  const b = h1[Math.min(jEnd, h1.length - 1)]; return Math.max(-1, (dir > 0 ? b.c - entry : entry - b.c) / risk);
}
const isGreen = (b) => b.c > b.o, isRed = (b) => b.c < b.o;
const symbols = readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => !SKIP.has(s) && (!ONLY || ONLY.includes(s)));
const trades = [];
for (const sym of symbols) {
  const { h1, h4, medDaily } = load(sym); const pip = pipOf(sym); const sp = spreadOf(sym);
  const stopPips = medDaily / pip > 90 ? 105 : 52.5;
  // patrones y estado de tendencia (igual que backtest-vrr)
  const pats = [];
  for (let i = 16; i < h4.length; i++) { const a = h4[i - 2], b = h4[i - 1], c = h4[i]; if (isGreen(a) && isRed(b) && isRed(c)) pats.push({ i, dir: -1, level: Math.max(a.h, b.h, c.h) }); else if (isRed(a) && isGreen(b) && isGreen(c)) pats.push({ i, dir: 1, level: Math.min(a.l, b.l, c.l) }); }
  const state = new Array(h4.length).fill(0); let cur = 0, curLevel = null, pi = 0;
  for (let i = 0; i < h4.length; i++) { if (cur !== 0 && curLevel !== null && (cur < 0 ? h4[i].h >= curLevel : h4[i].l <= curLevel)) { cur = 0; curLevel = null; } while (pi < pats.length && pats[pi].i === i) { cur = pats[pi].dir; curLevel = pats[pi].level; pi++; } state[i] = cur; }
  let busyUntil = -1; let pending = null; // orden pendiente: {dir, entry, stop, placedI, expiresEnd, src}
  const place = (p) => { pending = p; };
  for (let k = 0; k < pats.length; k++) {
    const p = pats[k]; const i = p.i; const bar = h4[i]; if (bar.date < FROM || i + 2 >= h4.length) continue; if (bar.end <= busyUntil) continue;
    const dir = p.dir; const atr = bar.atr; if (!atr) continue;
    // punto de entrada Protrader: la vela del color de la dirección más cercana AL PRECIO (dentro de 40 velas) seguida de una contraria
    let entry = null, entryBar = -1;
    for (let q = i - 3; q >= Math.max(1, i - LOOKBACK); q--) {
      const b = h4[q], nx = h4[q + 1];
      if (dir > 0 ? (isGreen(b) && isRed(nx) && b.l < bar.c) : (isRed(b) && isGreen(nx) && b.h > bar.c)) {
        const lvl = dir > 0 ? b.l : b.h;
        if (entry === null || (dir > 0 ? lvl > entry : lvl < entry)) { entry = lvl; entryBar = q; }
      }
    }
    if (entry === null) continue;
    const distPips = Math.abs(bar.c - entry) / pip; if (distPips > 400) continue; // demasiado lejos: no es "cercano"
    const trendPrev = state[i - 1] === dir; const diff = biasAt(sym, bar.date); const radarOk = diff !== null && Math.sign(diff) === dir && Math.abs(diff) >= 2; const radarContra = diff !== null && Math.sign(diff) === -dir && Math.abs(diff) >= 2;
    const src = { trend: trendPrev, radar: radarOk, radarContra };
    // ¿se llena? dentro de 10 velas H4, sin irse antes 1 ATR a favor
    const entryPx = dir > 0 ? entry + sp : entry; let fillJ = -1; const fillEnd = Math.min(h1.length - 1, h4[Math.min(h4.length - 1, i + PENDING_H4)].end);
    for (let j = bar.end + 1; j <= fillEnd; j++) { const b = h1[j]; if (dir > 0 ? b.h >= bar.c + atr : b.l <= bar.c - atr) break; if (dir > 0 ? b.l <= entryPx : b.h >= entryPx) { fillJ = j; break; } }
    const base = { sym, date: bar.date, dir, src, distPips, stopPips, filled: fillJ >= 0 };
    if (fillJ < 0) { trades.push({ ...base, r: {} }); continue; }
    const jEnd = Math.min(h1.length - 1, h4[Math.min(h4.length - 1, i + MAX_H4)].end);
    const r = {};
    for (const [sk, risk] of [['fijo', stopPips * pip], ['0,5 ATR H4', 0.5 * atr], ['1 ATR H4', atr]]) {
      const stop = dir > 0 ? entryPx - risk : entryPx + risk;
      r[sk] = { r1: simR(h1, fillJ, jEnd, dir, entryPx, stop, dir > 0 ? entryPx + risk : entryPx - risk), r15: simR(h1, fillJ, jEnd, dir, entryPx, stop, dir > 0 ? entryPx + 1.5 * risk : entryPx - 1.5 * risk), r2: simR(h1, fillJ, jEnd, dir, entryPx, stop, dir > 0 ? entryPx + 2 * risk : entryPx - 2 * risk) };
    }
    trades.push({ ...base, r }); busyUntil = jEnd; // una operación a la vez
  }
  void place;
}
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const pct = (a, n) => (n ? `${String(Math.round((100 * a) / n)).padStart(3)} %` : '  — ');
const st = (L, sk, k) => { const v = L.map((t) => t.r[sk] && t.r[sk][k]).filter((x) => x !== undefined && x !== null); if (!v.length) return '      —      '; return `${pct(v.filter((x) => x > 0).length, v.length)} ${mean(v) >= 0 ? '+' : ''}${mean(v).toFixed(2)}R`; };
const streak = (L, sk) => { let m = 0, c = 0; for (const t of [...L].sort((a, b) => (a.date < b.date ? -1 : 1))) { const v = t.r[sk] && t.r[sk].r2; if (v === undefined) continue; if (v < 0) { c++; m = Math.max(m, c); } else c = 0; } return m; };
const filled = trades.filter((t) => t.filled);
console.log(`\nEntrada Protrader en H4 · ${symbols.length} activos · ${path.basename(DATA)} · desde ${FROM} · radar: ${Object.keys(biasBy).length ? 'sí' : 'no'}`);
console.log(`  señales ${trades.length} · se llenan ${pct(filled.length, trades.length)} · distancia mediana entrada↔cierre del patrón ${Math.round([...trades].map((t) => t.distPips).sort((a, b) => a - b)[Math.floor(trades.length / 2)] || 0)} pips`);
const row = (name, L, sk) => { const v = L.filter((t) => t.r[sk]); if (v.length < 20) return; console.log(`  ${name.padEnd(40)} n=${String(v.length).padStart(5)} · 1R ${st(v, sk, 'r1')} · 1,5R ${st(v, sk, 'r15')} · 2R ${st(v, sk, 'r2')} · racha máx. (2R) ${streak(v, sk)}`); };
for (const sk of ['fijo', '0,5 ATR H4', '1 ATR H4']) {
  console.log(`\n== stop ${sk}${sk === 'fijo' ? ' (52,5 pips; 105 en pares con ATR diario > 90)' : ''} ==`);
  row('sin filtro de dirección', filled, sk); row('tendencia por patrones vigente', filled.filter((t) => t.src.trend), sk); row('radar a favor (≥ 2)', filled.filter((t) => t.src.radar), sk); row('radar + tendencia', filled.filter((t) => t.src.radar && t.src.trend), sk); row('radar en contra', filled.filter((t) => t.src.radarContra), sk);
}
console.log('\n== por año · stop 0,5 ATR H4 · objetivo 1R (y 1,5R) · sin filtro / tendencia / radar ==');
for (const y of [...new Set(filled.map((t) => t.date.slice(0, 4)))].sort()) { const L = filled.filter((t) => t.date.startsWith(y)); const T = L.filter((t) => t.src.trend); const R = L.filter((t) => t.src.radar); console.log(`  ${y}: sin filtro 1R ${st(L, '0,5 ATR H4', 'r1')} · 1,5R ${st(L, '0,5 ATR H4', 'r15')} (n=${L.length}) · tendencia 1R ${T.length >= 20 ? st(T, '0,5 ATR H4', 'r1') : '—'} (n=${T.length}) · radar 1R ${R.length >= 20 ? st(R, '0,5 ATR H4', 'r1') : '—'} (n=${R.length})`); }
console.log('\n== por par · stop fijo · 2R · radar a favor (n ≥ 25) ==');
for (const s of symbols) { const L = filled.filter((t) => t.sym === s && t.src.radar); if (L.length >= 25) console.log(`  ${s.padEnd(8)} n=${String(L.length).padStart(4)} · ${st(L, 'fijo', 'r2')} · stop ${L[0].stopPips} pips`); }
