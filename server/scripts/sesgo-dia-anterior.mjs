// Intradía (pedido del usuario, 13-10-2026): "el día anterior cerró bajista y ese es el sesgo; al día siguiente sube,
// manipula Asia y vuelve a bajar". ¿En qué pares pasa más y se puede operar?
// Datos: velas H1 de data/mt5 (hora de servidor = NY + 7). Día de trading = fecha de servidor (00:00 servidor = 17:00 NY).
//   Sesgo D   = dirección de la vela diaria anterior (cierre frente a apertura); "fuerte" si el cuerpo ≥ 50 % del rango.
//   Asia      = 17:00–02:00 NY (servidor 00–08): se mide desde la apertura del día.
//   Resto     = 02:00–17:00 NY (servidor 09–23).
// Manipulaciones (todas en contra de D):
//   M1 Asia en contra: el cierre de Asia queda en contra de D respecto a la apertura del día.
//   M2 Londres barre Asia en contra: entre 02:00 y 11:00 NY rompe primero el extremo de Asia contrario a D y una vela H1
//      vuelve a cerrar dentro del rango asiático.
//   M3 Barre el extremo del día anterior en contra de D (máximo si D bajista) antes de las 11:00 NY y vuelve dentro.
// Resultado: % de días que cierran a favor de D (cierre 17:00 NY frente a apertura) y frente a la base (todos los días
// tras un día D). Entradas operables (spread descontado, stop antes que objetivo en la misma vela):
//   E1 (M1): entrada en la apertura de Londres (02:00 NY) a favor de D, stop en el extremo de Asia contrario a D.
//   E2 (M2/M3): entrada al cierre de la vela que vuelve dentro, stop en el extremo de la barrida.
//   Objetivos 1R, 2R y cierre del día.
// Uso: node server/scripts/sesgo-dia-anterior.mjs [--desde 2024-01-01]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const FROM = arg('--desde', '2000-01-01');
const ASIA_END = 8; const POST_START = 9; const LAST_ENTRY = 18; // 11:00 NY

const SPREAD = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5 };
const SPREAD_PX = { XAUUSD: 0.3, US500F: 0.5, NAS100F: 1.5, US30F: 3 };
const pipOf = (s) => (s === 'XAUUSD' ? 0.1 : SPREAD_PX[s] !== undefined ? 1 : s.endsWith('JPY') ? 0.01 : 0.0001);
const spreadOf = (s) => (SPREAD_PX[s] ?? (SPREAD[s] ?? 2.5) * pipOf(s));

