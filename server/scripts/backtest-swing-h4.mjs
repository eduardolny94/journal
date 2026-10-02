// Backtest de la estrategia swing en H4 (docs/ESTRATEGIA-SWING-H4.md): dirección del radar (sesgo diario
// reconstruido a fecha) + patrón técnico en H4 + stop/objetivo por estructura y ATR. Velas H1 de MT5 agregadas a H4
// (hora del servidor = Nueva York + 7 h, así que el día del servidor es el día de trading de Nueva York).
// Solo lectura sobre la base de datos. Uso: node scripts/backtest-swing-h4.mjs   (desde la carpeta server)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pairPip } from '../src/radar/constants.js';

const ROOT = path.resolve(process.cwd(), '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const db = new DatabaseSync('data/journal.db', { readOnly: true });
const SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP'];
const SPREAD_PIPS = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURJPY: 1.6, GBPJPY: 2.2, EURGBP: 1.4 };
const MAX_BARS = 30; // salida por tiempo: 30 velas H4 (5 días de trading)
const ATR_N = 14;
// --stop-pips 25 → stop fijo en pips en todos los patrones (en vez del stop por estructura/ATR).
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
/** Agrega H1 → H4 alineadas a la medianoche del servidor (00, 04, 08, 12, 16, 20). */
function toH4(h1) {
  const out = [];
  let cur = null;
  h1.forEach((b, i) => {
    const slot = Math.floor(b.hour / 4);
    if (!cur || cur.date !== b.date || cur.slot !== slot) {
      if (cur) out.push(cur);
      cur = { date: b.date, slot, hour: slot * 4, o: b.o, h: b.h, l: b.l, c: b.c, first: i, last: i };
    } else {
      cur.h = Math.max(cur.h, b.h);
      cur.l = Math.min(cur.l, b.l);
      cur.c = b.c;
      cur.last = i;
    }
  });
  if (cur) out.push(cur);
  return out;
}
function ema(values, n) {
  const k = 2 / (n + 1);
  const out = new Array(values.length).fill(null);
  let e = null;
  values.forEach((v, i) => {
    e = e === null ? v : v * k + e * (1 - k);
    out[i] = i >= n - 1 ? e : null;
  });
  return out;
}
function sma(values, n) {
  const out = new Array(values.length).fill(null);
  let s = 0;
  for (let i = 0; i < values.length; i++) { s += values[i]; if (i >= n) s -= values[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
}
function atrSeries(bars, n) {
  const out = new Array(bars.length).fill(null);
  let a = null;
  for (let i = 1; i < bars.length; i++) {
    const tr = Math.max(bars[i].h - bars[i].l, Math.abs(bars[i].h - bars[i - 1].c), Math.abs(bars[i].l - bars[i - 1].c));
    a = a === null ? tr : (a * (n - 1) + tr) / n;
    if (i >= n) out[i] = a;
  }
  return out;
}

// Sesgo diario reconstruido (point-in-time: se usa el último sesgo con fecha anterior al día de la vela).
const biasAll = db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all();
const biasBySym = {};
for (const r of biasAll) (biasBySym[r.symbol] ||= []).push(r);
function biasBefore(list, date) {
  let lo = 0, hi = list.length - 1, idx = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m].date < date) { idx = m; lo = m + 1; } else hi = m - 1; }
  if (idx < 0) return null;
  const d = list[idx].diff;
  return { diff: d, level: Math.min(5, Math.round(Math.abs(d) / 2)), sign: d > 0 ? 1 : d < 0 ? -1 : 0, date: list[idx].date };
}
// Nivel de convicción por día y par (exportado por scripts/exportar-conviccion-diaria.mjs), si existe.
let conv = null;
try {
  const j = JSON.parse(readFileSync(path.join(DATA, 'conviccion-diaria.json'), 'utf8'));
  conv = { split: j.split_date, map: new Map(j.rows.map((r) => [`${r.sym}|${r.date}`, r])) };
  console.log(`Convicción diaria: ${j.rows.length} filas · fuera de muestra desde ${j.split_date}`);
} catch { console.log('Sin conviccion-diaria.json: no se mide el nivel A/B (ejecuta exportar-conviccion-diaria.mjs).'); }

