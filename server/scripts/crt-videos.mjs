// Reglas de los tres vídeos de CRT (@Clutiffx_, Nasdaq semanal; CRT en Nasdaq con vela de 07:00 NY; LiamCTD "Wall
// Street"/CTD en EURUSD-GBPUSD-DXY), convertidas en pruebas medibles (18-10-2026). Velas H1; hora de servidor = NY + 7.
//   P1 Tendencia mayor ("rango pendiente" vs "reiniciado"): CRT en H4 solo cuando la entrada va con la tendencia
//      diaria y la barrida es del lado contrario a la tendencia. Proxies de tendencia: D1 EMA8>SMA18, vela diaria
//      anterior, vela semanal anterior cerró fuera del rango de la previa (continuación), última vela lunes/viernes.
//   P2 Modelo Nueva York (vídeo 3): rango = vela H1 de 08:00 NY; manipulación = vela de 09:00 (o 10:00) que barre un
//      lado con mecha y cierra dentro; entrada al cierre; stop tras la mecha; objetivos lado opuesto, 1,5R, 2R, 3R;
//      salida 16:00 NY. Con y sin filtro de tendencia.
//   P3 Turtle soup horario (vídeo 2, vela de 07:00): por cada hora NY, vela H1 que barre el extremo de la vela anterior
//      y cierra dentro de ella; objetivo extremo opuesto de la vela anterior y 1R/2R; stop tras la mecha; máx. 8 h.
//      Tabla por hora: cuáles son las "mejores velas".
//   P4 SMT (vídeo 3): en el modelo NY y en Londres (rango asiático), EURUSD barre y GBPUSD no (o al revés) → entrar en
//      el que NO barrió, hacia el lado opuesto. Comparado con sin divergencia.
//   P5 Objetivo 1:1 contra tendencia (vídeo 2) frente a lado opuesto a favor.
// Uso: node server/scripts/crt-videos.mjs --dir data/mt5-fxcm --desde 2015-01-01 [--pares EURUSD,GBPUSD]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5-fxcm'));
const FROM = argOf('--desde', '2015-01-01');
const ONLY = argOf('--pares', null) ? argOf('--pares', '').split(',').map((x) => x.trim().toUpperCase()) : null;
const SPREAD = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5, GBPCAD: 2.5, EURNZD: 3, GBPNZD: 3.5 };
const SPREAD_PX = { XAUUSD: 0.3, US500F: 0.5, NAS100F: 1.5, US30F: 3 };
const pipOf = (s) => (s === 'XAUUSD' ? 0.1 : SPREAD_PX[s] !== undefined ? 1 : s.endsWith('JPY') ? 0.01 : 0.0001);
const spreadOf = (s) => (SPREAD_PX[s] ?? (SPREAD[s] ?? 2.5) * pipOf(s));
const NY = (h) => (h - 7 + 24) % 24;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const st = (L, k) => { const v = L.map((t) => t[k]).filter((x) => x !== null && x !== undefined && Number.isFinite(x)); if (!v.length) return '    —     '; return `${String(Math.round((100 * v.filter((x) => x > 0).length) / v.length)).padStart(3)} % ${mean(v) >= 0 ? '+' : ''}${mean(v).toFixed(2)}R`; };
const row = (name, L, keys = ['r_opp', 'r1', 'r15', 'r2', 'r3']) => console.log(`  ${name.padEnd(44)} n=${String(L.length).padStart(5)} · ${keys.map((k) => `${k.replace('r_opp', 'opuesto').replace('r15', '1,5R').replace('r1', '1R').replace('r2', '2R').replace('r3', '3R')} ${st(L, k)}`).join(' · ')}`);

