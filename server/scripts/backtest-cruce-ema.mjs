// Backtest de "cada vez que el precio cruza la EMA" en H4, como lo opera el usuario en su gráfico (18-10-2026):
// sus 18 posiciones dibujadas en AUDJPY H4 entran casi siempre en la primera vela H4 que CIERRA al otro lado de la EMA 8
// (azul) tras un retroceso, con stop fijo de ~80 pips (2–3 ATR de H4) y objetivo 2R (cortos con 3–6R).
// Señales medidas: precio_ema8 (cierre cruza la EMA 8) · precio_sma18 (cierre cruza la media 18) · cruce_8_18 (la EMA 8
// cruza la media 18). Stops: atr (×2,5 ATR14 H4, ≈ sus 80 pips en AUDJPY) · estructura (mín/máx de 10 velas H4) · fijo
// (--stop-pips N). Objetivos 1,5R / 2R / 3R, y 2R con stop a la entrada al tocar 1,1R. Filtros: ninguna, EMA 8>18 a favor,
// precio vs EMA 200 a favor, ambos, sesgo del radar a favor (fuerza ≥ 2, día anterior). Una operación a la vez por par.
// Uso: node server/scripts/backtest-cruce-ema.mjs [--dir data/mt5] [--desde 2024-01-01] [--pares AUDJPY,...] [--stop-pips 80]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5'));
const FROM = argOf('--desde', '2000-01-01');
const ONLY = argOf('--pares', null) ? argOf('--pares', '').split(',').map((x) => x.trim().toUpperCase()) : null;
const STOP_PIPS = argOf('--stop-pips', null) ? Number(argOf('--stop-pips')) : null;
const ATR_MULT = Number(argOf('--atr', 2.5));
const SPREAD = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5, GBPCAD: 2.5, EURNZD: 3, GBPNZD: 3.5 };
const SPREAD_PX = { XAUUSD: 0.3, US500F: 0.5, NAS100F: 1.5, US30F: 3 };
const pipOf = (s) => (s === 'XAUUSD' ? 0.1 : SPREAD_PX[s] !== undefined ? 1 : s.endsWith('JPY') ? 0.01 : 0.0001);
const spreadOf = (s) => (SPREAD_PX[s] ?? (SPREAD[s] ?? 2.5) * pipOf(s));
const MAX_H4 = 200;

