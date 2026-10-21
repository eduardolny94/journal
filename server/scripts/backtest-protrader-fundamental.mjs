// Protrader 5 "como ellos": sesgo de la semana por lo fundamental (expectativas de tipos = bono a 2 años de cada divisa,
// preparado el fin de semana con datos hasta el viernes), entrada H4 de la sesión 3 (rojo-verde-verde, límite en la
// mecha del verde-rojo más próximo), stop 52,5 pips (105 en pares de rango grande) o 0,5 ATR, objetivo 1R / 1,5R / 2R.
// Pares: los que más usan los mentores con histórico de bonos a 2 años descargable: EURUSD (Tesoro EE. UU. − BCE AAA)
// y USDJPY (Tesoro EE. UU. − MoF Japón). Bonos en data/yields/*.csv (21-10-2026).
// Uso: node server/scripts/backtest-protrader-fundamental.mjs [--pares EURUSD,USDJPY] [--dir data/mt5-fxcm] [--desde 2015-01-01]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5-fxcm'));
const FROM = argOf('--desde', '2015-01-01');
const KEY = argOf('--clave', 'm20'); // filtro fundamental de las tablas por par, por año y por día (m20, m60, m120, m250)
const PAIRS = argOf('--pares', 'EURUSD,USDJPY').split(',').map((x) => x.trim().toUpperCase());
const SPREAD = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6 };
const pipOf = (s) => (s.endsWith('JPY') ? 0.01 : 0.0001);
const spreadOf = (s) => (SPREAD[s] ?? 2.5) * pipOf(s);
const MAX_H4 = 60, PENDING_H4 = 10, LOOKBACK = 40;
const YIELD_FILE = { USD: 'US2Y.csv', EUR: 'EUR2Y.csv', JPY: 'JPY2Y.csv' };

