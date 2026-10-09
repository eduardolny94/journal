// Backtest de la operativa swing del usuario (09-10-2026): en H4, comprar cuando la EMA 8 (azul) cruza por encima de la
// media simple 18 (roja) y vender cuando cruza por debajo; stop en el último bajo/alto (estructura H4 o mínimo/máximo
// del día anterior); salida en el cruce contrario (o stop). Filtros que se miden por separado y combinados: EMA 200,
// alineación 8/18 en diario, alineación 8/18 en semanal, sesgo del radar (radar_daily_bias, fuerza ≥ 2 y nivel A/B si
// hay conviccion-diaria.json) y "pares tendenciales" (los 4 con mayor ratio de eficiencia a 60 días, a fecha).
// Datos: velas H1 de data/mt5 (MT5 o scripts/descargar-h1-yahoo.mjs), hora de servidor = NY + 7 h. Spread descontado.
// Uso: node server/scripts/backtest-c4l-swing.mjs [--json]   (desde la raíz del proyecto)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { pairPip } from '../src/radar/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
const SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'EURGBP', 'EURJPY', 'GBPJPY', 'AUDJPY', 'CADJPY', 'EURAUD', 'EURCAD'].filter((s) => existsSync(path.join(DATA, `${s}_PERIOD_H1.csv`)));
const SPREAD_PIPS = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5 };
const FAST = 8, SLOW = 18, TREND = 200, STRUCT_BARS = 10, MAX_BARS = 200, MIN_STOP_ATR = 0.3;
const TOP_TRENDING = 4;

