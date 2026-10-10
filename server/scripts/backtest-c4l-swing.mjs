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
const argStop = process.argv.indexOf('--stop-pips');
const FIXED_STOP_PIPS = argStop >= 0 ? Number(process.argv[argStop + 1]) : null;

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
/** ADX de Wilder (fuerza de tendencia, sin dirección). */
function adx(bars, n = 14) {
  const out = new Array(bars.length).fill(null);
  let trS = null, pS = null, nS = null, a = null;
  for (let i = 1; i < bars.length; i++) {
    const up = bars[i].h - bars[i - 1].h, dn = bars[i - 1].l - bars[i].l;
    const pdm = up > dn && up > 0 ? up : 0, ndm = dn > up && dn > 0 ? dn : 0;
    const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
    if (trS === null) { trS = tr; pS = pdm; nS = ndm; } else { trS += tr - trS / n; pS += pdm - pS / n; nS += ndm - nS / n; }
    if (i < n) continue;
    const pdi = trS ? (100 * pS) / trS : 0, ndi = trS ? (100 * nS) / trS : 0;
    const dx = pdi + ndi ? (100 * Math.abs(pdi - ndi)) / (pdi + ndi) : 0;
    a = a === null ? dx : (a * (n - 1) + dx) / n;
    if (i >= 2 * n) out[i] = a;
  }
  return out;
}
function rsi(values, n = 14) {
  const out = new Array(values.length).fill(null); let ag = null, al = null;
  for (let i = 1; i < values.length; i++) {
    const ch = values[i] - values[i - 1]; const g = Math.max(ch, 0), l = Math.max(-ch, 0);
    if (ag === null) { ag = g; al = l; } else { ag = (ag * (n - 1) + g) / n; al = (al * (n - 1) + l) / n; }
    if (i >= n) out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  }
  return out;
}
/** Histograma MACD (12, 26, 9). */
function macdHist(values) {
  const e12 = ema(values, 12), e26 = ema(values, 26);
  const line = values.map((_, i) => (e12[i] !== null && e26[i] !== null ? e12[i] - e26[i] : null));
  const idx = line.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
  const sig = ema(idx.map((i) => line[i]), 9);
  const out = new Array(values.length).fill(null);
  idx.forEach((i, k) => { if (sig[k] !== null) out[i] = line[i] - sig[k]; });
  return out;
}
/** Simula una salida con objetivo fijo y escalones de protección [[R alcanzado, nuevo stop en R], ...] sobre velas H1. */
function simExit(h1, h4, i, dir, entry, risk, stopPx, target, steps = [], maxBars = MAX_BARS) {
  let stopNow = stopPx; let jj = i + 1; let bb = 0; let res = null; const done = steps.map(() => false);
  for (; jj < h4.length && bb < maxBars && res === null; jj++, bb++) {
    for (let k = h4[jj].first; k <= h4[jj].last; k++) {
      const x = h1[k];
      const adv = dir > 0 ? x.l : x.h;
      if (dir > 0 ? adv <= stopNow : adv >= stopNow) { res = (dir > 0 ? stopNow - entry : entry - stopNow) / risk; break; }
      const favR = (dir > 0 ? x.h - entry : entry - x.l) / risk;
      if (favR >= target) { res = target; break; }
      steps.forEach(([trig, toR], s) => { if (!done[s] && favR >= trig) { done[s] = true; stopNow = dir > 0 ? entry + toR * risk : entry - toR * risk; } });
    }
  }
  if (res === null) res = jj < h4.length ? (dir > 0 ? h4[jj - 1].c - entry : entry - h4[jj - 1].c) / risk : 0;
  return Math.round(res * 1000) / 1000;
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
  const cd = d1.map((b) => b.c);
  frames[sym] = { h1, h4, d1, w1, e8: ema(c4, FAST), s18: sma(c4, SLOW), e200: ema(c4, TREND), atr4: atr(h4, 14), adx4: adx(h4, 14),
    d8: ema(cd, FAST), d18: sma(cd, SLOW), w8: ema(w1.map((b) => b.c), FAST), w18: sma(w1.map((b) => b.c), SLOW),
    adxD: adx(d1, 14), rsiD: rsi(cd, 14), macdD: macdHist(cd), atrD: atr(d1, 14) };
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
  // VWAP anclado aproximado (sin volumen en forex): media de cierres H1 desde el lunes (semana) y desde el día 1 (mes).
  const vwapW = new Array(h1.length).fill(null); const vwapM = new Array(h1.length).fill(null);
  { let wk = null, ws = 0, wn = 0, mo = null, ms = 0, mn = 0;
    for (let k = 0; k < h1.length; k++) { const b = h1[k]; const w = isoWeek(b.date); const m = b.date.slice(0, 7);
      if (w !== wk) { wk = w; ws = 0; wn = 0; } if (m !== mo) { mo = m; ms = 0; mn = 0; }
      ws += b.c; wn++; ms += b.c; mn++; vwapW[k] = ws / wn; vwapM[k] = ms / mn; } }
  for (let i0 = TREND + 1; i0 < h4.length - 1; i0++) {
    const up = F.e8[i0] > F.s18[i0] && F.e8[i0 - 1] <= F.s18[i0 - 1];
    const dn = F.e8[i0] < F.s18[i0] && F.e8[i0 - 1] >= F.s18[i0 - 1];
    if (!up && !dn) continue;
    const dir = up ? 1 : -1;
   for (const ENTRY_KIND of ['cruce', 'retroceso']) {
    let i = i0;
    if (ENTRY_KIND === 'retroceso') {
      let found = -1;
      for (let q = i0 + 1; q <= Math.min(h4.length - 2, i0 + 6); q++) {
        if (dir > 0 ? F.e8[q] <= F.s18[q] : F.e8[q] >= F.s18[q]) break; // el cruce se deshizo
        if (dir > 0 ? h4[q].l <= F.e8[q] && h4[q].c > F.e8[q] : h4[q].h >= F.e8[q] && h4[q].c < F.e8[q]) { found = q; break; }
      }
      if (found < 0) continue;
      i = found;
    }
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
    const vwW = vwapW[b.last]; const vwM = vwapM[b.last];
    const vwapWok = vwW === null ? null : (dir > 0 ? b.c > vwW : b.c < vwW);
    const vwapMok = vwM === null ? null : (dir > 0 ? b.c > vwM : b.c < vwM);
    const stopFixed = FIXED_STOP_PIPS ? (dir > 0 ? entry - FIXED_STOP_PIPS * pip : entry + FIXED_STOP_PIPS * pip) : null;
    // Indicadores de contexto (point-in-time) para buscar filtros que suban el acierto a 1,5R / 2R.
    const adx4 = F.adx4[i]; const adxD = di >= 0 ? F.adxD[di] : null; const rsiD = di >= 0 ? F.rsiD[di] : null; const macdD = di >= 0 ? F.macdD[di] : null;
    const rsiDok = rsiD === null ? null : (dir > 0 ? rsiD > 50 : rsiD < 50);
    const rsiDext = rsiD === null ? null : (dir > 0 ? rsiD >= 70 : rsiD <= 30);
    const macdDok = macdD === null ? null : (dir > 0 ? macdD > 0 : macdD < 0);
    const distE200 = F.e200[i] !== null ? Math.abs(b.c - F.e200[i]) / a : null;
    const e200slope = F.e200[i] !== null && F.e200[i - 10] !== null ? Math.sign(F.e200[i] - F.e200[i - 10]) === dir : null;
    const crossStrength = (dir > 0 ? b.c - F.s18[i] : F.s18[i] - b.c) / a;
    let crosses30 = 0; for (let q = i0 - 30; q < i0; q++) if (q > 0 && F.e8[q] !== null && F.s18[q] !== null && Math.sign(F.e8[q] - F.s18[q]) !== Math.sign(F.e8[q - 1] - F.s18[q - 1])) crosses30++;
    const w20 = h4.slice(Math.max(0, i - 20), i);
    const donchian = dir > 0 ? b.c >= Math.max(...w20.map((x) => x.h)) : b.c <= Math.min(...w20.map((x) => x.l));
    const dayEma8ok = di >= 0 && F.d8[di] !== null ? (dir > 0 ? d1[di].c > F.d8[di] : d1[di].c < F.d8[di]) : null;
    let d1age = null; if (d1ok === true) { d1age = 0; for (let q = di; q >= 0 && F.d8[q] !== null && F.d18[q] !== null && (dir > 0 ? F.d8[q] > F.d18[q] : F.d8[q] < F.d18[q]); q--) d1age++; }
    let w1age = null; if (w1ok === true) { w1age = 0; for (let q = wi; q >= 0 && F.w8[q] !== null && F.w18[q] !== null && (dir > 0 ? F.w8[q] > F.w18[q] : F.w8[q] < F.w18[q]); q--) w1age++; }
    const hourNY = ((Number(String(b.key).split('|')[1]) * 4) - 7 + 24) % 24; // inicio de la vela H4 en hora de Nueva York
    const weekday = new Date(`${b.date}T00:00:00Z`).getUTCDay();
    const atrDrel = di >= 0 && F.atrD[di] && d1[di] ? F.atrD[di] / d1[di].c : null;
    const ctx = { adx4, adxD, rsiDok, rsiDext, macdDok, distE200, e200slope, crossStrength, crosses30, donchian, dayEma8ok, d1age, w1age, hourNY, weekday, atrDrel };
    for (const [stopKind, stop] of [['estructura', stopStruct], ['diario', stopDaily], ['fijo', stopFixed]]) {
      if (stop === null) continue;
      let risk = dir > 0 ? entry - stop : stop - entry;
      if (risk < MIN_STOP_ATR * a) risk = MIN_STOP_ATR * a; // stop pegado: distancia mínima
      const stopPx = dir > 0 ? entry - risk : entry + risk;
      // Salidas medidas a la vez sobre las mismas velas H1 (stop antes que objetivo si tocan en la misma hora):
      //   cruce   = cruce contrario al cierre de la vela H4 (regla original del usuario)
      //   obj2    = objetivo fijo 2R (también 1,5R y 3R); si no llega, stop
      //   parcial = 80 % cerrado en 2R, stop del 20 % restante a la entrada (sin riesgo) y salida en el cruce contrario
      let exitR = null; let bars = 0; let reason = 'tope';
      const tgt = { 1.5: null, 2: null, 3: null };
      let maxFav = 0; let runnerStop = stopPx; let partialDone = false; let runnerExit = null;
      let j = i + 1;
      for (; j < h4.length && bars < MAX_BARS; j++, bars++) {
        let hit = false; let runnerHit = false;
        for (let k = h4[j].first; k <= h4[j].last; k++) {
          const x = h1[k];
          const fav = (dir > 0 ? x.h - entry : entry - x.l) / risk;
          const adverseStop = dir > 0 ? x.l <= stopPx : x.h >= stopPx;
          if (adverseStop && exitR === null) { hit = true; }
          if (!hit) maxFav = Math.max(maxFav, fav);
          for (const t of [1.5, 2, 3]) if (tgt[t] === null && !hit && fav >= t) tgt[t] = t;
          if (!hit && !partialDone && fav >= 2) { partialDone = true; runnerStop = entry; }
          if (partialDone && runnerExit === null && (dir > 0 ? x.l <= runnerStop : x.h >= runnerStop)) runnerHit = true;
          if (hit) break;
        }
        if (hit) { if (exitR === null) { exitR = -1; reason = 'stop'; } if (!partialDone) { runnerExit = -1; } break; }
        if (runnerHit && runnerExit === null) runnerExit = 0; // el resto salió a la entrada
        const cross = dir > 0 ? F.e8[j] < F.s18[j] : F.e8[j] > F.s18[j];
        if (cross) {
          const rc = (dir > 0 ? h4[j].c - spread - entry : entry - h4[j].c - spread) / risk;
          if (exitR === null) { exitR = rc; reason = 'cruce'; }
          if (runnerExit === null) runnerExit = partialDone ? rc : rc;
          break;
        }
      }
      if (exitR === null) { if (j >= h4.length) continue; exitR = (dir > 0 ? h4[j - 1].c - entry : entry - h4[j - 1].c) / risk; }
      if (runnerExit === null) runnerExit = exitR;
      // Objetivo 1:2 puro: se mantiene hasta tocar 2R o el stop, ignorando el cruce contrario (tope MAX_BARS velas H4).
      let pure2 = tgt[2] === 2 ? 2 : (reason === 'stop' ? -1 : null);
      if (pure2 === null) {
        let jj = j; let bb = bars;
        for (; jj < h4.length && bb < MAX_BARS && pure2 === null; jj++, bb++) {
          for (let k = h4[jj].first; k <= h4[jj].last; k++) {
            const x = h1[k];
            if (dir > 0 ? x.l <= stopPx : x.h >= stopPx) { pure2 = -1; break; }
            if ((dir > 0 ? x.h - entry : entry - x.l) / risk >= 2) { pure2 = 2; break; }
          }
        }
        if (pure2 === null) pure2 = jj < h4.length ? (dir > 0 ? h4[jj - 1].c - entry : entry - h4[jj - 1].c) / risk : 0;
      }
      for (const t of [1.5, 2, 3]) if (tgt[t] === null) tgt[t] = exitR < 0 && reason === 'stop' ? -1 : (reason === 'cruce' ? Math.min(exitR, t) : exitR);
      // Protección tras +1R: (a) stop a la entrada al tocar 1R, objetivo 2R; (b) 50 % cerrado en 1R, resto a 2R con stop en la entrada.
      let be1 = null; let reached1 = false;
      {
        let jj = i + 1; let bb = 0;
        for (; jj < h4.length && bb < MAX_BARS && be1 === null; jj++, bb++) {
          for (let k = h4[jj].first; k <= h4[jj].last; k++) {
            const x = h1[k];
            const adv = dir > 0 ? x.l : x.h; const favPx = dir > 0 ? x.h : x.l;
            const stopNow = reached1 ? entry : stopPx;
            if (dir > 0 ? adv <= stopNow : adv >= stopNow) { be1 = reached1 ? 0 : -1; break; }
            const favR = (dir > 0 ? favPx - entry : entry - favPx) / risk;
            if (favR >= 2) { be1 = 2; break; }
            if (favR >= 1) reached1 = true;
          }
        }
        if (be1 === null) be1 = reached1 ? 0 : (jj < h4.length ? (dir > 0 ? h4[jj - 1].c - entry : entry - h4[jj - 1].c) / risk : 0);
      }
      const parcial1 = reached1 ? 0.5 * 1 + 0.5 * be1 : be1;
      const pureT = {};
      for (const T of [0.5, 0.75, 1, 1.5]) {
        let res = null; let jj = i + 1; let bb = 0;
        for (; jj < h4.length && bb < MAX_BARS && res === null; jj++, bb++) {
          for (let k = h4[jj].first; k <= h4[jj].last; k++) {
            const x = h1[k];
            if (dir > 0 ? x.l <= stopPx : x.h >= stopPx) { res = -1; break; }
            if ((dir > 0 ? x.h - entry : entry - x.l) / risk >= T) { res = T; break; }
          }
        }
        pureT[T] = res === null ? (jj < h4.length ? (dir > 0 ? h4[jj - 1].c - entry : entry - h4[jj - 1].c) / risk : 0) : res;
      }
      // Variante parcial: 0,8 × 2R + 0,2 × salida del resto (si no llegó a 2R, es la salida original completa)
      const parcial = partialDone ? 0.8 * 2 + 0.2 * runnerExit : exitR;
      // Regla del usuario (10-10-2026): stop a la entrada al tocar +1,1R; objetivo 1,5R o 2R. Y una escalera: 1,1R → entrada, 1,5R → +0,75R, objetivo 2R.
      const be11_t15 = simExit(h1, h4, i, dir, entry, risk, stopPx, 1.5, [[1.1, 0]]);
      const be11_t2 = simExit(h1, h4, i, dir, entry, risk, stopPx, 2, [[1.1, 0]]);
      const esc_t2 = simExit(h1, h4, i, dir, entry, risk, stopPx, 2, [[1.1, 0], [1.5, 0.75]]);
      const esc_t3 = simExit(h1, h4, i, dir, entry, risk, stopPx, 3, [[1.1, 0], [1.5, 0.75], [2, 1.25]]);
      trades.push({ sym, date: b.date, hour: Number(String(b.key).split('|')[1]) * 4, year: b.date.slice(0, 4), dir, stopKind, r: exitR, r15: tgt[1.5], r2: tgt[2], r2_puro: pure2, p05: pureT[0.5], p075: pureT[0.75], p1: pureT[1], p15: pureT[1.5], r_be1: be1, entryKind: ENTRY_KIND, r_parcial1: parcial1, r3: tgt[3], r_parcial: parcial, be11_t15, be11_t2, esc_t2, esc_t3, stop_atr: risk / a, max_fav: Math.round(maxFav * 100) / 100, bars, reason, risk_pips: risk / pip, entry, stop: stopPx, ema200ok, d1ok, w1ok, radarOk, radarAB, trending, vwapWok, vwapMok, ...ctx });
    }
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
  ['+ VWAP semanal a favor', (t) => t.vwapWok === true],
  ['+ VWAP mensual a favor', (t) => t.vwapMok === true],
  ['+ semanal + VWAP mensual', (t) => t.w1ok === true && t.vwapMok === true],
  ['+ radar + VWAP mensual', (t) => t.radarOk === true && t.vwapMok === true],
  ['+ semanal + radar + VWAP mensual', (t) => t.w1ok === true && t.radarOk === true && t.vwapMok === true],
  ['+ semanal + radar + VWAP semanal', (t) => t.w1ok === true && t.radarOk === true && t.vwapWok === true],
];
for (const stopKind of FIXED_STOP_PIPS ? ['estructura', 'diario', 'fijo'] : ['estructura', 'diario']) {
  const T = trades.filter((t) => t.stopKind === stopKind && t.entryKind === 'cruce');
  console.log(`\n== Stop en el ${stopKind === 'estructura' ? 'último bajo/alto de 10 velas H4' : stopKind === 'diario' ? 'último mínimo/máximo del día anterior' : `fijo de ${FIXED_STOP_PIPS} pips`} · salida en el cruce contrario · ${SYMBOLS.length} pares · ${T[0] ? T[0].date : ''} → ${T[T.length - 1] ? T[T.length - 1].date : ''} ==`);
  for (const [name, fn] of VARIANTS) line(name, stats(T.filter(fn)));
}
// Detalle de la mejor combinación con stop de estructura: por par y por año.
const best = trades.filter((t) => t.entryKind === 'cruce' && t.stopKind === 'estructura' && t.w1ok === true && t.radarOk === true);
console.log('\nSemanal + radar (stop estructura) · por par:');
for (const sym of SYMBOLS) { const s = stats(best.filter((t) => t.sym === sym)); if (s.n) line(sym, s); }
console.log('Semanal + radar (stop estructura) · por año:');
for (const y of [...new Set(best.map((t) => t.year))].sort()) line(y, stats(best.filter((t) => t.year === y)));
console.log('Semanal + radar (stop estructura) · motivo de salida:');
for (const r of ['cruce', 'stop', 'tope']) line(r, stats(best.filter((t) => t.reason === r)));

// Salidas alternativas (objetivo fijo y parcial) para las combinaciones clave, con stop de estructura y en el día anterior.
const statsR = (list, key) => stats(list.map((t) => ({ ...t, r: t[key] })));
console.log('\n== Salidas alternativas · gana % / R por operación / factor (n) ==');
for (const stopKind of FIXED_STOP_PIPS ? ['estructura', 'diario', 'fijo'] : ['estructura', 'diario']) {
  console.log(`  stop ${stopKind}:`);
  for (const [name, fn] of [['semanal', (t) => t.w1ok === true], ['semanal + radar', (t) => t.w1ok === true && t.radarOk === true], ['semanal + radar A/B', (t) => t.w1ok === true && t.radarAB === true]]) {
    const T = trades.filter((t) => t.entryKind === 'cruce' && t.stopKind === stopKind && fn(t));
    const cell = (key) => { const s = statsR(T, key); return s.n ? `${s.win}% ${s.avg >= 0 ? '+' : ''}${s.avg}R PF ${s.pf}` : '—'; };
    console.log(`    ${name.padEnd(22)} n=${String(T.length).padStart(4)} · cruce: ${cell('r')} · 1,5R: ${cell('r15')} · 2R: ${cell('r2')} · 3R: ${cell('r3')} · parcial 80 % en 2R + resto al cruce: ${cell('r_parcial')}`);
  }
}
// Lista de operaciones de un par y periodo (para comparar con un backtest manual): --par GBPJPY --desde 2026-04-01 --hasta 2026-06-15
const ap = process.argv.indexOf('--par');
if (ap >= 0) {
  const sym = process.argv[ap + 1]; const ad = process.argv.indexOf('--desde'); const ah = process.argv.indexOf('--hasta');
  const from = ad >= 0 ? process.argv[ad + 1] : '2000-01-01'; const to = ah >= 0 ? process.argv[ah + 1] : '2100-01-01';
  const sk = FIXED_STOP_PIPS ? 'fijo' : 'estructura';
  const L = trades.filter((t) => t.sym === sym && t.stopKind === sk && t.w1ok === true && t.date >= from && t.date <= to);
  console.log(`\nOperaciones ${sym} ${from} → ${to} · cruce 8/18 en H4 a favor de la semana 8/18 · stop ${FIXED_STOP_PIPS ? `fijo ${FIXED_STOP_PIPS} pips` : 'estructura'} · objetivo 1:2 puro (hasta 2R o stop)`);
  for (const t of L) {
    const o = t.r2_puro === 2 ? 'OBJETIVO +2R' : t.r2_puro === -1 ? 'STOP −1R' : `abierta/tope ${t.r2_puro >= 0 ? '+' : ''}${Number(t.r2_puro).toFixed(2)}R`;
    console.log(`  ${t.date} ${String(t.hour).padStart(2, '0')}:00 ${t.dir > 0 ? 'compra' : 'venta '} ${t.entry.toFixed(3)} · ${o.padEnd(18)} · máx a favor ${String(t.max_fav).padStart(5)}R · cruce ${t.r >= 0 ? '+' : ''}${t.r.toFixed(2)}R · radar ${t.radarOk === null ? '—      ' : t.radarOk ? 'A FAVOR' : 'contra '}${t.radarAB ? ' A/B' : ''}`);
  }
  const st = (list) => { const n = list.length; if (!n) return '—'; const w = list.filter((t) => t.r2_puro > 0).length; const r = list.reduce((a, t) => a + t.r2_puro, 0) / n; return `n=${n} · ${Math.round((100 * w) / n)} % llegan a 2R · ${r >= 0 ? '+' : ''}${r.toFixed(2)}R por operación · neto ${(r * n).toFixed(1)}R`; };
  const st2 = (list, key) => { const n = list.length; if (!n) return '—'; const w = list.filter((t) => t[key] > 0).length; const r = list.reduce((a, t) => a + t[key], 0) / n; return `${Math.round((100 * w) / n)} % ganan · ${r >= 0 ? '+' : ''}${r.toFixed(2)}R/op · neto ${(r * n).toFixed(1)}R`; };
  console.log(`  Con stop a la entrada al tocar +1R (objetivo 2R): todas ${st2(L, 'r_be1')} · radar a favor ${st2(L.filter((t) => t.radarOk), 'r_be1')}`);
  console.log(`  Con 50 % en 1R y resto a 2R (stop a la entrada):  todas ${st2(L, 'r_parcial1')} · radar a favor ${st2(L.filter((t) => t.radarOk), 'r_parcial1')}`);
  console.log(`  Salida en el cruce contrario (tu regla original): todas ${st2(L, 'r')} · radar a favor ${st2(L.filter((t) => t.radarOk), 'r')}`);
  console.log(`  TODAS:          ${st(L)}`);
  console.log(`  radar a favor:  ${st(L.filter((t) => t.radarOk))}`);
  console.log(`  radar en contra o sin sesgo: ${st(L.filter((t) => !t.radarOk))}`);
}

// Variantes con protección tras +1R, para las combinaciones clave (stop fijo si se pidió; si no, día anterior).
{
  const sk = FIXED_STOP_PIPS ? 'fijo' : 'diario';
  console.log(`\n== Protección tras +1R · stop ${sk} · gana % / R por operación (n) ==`);
  for (const [name, fn] of [['semanal', (t) => t.w1ok === true], ['semanal + radar', (t) => t.w1ok === true && t.radarOk === true], ['semanal + radar A/B', (t) => t.w1ok === true && t.radarAB === true]]) {
    const T = trades.filter((t) => t.stopKind === sk && fn(t));
    const cell = (key) => { const s = statsR(T, key); return s.n ? `${s.win}% ${s.avg >= 0 ? '+' : ''}${s.avg}R` : '—'; };
    console.log(`    ${name.padEnd(22)} n=${String(T.length).padStart(4)} · cruce ${cell('r')} · 1:2 puro ${cell('r2_puro')} · BE en 1R → 2R ${cell('r_be1')} · 50 % en 1R + resto 2R ${cell('r_parcial1')} · parcial 80 % en 2R ${cell('r_parcial')}`);
  }
}

// Rejilla: acierto y R por objetivo (puro: hasta objetivo o stop) · entrada en el cruce o en el primer retroceso a la EMA 8.
if (process.argv.includes('--rejilla')) {
  console.log('\n== Rejilla de objetivos · stop día anterior · acierto % / R por operación (n) ==');
  for (const kind of ['cruce', 'retroceso']) {
    console.log(`  entrada: ${kind}`);
    for (const [name, fn] of [['semanal', (t) => t.w1ok === true], ['semanal + radar', (t) => t.w1ok === true && t.radarOk === true], ['semanal + radar A/B', (t) => t.w1ok === true && t.radarAB === true], ['radar A/B (sin semanal)', (t) => t.radarAB === true]]) {
      const T = trades.filter((t) => t.entryKind === kind && t.stopKind === 'diario' && fn(t));
      const cell = (key) => { const s = statsR(T, key); return s.n ? `${String(s.win).padStart(4)}% ${s.avg >= 0 ? '+' : ''}${s.avg.toFixed(2)}R` : '—'; };
      console.log(`    ${name.padEnd(24)} n=${String(T.length).padStart(4)} · 0,5R ${cell('p05')} · 0,75R ${cell('p075')} · 1R ${cell('p1')} · 1,5R ${cell('p15')} · 2R ${cell('r2_puro')} · 50 % en 1R + resto 2R ${cell('r_parcial1')} · cruce contrario ${cell('r')}`);
    }
  }
}

// Búsqueda de filtros que suban el acierto con objetivo 1,5R / 2R y stop a la entrada en +1,1R (regla del usuario, 10-10-2026).
// Cada filtro se añade a una base y se mira n, acierto y R por operación; después, los mejores se comprueban por año (tres cortes).
if (process.argv.includes('--filtros')) {
  const EXITS = [['1,5R puro', 'p15'], ['2R puro', 'r2_puro'], ['BE 1,1→1,5R', 'be11_t15'], ['BE 1,1→2R', 'be11_t2'], ['escalera→2R', 'esc_t2'], ['escalera→3R', 'esc_t3']];
  const BASES = [['semanal', (t) => t.w1ok === true], ['radar (fuerza ≥ 2)', (t) => t.radarOk === true], ['semanal + radar', (t) => t.w1ok === true && t.radarOk === true], ['semanal + radar A/B', (t) => t.w1ok === true && t.radarAB === true]];
  const FILTERS = [
    ['(base)', () => true],
    ['ADX H4 ≥ 20', (t) => t.adx4 >= 20], ['ADX H4 ≥ 25', (t) => t.adx4 >= 25], ['ADX H4 < 20 (arranque)', (t) => t.adx4 !== null && t.adx4 < 20],
    ['ADX diario ≥ 20', (t) => t.adxD >= 20], ['ADX diario ≥ 25', (t) => t.adxD >= 25], ['ADX diario < 20', (t) => t.adxD !== null && t.adxD < 20],
    ['RSI diario a favor (>50/<50)', (t) => t.rsiDok === true], ['RSI diario no extremo', (t) => t.rsiDext === false],
    ['MACD diario a favor', (t) => t.macdDok === true],
    ['EMA 200 H4 a favor', (t) => t.ema200ok], ['pendiente EMA 200 a favor', (t) => t.e200slope === true],
    ['cerca de EMA 200 (≤ 3 ATR)', (t) => t.distE200 !== null && t.distE200 <= 3], ['lejos de EMA 200 (> 3 ATR)', (t) => t.distE200 > 3],
    ['cruce fuerte (cierre ≥ 0,5 ATR tras la MA 18)', (t) => t.crossStrength >= 0.5], ['cruce suave (< 0,5 ATR)', (t) => t.crossStrength < 0.5],
    ['pocos cruces previos (≤ 2 en 30 velas)', (t) => t.crosses30 <= 2], ['mercado picado (≥ 4 cruces en 30 velas)', (t) => t.crosses30 >= 4],
    ['rompe máximo/mínimo 20 velas H4', (t) => t.donchian], ['no rompe (cruce interno)', (t) => !t.donchian],
    ['cierre diario a favor de su EMA 8', (t) => t.dayEma8ok === true],
    ['diario 8/18 a favor', (t) => t.d1ok === true], ['diario a favor y joven (≤ 10 d)', (t) => t.d1ok === true && t.d1age <= 10], ['diario a favor y maduro (> 10 d)', (t) => t.d1ok === true && t.d1age > 10],
    ['semana joven (≤ 6 sem)', (t) => t.w1age !== null && t.w1age <= 6], ['semana madura (> 6 sem)', (t) => t.w1age > 6],
    ['stop ≤ 1,5 ATR H4', (t) => t.stop_atr <= 1.5], ['stop 1,5–3 ATR H4', (t) => t.stop_atr > 1.5 && t.stop_atr <= 3], ['stop > 3 ATR H4', (t) => t.stop_atr > 3],
    ['vela Londres/NY (1–13 h NY)', (t) => t.hourNY >= 1 && t.hourNY <= 13], ['vela asiática (17–21 h NY)', (t) => t.hourNY >= 17 || t.hourNY < 1],
    ['no viernes', (t) => t.weekday !== 5], ['no lunes', (t) => t.weekday !== 1],
    ['VWAP semanal a favor', (t) => t.vwapWok === true],
    ['volatilidad diaria alta (ATR > 0,7 %)', (t) => t.atrDrel > 0.007], ['volatilidad diaria baja (ATR ≤ 0,7 %)', (t) => t.atrDrel !== null && t.atrDrel <= 0.007],
  ];
  const cell = (list, key) => { const s = statsR(list, key); return s.n ? `${String(s.win).padStart(3)}% ${s.avg >= 0 ? '+' : ''}${s.avg.toFixed(2)}R` : '     —     '; };
  for (const [bname, bfn] of BASES) {
    const B = trades.filter((t) => t.entryKind === 'cruce' && t.stopKind === 'diario' && bfn(t));
    console.log(`\n== Filtros sobre «${bname}» · stop día anterior · n=${B.length} · ${EXITS.map((e) => e[0]).join(' · ')} ==`);
    for (const [fname, ffn] of FILTERS) {
      const L = B.filter(ffn);
      console.log(`  ${fname.padEnd(46)} n=${String(L.length).padStart(4)} · ${EXITS.map(([, k]) => cell(L, k)).join(' · ')}`);
    }
    // Robustez por año de los filtros con n ≥ 40 que mejoran el R de «BE 1,1→2R» respecto a la base en los tres años.
    const years = ['2024', '2025', '2026'];
    const baseY = Object.fromEntries(years.map((y) => [y, statsR(B.filter((t) => t.year === y), 'be11_t2')]));
    const robust = [];
    for (const [fname, ffn] of FILTERS.slice(1)) {
      const L = B.filter(ffn); if (L.length < 40) continue;
      const ok = years.every((y) => { const s = statsR(L.filter((t) => t.year === y), 'be11_t2'); return s.n >= 8 && s.avg > (baseY[y].avg ?? 0); });
      if (ok) robust.push(`${fname} (n=${L.length}: ${years.map((y) => `${y} ${statsR(L.filter((t) => t.year === y), 'be11_t2').avg >= 0 ? '+' : ''}${statsR(L.filter((t) => t.year === y), 'be11_t2').avg}R`).join(', ')})`);
    }
    console.log(`  → base por año (BE 1,1→2R): ${years.map((y) => `${y} n=${baseY[y].n} ${baseY[y].win ?? '—'}% ${baseY[y].avg >= 0 ? '+' : ''}${baseY[y].avg ?? '—'}R`).join(' · ')}`);
    console.log(`  → filtros que mejoran el R en los TRES años (n ≥ 40): ${robust.length ? robust.join(' | ') : 'ninguno'}`);
  }
}

// Persistencia de la tendencia en H4 por par: tramos de velas con la EMA 8 a un lado de la media 18, en días (6 velas H4).
// Se miden todos los tramos, los alineados con la semana 8/18 y los que además tenían el radar a favor (fuerza ≥ 2).
if (process.argv.includes('--persistencia')) {
  console.log('\n== Persistencia de la tendencia en H4 (tramos 8/18 del mismo lado) · días = velas H4 / 6 ==');
  console.log('  par       tramos  mediana  ≥4 d   ≥7 d   sigue tras 4 d  | alineados con semana: n  mediana  ≥7 d  | con radar a favor: n  mediana  ≥7 d');
  const rows = [];
  for (const sym of SYMBOLS) {
    const F = frames[sym]; const { h4, w1 } = F;
    const segs = [];
    let start = null; let cur = 0;
    for (let i = SLOW; i < h4.length; i++) {
      const d = F.e8[i] > F.s18[i] ? 1 : F.e8[i] < F.s18[i] ? -1 : 0;
      if (d !== cur) { if (cur !== 0 && start !== null) segs.push({ dir: cur, from: start, to: i - 1 }); cur = d; start = i; }
    }
    const info = segs.map((g) => {
      const b = h4[g.from]; const wi = alignmentIndex(w1, b.date);
      const wOk = wi >= 0 && F.w8[wi] !== null && F.w18[wi] !== null ? (g.dir > 0 ? F.w8[wi] > F.w18[wi] : F.w8[wi] < F.w18[wi]) : false;
      const diff = biasAt(sym, b.date);
      const rOk = diff !== null && Math.sign(diff) === g.dir && Math.abs(diff) >= 3;
      return { days: (g.to - g.from + 1) / 6, wOk, rOk };
    });
    const med = (a) => { if (!a.length) return null; const x = [...a].sort((p, q) => p - q); return x[Math.floor(x.length / 2)]; };
    const pct = (a, d) => (a.length ? Math.round((100 * a.filter((v) => v >= d).length) / a.length) : null);
    const all = info.map((x) => x.days); const w = info.filter((x) => x.wOk).map((x) => x.days); const r = info.filter((x) => x.wOk && x.rOk).map((x) => x.days);
    const after4 = all.filter((v) => v >= 4); const cont = after4.length ? Math.round((100 * after4.filter((v) => v >= 7).length) / after4.length) : null;
    rows.push({ sym, n: all.length, med: med(all), p4: pct(all, 4), p7: pct(all, 7), cont, wn: w.length, wmed: med(w), wp7: pct(w, 7), rn: r.length, rmed: med(r), rp7: pct(r, 7) });
  }
  rows.sort((a, b) => (b.wp7 ?? 0) - (a.wp7 ?? 0));
  for (const x of rows) console.log(`  ${x.sym.padEnd(8)} ${String(x.n).padStart(6)}  ${String(x.med?.toFixed(1)).padStart(5)} d  ${String(x.p4).padStart(3)} %  ${String(x.p7).padStart(3)} %   ${String(x.cont).padStart(3)} % siguen ≥7  | ${String(x.wn).padStart(4)}  ${String(x.wmed?.toFixed(1)).padStart(5)} d  ${String(x.wp7).padStart(3)} %  | ${String(x.rn).padStart(4)}  ${String(x.rmed === null ? '—' : x.rmed.toFixed(1)).padStart(5)} d  ${String(x.rp7 ?? '—').padStart(3)} %`);
}

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