// ---- bonos a 2 años: serie diaria ordenada por fecha, valor "as of" (último ≤ fecha) y cambio a N sesiones
const yields = {};
for (const [ccy, f] of Object.entries(YIELD_FILE)) {
  try { yields[ccy] = readFileSync(path.join(ROOT, 'data', 'yields', f), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => { const [d, v] = l.split(','); return { d, v: +v }; }).filter((r) => Number.isFinite(r.v)); } catch { /* sin serie */ }
}
const idxAt = (rows, date) => { let lo = 0, hi = rows.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].d <= date) { a = m; lo = m + 1; } else hi = m - 1; } return a; };
/** Diferencial base − cotizada (en puntos) as of `date`, y su cambio a 20 y 60 sesiones y frente a la media de 100. */
function fundamental(sym, date) {
  const b = yields[sym.slice(0, 3)], q = yields[sym.slice(3)]; if (!b || !q) return null;
  const ib = idxAt(b, date), iq = idxAt(q, date); if (ib < 250 || iq < 250) return null;
  const diff = (k) => b[ib - k].v - q[iq - k].v;
  const now = diff(0); let m100 = 0; for (let k = 0; k < 100; k++) m100 += diff(k); m100 /= 100;
  return { now, m20: now - diff(20), m60: now - diff(60), m120: now - diff(120), m250: now - diff(250), vsMean: now - m100 };
}
/** Lunes de la semana (AAAA-MM-DD) y el domingo anterior (fecha "as of" de la preparación del fin de semana). */
function weekOf(date) { const t = new Date(`${date}T00:00:00Z`); const dow = (t.getUTCDay() + 6) % 7; const mon = new Date(t.getTime() - dow * 864e5); const sun = new Date(mon.getTime() - 864e5); return { monday: mon.toISOString().slice(0, 10), asOf: sun.toISOString().slice(0, 10), dow }; }

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
  const byDay = new Map(); for (const b of h1) { const d = byDay.get(b.date); if (!d) byDay.set(b.date, { h: b.h, l: b.l, c: b.c }); else { d.h = Math.max(d.h, b.h); d.l = Math.min(d.l, b.l); d.c = b.c; } }
  const ranges = [...byDay.values()].map((d) => d.h - d.l).sort((x, y) => x - y); const medDaily = ranges[Math.floor(ranges.length / 2)] || 0;
  return { h1, h4, medDaily, byDay };
}
function simR(h1, j0, jEnd, dir, entry, stop, target) {
  const risk = Math.abs(entry - stop);
  for (let j = j0; j <= jEnd; j++) { const b = h1[j]; if (dir > 0 ? b.l <= stop : b.h >= stop) return -1; if (dir > 0 ? b.h >= target : b.l <= target) return (dir > 0 ? target - entry : entry - target) / risk; }
  const b = h1[Math.min(jEnd, h1.length - 1)]; return Math.max(-1, (dir > 0 ? b.c - entry : entry - b.c) / risk);
}
const isGreen = (b) => b.c > b.o, isRed = (b) => b.c < b.o;
const trades = []; const yearly = {};
for (const sym of PAIRS) {
  const { h1, h4, medDaily, byDay } = load(sym); const pip = pipOf(sym); const sp = spreadOf(sym);
  const stopPips = medDaily / pip > 90 ? 105 : 52.5;
  // contexto por año: cambio del diferencial (pb) y del par (%)
  const days = [...byDay.keys()].sort();
  for (const y of new Set(days.map((d) => d.slice(0, 4)))) { const L = days.filter((d) => d.startsWith(y)); const f0 = fundamental(sym, L[0]), f1 = fundamental(sym, L[L.length - 1]); if (f0 && f1) (yearly[sym] ||= {})[y] = { dbp: Math.round((f1.now - f0.now) * 100), pct: +((100 * (byDay.get(L[L.length - 1]).c / byDay.get(L[0]).c - 1)).toFixed(1)), days: L.length }; }
  const pats = [];
  for (let i = 16; i < h4.length; i++) { const a = h4[i - 2], b = h4[i - 1], c = h4[i]; if (isGreen(a) && isRed(b) && isRed(c)) pats.push({ i, dir: -1, level: Math.max(a.h, b.h, c.h) }); else if (isRed(a) && isGreen(b) && isGreen(c)) pats.push({ i, dir: 1, level: Math.min(a.l, b.l, c.l) }); }
  const state = new Array(h4.length).fill(0); let cur = 0, curLevel = null, pi = 0;
  for (let i = 0; i < h4.length; i++) { if (cur !== 0 && curLevel !== null && (cur < 0 ? h4[i].h >= curLevel : h4[i].l <= curLevel)) { cur = 0; curLevel = null; } while (pi < pats.length && pats[pi].i === i) { cur = pats[pi].dir; curLevel = pats[pi].level; pi++; } state[i] = cur; }
  let busyUntil = -1;
  for (let k = 0; k < pats.length; k++) {
    const p = pats[k]; const i = p.i; const bar = h4[i]; if (bar.date < FROM || i + 2 >= h4.length) continue; if (bar.end <= busyUntil) continue;
    const dir = p.dir; const atr = bar.atr; if (!atr) continue;
    let entry = null;
    for (let q = i - 3; q >= Math.max(1, i - LOOKBACK); q--) {
      const b = h4[q], nx = h4[q + 1];
      if (dir > 0 ? (isGreen(b) && isRed(nx) && b.l < bar.c) : (isRed(b) && isGreen(nx) && b.h > bar.c)) { const lvl = dir > 0 ? b.l : b.h; if (entry === null || (dir > 0 ? lvl > entry : lvl < entry)) entry = lvl; }
    }
    if (entry === null) continue;
    const distPips = Math.abs(bar.c - entry) / pip; if (distPips > 400) continue;
    const wk = weekOf(bar.date); const f = fundamental(sym, wk.asOf); if (!f) continue;
    const sgn = (v, th) => (Math.abs(v) < th ? 0 : Math.sign(v));
    const fund = { m20: sgn(f.m20, 0.05), m60: sgn(f.m60, 0.10), m120: sgn(f.m120, 0.15), m250: sgn(f.m250, 0.20), lvl: sgn(f.vsMean, 0.05), carry: sgn(f.now, 0.25) };
    const diff = biasAt(sym, bar.date); const radar = diff !== null && Math.abs(diff) >= 2 ? Math.sign(diff) : 0;
    const entryPx = dir > 0 ? entry + sp : entry; let fillJ = -1; const fillEnd = Math.min(h1.length - 1, h4[Math.min(h4.length - 1, i + PENDING_H4)].end);
    for (let j = bar.end + 1; j <= fillEnd; j++) { const b = h1[j]; if (dir > 0 ? b.h >= bar.c + atr : b.l <= bar.c - atr) break; if (dir > 0 ? b.l <= entryPx : b.h >= entryPx) { fillJ = j; break; } }
    const base = { sym, date: bar.date, week: wk.monday, dow: wk.dow, dir, trend: state[i - 1] === dir, fund, radar, stopPips, filled: fillJ >= 0 };
    if (fillJ < 0) { trades.push({ ...base, r: {} }); continue; }
    const jEnd = Math.min(h1.length - 1, h4[Math.min(h4.length - 1, i + MAX_H4)].end);
    const r = {};
    for (const [sk, risk] of [['fijo', stopPips * pip], ['0,5 ATR', 0.5 * atr]]) {
      const stop = dir > 0 ? entryPx - risk : entryPx + risk; const tgt = (m) => (dir > 0 ? entryPx + m * risk : entryPx - m * risk);
      r[sk] = { r1: simR(h1, fillJ, jEnd, dir, entryPx, stop, tgt(1)), r15: simR(h1, fillJ, jEnd, dir, entryPx, stop, tgt(1.5)), r2: simR(h1, fillJ, jEnd, dir, entryPx, stop, tgt(2)) };
    }
    trades.push({ ...base, r }); busyUntil = jEnd;
  }
}
// ---- informes
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const pct = (a, n) => (n ? `${String(Math.round((100 * a) / n)).padStart(3)} %` : '  — ');
const vals = (L, sk, k) => L.map((t) => t.r[sk] && t.r[sk][k]).filter((x) => x !== undefined);
const st = (L, sk, k) => { const v = vals(L, sk, k); if (!v.length) return '      —      '; return `${pct(v.filter((x) => x > 0).length, v.length)} ${mean(v) >= 0 ? '+' : ''}${mean(v).toFixed(2)}R`; };
const streak = (L, sk, k) => { let m = 0, c = 0; for (const t of [...L].sort((a, b) => (a.date < b.date ? -1 : 1))) { const v = t.r[sk] && t.r[sk][k]; if (v === undefined) continue; if (v < 0) { c++; m = Math.max(m, c); } else c = 0; } return m; };
const equity = (L, sk, k, risk = 0.01) => { let e = 1, peak = 1, dd = 0; for (const t of [...L].sort((a, b) => (a.date < b.date ? -1 : 1))) { const v = t.r[sk] && t.r[sk][k]; if (v === undefined) continue; e *= 1 + risk * v; peak = Math.max(peak, e); dd = Math.max(dd, 1 - e / peak); } return { ret: e - 1, dd }; };
const filled = trades.filter((t) => t.filled);
const favor = (key) => filled.filter((t) => t.fund[key] === t.dir), contra = (key) => filled.filter((t) => t.fund[key] === -t.dir);
console.log(`\nProtrader "como ellos" · ${PAIRS.join(' + ')} · ${path.basename(DATA)} · desde ${FROM} · bonos 2 años as of viernes anterior`);
console.log(`  señales ${trades.length} · se llenan ${pct(filled.length, trades.length)} · stop fijo: ${PAIRS.map((s) => `${s} ${filled.find((t) => t.sym === s)?.stopPips ?? '?'} pips`).join(', ')}`);
const row = (name, L, sk, min = 20) => { const v = L.filter((t) => t.r[sk]); if (v.length < min) return; console.log(`  ${name.padEnd(44)} n=${String(v.length).padStart(4)} · 1R ${st(v, sk, 'r1')} · 1,5R ${st(v, sk, 'r15')} · 2R ${st(v, sk, 'r2')} · racha 2R ${streak(v, sk, 'r2')}`); };
for (const sk of ['fijo', '0,5 ATR']) {
  console.log(`\n== stop ${sk} ==`);
  row('sin filtro', filled, sk);
  row('tendencia por patrones', filled.filter((t) => t.trend), sk);
  row('fundamental: diferencial 2a sube 20 sesiones (≥5 pb)', favor('m20'), sk);
  row('   …en contra', contra('m20'), sk);
  row('fundamental: diferencial 2a sube 60 sesiones (≥10 pb)', favor('m60'), sk);
  row('   …en contra', contra('m60'), sk);
  row('fundamental: diferencial 2a sube 120 sesiones (≥15 pb)', favor('m120'), sk);
  row('   …en contra', contra('m120'), sk);
  row('fundamental: diferencial 2a sube 250 sesiones (≥20 pb)', favor('m250'), sk);
  row('   …en contra', contra('m250'), sk);
  row('fundamental 250 + tendencia por patrones', favor('m250').filter((t) => t.trend), sk);
  row('fundamental: diferencial por encima de su media 100', favor('lvl'), sk);
  row('fundamental: 20 y 60 sesiones de acuerdo', filled.filter((t) => t.fund.m20 === t.dir && t.fund.m60 === t.dir), sk);
  row('fundamental 20 + tendencia por patrones', favor('m20').filter((t) => t.trend), sk);
  row('fundamental 20 + 60 + tendencia', filled.filter((t) => t.fund.m20 === t.dir && t.fund.m60 === t.dir && t.trend), sk);
  row('carry (diferencial > 25 pb a favor)', favor('carry'), sk);
  row('radar a favor (2023→)', filled.filter((t) => t.radar === t.dir), sk);
  row('radar + fundamental 20', filled.filter((t) => t.radar === t.dir && t.fund.m20 === t.dir), sk);
}
// por par
console.log(`\n== por par · fundamental ${KEY} a favor ==`);
for (const s of PAIRS) { const L = favor(KEY).filter((t) => t.sym === s); console.log(`  ${s}: stop fijo 2R ${st(L, 'fijo', 'r2')} · 1R ${st(L, 'fijo', 'r1')} · stop 0,5 ATR 1R ${st(L, '0,5 ATR', 'r1')} · 2R ${st(L, '0,5 ATR', 'r2')} (n=${L.length}) · en contra 2R fijo ${st(contra(KEY).filter((t) => t.sym === s), 'fijo', 'r2')}`); }
// por año con contexto
console.log(`\n== por año · fundamental ${KEY} a favor · stop fijo 2R / stop 0,5 ATR 1R · contexto (cambio del diferencial 2a en pb, cambio del par) ==`);
for (const s of PAIRS) {
  console.log(`  ${s}`);
  for (const y of Object.keys(yearly[s] || {}).sort()) { if (y < FROM.slice(0, 4)) continue; const L = favor(KEY).filter((t) => t.sym === s && t.date.startsWith(y)); const C = contra(KEY).filter((t) => t.sym === s && t.date.startsWith(y)); const A = filled.filter((t) => t.sym === s && t.date.startsWith(y)); const ctx = yearly[s][y]; console.log(`    ${y}: a favor n=${String(L.length).padStart(3)} 2R ${st(L, 'fijo', 'r2')} · 1R(0,5 ATR) ${st(L, '0,5 ATR', 'r1')} | en contra n=${String(C.length).padStart(3)} 2R ${st(C, 'fijo', 'r2')} | todo n=${String(A.length).padStart(3)} 2R ${st(A, 'fijo', 'r2')} | diferencial ${ctx.dbp >= 0 ? '+' : ''}${ctx.dbp} pb · par ${ctx.pct >= 0 ? '+' : ''}${ctx.pct} %`); }
}
// día de la semana de la señal
console.log(`\n== día de la semana en que cierra el patrón · fundamental ${KEY} a favor · stop fijo 2R ==`);
for (const d of [0, 1, 2, 3, 4]) { const L = favor(KEY).filter((t) => t.dow === d); console.log(`  ${['lunes', 'martes', 'miércoles', 'jueves', 'viernes'][d].padEnd(10)} n=${String(L.length).padStart(4)} · ${st(L, 'fijo', 'r2')} · 1R(0,5 ATR) ${st(L, '0,5 ATR', 'r1')}`); }
// permutación: ¿el filtro fundamental aporta más que elegir semanas al azar?
function permutation(key, sk, k, N = 2000) {
  const obs = mean(vals(favor(key), sk, k)); const weeks = [...new Set(filled.map((t) => `${t.sym} ${t.week}`))];
  const signByWeek = new Map(); for (const t of filled) signByWeek.set(`${t.sym} ${t.week}`, t.fund[key]);
  const signs = weeks.map((w) => signByWeek.get(w)); let ge = 0;
  for (let n = 0; n < N; n++) { for (let i = signs.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [signs[i], signs[j]] = [signs[j], signs[i]]; } const m = new Map(weeks.map((w, i) => [w, signs[i]])); const v = []; for (const t of filled) { if (m.get(`${t.sym} ${t.week}`) === t.dir && t.r[sk]) v.push(t.r[sk][k]); } if (mean(v) >= obs) ge++; }
  return { obs, p: ge / N };
}
console.log('\n== permutación (2.000 barajados del sesgo semanal entre semanas): ¿el fundamental aporta? ==');
for (const [key, name] of [['m20', 'diferencial 20 sesiones'], ['m60', 'diferencial 60 sesiones'], ['m120', 'diferencial 120 sesiones'], ['m250', 'diferencial 250 sesiones']]) for (const [sk, k] of [['fijo', 'r2'], ['0,5 ATR', 'r1']]) { const { obs, p } = permutation(key, sk, k); console.log(`  ${name.padEnd(26)} stop ${sk.padEnd(8)} ${k.padEnd(3)} R medio ${obs >= 0 ? '+' : ''}${obs.toFixed(3)} · p = ${p.toFixed(3)}`); }
// cuenta
console.log('\n== cuenta al 1 % por operación (interés compuesto) ==');
for (const [name, L] of [['sin filtro', filled], ['fundamental 20 a favor', favor('m20')], ['fundamental 250 a favor', favor('m250')], ['fundamental 250 + tendencia', favor('m250').filter((t) => t.trend)]]) for (const [sk, k] of [['fijo', 'r2'], ['0,5 ATR', 'r1']]) { const e = equity(L, sk, k); const yrs = (new Date(filled.at(-1).date) - new Date(filled[0].date)) / (365.25 * 864e5); console.log(`  ${name.padEnd(28)} stop ${sk.padEnd(8)} ${k.padEnd(3)} n=${String(vals(L, sk, k).length).padStart(4)} (${(vals(L, sk, k).length / yrs).toFixed(0)}/año) · ${e.ret >= 0 ? '+' : ''}${(100 * e.ret).toFixed(0)} % en ${yrs.toFixed(1)} años · DD máx. ${(100 * e.dd).toFixed(0)} %`); }
