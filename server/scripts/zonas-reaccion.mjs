// Ranking de ZONAS de reacción medidas con la misma vara (Osler 2000): para cada familia de niveles, ¿el precio rebota más que
// en una copia del nivel desplazada al azar? Oro en M15 (2022→2026) y divisas en H1 FXCM (2015→2026).
// Toque = el precio llega a ±0,02 % del nivel viniendo del lado bueno (primer toque del día de cada nivel). Rebote = 1 y 2 velas
// después sigue del lado bueno. Operación: límite en el nivel, stop 0,25 ATR H1, objetivo 1:1, cierre a fin de día, con coste.
// Control = el mismo nivel desplazado 0,3–1 ATR diarios al azar (semilla fija). Regla de la casa: una zona "vale" si rebota más
// que su control en todos (o casi todos) los años.
// Familias: VWAP del día y ±1σ (en divisas sin volumen: TWAP), VWAP de la semana, VWAP final de ayer, cierre de ayer, apertura
// del día / semana / mes, alto-bajo de ayer, de la semana pasada, máx-mín de 20 días, altos/bajos iguales (liquidez), EMA 50 y 200
// de H1, Bandas de Bollinger H1 (20, 2), EMA 8 y SMA 18 diarias, Asia (01–09 servidor), redondos, y en el oro POC/VAH/VAL del CME.
// Uso: node server/scripts/zonas-reaccion.mjs [--oro] [--fx EURUSD,GBPUSD,USDCHF,USDJPY]
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DELTA = 0.0002, STOP = 0.25;
const SPREAD = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, XAUUSD: 3 };
const pipOf = (s) => (s === 'XAUUSD' ? 0.1 : s.endsWith('JPY') ? 0.01 : 0.0001);
const costOf = (s) => ((SPREAD[s] || 1.5) + 1) * pipOf(s);