/** Simula sobre H1 desde la vela h1Start: stop, objetivos fijos, trailing por ATR y salida por tiempo. */
function simulate(h1, h1Start, h1End, dir, entry, stop, atr, spread) {
  const risk = Math.abs(entry - stop);
  const res = { tp: { 1: null, 2: null, 3: null }, stopped: null, trail_r: null, time_r: null, mfe: 0, mae: 0 };
  let trailStop = stop;
  let best = entry;
  let trailOpen = true;
  let fixedOpen = true;
  for (let i = h1Start; i <= h1End && (fixedOpen || trailOpen); i++) {
    const b = h1[i];
    const adverse = dir > 0 ? (entry - b.l) / risk : (b.h - entry) / risk;
    const favorable = dir > 0 ? (b.h - entry) / risk : (entry - b.l) / risk;
    res.mae = Math.max(res.mae, adverse);
    res.mfe = Math.max(res.mfe, favorable);
    if (fixedOpen) {
      const hitStop = dir > 0 ? b.l <= stop : b.h >= stop; // conservador: stop antes que objetivo en la misma vela
      if (hitStop) { res.stopped = i; fixedOpen = false; }
      else {
        for (const t of [1, 2, 3]) if (res.tp[t] === null && favorable >= t) res.tp[t] = i;
        if (res.tp[3] !== null) fixedOpen = false;
      }
    }
    if (trailOpen) {
      const hitTrail = dir > 0 ? b.l <= trailStop : b.h >= trailStop;
      if (hitTrail) { res.trail_r = (dir > 0 ? trailStop - entry : entry - trailStop) / risk; trailOpen = false; }
      else {
        best = dir > 0 ? Math.max(best, b.c) : Math.min(best, b.c);
        const t = dir > 0 ? best - 2 * atr : best + 2 * atr; // trailing a 2 ATR(H4) del mejor cierre
        if (dir > 0 ? t > trailStop : t < trailStop) trailStop = t;
      }
    }
  }
  const last = h1[Math.min(h1End, h1.length - 1)];
  const closeR = (dir > 0 ? last.c - entry : entry - last.c) / risk;
  if (trailOpen) res.trail_r = closeR;
  res.time_r = res.stopped !== null ? -1 : closeR;
  const cost = spread / risk; // el spread se paga una vez, en R
  const hit = (t) => res.tp[t] !== null && (res.stopped === null || res.tp[t] < res.stopped);
  const rFixed = (t) => (res.stopped !== null && !hit(t) ? -1 : hit(t) ? t : res.time_r) - cost;
  return { r1: rFixed(1), r2: rFixed(2), r3: rFixed(3), hit1: hit(1), hit2: hit(2), r_trail: res.trail_r - cost, r_time: res.time_r - cost, mfe: res.mfe, mae: res.mae };
}

// ---------- Patrones (todos evaluados al cierre de la vela H4 i, en la dirección dir) ----------
function swingLow(h4, i, n) { let v = Infinity; for (let k = i - n; k < i; k++) v = Math.min(v, h4[k].l); return v; }
function swingHigh(h4, i, n) { let v = -Infinity; for (let k = i - n; k < i; k++) v = Math.max(v, h4[k].h); return v; }