function loadH1(sym) {
  const rows = readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1);
  const bars = [];
  for (const line of rows) {
    const [t, o, h, l, c] = line.split(',');
    if (!t) continue;
    const [d, hm] = t.split(' ');
    bars.push({ date: d.replace(/\./g, '-'), hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  return bars;
}
function aggregate(h1, keyOf) {
  const out = [];
  let cur = null;
  h1.forEach((b, i) => {
    const key = keyOf(b);
    if (!cur || cur.key !== key) {
      if (cur) out.push(cur);
      cur = { key, date: b.date, o: b.o, h: b.h, l: b.l, c: b.c, first: i, last: i };
    } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.last = i; cur.date = b.date; }
  });
  if (cur) out.push(cur);
  return out;
}
const toH4 = (h1) => aggregate(h1, (b) => `${b.date}|${Math.floor(b.hour / 4)}`);
const toD1 = (h1) => aggregate(h1, (b) => b.date);
function isoWeek(ymd) {
  const d = new Date(`${ymd}T00:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const y = d.getUTCFullYear();
  const first = new Date(Date.UTC(y, 0, 4));
  return `${y}-W${String(1 + Math.round(((d - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`;
}
const toW1 = (h1) => aggregate(h1, (b) => isoWeek(b.date));
function ema(values, n) {
  const k = 2 / (n + 1); const out = new Array(values.length).fill(null); let e = null;
  values.forEach((v, i) => { e = e === null ? v : v * k + e * (1 - k); out[i] = i >= n - 1 ? e : null; });
  return out;
}
function sma(values, n) {
  const out = new Array(values.length).fill(null); let s = 0;
  values.forEach((v, i) => { s += v; if (i >= n) s -= values[i - n]; if (i >= n - 1) out[i] = s / n; });
  return out;
}
function atr(bars, n = 14) {
  const out = new Array(bars.length).fill(null); let a = null;
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
    a = a === null ? tr : (a * (n - 1) + tr) / n;
    if (i >= n) out[i] = a;
  }
  return out;
}
/** Ratio de eficiencia a 60 días (|recorrido neto| / suma de |cambios|), a fecha. */
function efficiency60(d1, idx) {
  if (idx < 60) return null;
  let noise = 0;
  for (let k = idx - 59; k <= idx; k++) noise += Math.abs(d1[k].c - d1[k - 1].c);
  return noise ? Math.abs(d1[idx].c - d1[idx - 60].c) / noise : 0;
}
/** Estado 8/18 de un marco superior al cierre de la última vela COMPLETADA antes de `date` (point-in-time). */
function alignmentIndex(frames, date) {
  let lo = 0, hi = frames.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (frames[m].date < date) { ans = m; lo = m + 1; } else hi = m - 1; }
  return ans;
}

// Sesgo del radar reconstruido (dirección y fuerza) y nivel de convicción si está exportado.
const biasRows = db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all();
const biasBy = {};
for (const r of biasRows) { (biasBy[r.symbol] ||= []).push(r); }
function biasAt(sym, date) {
  const rows = biasBy[sym]; if (!rows) return null;
  let lo = 0, hi = rows.length - 1, ans = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date <= date) { ans = rows[m]; lo = m + 1; } else hi = m - 1; }
  return ans && (new Date(date) - new Date(ans.date)) / 86400000 <= 5 ? ans.diff : null;
}
let tierBy = null;
try {
  const j = JSON.parse(readFileSync(path.join(DATA, 'conviccion-diaria.json'), 'utf8'));
  tierBy = {}; for (const r of j.rows) tierBy[`${r.sym}|${r.date}`] = r.tier_test;
  console.log(`Niveles A/B: conviccion-diaria.json (${j.rows.length} filas, prueba desde ${j.split_date})`);
} catch { console.log('Sin conviccion-diaria.json: el filtro "radar" usa solo dirección y fuerza ≥ 2 del sesgo reconstruido.'); }

// ---------- Simulación ----------
const trades = [];
const effByDate = {}; // fecha → { sym: eficiencia } para elegir los 4 más tendenciales a fecha
const frames = {};
for (const sym of SYMBOLS) {
  const h1 = loadH1(sym);
  const h4 = toH4(h1); const d1 = toD1(h1); const w1 = toW1(h1);
  const c4 = h4.map((b) => b.c);
  frames[sym] = { h1, h4, d1, w1, e8: ema(c4, FAST), s18: sma(c4, SLOW), e200: ema(c4, TREND), atr4: atr(h4, 14),
    d8: ema(d1.map((b) => b.c), FAST), d18: sma(d1.map((b) => b.c), SLOW), w8: ema(w1.map((b) => b.c), FAST), w18: sma(w1.map((b) => b.c), SLOW) };
  d1.forEach((b, i) => { const e = efficiency60(d1, i); if (e !== null) (effByDate[b.date] ||= {})[sym] = e; });
}
const effDates = Object.keys(effByDate).sort();
function topTrendingAt(date) {
  let lo = 0, hi = effDates.length - 1, ans = null;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (effDates[m] < date) { ans = effDates[m]; lo = m + 1; } else hi = m - 1; }
  if (!ans) return new Set();
  return new Set(Object.entries(effByDate[ans]).sort((a, b) => b[1] - a[1]).slice(0, TOP_TRENDING).map(([s]) => s));
}

for (const sym of SYMBOLS) {
  const F = frames[sym]; const { h1, h4, d1, w1 } = F;
  const pip = pairPip(sym); const spread = (SPREAD_PIPS[sym] || 1.5) * pip;
  for (let i = TREND + 1; i < h4.length - 1; i++) {
    const up = F.e8[i] > F.s18[i] && F.e8[i - 1] <= F.s18[i - 1];
    const dn = F.e8[i] < F.s18[i] && F.e8[i - 1] >= F.s18[i - 1];
    if (!up && !dn) continue;
    const dir = up ? 1 : -1;
    const b = h4[i];
    const a = F.atr4[i]; if (!a) continue;
    const entry = dir > 0 ? b.c + spread : b.c;
    // Stops: estructura = extremo de las últimas STRUCT_BARS velas H4; diario = extremo del día anterior completado.
    const win = h4.slice(Math.max(0, i - STRUCT_BARS + 1), i + 1);
    const stopStruct = dir > 0 ? Math.min(...win.map((x) => x.l)) - spread : Math.max(...win.map((x) => x.h)) + spread;
    const di = alignmentIndex(d1, b.date);
    const stopDaily = di >= 0 ? (dir > 0 ? d1[di].l - spread : d1[di].h + spread) : null;
    // Contexto (point-in-time)
    const ema200ok = dir > 0 ? b.c > F.e200[i] : b.c < F.e200[i];
    const d1ok = di >= 0 && F.d8[di] !== null && F.d18[di] !== null ? (dir > 0 ? F.d8[di] > F.d18[di] : F.d8[di] < F.d18[di]) : null;
    const wi = alignmentIndex(w1, b.date);
    const w1ok = wi >= 0 && F.w8[wi] !== null && F.w18[wi] !== null ? (dir > 0 ? F.w8[wi] > F.w18[wi] : F.w8[wi] < F.w18[wi]) : null;
    const diff = biasAt(sym, b.date);
    const radarOk = diff === null ? null : (Math.sign(diff) === dir && Math.abs(diff) >= 3);
    const tier = tierBy ? tierBy[`${sym}|${b.date}`] || null : null;
    const radarAB = tierBy ? (radarOk === true && (tier === 'A' || tier === 'B')) : null;
    const trending = topTrendingAt(b.date).has(sym);
    for (const [stopKind, stop] of [['estructura', stopStruct], ['diario', stopDaily]]) {
      if (stop === null) continue;
      let risk = dir > 0 ? entry - stop : stop - entry;
      if (risk < MIN_STOP_ATR * a) risk = MIN_STOP_ATR * a; // stop pegado: distancia mínima
      const stopPx = dir > 0 ? entry - risk : entry + risk;
      // Salida: cruce contrario (al cierre de esa vela) o stop en H1; tope de MAX_BARS velas H4.
      let exitR = null; let bars = 0; let reason = 'tope';
      let j = i + 1;
      for (; j < h4.length && bars < MAX_BARS; j++, bars++) {
        let hit = false;
        for (let k = h4[j].first; k <= h4[j].last; k++) {
          const x = h1[k];
          if (dir > 0 ? x.l <= stopPx : x.h >= stopPx) { hit = true; break; }
        }
        if (hit) { exitR = -1; reason = 'stop'; break; }
        const cross = dir > 0 ? F.e8[j] < F.s18[j] : F.e8[j] > F.s18[j];
        if (cross) { exitR = (dir > 0 ? h4[j].c - spread - entry : entry - h4[j].c - spread) / risk; reason = 'cruce'; break; }
      }
      if (exitR === null) { if (j >= h4.length) continue; exitR = (dir > 0 ? h4[j - 1].c - entry : entry - h4[j - 1].c) / risk; }
      trades.push({ sym, date: b.date, year: b.date.slice(0, 4), dir, stopKind, r: exitR, bars, reason, risk_pips: risk / pip, ema200ok, d1ok, w1ok, radarOk, radarAB, trending });
    }
  }
}

// ---------- Resultados ----------
const f1 = (n) => (n === null || n === undefined ? '—' : n.toFixed(2));
function stats(list) {
  if (!list.length) return { n: 0 };
  const wins = list.filter((t) => t.r > 0); const g = wins.reduce((a, t) => a + t.r, 0); const l = list.filter((t) => t.r <= 0).reduce((a, t) => a + t.r, 0);
  const avg = list.reduce((a, t) => a + t.r, 0) / list.length;
  return { n: list.length, win: Math.round((1000 * wins.length) / list.length) / 10, avg: Math.round(avg * 100) / 100, pf: l ? Math.round((100 * g) / -l) / 100 : null, bars: Math.round(list.reduce((a, t) => a + t.bars, 0) / list.length) };
}
const line = (name, s) => console.log(`  ${name.padEnd(46)} n=${String(s.n).padStart(5)}  gana ${String(s.win ?? '—').padStart(5)} %  R/op ${String(s.avg ?? '—').padStart(6)}  PF ${String(s.pf ?? '—').padStart(5)}  velas ${s.bars ?? '—'}`);
const VARIANTS = [
  ['cruce 8/18 sin filtro', () => true],
  ['+ EMA 200 a favor', (t) => t.ema200ok],
  ['+ diario 8/18 a favor', (t) => t.d1ok === true],
  ['+ semanal 8/18 a favor', (t) => t.w1ok === true],
  ['+ semanal + diario a favor', (t) => t.w1ok === true && t.d1ok === true],
  ['+ radar a favor (fuerza ≥ 2)', (t) => t.radarOk === true],
  ['+ radar nivel A/B', (t) => t.radarAB === true],
  ['+ par tendencial (top 4 eficiencia 60 d)', (t) => t.trending],
  ['+ semanal + radar', (t) => t.w1ok === true && t.radarOk === true],
  ['+ semanal + radar + tendencial', (t) => t.w1ok === true && t.radarOk === true && t.trending],
  ['+ semanal + radar A/B', (t) => t.w1ok === true && t.radarAB === true],
  ['+ semanal + radar A/B + tendencial', (t) => t.w1ok === true && t.radarAB === true && t.trending],
  ['+ semanal + EMA 200 + radar', (t) => t.w1ok === true && t.ema200ok && t.radarOk === true],
];
for (const stopKind of ['estructura', 'diario']) {
  const T = trades.filter((t) => t.stopKind === stopKind);
  console.log(`\n== Stop en el último ${stopKind === 'estructura' ? 'bajo/alto de 10 velas H4' : 'mínimo/máximo del día anterior'} · salida en el cruce contrario · ${SYMBOLS.length} pares · ${T[0] ? T[0].date : ''} → ${T[T.length - 1] ? T[T.length - 1].date : ''} ==`);
  for (const [name, fn] of VARIANTS) line(name, stats(T.filter(fn)));
}
// Detalle de la mejor combinación con stop de estructura: por par y por año.
const best = trades.filter((t) => t.stopKind === 'estructura' && t.w1ok === true && t.radarOk === true);
console.log('\nSemanal + radar (stop estructura) · por par:');
for (const sym of SYMBOLS) { const s = stats(best.filter((t) => t.sym === sym)); if (s.n) line(sym, s); }
console.log('Semanal + radar (stop estructura) · por año:');
for (const y of [...new Set(best.map((t) => t.year))].sort()) line(y, stats(best.filter((t) => t.year === y)));
console.log('Semanal + radar (stop estructura) · motivo de salida:');
for (const r of ['cruce', 'stop', 'tope']) line(r, stats(best.filter((t) => t.reason === r)));

// Cuenta de 500 $ arriesgando el 1 % por operación (capitalización), con la combinación semanal + radar.
function account(list, riskPct = 0.01, start = 500) {
  let eq = start, peak = start, maxDd = 0; const byMonth = {};
  for (const t of [...list].sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const before = eq; eq *= 1 + riskPct * t.r; peak = Math.max(peak, eq); maxDd = Math.max(maxDd, (peak - eq) / peak);
    const m = t.date.slice(0, 7); byMonth[m] = (byMonth[m] || 0) + (eq - before);
  }
  const months = Object.values(byMonth);
  return { end: Math.round(eq), ret: Math.round(((eq / start) - 1) * 1000) / 10, maxDd: Math.round(maxDd * 1000) / 10, worstMonth: months.length ? Math.round(Math.min(...months)) : 0, bestMonth: months.length ? Math.round(Math.max(...months)) : 0, months: months.length, posMonths: months.filter((x) => x > 0).length };
}
for (const [name, fn] of [['sin filtro', () => true], ['semanal', (t) => t.w1ok === true], ['semanal + radar', (t) => t.w1ok === true && t.radarOk === true], ['semanal + radar + tendencial', (t) => t.w1ok === true && t.radarOk === true && t.trending]]) {
  const a = account(trades.filter((t) => t.stopKind === 'estructura' && fn(t)));
  console.log(`\nCuenta 500 $ · 1 % por operación · ${name}: final ${a.end} $ (${a.ret >= 0 ? '+' : ''}${a.ret} %), drawdown máximo ${a.maxDd} %, meses positivos ${a.posMonths}/${a.months}, peor mes ${a.worstMonth} $, mejor mes ${a.bestMonth} $`);
}
if (process.argv.includes('--json')) { writeFileSync(path.join(DATA, 'backtest-c4l-swing.json'), JSON.stringify(trades)); console.log('\nRegistros guardados en data/mt5/backtest-c4l-swing.json'); }