let biasBy = {};
try {
  const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
  for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) (biasBy[r.symbol] ||= []).push(r);
} catch { biasBy = {}; }
function biasAt(sym, date) {
  const rows = biasBy[sym]; if (!rows) return null;
  let lo = 0, hi = rows.length - 1, ans = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { ans = rows[m]; lo = m + 1; } else hi = m - 1; }
  return ans && ans.date >= addDays(date, -4) ? ans.diff : null;
}
function addDays(ymd, n) { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

function load(sym) {
  const h1 = [];
  for (const line of readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) {
    const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue;
    h1.push({ date: d.replace(/\./g, '-'), hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  const h4 = [];
  h1.forEach((b, i) => { const key = `${b.date} ${Math.floor(b.hour / 4)}`; const last = h4[h4.length - 1]; if (last && last.key === key) { last.h = Math.max(last.h, b.h); last.l = Math.min(last.l, b.l); last.c = b.c; last.end = i; } else h4.push({ key, date: b.date, o: b.o, h: b.h, l: b.l, c: b.c, start: i, end: i }); });
  const ema = (n) => { const k = 2 / (n + 1); let e = null; return h4.map((x) => (e = e === null ? x.c : x.c * k + e * (1 - k))); };
  const e8 = ema(8), e200 = ema(200);
  let s = 0; const s18 = h4.map((x, i) => { s += x.c; if (i >= 18) s -= h4[i - 18].c; return i >= 17 ? s / 18 : null; });
  let a = null; const atr = h4.map((x, i) => { const tr = i ? Math.max(x.h - x.l, Math.abs(x.h - h4[i - 1].c), Math.abs(x.l - h4[i - 1].c)) : x.h - x.l; a = a === null ? tr : (a * 13 + tr) / 14; return a; });
  return { h1, h4, e8, s18, e200, atr };
}
/** Simula sobre H1 desde la vela H4 i+1: stop antes que objetivo en la misma hora; escalones [[R alcanzado, nuevo stop en R]]. */
function sim(h1, h4, i, dir, entry, risk, stop0, target, steps = []) {
  sim.lastHit = -1;
  let stop = stop0; const done = steps.map(() => false);
  const lastIdx = Math.min(h1.length - 1, h4[Math.min(h4.length - 1, i + MAX_H4)].end);
  for (let j = h4[i].end + 1; j <= lastIdx; j++) {
    const b = h1[j];
    if (dir > 0 ? b.l <= stop : b.h >= stop) return (dir > 0 ? stop - entry : entry - stop) / risk;
    const fav = (dir > 0 ? b.h - entry : entry - b.h) / risk;
    const favH = (dir > 0 ? b.h - entry : entry - b.l) / risk;
    if (favH >= target) { sim.lastHit = j; return target; }
    steps.forEach(([r, newR], k) => { if (!done[k] && favH >= r) { done[k] = true; stop = dir > 0 ? entry + newR * risk : entry - newR * risk; } });
    void fav;
  }
  const b = h1[lastIdx]; return Math.max(-1, (dir > 0 ? b.c - entry : entry - b.c) / risk);
}
/** Runner del 10 % tras tocar 2R: (a) stop en la entrada y salida al cierre H4 contra la media 18; (b) stop en +1R sin más salida. Devuelve R del runner desde la entrada. */
function runner(D, hit, dir, entry, risk, mode) {
  const h1 = D.h1, h4 = D.h4; let k = h4.findIndex((x) => x.end >= hit); const stop = mode === "stop1r" ? (dir > 0 ? entry + risk : entry - risk) : entry;
  const lastIdx = Math.min(h1.length - 1, h4[Math.min(h4.length - 1, k + MAX_H4)].end);
  for (let j = hit + 1; j <= lastIdx; j++) {
    const b = h1[j];
    if (dir > 0 ? b.l <= stop : b.h >= stop) return (dir > 0 ? stop - entry : entry - stop) / risk;
    if (j === h4[k].end) { const kk = k; k++; if (mode === "sma18" && (dir > 0 ? h4[kk].c < D.s18[kk] : h4[kk].c > D.s18[kk])) return (dir > 0 ? h4[kk].c - entry : entry - h4[kk].c) / risk; }
  }
  const b = h1[lastIdx]; return (dir > 0 ? b.c - entry : entry - b.c) / risk;
}
const SIGNALS = ['precio_ema8', 'precio_sma18', 'cruce_8_18'];
const STOPS = STOP_PIPS ? ['atr', 'estructura', 'fijo'] : ['atr', 'estructura'];
const trades = [];
const symbols = readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => !ONLY || ONLY.includes(s));
for (const sym of symbols) {
  const D = load(sym); const sp = spreadOf(sym); const pip = pipOf(sym);
  for (const sig of SIGNALS) {
    let busyUntil = -1;
    for (let i = 201; i < D.h4.length - 1; i++) {
      if (D.h4[i].date < FROM) continue; if (D.h4[i].end <= busyUntil) continue;
      const c = D.h4[i].c, cp = D.h4[i - 1].c; let dir = 0;
      if (sig === 'precio_ema8') dir = c > D.e8[i] && cp <= D.e8[i - 1] ? 1 : c < D.e8[i] && cp >= D.e8[i - 1] ? -1 : 0;
      else if (sig === 'precio_sma18') dir = c > D.s18[i] && cp <= D.s18[i - 1] ? 1 : c < D.s18[i] && cp >= D.s18[i - 1] ? -1 : 0;
      else dir = D.e8[i] > D.s18[i] && D.e8[i - 1] <= D.s18[i - 1] ? 1 : D.e8[i] < D.s18[i] && D.e8[i - 1] >= D.s18[i - 1] ? -1 : 0;
      if (!dir) continue;
      const entry = dir > 0 ? c + sp : c; const a = D.atr[i];
      const win = D.h4.slice(Math.max(0, i - 9), i + 1);
      const stops = { atr: ATR_MULT * a, estructura: Math.max(0.3 * a, dir > 0 ? entry - (Math.min(...win.map((x) => x.l)) - sp) : (Math.max(...win.map((x) => x.h)) + sp) - entry) };
      if (STOP_PIPS) stops.fijo = STOP_PIPS * pip;
      const diff = biasAt(sym, D.h4[i].date);
      const f = { ema: Math.sign(D.e8[i] - D.s18[i]) === dir, e200: Math.sign(c - D.e200[i]) === dir, radar: diff !== null && Math.sign(diff) === dir && Math.abs(diff) >= 2, radarContra: diff !== null && Math.sign(diff) === -dir && Math.abs(diff) >= 2 };
      const t = { sym, sig, date: D.h4[i].date, dir, f, r: {} };
      for (const sk of STOPS) {
        const risk = stops[sk]; const stop = dir > 0 ? entry - risk : entry + risk;
        const r2 = sim(D.h1, D.h4, i, dir, entry, risk, stop, 2); const hit2 = sim.lastHit;
        const p90a = hit2 >= 0 ? 0.9 * 2 + 0.1 * runner(D, hit2, dir, entry, risk, "sma18") : r2; const p90b = hit2 >= 0 ? 0.9 * 2 + 0.1 * runner(D, hit2, dir, entry, risk, "stop1r") : r2;
        t.r[sk] = { r15: sim(D.h1, D.h4, i, dir, entry, risk, stop, 1.5), r2, p90a, p90b, r3: sim(D.h1, D.h4, i, dir, entry, risk, stop, 3), be: sim(D.h1, D.h4, i, dir, entry, risk, stop, 2, [[1.1, 0]]), riskPips: risk / pip };
      }
      trades.push(t); busyUntil = D.h4[Math.min(D.h4.length - 1, i + 1)].end; // la siguiente señal solo tras la vela siguiente (sin solapar la misma vela)
    }
  }
}
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const st = (L, sk, k) => { const v = L.map((t) => t.r[sk][k]); if (!v.length) return '      —      '; return `${String(Math.round((100 * v.filter((x) => x > 0).length) / v.length)).padStart(3)} % ${mean(v) >= 0 ? '+' : ''}${mean(v).toFixed(2)}R`; };
const row = (name, L, sk) => console.log(`  ${name.padEnd(36)} n=${String(L.length).padStart(5)} · 1,5R ${st(L, sk, 'r15')} · 2R ${st(L, sk, 'r2')} · 90/10 media18 ${st(L, sk, 'p90a')} · 90/10 stop+1R ${st(L, sk, 'p90b')} · 3R ${st(L, sk, 'r3')} · 2R+BE1,1 ${st(L, sk, 'be')} · stop medio ${L.length ? Math.round(mean(L.map((t) => t.r[sk].riskPips))) : 0} pips`);
console.log(`\nCruces de EMA en H4 · ${symbols.length} activos · ${path.basename(DATA)} · desde ${FROM} · stop ATR ×${ATR_MULT}${STOP_PIPS ? ` · fijo ${STOP_PIPS} pips` : ''} · radar: ${Object.keys(biasBy).length ? 'sí' : 'no'}`);
const FILTERS = [['sin filtro', () => true], ['EMA 8/18 a favor', (t) => t.f.ema], ['precio vs EMA 200 a favor', (t) => t.f.e200], ['EMA 8/18 + EMA 200 a favor', (t) => t.f.ema && t.f.e200], ['radar a favor (≥2)', (t) => t.f.radar], ['radar + EMA 200 a favor', (t) => t.f.radar && t.f.e200], ['radar en contra', (t) => t.f.radarContra]];
for (const sig of SIGNALS) {
  for (const sk of STOPS) {
    console.log(`\n== señal ${sig} · stop ${sk} ==`);
    for (const [name, fn] of FILTERS) { const L = trades.filter((t) => t.sig === sig && fn(t)); if (L.length >= 20) row(name, L, sk); }
  }
}
console.log('\n== por par · señal precio_ema8 · stop atr · sin filtro / EMA 200 a favor / radar a favor (2R) ==');
for (const s of symbols) {
  const L = trades.filter((t) => t.sym === s && t.sig === 'precio_ema8'); if (L.length < 20) continue;
  const F = L.filter((t) => t.f.e200), R = L.filter((t) => t.f.radar);
  console.log(`  ${s.padEnd(8)} todo n=${String(L.length).padStart(4)} ${st(L, 'atr', 'r2')} · EMA200 n=${String(F.length).padStart(4)} ${st(F, 'atr', 'r2')} · radar n=${String(R.length).padStart(4)} ${R.length >= 10 ? st(R, 'atr', 'r2') : '      —      '}`);
}