const PATTERNS = {
  // 1. Retroceso a la EMA 20 H4 y cierre a favor: tendencia H4 (EMA20 > EMA50), la vela toca la EMA20 y cierra a favor por encima de ella.
  ema20: (h4, i, ind, dir) => {
    const b = h4[i];
    const e20 = ind.ema20[i], e50 = ind.ema50[i];
    if (e20 === null || e50 === null) return null;
    if (dir > 0 && !(e20 > e50 && b.l <= e20 && b.c > e20 && b.c > b.o)) return null;
    if (dir < 0 && !(e20 < e50 && b.h >= e20 && b.c < e20 && b.c < b.o)) return null;
    const stop = dir > 0 ? Math.min(b.l, h4[i - 1].l) - 0.2 * ind.atr[i] : Math.max(b.h, h4[i - 1].h) + 0.2 * ind.atr[i];
    return { entry: b.c, stop };
  },
  // 2. Barrido de liquidez y recuperación (vela FU): la vela rompe el mínimo de las 6 H4 anteriores y cierra de vuelta por encima, a favor.
  sweep: (h4, i, ind, dir) => {
    const b = h4[i];
    if (dir > 0) {
      const sl = swingLow(h4, i, 6);
      if (!(b.l < sl && b.c > sl && b.c > b.o)) return null;
      return { entry: b.c, stop: b.l - 0.1 * ind.atr[i] };
    }
    const sh = swingHigh(h4, i, 6);
    if (!(b.h > sh && b.c < sh && b.c < b.o)) return null;
    return { entry: b.c, stop: b.h + 0.1 * ind.atr[i] };
  },
  // 3. Reentrada en un FVG H4 a favor: hueco entre la vela i-2 y la i (impulso) dentro de las últimas 12 velas; orden
  //    limitada en el borde del hueco, que se ejecuta cuando la vela i lo toca (sin mirar cómo cierra esa vela: sin futuro).
  fvg: (h4, i, ind, dir) => {
    for (let j = i - 1; j >= i - 12 && j >= 2; j--) {
      const a = h4[j - 2], c = h4[j];
      if (dir > 0 && c.l > a.h) {
        const top = c.l, bottom = a.h;
        let touched = false;
        for (let k = j + 1; k < i; k++) if (h4[k].l <= top) { touched = true; break; }
        if (touched) continue;
        if (h4[i].l <= top) return { entry: Math.min(top, h4[i].o), stop: bottom - 0.2 * ind.atr[i - 1], limit: true };
        return null;
      }
      if (dir < 0 && c.h < a.l) {
        const bottom = c.h, top = a.l;
        let touched = false;
        for (let k = j + 1; k < i; k++) if (h4[k].h >= bottom) { touched = true; break; }
        if (touched) continue;
        if (h4[i].h >= bottom) return { entry: Math.max(bottom, h4[i].o), stop: top + 0.2 * ind.atr[i - 1], limit: true };
        return null;
      }
    }
    return null;
  },
  // 0. Referencia: solo el sesgo, sin patrón. Entrada al cierre de la primera H4 del día (04:00 servidor), stop a 1,5 ATR.
  sesgo_solo: (h4, i, ind, dir) => {
    if (h4[i].hour !== 4) return null;
    return { entry: h4[i].c, stop: dir > 0 ? h4[i].c - 1.5 * ind.atr[i] : h4[i].c + 1.5 * ind.atr[i] };
  },
  // 0b. Igual, con stop ancho (3 ATR H4 ≈ un día de rango): el sesgo es una deriva, no una entrada precisa.
  sesgo_ancho: (h4, i, ind, dir) => {
    if (h4[i].hour !== 4) return null;
    return { entry: h4[i].c, stop: dir > 0 ? h4[i].c - 3 * ind.atr[i] : h4[i].c + 3 * ind.atr[i] };
  },
  // 4. Ruptura del canal Donchian 20 H4 a favor (continuación): cierre por encima del máximo de las 20 H4 anteriores.
  donchian: (h4, i, ind, dir) => {
    const b = h4[i];
    if (dir > 0) { const hh = swingHigh(h4, i, 20); if (!(b.c > hh)) return null; return { entry: b.c, stop: b.c - 1.5 * ind.atr[i] }; }
    const ll = swingLow(h4, i, 20); if (!(b.c < ll)) return null; return { entry: b.c, stop: b.c + 1.5 * ind.atr[i] };
  },
};
const SESSION_OK = (hour) => hour === 8 || hour === 12 || hour === 16; // cierres H4 de 12:00, 16:00 y 20:00 servidor = Londres y Nueva York

