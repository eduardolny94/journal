// ¿Qué media de 1 h acompaña mejor la operación y dice cuándo salir o dejar correr? (25-10-2026)
// Motores: (1) barrida de Asia a favor del radar con vuelta tardía (estrategia-1a2.mjs; MT5 28 pares, 2024–26) y
//          (2) FVG de 4 h de Asia al 50 %, toque tardío (fvg-asia-*.mjs; FXCM 10 pares, 2015–26).
// Salidas comparadas (stop inicial igual en todas; se mantiene hasta 2 días más como máximo):
//   fijo 1R / 1,5R / 2R al cierre del día · EMA n: salir al cierre de la vela H1 que cierra al otro lado de la EMA n (8/13/21/34/55)
//   · BE+EMA: stop fijo hasta tocar 1R, después salir por la EMA n · arrastre: stop = EMA n − 2 pips cada vela (solo a favor).
// Uso: node server/scripts/salida-ema.mjs [--motor asia|fvg|ambos] [--coste-extra 1]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const MOTOR = argOf('--motor', 'ambos'); const EXTRA = Number(argOf('--coste-extra', '1')); const EMAS = [8, 13, 21, 34, 55];
const SPREAD0 = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5, GBPCAD: 2.5, EURNZD: 3, GBPNZD: 3.5, AUDCAD: 2, AUDCHF: 2, CADCHF: 2.2, NZDCHF: 2.5, NZDCAD: 2.5, AUDNZD: 2.2, GBPAUD: 2.8, GBPCHF: 2.5, EURCHF: 1.8, CHFJPY: 2.5, NZDJPY: 2.2 };
const pipOf = (s) => (s.endsWith('JPY') ? 0.01 : 0.0001);
const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
const biasBy = {}; for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) (biasBy[r.symbol] ||= []).push(r);
const biasAt = (sym, date) => { const rows = biasBy[sym]; if (!rows) return null; let a = null; for (const r of rows) { if (r.date < date) a = r; else break; } return a ? a.diff : null; };
function load(dir, sym) { const all = []; for (const line of readFileSync(path.join(ROOT, dir, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue; all.push({ date: d.replace(/\./g, '-'), hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c, ema: {} }); }
  for (const n of EMAS) { let e = null; const k = 2 / (n + 1); for (const b of all) { e = e === null ? b.c : e + k * (b.c - e); b.ema[n] = e; } }
  const days = []; let cur = null; all.forEach((b, i) => { if (!cur || cur.date !== b.date) { cur = { date: b.date, start: i, bars: [] }; days.push(cur); } cur.bars.push(b); }); return { all, days: days.filter((d) => d.bars.length >= 20) }; }
/** Simula todas las salidas desde fillIdx (índice en `all`) hasta el final del día + 2. */
function exits(all, fillIdx, endIdx, dir, entry, stop0, pip) {
  const risk = Math.abs(entry - stop0); const ex = EXTRA * pip; const SL = -1 - ex / risk; const R = (px) => (dir > 0 ? px - entry : entry - px) / risk;
  const out = {}; const dayEnd = (() => { const d0 = all[fillIdx].date; let k = fillIdx; while (k + 1 <= endIdx && all[k + 1].date === d0) k++; return k; })();
  // fijos al cierre del día
  for (const m of [1, 1.5, 2, 3]) { let v = null; for (let k = fillIdx; k <= dayEnd; k++) { const b = all[k]; if (dir > 0 ? b.l <= stop0 : b.h >= stop0) { v = SL; break; } if (dir > 0 ? b.h >= entry + m * risk : b.l <= entry - m * risk) { v = m; break; } } out[`fijo ${m}R`] = v === null ? Math.max(-1, R(all[dayEnd].c)) : v; }
  for (const n of EMAS) {
    // EMA pura: stop inicial + salir al cierre contra la EMA (desde la 2.ª vela tras el llenado), hasta 2 días más
    { let v = null; for (let k = fillIdx; k <= endIdx; k++) { const b = all[k]; if (dir > 0 ? b.l <= stop0 : b.h >= stop0) { v = SL; break; } if (k > fillIdx && (dir > 0 ? b.c < b.ema[n] : b.c > b.ema[n])) { v = Math.max(-1, R(b.c)); break; } } out[`EMA ${n}`] = v === null ? Math.max(-1, R(all[endIdx].c)) : v; }
    // BE + EMA: stop fijo hasta tocar 1R; después stop en la entrada y salida por cierre contra la EMA
    { let v = null, r1 = false; for (let k = fillIdx; k <= endIdx; k++) { const b = all[k]; if (!r1) { if (dir > 0 ? b.l <= stop0 : b.h >= stop0) { v = SL; break; } if (dir > 0 ? b.h >= entry + risk : b.l <= entry - risk) r1 = true; } else { if (dir > 0 ? b.l <= entry : b.h >= entry) { v = 0; break; } } if (r1 && k > fillIdx && (dir > 0 ? b.c < b.ema[n] : b.c > b.ema[n])) { v = Math.max(r1 ? -1 : -1, R(b.c)); break; } } out[`1R→EMA ${n}`] = v === null ? Math.max(-1, R(all[endIdx].c)) : v; }
    // arrastre: stop = max(stop anterior, EMA − 2 pips) cada vela (largo)
    { let v = null, st = stop0; for (let k = fillIdx; k <= endIdx; k++) { const b = all[k]; if (dir > 0 ? b.l <= st : b.h >= st) { v = Math.max(-1, R(st)) + (st === stop0 ? SL + 1 : 0); break; } const cand = dir > 0 ? b.ema[n] - 2 * pip : b.ema[n] + 2 * pip; if (dir > 0 ? cand > st && cand < b.l : cand < st && cand > b.h) st = cand; } out[`arrastre EMA ${n}`] = v === null ? Math.max(-1, R(all[endIdx].c)) : v; }
  }
  return out;
}
const trades = [];
if (MOTOR !== 'fvg') { // barrida de Asia a favor del radar, vuelta tardía
  const dir0 = 'data/mt5'; const PAIRS = readdirSync(path.join(ROOT, dir0)).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => !['XAUUSD', 'US500F', 'NAS100F', 'US30F'].includes(s));
  for (const sym of PAIRS) { const pip = pipOf(sym), sp = ((SPREAD0[sym] ?? 2.5) + EXTRA) * pip; const { all, days } = load(dir0, sym);
    for (let i = 1; i < days.length - 2; i++) { const d = days[i]; const diff = biasAt(sym, d.date); if (diff === null || Math.abs(diff) < 3) continue; const side = Math.sign(diff);
      const asia = d.bars.filter((b) => b.hour >= 2 && b.hour <= 8); if (asia.length < 5) continue; const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), range = aH - aL;
      const after = d.bars.filter((b) => b.hour >= 9); let first = 0, ext = null, sweepHour = null, closeBar = null;
      for (const b of after) { if (!first) { if (b.hour >= 11) break; const up = b.h > aH, dn = b.l < aL; if (up && dn) { first = 2; break; } if (up) { first = 1; ext = b.h; sweepHour = b.hour; } else if (dn) { first = -1; ext = b.l; sweepHour = b.hour; } if (first && b.c < aH && b.c > aL) { closeBar = b; break; } continue; } if (b.hour > 12) break; ext = first > 0 ? Math.max(ext, b.h) : Math.min(ext, b.l); if (b.c < aH && b.c > aL) { closeBar = b; break; } }
      if (first !== side || !closeBar || closeBar.hour === sweepHour) continue; if (Math.abs(ext - (first > 0 ? aH : aL)) / range > 1) continue;
      const dir = -first; const entry = dir > 0 ? closeBar.c + sp : closeBar.c; const stop = dir > 0 ? ext - pip : ext + pip; const fillIdx = all.indexOf(closeBar) + 1; const endIdx = days[i + 2].start + days[i + 2].bars.length - 1;
      if (fillIdx >= all.length) continue; trades.push({ motor: 'barrida de Asia (radar, vuelta tardía)', sym, date: d.date, ...exits(all, fillIdx, endIdx, dir, entry, stop, pip) }); } }
}
if (MOTOR !== 'asia') { // FVG 4 h de Asia al 50 %, Asia a favor, toque tardío
  const dir0 = 'data/mt5-fxcm'; const PAIRS = readdirSync(path.join(ROOT, dir0)).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', ''));
  for (const sym of PAIRS) { const pip = pipOf(sym), sp = ((SPREAD0[sym] ?? 2.5) + EXTRA) * pip; const { all, days } = load(dir0, sym);
    for (let i = 1; i < days.length - 2; i++) { const d = days[i], p1 = days[i - 1]; const asia = d.bars.filter((b) => b.hour >= 1 && b.hour <= 8), london = d.bars.filter((b) => b.hour >= 9 && b.hour <= 14); if (asia.length < 6 || london.length < 4) continue;
      const asiaDir = Math.sign(asia.at(-1).c - asia[0].o); const mk = (bb) => (bb.length ? { h: Math.max(...bb.map((b) => b.h)), l: Math.min(...bb.map((b) => b.l)) } : null); const c1 = mk(p1.bars.filter((b) => b.hour >= 21)), c3 = mk(asia.filter((b) => b.hour >= 5)); if (!c1 || !c3) continue;
      for (const dir of [1, -1]) { if (asiaDir !== dir) continue; let f = null; if (dir > 0 && c3.l > c1.h) f = { top: c3.l, bot: c1.h }; if (dir < 0 && c3.h < c1.l) f = { top: c1.l, bot: c3.h }; if (!f) continue; if (!(dir > 0 ? london[0].o > f.top : london[0].o < f.bot)) continue;
        const level = (f.top + f.bot) / 2, entry = dir > 0 ? level + sp : level, far = dir > 0 ? f.bot : f.top, stop = dir > 0 ? far - 10 * pip : far + 10 * pip; let fill = null; for (const b of london) { if (b.hour < 10) { if (dir > 0 ? b.l <= entry : b.h >= entry) break; continue; } if (dir > 0 ? b.l <= entry : b.h >= entry) { fill = b; break; } } if (!fill) continue;
        const fillIdx = all.indexOf(fill); const endIdx = days[i + 2].start + days[i + 2].bars.length - 1; trades.push({ motor: 'FVG 4 h de Asia (50 %, toque tardío)', sym, date: d.date, ...exits(all, fillIdx, endIdx, dir, entry, stop, pip) }); } } }
}
const pct = (a, n) => (n ? `${String(Math.round((100 * a) / n)).padStart(3)} %` : '  — '); const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
for (const motor of [...new Set(trades.map((t) => t.motor))]) {
  const L = trades.filter((t) => t.motor === motor); console.log(`\n==================== ${motor} · n=${L.length} · costes spread + ${EXTRA} pip ====================`);
  const keys = Object.keys(L[0]).filter((k) => !['motor', 'sym', 'date'].includes(k));
  const rows = keys.map((k) => { const v = L.map((t) => t[k]); const w = v.filter((x) => x > 0); return { k, wr: w.length / v.length, m: mean(v), aw: mean(w), big: v.filter((x) => x >= 2).length / v.length, med: [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)] }; });
  console.log(`  ${'salida'.padEnd(18)} acierto   R medio   R medio ganadoras   ≥ 2R   mediana`);
  for (const r of rows.sort((a, b) => b.m - a.m)) console.log(`  ${r.k.padEnd(18)} ${pct(Math.round(r.wr * 1000), 1000)}   ${r.m >= 0 ? '+' : ''}${r.m.toFixed(2)}R     ${r.aw >= 0 ? '+' : ''}${r.aw.toFixed(2)}R              ${pct(Math.round(r.big * 1000), 1000)}  ${r.med >= 0 ? '+' : ''}${r.med.toFixed(2)}R`);
  const yrs = [...new Set(L.map((t) => t.date.slice(0, 4)))].sort(); const best = rows.sort((a, b) => b.m - a.m)[0].k; console.log(`  por año · ${best} (R medio): ` + yrs.map((y) => { const Y = L.filter((t) => t.date.startsWith(y)); return `${y.slice(2)}:${mean(Y.map((t) => t[best])) >= 0 ? '+' : ''}${mean(Y.map((t) => t[best])).toFixed(2)}`; }).join(' ') + `   · fijo 2R: ` + yrs.map((y) => { const Y = L.filter((t) => t.date.startsWith(y)); return `${y.slice(2)}:${mean(Y.map((t) => t['fijo 2R'])) >= 0 ? '+' : ''}${mean(Y.map((t) => t['fijo 2R'])).toFixed(2)}`; }).join(' '));
}