let biasBy = {};
try {
  const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
  for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) (biasBy[r.symbol] ||= []).push(r);
} catch { biasBy = {}; }
function biasAt(sym, date) {
  const rows = biasBy[sym]; if (!rows) return null;
  let lo = 0, hi = rows.length - 1, ans = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { ans = rows[m]; lo = m + 1; } else hi = m - 1; }
  return ans && (new Date(date) - new Date(ans.date)) / 86400000 <= 5 ? ans.diff : null;
}
function loadDays(sym) {
  const rows = readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1);
  const days = new Map();
  for (const line of rows) {
    const [t, o, h, l, c] = line.split(',');
    if (!t) continue;
    const [d, hm] = t.split(' ');
    if (hm.slice(3, 5) !== '00') continue;
    const date = d.replace(/\./g, '-');
    (days.get(date) || days.set(date, []).get(date)).push({ hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  return [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function simulate(post, startIdx, dir, entry, stop, close) {
  const risk = dir > 0 ? entry - stop : stop - entry;
  const run = (T) => {
    for (let k = startIdx; k < post.length; k++) {
      const b = post[k];
      if (dir > 0 ? b.l <= stop : b.h >= stop) return -1;
      if ((dir > 0 ? b.h - entry : entry - b.l) / risk >= T) return T;
    }
    return Math.max(-1, (dir > 0 ? close - entry : entry - close) / risk);
  };
  return { r1: run(1), r2: run(2), rc: Math.min(10, run(99)), risk };
}

const symbols = readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', ''));
const rows = [];
for (const sym of symbols) {
  const sp = spreadOf(sym); const pip = pipOf(sym);
  const days = loadDays(sym);
  const ev = [];
  for (let i = 1; i < days.length; i++) {
    const [date, bars] = days[i]; const [, prev] = days[i - 1];
    if (date < FROM || prev.length < 18 || bars.length < 20) continue;
    const pO = prev[0].o, pC = prev[prev.length - 1].c, pH = Math.max(...prev.map((b) => b.h)), pL = Math.min(...prev.map((b) => b.l));
    const D = Math.sign(pC - pO); if (D === 0) continue;
    const strong = Math.abs(pC - pO) >= 0.5 * (pH - pL);
    const asia = bars.filter((b) => b.hour <= ASIA_END); const post = bars.filter((b) => b.hour >= POST_START);
    if (asia.length < 6 || post.length < 10) continue;
    const dO = bars[0].o, aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), aC = asia[asia.length - 1].c;
    const close = post[post.length - 1].c;
    const win = Math.sign(close - dO) === D;            // el día cierra a favor del sesgo
    const winFromAsia = Math.sign(close - aC) === D;    // desde el cierre de Asia
    const beyond = D > 0 ? close > aH : close < aL;      // cierra más allá del extremo de Asia a favor
    const m1 = Math.sign(aC - dO) === -D;
    const diff = biasAt(sym, date); const radarOk = diff !== null && Math.sign(diff) === D && Math.abs(diff) >= 3;
    const e = { date, D, strong, win, winFromAsia, beyond, m1, m2: false, m3: false, radarOk, t1: null, t2: null, t3: null };
    // E1: Asia en contra → entrada en la apertura de Londres a favor de D, stop en el extremo de Asia contrario.
    if (m1) {
      const entry = D > 0 ? post[0].o + sp : post[0].o; const stop = D > 0 ? aL - sp : aH + sp;
      if ((D > 0 ? entry - stop : stop - entry) > 0) e.t1 = simulate(post, 0, D, entry, stop, close);
    }
    // E2 (M2): Londres barre el extremo de Asia contrario a D primero y vuelve dentro antes de las 11:00 NY.
    {
      let first = 0, fi = -1;
      for (let k = 0; k < post.length; k++) { const up = post[k].h > aH, dn = post[k].l < aL; if (up || dn) { first = up && dn ? 2 : up ? 1 : -1; fi = k; break; } }
      if (first === -D) {
        let ext = -D > 0 ? -Infinity : Infinity, ei = -1;
        for (let k = fi; k < post.length && post[k].hour <= LAST_ENTRY; k++) {
          ext = -D > 0 ? Math.max(ext, post[k].h) : Math.min(ext, post[k].l);
          if (-D > 0 ? post[k].c < aH : post[k].c > aL) { ei = k; break; }
        }
        if (ei >= 0) {
          e.m2 = true;
          const entry = D > 0 ? post[ei].c + sp : post[ei].c; const stop = D > 0 ? ext - sp : ext + sp;
          if ((D > 0 ? entry - stop : stop - entry) > 0) e.t2 = simulate(post, ei + 1, D, entry, stop, close);
        }
      }
    }
    // E3 (M3): barre el extremo del día anterior contrario a D (desde Asia hasta las 11:00 NY) y vuelve dentro.
    {
      const level = D > 0 ? pL : pH; const all = bars.filter((b) => b.hour <= LAST_ENTRY);
      let swept = false, ext = D > 0 ? Infinity : -Infinity, ei = -1;
      for (let k = 0; k < all.length; k++) {
        const b = all[k];
        if (D > 0 ? b.l < level : b.h > level) swept = true;
        if (swept) { ext = D > 0 ? Math.min(ext, b.l) : Math.max(ext, b.h); if (D > 0 ? b.c > level : b.c < level) { ei = k; break; } }
      }
      if (ei >= 0) {
        e.m3 = true;
        const startHour = all[ei].hour; const rest = bars.filter((b) => b.hour > startHour);
        const entry = D > 0 ? all[ei].c + sp : all[ei].c; const stop = D > 0 ? ext - sp : ext + sp;
        if (rest.length && (D > 0 ? entry - stop : stop - entry) > 0) e.t3 = simulate(rest, 0, D, entry, stop, close);
      }
    }
    if (e.t1) e.t1.riskPips = e.t1.risk / pip; if (e.t2) e.t2.riskPips = e.t2.risk / pip;
    ev.push(e);
  }
  rows.push({ sym, ev });
}

const pct = (a, n) => (n ? Math.round((1000 * a) / n) / 10 : null);
const rate = (L, k) => (L.length ? `${String(pct(L.filter((e) => e[k]).length, L.length)).padStart(4)}%` : '  — ');
const tr = (L, key, k) => { const v = L.map((e) => e[key]).filter(Boolean).map((t) => t[k]); if (!v.length) return '—'; const w = v.filter((x) => x > 0).length; const a = v.reduce((p, q) => p + q, 0) / v.length; return `${Math.round((100 * w) / v.length)}% ${a >= 0 ? '+' : ''}${a.toFixed(2)}R (${v.length})`; };
const med = (a) => { if (!a.length) return 0; const x = [...a].sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };

console.log(`\nSesgo = vela diaria anterior · Asia 17:00–02:00 NY · resto hasta 17:00 NY · desde ${FROM}`);
console.log('par       días  base: día a favor | M1 Asia en contra: desde Asia a favor · más allá de Asia · E1 2R | M2 Londres barre Asia en contra: desde Asia a favor · E2 1R · E2 2R | M3 barre extremo del día anterior: día a favor · E3 2R');
rows.sort((a, b) => {
  const s = (r) => { const L = r.ev.filter((e) => e.m1); return L.length ? L.filter((e) => e.winFromAsia).length / L.length : 0; };
  return s(b) - s(a);
});
for (const r of rows) {
  const E = r.ev; const M1 = E.filter((e) => e.m1), M2 = E.filter((e) => e.m2), M3 = E.filter((e) => e.m3);
  console.log(`${r.sym.padEnd(8)} ${String(E.length).padStart(5)}  ${rate(E, 'win')}             | ${rate(M1, 'winFromAsia')} (${M1.length}) · ${rate(M1, 'beyond')} · ${tr(M1, 't1', 'r2')} | ${rate(M2, 'winFromAsia')} (${M2.length}) · ${tr(M2, 't2', 'r1')} · ${tr(M2, 't2', 'r2')} | ${rate(M3, 'win')} (${M3.length}) · ${tr(M3, 't3', 'r2')} · stop E2 ${Math.round(med(M2.filter((e) => e.t2).map((e) => e.t2.riskPips)))} pips`);
}
const ALL = rows.flatMap((r) => r.ev.map((e) => ({ ...e, sym: r.sym })));
const line = (name, L) => console.log(`  ${name.padEnd(44)} n=${String(L.length).padStart(5)} · día a favor ${rate(L, 'win')} · desde el cierre de Asia a favor ${rate(L, 'winFromAsia')} · cierra más allá de Asia ${rate(L, 'beyond')} · E1 2R ${tr(L, 't1', 'r2')} · E2 1R ${tr(L, 't2', 'r1')} · E2 2R ${tr(L, 't2', 'r2')} · E3 2R ${tr(L, 't3', 'r2')}`);
console.log('\nTodos los activos:');
line('base (todos los días)', ALL);
line('M1 Asia en contra', ALL.filter((e) => e.m1));
line('M2 Londres barre Asia en contra', ALL.filter((e) => e.m2));
line('M3 barre extremo del día anterior', ALL.filter((e) => e.m3));
line('M2 + día anterior fuerte (cuerpo ≥ 50 %)', ALL.filter((e) => e.m2 && e.strong));
line('M2 + radar a favor del sesgo', ALL.filter((e) => e.m2 && e.radarOk));
line('M2 + fuerte + radar', ALL.filter((e) => e.m2 && e.strong && e.radarOk));
line('M1 + M2 (Asia en contra y Londres barre)', ALL.filter((e) => e.m1 && e.m2));
line('M3 + radar', ALL.filter((e) => e.m3 && e.radarOk));
console.log('\nPor año (M2, todos los activos):');
for (const y of ['2024', '2025', '2026']) line(y, ALL.filter((e) => e.m2 && e.date.startsWith(y)));
console.log('\nPares con E2 2R positivo · por año:');
for (const r of rows) {
  const M2 = r.ev.filter((e) => e.m2 && e.t2); if (M2.length < 30) continue;
  const avg = M2.reduce((a, e) => a + e.t2.r2, 0) / M2.length; if (avg <= 0.05) continue;
  console.log(`  ${r.sym.padEnd(8)} ${tr(M2, 't2', 'r2')} · ${['2024', '2025', '2026'].map((y) => `${y} ${tr(M2.filter((e) => e.date.startsWith(y)), 't2', 'r2')}`).join(' | ')} · con radar ${tr(M2.filter((e) => e.radarOk), 't2', 'r2')} · fuerte ${tr(M2.filter((e) => e.strong), 't2', 'r2')}`);
}