const records = [];
for (const sym of SYMBOLS) {
  const h1 = loadH1(sym);
  const h4 = toH4(h1);
  const pip = pairPip(sym);
  const closes = h4.map((b) => b.c);
  const ind = { ema20: ema(closes, 20), ema50: ema(closes, 50), atr: atrSeries(h4, ATR_N), ema8: ema(closes, 8), sma18: sma(closes, 18), ema200: ema(closes, 200) };
  const biasList = biasBySym[sym] || [];
  // Tendencia diaria de 20 días (cierre del día anterior frente a 20 días antes), point-in-time.
  const dayClose = new Map();
  for (const b of h4) dayClose.set(b.date, b.c);
  const dates = [...dayClose.keys()];
  const dayIdx = new Map(dates.map((d, i) => [d, i]));
  const openUntil = {}; // una operación a la vez por par, patrón y dirección (cada patrón se mide por separado)
  for (let i = 60; i < h4.length - MAX_BARS; i++) {
    if (ind.atr[i] === null || ind.atr[i - 1] === null) continue;
    const bias = biasBefore(biasList, h4[i].date);
    const di = dayIdx.get(h4[i].date);
    const trendD = di !== undefined && di >= 21 ? (dayClose.get(dates[di - 1]) > dayClose.get(dates[di - 21]) ? 1 : -1) : 0;
    for (const dir of [1, -1]) {
      for (const [name, fn] of Object.entries(PATTERNS)) {
        const key = `${name}:${dir}`;
        if (h4[i].last <= (openUntil[key] ?? -1)) continue;
        const sig = fn(h4, i, ind, dir);
        if (!sig) continue;
        if (FIXED_STOP_PIPS) sig.stop = dir > 0 ? sig.entry - FIXED_STOP_PIPS * pip : sig.entry + FIXED_STOP_PIPS * pip;
        const risk = Math.abs(sig.entry - sig.stop);
        if (!FIXED_STOP_PIPS && risk < 0.3 * ind.atr[i]) continue;
        let h1Start = h4[i].last + 1; // entrada al cierre de la vela i: la simulación empieza en la H1 siguiente
        if (sig.limit) { // orden limitada: se ejecuta en la H1 de la vela i que toca el precio de entrada
          h1Start = -1;
          for (let k = h4[i].first; k <= h4[i].last; k++) if (dir > 0 ? h1[k].l <= sig.entry : h1[k].h >= sig.entry) { h1Start = k; break; }
          if (h1Start < 0) continue;
        }
        const h1End = Math.min(h1.length - 1, h4[Math.min(h4.length - 1, i + MAX_BARS)].last);
        const sim = simulate(h1, h1Start, h1End, dir, sig.entry, sig.stop, ind.atr[i], SPREAD_PIPS[sym] * pip);
        const cv = conv && bias ? conv.map.get(`${sym}|${bias.date}`) : null; // convicción del mismo día que el sesgo usado
        records.push({
          sym, date: h4[i].date, hour: h4[i].hour, pattern: name, dir, session: SESSION_OK(h4[i].hour),
          bias_level: bias ? bias.level : null, bias_aligned: bias ? bias.sign === dir : null, bias_against: bias ? bias.sign === -dir && bias.level >= 2 : null,
          tier: cv ? cv.tier_test : null, oos: cv ? bias.date >= conv.split : null, p5: cv ? cv.p5_test : null,
          trend_aligned: trendD === dir, risk_pips: risk / pip,
          // Contexto de medias "C4L": EMA 8 sobre/bajo la media 18, y precio frente a la EMA 200, en el sentido de la operación.
          ma_aligned: ind.ema8[i] !== null && ind.sma18[i] !== null ? (dir > 0 ? ind.ema8[i] > ind.sma18[i] : ind.ema8[i] < ind.sma18[i]) : null,
          ema200_aligned: ind.ema200[i] !== null ? (dir > 0 ? h4[i].c > ind.ema200[i] : h4[i].c < ind.ema200[i]) : null,
          ...sim,
        });
        openUntil[key] = h1End;
      }
    }
  }
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);
function stats(list) {
  const n = list.length;
  const w = (key) => (n ? Math.round((1000 * list.filter((r) => r[key]).length) / n) / 10 : null);
  return { n, win1: w('hit1'), win2: w('hit2'), exp1: r2(mean(list.map((r) => r.r1))), exp2: r2(mean(list.map((r) => r.r2))), exp3: r2(mean(list.map((r) => r.r3))), exp_trail: r2(mean(list.map((r) => r.r_trail))), exp_time: r2(mean(list.map((r) => r.r_time))), risk: r2(mean(list.map((r) => r.risk_pips))) };
}
const fmt = (s) => (s.n ? `n=${String(s.n).padStart(5)} · 1R ${String(s.win1).padStart(4)} % · 2R ${String(s.win2).padStart(4)} % · esperanza 1R ${s.exp1 >= 0 ? '+' : ''}${s.exp1} · 2R ${s.exp2 >= 0 ? '+' : ''}${s.exp2} · 3R ${s.exp3 >= 0 ? '+' : ''}${s.exp3} · trailing ${s.exp_trail >= 0 ? '+' : ''}${s.exp_trail} · tiempo ${s.exp_time >= 0 ? '+' : ''}${s.exp_time} · riesgo ${s.risk} pips` : 'sin operaciones');