function load(sym) {
  const m15 = path.join(ROOT, 'data/mt5-largo', `${sym}_M15.csv`), h1 = path.join(ROOT, 'data/mt5-fxcm', `${sym}_PERIOD_H1.csv`);
  const bars = []; let tf;
  if (sym === 'XAUUSD' && existsSync(m15)) { tf = 15; for (const line of readFileSync(m15, 'utf8').trim().split(/\r?\n/)) { if (/^[<a-z]/i.test(line)) continue; const f = line.split('\t'); if (f.length < 7) continue; bars.push({ date: f[0].replace(/\./g, '-'), hm: f[1].slice(0, 5), o: +f[2], h: +f[3], l: +f[4], c: +f[5], v: +f[6] || 1 }); } }
  else if (existsSync(h1)) { tf = 60; for (const line of readFileSync(h1, 'utf8').trim().split(/\r?\n/)) { if (/^[a-z]/i.test(line)) continue; const f = line.split(','); if (f.length < 5) continue; const [d, t] = f[0].split(' '); bars.push({ date: d.replace(/\./g, '-'), hm: t.slice(0, 5), o: +f[1], h: +f[2], l: +f[3], c: +f[4], v: 1 }); } }
  else return null;
  const days = []; let cur = null;
  for (const b of bars) { if (!cur || cur.date !== b.date) { cur = { date: b.date, bars: [] }; days.push(cur); } cur.bars.push(b); }
  let prevC = null; const trs = [], closes = [];
  for (const d of days) {
    d.h = Math.max(...d.bars.map((b) => b.h)); d.l = Math.min(...d.bars.map((b) => b.l)); d.o = d.bars[0].o; d.c = d.bars.at(-1).c;
    d.atr = trs.length >= 14 ? trs.slice(-14).reduce((a, b) => a + b, 0) / 14 : null;
    d.ema8 = closes.length >= 8 ? ema(closes, 8) : null; d.sma18 = closes.length >= 18 ? closes.slice(-18).reduce((a, b) => a + b, 0) / 18 : null;
    trs.push(prevC === null ? d.h - d.l : Math.max(d.h - d.l, Math.abs(d.h - prevC), Math.abs(d.l - prevC))); prevC = d.c; closes.push(d.c);
    let sv = 0, spv = 0; for (const b of d.bars) { const tp = (b.h + b.l + b.c) / 3; sv += b.v; spv += tp * b.v; } d.vwapFin = spv / sv;
  }
  // serie H1 (agregada si M15) con ATR14, EMA50, EMA200 y Bollinger 20/2, conocidos al cerrar la hora
  const hours = []; let hk = null, hb = null;
  for (const d of days) for (const b of d.bars) { const key = `${d.date} ${b.hm.slice(0, 2)}`; if (key !== hk) { hk = key; hb = { h: b.h, l: b.l, c: b.c, key }; hours.push(hb); } else { hb.h = Math.max(hb.h, b.h); hb.l = Math.min(hb.l, b.l); hb.c = b.c; } }
  const byHour = new Map(); let pc = null; const htr = [], hc = []; let e50 = null, e200 = null;
  for (const hr of hours) {
    byHour.set(hr.key, { atr: htr.length >= 14 ? htr.slice(-14).reduce((a, b) => a + b, 0) / 14 : null, e50, e200, bb: hc.length >= 20 ? bb(hc.slice(-20)) : null });
    htr.push(pc === null ? hr.h - hr.l : Math.max(hr.h - hr.l, Math.abs(hr.h - pc), Math.abs(hr.l - pc))); pc = hr.c; hc.push(hr.c);
    e50 = e50 === null ? hr.c : e50 + (2 / 51) * (hr.c - e50); e200 = e200 === null ? hr.c : e200 + (2 / 201) * (hr.c - e200);
  }
  const keys = [...byHour.keys()];
  for (const d of days) for (const b of d.bars) { const k = `${d.date} ${b.hm.slice(0, 2)}`; const i = keys.indexOf(k); b.H = byHour.get(k); b.Hprev = i > 0 ? byHour.get(keys[i - 1]) : null; }
  // semanas y meses
  const wk = (date) => { const dt = new Date(`${date}T00:00:00Z`); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(0, 10); };
  const weeks = new Map(); let wkey = null, mkey = null;
  for (const d of days) { const k = wk(d.date); if (!weeks.has(k)) weeks.set(k, { h: -Infinity, l: Infinity, open: d.o, first: d.date }); const w = weeks.get(k); w.h = Math.max(w.h, d.h); w.l = Math.min(w.l, d.l); d.wk = k; if (k !== wkey) { wkey = k; } d.weekOpen = w.open; const mk = d.date.slice(0, 7); if (mk !== mkey) { mkey = mk; } d.monthOpen = days.find((x) => x.date.slice(0, 7) === mk).o; }
  const wkeys = [...weeks.keys()].sort();
  for (const d of days) { const i = wkeys.indexOf(d.wk); d.prevWeek = i > 0 ? weeks.get(wkeys[i - 1]) : null; }
  return { days, tf };
}
function ema(xs, n) { let e = xs[0]; for (let i = 1; i < xs.length; i++) e += (2 / (n + 1)) * (xs[i] - e); return e; }
function bb(xs) { const m = xs.reduce((a, b) => a + b, 0) / xs.length; const s = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length); return { up: m + 2 * s, dn: m - 2 * s, mid: m }; }
let seed = 20261105; const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pct = (a, b) => (b ? `${((100 * a) / b).toFixed(0)} %` : '—');
const f2 = (x) => (x === null || x === undefined || Number.isNaN(x) ? '—' : (x >= 0 ? '+' : '') + x.toFixed(2));
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
function sim(bars, i, dir, entry, stop, tgt, cost) { const risk = Math.abs(entry - stop); if (!(risk > 0)) return null; for (let j = i; j < bars.length; j++) { const b = bars[j]; if (dir > 0 ? b.l <= stop : b.h >= stop) return -1 - cost / risk; if (dir > 0 ? b.h >= tgt : b.l <= tgt) return (Math.abs(tgt - entry) - cost) / risk; } return (dir * (bars.at(-1).c - entry) - cost) / risk; }

// perfil del CME (oro): el perfil del día D se usa como nivel el día siguiente
const cme = new Map();
const cmeDir = path.join(ROOT, 'data/cme-perfil/GC');
if (existsSync(cmeDir)) for (const f of readdirSync(cmeDir)) { try { const j = JSON.parse(readFileSync(path.join(cmeDir, f), 'utf8')); cme.set(j.date, j); } catch { /* ignora */ } }