function ema(v, n) { const k = 2 / (n + 1); const o = []; let e = null; for (const x of v) { e = e === null ? x : x * k + e * (1 - k); o.push(e); } return o; }
function sma(v, n) { const o = []; let s = 0; v.forEach((x, i) => { s += x; if (i >= n) s -= v[i - n]; o.push(i >= n - 1 ? s / n : null); }); return o; }
function load(sym) {
  const byDay = new Map();
  for (const line of readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) {
    const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue;
    const date = d.replace(/\./g, '-'); (byDay.get(date) || byDay.set(date, []).get(date)).push({ date, hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  const dates = [...byDay.keys()].filter((d) => new Date(`${d}T12:00:00Z`).getUTCDay() % 6 !== 0).sort();
  const days = dates.map((d) => { const L = byDay.get(d); return { date: d, o: L[0].o, h: Math.max(...L.map((b) => b.h)), l: Math.min(...L.map((b) => b.l)), c: L[L.length - 1].c, dow: new Date(`${d}T12:00:00Z`).getUTCDay() }; });
  const closes = days.map((x) => x.c); const e8 = ema(closes, 8), s18 = sma(closes, 18);
  let a = null; days.forEach((x, i) => { const tr = i ? Math.max(x.h - x.l, Math.abs(x.h - days[i - 1].c), Math.abs(x.l - days[i - 1].c)) : x.h - x.l; a = a === null ? tr : (a * 13 + tr) / 14; x.atr = i >= 14 ? a : null; x.e8 = e8[i]; x.s18 = s18[i]; });
  // semanas ISO (para la regla "la semana anterior cerró fuera del rango de la previa")
  const weeks = []; for (const x of days) { const wk = isoWeek(x.date); const w = weeks[weeks.length - 1]; if (!w || w.key !== wk) weeks.push({ key: wk, o: x.o, h: x.h, l: x.l, c: x.c }); else { w.h = Math.max(w.h, x.h); w.l = Math.min(w.l, x.l); w.c = x.c; } }
  const weekIdx = new Map(weeks.map((w, i) => [w.key, i]));
  return { byDay, dates, days, weeks, weekIdx };
}
function isoWeek(ymd) { const d = new Date(`${ymd}T00:00:00Z`); const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3); const y = d.getUTCFullYear(); const f = new Date(Date.UTC(y, 0, 4)); return `${y}-W${String(1 + Math.round(((d - f) / 86400000 - 3 + ((f.getUTCDay() + 6) % 7)) / 7)).padStart(2, '0')}`; }
/** Tendencias "mayores" conocidas al cierre del día anterior (índice i del día actual). */
function trends(D, i) {
  const p = D.days[i - 1]; if (!p) return null;
  const ema18 = p.e8 !== null && p.s18 !== null ? Math.sign(p.e8 - p.s18) : 0;
  const prevDay = Math.sign(p.c - p.o);
  const wi = D.weekIdx.get(isoWeek(D.days[i].date)); const w1 = wi > 0 ? D.weeks[wi - 1] : null, w2 = wi > 1 ? D.weeks[wi - 2] : null;
  const weekOut = w1 && w2 ? (w1.c > w2.h ? 1 : w1.c < w2.l ? -1 : 0) : 0;
  let monFri = 0; for (let k = i - 1; k >= Math.max(0, i - 7); k--) { const d = D.days[k]; if (d.dow === 1 || d.dow === 5) { monFri = Math.sign(d.c - d.o); break; } }
  return { ema18, prevDay, weekOut, monFri };
}
function sim(bars, startIdx, dir, entry, stop, targets, lastIdx) {
  const risk = dir > 0 ? entry - stop : stop - entry; if (!(risk > 0)) return null;
  const out = {};
  for (const [name, px] of Object.entries(targets)) {
    let r = null;
    for (let k = startIdx; k <= lastIdx && k < bars.length; k++) { const b = bars[k]; if (dir > 0 ? b.l <= stop : b.h >= stop) { r = -1; break; } if (px !== null && (dir > 0 ? b.h >= px : b.l <= px)) { r = (dir > 0 ? px - entry : entry - px) / risk; break; } }
    if (r === null) { const b = bars[Math.min(lastIdx, bars.length - 1)]; r = Math.max(-1, (dir > 0 ? b.c - entry : entry - b.c) / risk); }
    out[name] = r;
  }
  return out;
}
const rTargets = (entry, risk, dir, opp) => ({ r_opp: opp, r1: dir > 0 ? entry + risk : entry - risk, r15: dir > 0 ? entry + 1.5 * risk : entry - 1.5 * risk, r2: dir > 0 ? entry + 2 * risk : entry - 2 * risk, r3: dir > 0 ? entry + 3 * risk : entry - 3 * risk });

const symbols = readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => !ONLY || ONLY.includes(s));
const T = { h4: [], ny: [], ts: [], smt: [] };
const DD = {};
for (const sym of symbols) {
  const D = load(sym); DD[sym] = D; const sp = spreadOf(sym); const pip = pipOf(sym);
  for (let i = 20; i < D.dates.length; i++) {
    const d = D.dates[i]; if (d < FROM) continue; const bars = D.byDay.get(d); if (!bars || bars.length < 18) continue;
    const atr = D.days[i - 1].atr; if (!atr) continue; const tr = trends(D, i); if (!tr) continue;
    const idx = (b) => bars.indexOf(b);
    // ---- P1: CRT H4 (rango asiático 21–01 NY, manipulación H4 01–05 cierre dentro; y rango 01–05, manipulación 05–09)
    for (const [key, rH0, rH1, mH0, mH1, dEnd] of [['B_asia', 4, 7, 8, 11, 15], ['A_1-5-9', 8, 11, 12, 15, 19]]) {
      const R = bars.filter((b) => b.hour >= rH0 && b.hour <= rH1), M = bars.filter((b) => b.hour >= mH0 && b.hour <= mH1);
      if (R.length < 3 || M.length < 4) continue;
      const rH = Math.max(...R.map((b) => b.h)), rL = Math.min(...R.map((b) => b.l)); const mH = Math.max(...M.map((b) => b.h)), mL = Math.min(...M.map((b) => b.l)), mC = M[M.length - 1].c;
      const up = mH > rH, dn = mL < rL; if (up === dn) continue; const side = up ? 1 : -1; if (side > 0 ? !(mC < rH) : !(mC > rL)) continue;
      const dir = -side; const ext = side > 0 ? mH : mL; const entry = dir > 0 ? mC + sp : mC; const stop = dir > 0 ? ext - sp : ext + sp; const risk = dir > 0 ? entry - stop : stop - entry; if (!(risk > 0)) continue;
      const li0 = bars.findIndex((b) => b.hour > dEnd) - 1; const li = li0 < 0 ? bars.length - 1 : li0;
      const r = sim(bars, idx(M[M.length - 1]) + 1, dir, entry, stop, rTargets(entry, risk, dir, dir > 0 ? rH : rL), li); if (!r) continue;
      T.h4.push({ sym, date: d, key, dir, ...r, riskPips: risk / pip, ...tr, oppR: (dir > 0 ? rH - entry : entry - rL) / risk });
    }
    // ---- P2: modelo NY: rango = vela 08:00 NY (servidor 15), manipulación 09:00 (16) o 10:00 (17)
    const b8 = bars.find((b) => b.hour === 15);
    if (b8) {
      for (const mh of [16, 17]) {
        const m = bars.find((b) => b.hour === mh); if (!m) continue;
        const prev = mh === 17 ? bars.find((b) => b.hour === 16) : null;
        if (prev && (prev.h > b8.h || prev.l < b8.l)) break; // si la de 09:00 ya barrió, es la de 09:00 la manipulación
        const up = m.h > b8.h, dn = m.l < b8.l; if (up === dn) continue; const side = up ? 1 : -1; if (side > 0 ? !(m.c < b8.h) : !(m.c > b8.l)) continue;
        const dir = -side; const ext = side > 0 ? m.h : m.l; const entry = dir > 0 ? m.c + sp : m.c; const stop = dir > 0 ? ext - sp : ext + sp; const risk = dir > 0 ? entry - stop : stop - entry; if (!(risk > 0)) continue;
        const li0 = bars.findIndex((b) => b.hour > 23) - 1; const li = li0 < 0 ? bars.length - 1 : li0;
        const r = sim(bars, idx(m) + 1, dir, entry, stop, rTargets(entry, risk, dir, dir > 0 ? b8.h : b8.l), li); if (!r) continue;
        T.ny.push({ sym, date: d, manipHour: NY(mh), dir, ...r, riskPips: risk / pip, ...tr, oppR: (dir > 0 ? b8.h - entry : entry - b8.l) / risk, sweepAtr: (side > 0 ? m.h - b8.h : b8.l - m.l) / atr });
        break;
      }
    }
    // ---- P3: turtle soup horario: vela que barre el extremo de la anterior y cierra dentro de la anterior
    for (let k = 1; k < bars.length; k++) {
      const p = bars[k - 1], b = bars[k]; const up = b.h > p.h, dn = b.l < p.l; if (up === dn) continue; const side = up ? 1 : -1;
      if (side > 0 ? !(b.c < p.h) : !(b.c > p.l)) continue;
      if (k + 1 >= bars.length) continue; // última vela del día de servidor (16:00 NY): no hay velas para gestionar
      const dir = -side; const ext = side > 0 ? b.h : b.l; const entry = dir > 0 ? b.c + sp : b.c; const stop = dir > 0 ? ext - sp : ext + sp; const risk = dir > 0 ? entry - stop : stop - entry; if (!(risk > 0) || risk < 0.08 * atr) continue;
      const r = sim(bars, k + 1, dir, entry, stop, rTargets(entry, risk, dir, dir > 0 ? p.h : p.l), Math.min(bars.length - 1, k + 8)); if (!r) continue;
      T.ts.push({ sym, date: d, hourNY: NY(b.hour), dir, ...r, riskPips: risk / pip, ...tr });
    }
  }
}
// ---- P4: SMT EURUSD vs GBPUSD (modelo NY y Londres): uno barre el rango y el otro no
if (DD.EURUSD && DD.GBPUSD) {
  const common = DD.EURUSD.dates.filter((d) => d >= FROM && DD.GBPUSD.byDay.has(d));
  for (const d of common) {
    const E = DD.EURUSD.byDay.get(d), G = DD.GBPUSD.byDay.get(d); if (!E || !G || E.length < 18 || G.length < 18) continue;
    for (const [key, rH0, rH1, mH0, mH1, dEnd] of [['NY_08-09', 15, 15, 16, 16, 23], ['Londres_asia', 4, 7, 8, 11, 15]]) {
      const rng = (B) => { const R = B.filter((b) => b.hour >= rH0 && b.hour <= rH1); return R.length ? [Math.max(...R.map((b) => b.h)), Math.min(...R.map((b) => b.l))] : null; };
      const man = (B) => B.filter((b) => b.hour >= mH0 && b.hour <= mH1);
      const re = rng(E), rg = rng(G), me = man(E), mg = man(G); if (!re || !rg || !me.length || !mg.length) continue;
      const sw = (R, M) => { const H = Math.max(...M.map((b) => b.h)), L = Math.min(...M.map((b) => b.l)); return H > R[0] && L < R[1] ? 2 : H > R[0] ? 1 : L < R[1] ? -1 : 0; };
      const se = sw(re, me), sg = sw(rg, mg); if (se === 2 || sg === 2) continue;
      if (se === sg) { if (se === 0) continue; }
      // divergencia: uno barre (se !== 0) y el otro no (sg === 0) → entrar en el que NO barrió, contra el lado barrido del otro
      const cases = [];
      if (se !== 0 && sg === 0) cases.push({ pair: 'GBPUSD', B: G, R: rg, M: mg, side: se, smt: true });
      if (sg !== 0 && se === 0) cases.push({ pair: 'EURUSD', B: E, R: re, M: me, side: sg, smt: true });
      if (se !== 0 && sg === se) { cases.push({ pair: 'EURUSD', B: E, R: re, M: me, side: se, smt: false }); cases.push({ pair: 'GBPUSD', B: G, R: rg, M: mg, side: sg, smt: false }); }
      for (const c of cases) {
        const m = c.M[c.M.length - 1]; const dir = -c.side; const sp = spreadOf(c.pair);
        // el que no barrió: entrada al cierre de la vela de manipulación, stop en su extremo del lado barrido (el que barrió: stop tras su mecha)
        const ext = c.side > 0 ? Math.max(...c.M.map((b) => b.h)) : Math.min(...c.M.map((b) => b.l));
        const entry = dir > 0 ? m.c + sp : m.c; const stop = dir > 0 ? ext - sp : ext + sp; const risk = dir > 0 ? entry - stop : stop - entry; if (!(risk > 0)) continue;
        const li0 = c.B.findIndex((b) => b.hour > dEnd) - 1; const li = li0 < 0 ? c.B.length - 1 : li0;
        const r = sim(c.B, c.B.indexOf(m) + 1, dir, entry, stop, rTargets(entry, risk, dir, dir > 0 ? c.R[0] : c.R[1]), li); if (!r) continue;
        const i = DD[c.pair].dates.indexOf(d); const tr = trends(DD[c.pair], i) || {};
        T.smt.push({ sym: c.pair, date: d, key, smt: c.smt, dir, ...r, ...tr, riskPips: risk / pipOf(c.pair) });
      }
    }
  }
}

const withTrend = (t, k) => t[k] !== 0 && t[k] === t.dir, againstTrend = (t, k) => t[k] !== 0 && t[k] === -t.dir;
console.log(`\nReglas de los vídeos sobre ${symbols.length} activos · ${path.basename(DATA)} · desde ${FROM}`);
console.log('\n== P1 · CRT en H4 (Londres) con filtro de tendencia mayor ("rango pendiente" = entrada a favor de la tendencia; la barrida es del lado contrario) ==');
for (const key of ['B_asia', 'A_1-5-9']) {
  const L = T.h4.filter((t) => t.key === key); console.log(`  [${key}]`);
  row('sin filtro', L);
  for (const [name, k] of [['tendencia D1 EMA8>SMA18', 'ema18'], ['vela diaria anterior', 'prevDay'], ['semana anterior cerró fuera (continuación)', 'weekOut'], ['última vela lunes/viernes', 'monFri']]) {
    row(`a favor · ${name}`, L.filter((t) => withTrend(t, k))); row(`en contra · ${name}`, L.filter((t) => againstTrend(t, k)));
  }
  row('a favor de EMA Y semana', L.filter((t) => withTrend(t, 'ema18') && withTrend(t, 'weekOut')));
}
console.log('\n== P2 · Modelo Nueva York: rango = vela de 08:00 NY, manipulación en la de 09:00 (o 10:00) con cierre dentro, salida 16:00 ==');
row('sin filtro', T.ny);
row('manipulación a las 09:00', T.ny.filter((t) => t.manipHour === 9)); row('manipulación a las 10:00', T.ny.filter((t) => t.manipHour === 10));
row('a favor de la tendencia D1 (EMA)', T.ny.filter((t) => withTrend(t, 'ema18'))); row('en contra de la tendencia D1 (EMA)', T.ny.filter((t) => againstTrend(t, 'ema18')));
row('a favor de EMA + semana', T.ny.filter((t) => withTrend(t, 'ema18') && withTrend(t, 'weekOut')));
row('a favor de lunes/viernes', T.ny.filter((t) => withTrend(t, 'monFri')));
row('barrida ≥ 0,1 ATR', T.ny.filter((t) => t.sweepAtr >= 0.1)); row('a favor EMA + barrida ≥ 0,1 ATR', T.ny.filter((t) => withTrend(t, 'ema18') && t.sweepAtr >= 0.1));
console.log('  por par (a favor de la tendencia D1):');
for (const s of symbols) { const L = T.ny.filter((t) => t.sym === s && withTrend(t, 'ema18')); if (L.length >= 30) row(`    ${s}`, L); }
console.log('\n== P3 · Turtle soup horario (vela que barre el extremo de la anterior y cierra dentro) · por hora NY (España = NY + 6) · objetivo extremo opuesto de la vela anterior / 1R / 2R ==');
console.log('  hora NY   todas: n · opuesto · 1R · 2R      |  a favor de la tendencia D1: n · opuesto · 1R · 2R   |  en contra: opuesto');
for (let h = 0; h < 24; h++) {
  const L = T.ts.filter((t) => t.hourNY === h); if (L.length < 200) continue;
  const F = L.filter((t) => withTrend(t, 'ema18')), C = L.filter((t) => againstTrend(t, 'ema18'));
  console.log(`  ${String(h).padStart(2)}:00 (${String((h + 6) % 24).padStart(2)}:00 ES)  n=${String(L.length).padStart(6)} · ${st(L, 'r_opp')} · ${st(L, 'r1')} · ${st(L, 'r2')}   |  n=${String(F.length).padStart(6)} · ${st(F, 'r_opp')} · ${st(F, 'r1')} · ${st(F, 'r2')}   |  ${st(C, 'r_opp')}`);
}
console.log('\n== P4 · SMT EURUSD/GBPUSD: uno barre el rango y el otro no → entrar en el que NO barrió ==');
for (const key of ['NY_08-09', 'Londres_asia']) { console.log(`  [${key}]`); row('con divergencia (SMT)', T.smt.filter((t) => t.key === key && t.smt)); row('sin divergencia (los dos barren)', T.smt.filter((t) => t.key === key && !t.smt)); row('SMT + a favor de la tendencia D1', T.smt.filter((t) => t.key === key && t.smt && withTrend(t, 'ema18'))); }
console.log('\n== P5 · Objetivo según tendencia (vídeo 2): 1:1 contra tendencia, lado opuesto a favor · modelo NY + H4 asiático ==');
const all = [...T.ny, ...T.h4.filter((t) => t.key === 'B_asia')];
row('contra tendencia · 1R', all.filter((t) => againstTrend(t, 'ema18')), ['r1']); row('contra tendencia · lado opuesto', all.filter((t) => againstTrend(t, 'ema18')), ['r_opp']);
row('a favor · 1R', all.filter((t) => withTrend(t, 'ema18')), ['r1']); row('a favor · lado opuesto', all.filter((t) => withTrend(t, 'ema18')), ['r_opp']); row('a favor · 2R', all.filter((t) => withTrend(t, 'ema18')), ['r2']);
