// Backtest del cruce de medias "C4L" en H4: EMA 8 (azul) frente a media simple 18 (roja); compra cuando la azul cruza
// por encima de la roja, venta cuando cruza por debajo; EMA 200 (morada) como filtro de tendencia opcional, y el radar
// (nivel A/B del día) como filtro opcional. Velas H1 de MT5 agregadas a H4 (día de Nueva York), spread descontado,
// stop opcional a 2 ATR evaluado en H1. Solo lectura. Uso: node scripts/backtest-cruce-emas.mjs   (carpeta server)
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pairPip } from '../src/radar/constants.js';

const ROOT = path.resolve(process.cwd(), '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const db = new DatabaseSync('data/journal.db', { readOnly: true });
const SYMBOLS = ['EURUSD', 'GBPUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'AUDUSD', 'NZDUSD', 'EURJPY', 'GBPJPY', 'EURGBP'];
const SPREAD_PIPS = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURJPY: 1.6, GBPJPY: 2.2, EURGBP: 1.4 };
const FAST = 8, SLOW = 18, TREND = 200, ATR_N = 14, STOP_ATR = 2;
// --stop-pips 25 → stop fijo en pips para todas las variantes con stop (y referencia de R para las que no lo tienen).
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
function toH4(h1) {
  const out = [];
  let cur = null;
  h1.forEach((b, i) => {
    const slot = Math.floor(b.hour / 4);
    if (!cur || cur.date !== b.date || cur.slot !== slot) {
      if (cur) out.push(cur);
      cur = { date: b.date, slot, hour: slot * 4, o: b.o, h: b.h, l: b.l, c: b.c, first: i, last: i };
    } else { cur.h = Math.max(cur.h, b.h); cur.l = Math.min(cur.l, b.l); cur.c = b.c; cur.last = i; }
  });
  if (cur) out.push(cur);
  return out;
}
function ema(values, n) {
  const k = 2 / (n + 1);
  const out = new Array(values.length).fill(null);
  let e = null;
  values.forEach((v, i) => { e = e === null ? v : v * k + e * (1 - k); out[i] = i >= n - 1 ? e : null; });
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
/** Ratio de eficiencia de Kaufman a 20 velas: cuánto del camino recorrido es desplazamiento neto (1 = tendencia pura). */
function efficiency(closes, n = 20) {
  let sum = 0, cnt = 0;
  for (let i = n; i < closes.length; i++) {
    let noise = 0;
    for (let k = i - n + 1; k <= i; k++) noise += Math.abs(closes[k] - closes[k - 1]);
    if (noise > 0) { sum += Math.abs(closes[i] - closes[i - n]) / noise; cnt++; }
  }
  return cnt ? sum / cnt : null;
}

// Radar: sesgo diario reconstruido y nivel A/B por día (point-in-time: el del día anterior a la vela).
const biasAll = db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all();
const biasBySym = {};
for (const r of biasAll) (biasBySym[r.symbol] ||= []).push(r);
function biasBefore(list, date) {
  let lo = 0, hi = list.length - 1, idx = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (list[m].date < date) { idx = m; lo = m + 1; } else hi = m - 1; }
  if (idx < 0) return null;
  const d = list[idx].diff;
  return { sign: d > 0 ? 1 : d < 0 ? -1 : 0, level: Math.min(5, Math.round(Math.abs(d) / 2)), date: list[idx].date };
}
let conv = null;
try {
  const j = JSON.parse(readFileSync(path.join(DATA, 'conviccion-diaria.json'), 'utf8'));
  conv = new Map(j.rows.map((r) => [`${r.sym}|${r.date}`, r.tier_test]));
} catch { console.log('Sin conviccion-diaria.json: las variantes con radar se omiten.'); }

const VARIANTS = {
  cruce: { label: 'Cruce 8/18, siempre en mercado', ema200: false, stop: false, radar: false },
  cruce_stop: { label: 'Cruce 8/18 + stop a 2 ATR', ema200: false, stop: true, radar: false },
  cruce_200: { label: 'Cruce 8/18 solo a favor de la EMA 200', ema200: true, stop: false, radar: false },
  cruce_200_stop: { label: 'Cruce 8/18 a favor de la EMA 200 + stop 2 ATR', ema200: true, stop: true, radar: false },
  cruce_radar: { label: 'Cruce 8/18 solo con nivel A/B del radar a favor', ema200: false, stop: false, radar: true },
  cruce_radar_200: { label: 'Cruce 8/18 con nivel A/B y EMA 200 a favor', ema200: true, stop: false, radar: true },
  cruce_radar_200_stop: { label: 'Cruce 8/18 con nivel A/B, EMA 200 y stop 2 ATR', ema200: true, stop: true, radar: true },
  // Variantes contra el "serrucho": exigir separación mínima entre medias al cruzar, o una vela de confirmación.
  cruce_sep: { label: 'Cruce 8/18 con separación ≥ 0,15 ATR + EMA 200 + stop', ema200: true, stop: true, radar: false, sep: 0.15 },
  cruce_confirm: { label: 'Cruce 8/18 confirmado (vela siguiente a favor) + EMA 200 + stop', ema200: true, stop: true, radar: false, confirm: true },
};

const trades = [];
const trendiness = {};
for (const sym of SYMBOLS) {
  const h1 = loadH1(sym);
  const h4 = toH4(h1);
  const pip = pairPip(sym);
  const spread = SPREAD_PIPS[sym] * pip;
  const closes = h4.map((b) => b.c);
  const fast = ema(closes, FAST), slow = sma(closes, SLOW), trend = ema(closes, TREND), atr = atrSeries(h4, ATR_N);
  trendiness[sym] = efficiency(closes);
  const biasList = biasBySym[sym] || [];
  const pos = Object.fromEntries(Object.keys(VARIANTS).map((v) => [v, null]));
  const close = (v, p, i, exitPrice, reason) => {
    const pips = (p.dir > 0 ? exitPrice - p.entry : p.entry - exitPrice) / pip - SPREAD_PIPS[sym];
    trades.push({ sym, variant: v, dir: p.dir, entry_date: p.date, exit_date: h4[i].date, bars: i - p.i, pips: Math.round(pips * 10) / 10, r: Math.round((pips / p.risk_pips) * 100) / 100, reason, radar: p.radar });
    pos[v] = null;
  };
  for (let i = TREND + 1; i < h4.length; i++) {
    if (fast[i] === null || slow[i] === null || atr[i] === null) continue;
    const crossUp = fast[i - 1] <= slow[i - 1] && fast[i] > slow[i];
    const crossDown = fast[i - 1] >= slow[i - 1] && fast[i] < slow[i];
    const signalRaw = crossUp ? 1 : crossDown ? -1 : 0;
    // Confirmación: el cruce fue en la vela anterior y esta vela cierra a favor y sigue por el mismo lado.
    const prevUp = fast[i - 2] !== null && fast[i - 2] <= slow[i - 2] && fast[i - 1] > slow[i - 1];
    const prevDown = fast[i - 2] !== null && fast[i - 2] >= slow[i - 2] && fast[i - 1] < slow[i - 1];
    const signalConfirm = prevUp && fast[i] > slow[i] && h4[i].c > h4[i].o ? 1 : prevDown && fast[i] < slow[i] && h4[i].c < h4[i].o ? -1 : 0;
    const sepOk = Math.abs(fast[i] - slow[i]) >= 0.15 * atr[i];
    const bias = biasBefore(biasList, h4[i].date);
    const tier = conv && bias ? conv.get(`${sym}|${bias.date}`) : null;
    const radarDir = bias && (tier === 'A' || tier === 'B') ? bias.sign : 0;
    for (const [v, cfg] of Object.entries(VARIANTS)) {
      if (cfg.radar && !conv) continue;
      const signal = cfg.confirm ? signalConfirm : cfg.sep && !sepOk ? 0 : signalRaw;
      let p = pos[v];
      // 1) Stop intrabar (H1) durante la vela i.
      if (p && cfg.stop) {
        for (let k = h4[i].first; k <= h4[i].last; k++) {
          if (p.dir > 0 ? h1[k].l <= p.stop : h1[k].h >= p.stop) { close(v, p, i, p.stop, 'stop'); p = null; break; }
        }
      }
      // 2) Cruce en contra al cierre: se cierra (siempre con el cruce bruto: la salida no espera confirmación).
      if (p && signalRaw === -p.dir) { close(v, p, i, h4[i].c, 'cruce'); p = null; }
      // 3) Entrada al cierre si hay cruce y pasan los filtros.
      if (!p && signal !== 0) {
        if (cfg.ema200 && (trend[i] === null || (signal > 0 ? h4[i].c <= trend[i] : h4[i].c >= trend[i]))) continue;
        if (cfg.radar && radarDir !== signal) continue;
        const risk = FIXED_STOP_PIPS ? FIXED_STOP_PIPS * pip : STOP_ATR * atr[i];
        pos[v] = { dir: signal, i, date: h4[i].date, entry: h4[i].c, stop: signal > 0 ? h4[i].c - risk : h4[i].c + risk, risk_pips: risk / pip, radar: radarDir === signal ? (bias.level >= 2 ? 'A/B+fuerza2' : 'A/B') : 'no' };
      }
    }
  }
}

const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r2 = (v) => (v === null ? null : Math.round(v * 100) / 100);
function stats(list) {
  const n = list.length;
  if (!n) return { n: 0 };
  const wins = list.filter((t) => t.pips > 0);
  const g = wins.reduce((a, t) => a + t.pips, 0), l = -list.filter((t) => t.pips <= 0).reduce((a, t) => a + t.pips, 0);
  let cum = 0, peak = 0, dd = 0;
  for (const t of list) { cum += t.r; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
  return { n, win: Math.round((1000 * wins.length) / n) / 10, pips: r2(mean(list.map((t) => t.pips))), r: r2(mean(list.map((t) => t.r))), pf: l ? r2(g / l) : null, total_r: r2(cum), dd_r: r2(dd), bars: Math.round(mean(list.map((t) => t.bars))) };
}
const fmt = (s) => (s.n ? `n=${String(s.n).padStart(4)} · gana ${String(s.win).padStart(4)} % · ${s.pips >= 0 ? '+' : ''}${s.pips} pips/op · ${s.r >= 0 ? '+' : ''}${s.r}R/op · factor ${s.pf ?? '∞'} · total ${s.total_r >= 0 ? '+' : ''}${s.total_r}R · peor caída ${s.dd_r}R · ${s.bars} velas/op` : 'sin operaciones');

console.log(`Operaciones simuladas: ${trades.length} · 10 pares · 2021-09 → 2026-09 (las variantes con radar, desde 2023-10) · stop ${FIXED_STOP_PIPS ? `fijo de ${FIXED_STOP_PIPS} pips` : '2 ATR(H4)'}\n`);
for (const [v, cfg] of Object.entries(VARIANTS)) {
  const list = trades.filter((t) => t.variant === v);
  console.log(`=== ${cfg.label} ===\n  todo:   ${fmt(stats(list))}`);
  const byPair = {};
  for (const t of list) (byPair[t.sym] ||= []).push(t);
  for (const [s, l] of Object.entries(byPair).sort((a, b) => (stats(b[1]).r ?? -9) - (stats(a[1]).r ?? -9))) console.log(`  ${s}: ${fmt(stats(l))}`);
  const byYear = {};
  for (const t of list) (byYear[t.entry_date.slice(0, 4)] ||= []).push(t);
  console.log('  por año: ' + Object.entries(byYear).sort().map(([y, l]) => { const s = stats(l); return `${y} ${s.r >= 0 ? '+' : ''}${s.r}R (n=${s.n}, ${s.win} %)`; }).join(' · '));
  console.log('');
}
console.log('=== Pares más tendenciales en H4 (ratio de eficiencia a 20 velas, 5 años) ===');
for (const [s, e] of Object.entries(trendiness).sort((a, b) => b[1] - a[1])) {
  const base = stats(trades.filter((t) => t.variant === 'cruce' && t.sym === s));
  const f200 = stats(trades.filter((t) => t.variant === 'cruce_200' && t.sym === s));
  console.log(`  ${s}: eficiencia ${(100 * e).toFixed(1)} % · cruce solo ${base.r >= 0 ? '+' : ''}${base.r}R/op (factor ${base.pf}) · con EMA 200 ${f200.r >= 0 ? '+' : ''}${f200.r}R/op (factor ${f200.pf})`);
}
writeFileSync(path.join(DATA, 'backtest-cruce-emas.json'), JSON.stringify({ generated_at: new Date().toISOString(), trades, trendiness }));
console.log('\nGuardado en data/mt5/backtest-cruce-emas.json');