function estaticos(days, idx) {
  const d = days[idx], p = days[idx - 1]; const L = [];
  L.push(['cierre de ayer', p.c], ['apertura del día', d.o], ['VWAP final de ayer', p.vwapFin]);
  if (d.weekOpen !== d.o) L.push(['apertura de la semana', d.weekOpen]); if (d.monthOpen !== d.o && d.monthOpen !== d.weekOpen) L.push(['apertura del mes', d.monthOpen]);
  L.push(['alto/bajo de ayer', p.h], ['alto/bajo de ayer', p.l]);
  if (d.prevWeek) L.push(['alto/bajo semana pasada', d.prevWeek.h], ['alto/bajo semana pasada', d.prevWeek.l]);
  if (idx >= 20) { const w = days.slice(idx - 20, idx); L.push(['máx/mín 20 días', Math.max(...w.map((x) => x.h))], ['máx/mín 20 días', Math.min(...w.map((x) => x.l))]); }
  if (p.ema8) L.push(['EMA 8 diaria', p.ema8]); if (p.sma18) L.push(['SMA 18 diaria', p.sma18]);
  // altos/bajos iguales (liquidez): dos extremos diarios de los últimos 10 días a menos de 0,1 ATR
  if (idx >= 10 && d.atr) { const w = days.slice(idx - 10, idx); const seen = []; for (let a = 0; a < w.length; a++) for (let b2 = a + 1; b2 < w.length; b2++) { if (Math.abs(w[a].h - w[b2].h) <= 0.1 * d.atr) { const lv = (w[a].h + w[b2].h) / 2; if (!seen.some((s) => Math.abs(s - lv) < 0.2 * d.atr)) { seen.push(lv); L.push(['altos/bajos iguales', lv]); } } if (Math.abs(w[a].l - w[b2].l) <= 0.1 * d.atr) { const lv = (w[a].l + w[b2].l) / 2; if (!seen.some((s) => Math.abs(s - lv) < 0.2 * d.atr)) { seen.push(lv); L.push(['altos/bajos iguales', lv]); } } } }
  if (d.atr) { const lo = d.o - 1.5 * d.atr, hi = d.o + 1.5 * d.atr; const step = d.o > 500 ? 50 : d.o > 50 ? 0.5 : 0.005; for (let x = Math.ceil(lo / step) * step; x <= hi; x += step) L.push(['redondos', Number(x.toFixed(4))]); }
  const cp = cme.get(p.date); if (cp) { L.push(['CME POC', cp.poc], ['CME VAH/VAL', cp.vah], ['CME VAH/VAL', cp.val]); for (const g of (cp.grandes || []).slice(0, 5)) L.push(['CME operación grande', g.price]); }
  return L;
}

function medir(sym) {
  const data = load(sym); if (!data) return null; const { days, tf } = data; const cost = costOf(sym); const rows = [];
  const H1 = tf === 60; const k1 = H1 ? 1 : 1, k2 = H1 ? 2 : 2; // rebote a 1 y 2 velas (15/30 min en M15, 1/2 h en H1)
  const asiaEnd = H1 ? '09:00' : '09:00';
  for (let idx = 20; idx < days.length; idx++) {
    const d = days[idx]; if (!d.atr) continue; const y = d.date.slice(0, 4);
    // VWAP del día y de la semana por vela
    let sv = 0, spv = 0, sppv = 0; const vw = []; let wsv = d.wsv0 || 0;
    const wstart = days.slice(0, idx).reverse().find((x) => x.wk !== d.wk); // acumulado de la semana hasta ayer
    let W = { sv: 0, spv: 0 }; for (let j = idx - 1; j >= 0 && days[j].wk === d.wk; j--) for (const b of days[j].bars) { const tp = (b.h + b.l + b.c) / 3; W.sv += b.v; W.spv += tp * b.v; }
    for (const b of d.bars) { const tp = (b.h + b.l + b.c) / 3; sv += b.v; spv += tp * b.v; sppv += tp * tp * b.v; W.sv += b.v; W.spv += tp * b.v; const m = spv / sv; vw.push({ m, s: Math.sqrt(Math.max(0, sppv / sv - m * m)), w: W.spv / W.sv }); }
    const asia = { h: -Infinity, l: Infinity };
    const items = [];
    for (const [fam, lv] of estaticos(days, idx)) { items.push({ fam, lv, ctrl: false }); items.push({ fam, lv: lv + (rnd() < 0.5 ? -1 : 1) * (0.3 + 0.7 * rnd()) * d.atr, ctrl: true }); }
    const dyn = [['VWAP del día', (i) => vw[i - 1].m, 0], ['VWAP +1σ', (i) => vw[i - 1].m + vw[i - 1].s, 1], ['VWAP −1σ', (i) => vw[i - 1].m - vw[i - 1].s, -1], ['VWAP de la semana', (i) => vw[i - 1].w, 0],
      ['EMA 50 H1', (i) => d.bars[i].Hprev?.e50, 0], ['EMA 200 H1', (i) => d.bars[i].Hprev?.e200, 0], ['Bollinger H1 sup/inf', (i) => d.bars[i].Hprev?.bb?.up, 1], ['Bollinger H1 sup/inf', (i) => d.bars[i].Hprev?.bb?.dn, -1],
      ['alto/bajo de Asia', (i) => (d.bars[i].hm >= asiaEnd ? asia.h : null), 1], ['alto/bajo de Asia', (i) => (d.bars[i].hm >= asiaEnd ? asia.l : null), -1]];
    for (const [fam, f, side] of dyn) { for (const ctrl of [false, true]) { const shift = ctrl ? (rnd() < 0.5 ? -1 : 1) * (0.3 + 0.7 * rnd()) * d.atr : 0; items.push({ fam, f: (i) => { const v = f(i); return v === null || v === undefined ? null : v + shift; }, side, ctrl }); } }
    const minI = H1 ? 1 : 9;
    for (const it of items) {
      for (let i = 1; i < d.bars.length - 2; i++) {
        const b = d.bars[i], pb = d.bars[i - 1]; if (b.hm < asiaEnd) { asia.h = Math.max(asia.h, b.h); asia.l = Math.min(asia.l, b.l); }
        if (it.f && i < minI) continue; const atrH = b.H?.atr ?? b.Hprev?.atr; if (!atrH) continue;
        const lv = it.f ? it.f(i) : it.lv; if (lv === null || lv === undefined || !Number.isFinite(lv)) continue;
        const dl = DELTA * lv; let dir = 0;
        if (pb.c > lv + dl && b.l <= lv + dl) dir = 1; else if (pb.c < lv - dl && b.h >= lv - dl) dir = -1;
        if (!dir) continue; if (it.side && ((it.side > 0 && dir === 1) || (it.side < 0 && dir === -1))) continue;
        const b1 = d.bars[i + k1], b2 = d.bars[i + k2]; const entry = lv + dir * dl, stop = entry - dir * STOP * atrH;
        rows.push({ sym, y, fam: it.fam, ctrl: it.ctrl, r1: dir > 0 ? b1.c > lv : b1.c < lv, r2: dir > 0 ? b2.c > lv : b2.c < lv, t: sim(d.bars, i, dir, entry, stop, entry + dir * STOP * atrH, cost) });
        break;
      }
    }
  }
  return rows;
}