const withBias = records.filter((r) => r.bias_level !== null);
console.log(`Stop: ${FIXED_STOP_PIPS ? `fijo de ${FIXED_STOP_PIPS} pips` : 'por estructura/ATR'}\nSeñales: ${records.length} (5 años, 10 pares) · con sesgo disponible: ${withBias.length} (${withBias[0] ? withBias.reduce((a, r) => (r.date < a ? r.date : a), '9') : ''} → ${withBias.reduce((a, r) => (r.date > a ? r.date : a), '0')})\n`);
const FILTERS = [
  ['técnica sola (5 años, ambas direcciones)', (r) => true, records],
  ['técnica sola (3 años con sesgo, ambas direcciones)', (r) => true, withBias],
  ['sesgo ≥ 1 a favor', (r) => r.bias_aligned && r.bias_level >= 1, withBias],
  ['sesgo ≥ 2 a favor', (r) => r.bias_aligned && r.bias_level >= 2, withBias],
  ['sesgo ≥ 3 a favor', (r) => r.bias_aligned && r.bias_level >= 3, withBias],
  ['sesgo ≥ 3 a favor + sesión Londres/NY', (r) => r.bias_aligned && r.bias_level >= 3 && r.session, withBias],
  ['sesgo ≥ 3 a favor + tendencia 20 d a favor', (r) => r.bias_aligned && r.bias_level >= 3 && r.trend_aligned, withBias],
  ['sesgo ≥ 2 en contra (lo que NO hay que hacer)', (r) => r.bias_against, withBias],
  ['nivel A o B a favor (todo el periodo)', (r) => r.bias_aligned && (r.tier === 'A' || r.tier === 'B'), withBias],
  ['nivel A a favor (todo el periodo)', (r) => r.bias_aligned && r.tier === 'A', withBias],
  ['nivel A o B a favor, solo fuera de muestra', (r) => r.bias_aligned && r.oos && (r.tier === 'A' || r.tier === 'B'), withBias],
  ['nivel A a favor, solo fuera de muestra', (r) => r.bias_aligned && r.oos && r.tier === 'A', withBias],
  ['fuerza ≥ 3 + nivel A o B a favor (todo el periodo)', (r) => r.bias_aligned && r.bias_level >= 3 && (r.tier === 'A' || r.tier === 'B'), withBias],
  ['fuerza ≥ 3 + nivel A o B, solo fuera de muestra', (r) => r.bias_aligned && r.bias_level >= 3 && r.oos && (r.tier === 'A' || r.tier === 'B'), withBias],
];
for (const name of Object.keys(PATTERNS)) {
  console.log(`\n=== Patrón: ${name} ===`);
  for (const [label, f, src] of FILTERS) console.log(`  ${label.padEnd(50)} ${fmt(stats(src.filter((r) => r.pattern === name && f(r))))}`);
}
console.log('\n=== Mejor combinación por par y por año (sesgo ≥ 3 a favor) ===');
const best = withBias.filter((r) => r.bias_aligned && r.bias_level >= 3);
for (const name of Object.keys(PATTERNS)) {
  const list = best.filter((r) => r.pattern === name);
  console.log(`\n${name}: ${fmt(stats(list))}`);
  const byPair = {};
  for (const r of list) (byPair[r.sym] ||= []).push(r);
  console.log('  por par: ' + Object.entries(byPair).map(([s, l]) => { const st = stats(l); return `${s} ${st.win2}% ${st.exp2 >= 0 ? '+' : ''}${st.exp2}R (n=${st.n})`; }).join(' · '));
  const byYear = {};
  for (const r of list) (byYear[r.date.slice(0, 4)] ||= []).push(r);
  console.log('  por año: ' + Object.entries(byYear).map(([y, l]) => { const st = stats(l); return `${y} ${st.win2}% ${st.exp2 >= 0 ? '+' : ''}${st.exp2}R (n=${st.n})`; }).join(' · '));
}
writeFileSync(path.join(ROOT, 'data', 'mt5', 'backtest-swing-h4.json'), JSON.stringify({ generated_at: new Date().toISOString(), records }, null, 0));
console.log('\nRegistros guardados en data/mt5/backtest-swing-h4.json');