function ranking(rows, title) {
  console.log(`\n==== ${title} ====`);
  console.log(`  ${'zona'.padEnd(26)} ${'n'.padStart(6)} ${'rebote 1v'.padStart(9)} ${'ctrl'.padStart(6)} ${'dif'.padStart(6)} ${'rebote 2v'.padStart(9)} ${'ctrl'.padStart(6)} ${'años>ctrl'.padStart(9)} ${'1:1 real'.padStart(8)} ${'ctrl'.padStart(6)} ${'R̄ neto'.padStart(7)}`);
  const fams = [...new Set(rows.map((r) => r.fam))];
  const out = [];
  for (const fam of fams) {
    const real = rows.filter((r) => r.fam === fam && !r.ctrl), ctl = rows.filter((r) => r.fam === fam && r.ctrl); if (real.length < 50) continue;
    const p = (rs, k) => (rs.length ? rs.filter((r) => r[k]).length / rs.length : null);
    const years = [...new Set(real.map((r) => r.y))].sort(); let win = 0, tot = 0;
    for (const yy of years) { const a = real.filter((r) => r.y === yy), c = ctl.filter((r) => r.y === yy); if (a.length < 20 || c.length < 20) continue; tot++; if (p(a, 'r1') > p(c, 'r1')) win++; }
    out.push({ fam, n: real.length, b1: p(real, 'r1'), c1: p(ctl, 'r1'), b2: p(real, 'r2'), c2: p(ctl, 'r2'), win, tot, w1: real.filter((r) => r.t > 0).length / real.length, wc: ctl.length ? ctl.filter((r) => r.t > 0).length / ctl.length : null, rn: mean(real.map((r) => r.t)) });
  }
  out.sort((a, b) => (b.b1 - b.c1) - (a.b1 - a.c1));
  for (const o of out) console.log(`  ${o.fam.padEnd(26)} ${String(o.n).padStart(6)} ${pct(o.b1 * 100, 100).padStart(9)} ${pct(o.c1 * 100, 100).padStart(6)} ${((o.b1 - o.c1) * 100).toFixed(0).padStart(5)}p ${pct(o.b2 * 100, 100).padStart(9)} ${pct(o.c2 * 100, 100).padStart(6)} ${`${o.win}/${o.tot}`.padStart(9)} ${pct(o.w1 * 100, 100).padStart(8)} ${(o.wc === null ? '—' : pct(o.wc * 100, 100)).padStart(6)} ${f2(o.rn).padStart(7)}`);
}

const ORO = !process.argv.includes('--fx') || process.argv.includes('--oro');
if (ORO) { const rows = medir('XAUUSD'); ranking(rows, 'ORO · M15 2022-08 → 2026-10 · rebote a 15/30 min · 1:1 con stop 0,25 ATR H1 y 0,4 $ de coste'); }
const FX = (arg('--fx', process.argv.includes('--oro') ? '' : 'EURUSD,GBPUSD,USDCHF,USDJPY') || '').split(',').filter(Boolean);
let all = [];
for (const s of FX) { const rows = medir(s); if (!rows) continue; all = all.concat(rows); ranking(rows, `${s} · H1 FXCM 2015 → 2026 · rebote a 1/2 h · 1:1 con stop 0,25 ATR H1 y spread + 1 pip`); }
if (FX.length > 1) ranking(all, `DIVISAS juntas (${FX.join(', ')})`);
