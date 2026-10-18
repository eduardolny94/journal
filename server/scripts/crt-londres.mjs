// Candle Range Theory (CRT) en Londres, medida en nuestros datos (18-10-2026).
// Velas H1 de MT5 (servidor = NY + 7), 32 activos, dic-2023 → oct-2026, spread descontado. Modelo de tres velas:
//   1) vela de RANGO (acumulación) → su máximo y mínimo son el rango;
//   2) vela de MANIPULACIÓN (turtle soup): barre UN lado del rango y cierra de vuelta dentro;
//   3) vela de DISTRIBUCIÓN: se espera que vaya al lado contrario del rango.
// Variantes medidas (todas con entrada al cierre de la vela H1 que vuelve dentro del rango, stop en el extremo de la
// barrida ± spread, objetivos: 50 % del rango, lado opuesto del rango, 1R, 2R; si nada toca, salida al final de la
// ventana de distribución):
//   A) H4 1-5-9 NY: rango = vela H4 de 01:00–05:00 NY, manipulación 05:00–09:00, distribución 09:00–13:00.
//   B) H4 21-1-5 NY: rango = 21:00–01:00 (Asia), manipulación 01:00–05:00 (apertura de Londres), distribución 05:00–09:00.
//   C) Diario: rango = día de servidor anterior (17:00 → 17:00 NY), manipulación en Londres 02:00–08:00 NY,
//      distribución hasta el cierre del día (17:00 NY).
// Filtros: "primera vez" (el lado barrido no se había tocado antes en la ventana), barrida mínima (≥ 0,1 ATR fuera),
// sesgo del radar del día anterior a favor de la entrada, y vuelta dentro en la misma vela H1 que barre.
// Uso: node server/scripts/crt-londres.mjs [--desde 2024-01-01]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const DATA = path.join(ROOT, 'data', 'mt5');
const FROM = (() => { const i = process.argv.indexOf('--desde'); return i >= 0 ? process.argv[i + 1] : '2024-01-01'; })();
const SPREAD = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5 };
const SPREAD_PX = { XAUUSD: 0.3, US500F: 0.5, NAS100F: 1.5, US30F: 3 };
const pipOf = (s) => (s === 'XAUUSD' ? 0.1 : SPREAD_PX[s] !== undefined ? 1 : s.endsWith('JPY') ? 0.01 : 0.0001);
const spreadOf = (s) => (SPREAD_PX[s] ?? (SPREAD[s] ?? 2.5) * pipOf(s));
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);
const NY = (serverHour) => (serverHour - 7 + 24) % 24; // hora NY de una vela por su hora de servidor

let biasBy = {};
try { const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true }); for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) (biasBy[r.symbol] ||= []).push(r); } catch { biasBy = {}; }
function biasBefore(sym, date) { const rows = biasBy[sym]; if (!rows) return null; let lo = 0, hi = rows.length - 1, ans = null; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].date < date) { ans = rows[m]; lo = m + 1; } else hi = m - 1; } return ans && (new Date(date) - new Date(ans.date)) / 86400000 <= 5 ? ans.diff : null; }

function load(sym) {
  const bars = [];
  for (const line of readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) {
    const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue;
    bars.push({ date: d.replace(/\./g, '-'), hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  // ATR diario por fecha (día de servidor), con el día anterior
  const byDay = new Map(); for (const b of bars) (byDay.get(b.date) || byDay.set(b.date, []).get(b.date)).push(b);
  const dates = [...byDay.keys()].sort(); const atr = new Map(); let a = null, pc = null;
  for (const d of dates) { const L = byDay.get(d); const H = Math.max(...L.map((x) => x.h)), Lo = Math.min(...L.map((x) => x.l)), C = L[L.length - 1].c; const tr = pc === null ? H - Lo : Math.max(H - Lo, Math.abs(H - pc), Math.abs(Lo - pc)); a = a === null ? tr : (a * 13 + tr) / 14; atr.set(d, a); pc = C; }
  return { bars, byDay, dates, atr };
}
const prevDate = (D, d) => { const i = D.dates.indexOf(d); return i > 0 ? D.dates[i - 1] : null; };
const hoursOf = (D, d, from, to) => (D.byDay.get(d) || []).filter((b) => b.hour >= from && b.hour <= to);

/** Simula una entrada contra la barrida: entry al cierre de la vela que vuelve dentro; stop en el extremo barrido. */
function simulate(bars, startIdx, dir, entry, stop, targets, lastIdx) {
  const risk = dir > 0 ? entry - stop : stop - entry; if (!(risk > 0)) return null;
  const out = {};
  for (const [name, px] of Object.entries(targets)) {
    let r = null;
    for (let k = startIdx; k <= lastIdx && k < bars.length; k++) {
      const b = bars[k];
      if (dir > 0 ? b.l <= stop : b.h >= stop) { r = -1; break; }
      if (dir > 0 ? b.h >= px : b.l <= px) { r = (dir > 0 ? px - entry : entry - px) / risk; break; }
    }
    if (r === null) { const b = bars[Math.min(lastIdx, bars.length - 1)]; r = Math.max(-1, (dir > 0 ? b.c - entry : entry - b.c) / risk); }
    out[name] = r;
  }
  out.risk = risk;
  return out;
}

const symbols = readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', ''));
const trades = [];
for (const sym of symbols) {
  const D = load(sym); const sp = spreadOf(sym); const pip = pipOf(sym);
  for (const d of D.dates) {
    if (d < FROM) continue;
    const pd = prevDate(D, d); const atr = pd ? D.atr.get(pd) : null; if (!atr) continue;
    const dayBars = D.byDay.get(d); if (!dayBars || dayBars.length < 18) continue;
    const idxOf = (b) => dayBars.indexOf(b);
    const diff = biasBefore(sym, d);
    // Ventanas en hora de servidor: A) rango 08–11, manip 12–15, distr 16–19 · B) rango 04–07, manip 08–11, distr 12–15
    // C) rango = día anterior entero, manip 09–14 (02:00–07:59 NY), distr hasta 23
    const models = [
      { key: 'A_H4_1-5-9', range: hoursOf(D, d, 8, 11), manip: hoursOf(D, d, 12, 15), distrEnd: 19 },
      { key: 'B_H4_21-1-5', range: hoursOf(D, d, 4, 7), manip: hoursOf(D, d, 8, 11), distrEnd: 15 },
      { key: 'C_diario_Londres', range: pd ? D.byDay.get(pd) : null, manip: hoursOf(D, d, 9, 14), distrEnd: 23 },
    ];
    // Variante canónica (cierre de la vela H4 de manipulación): entrada al cierre de la vela H4 completa si barrió UN lado y
    // cerró dentro; stop en el extremo barrido; objetivos iguales; salida al final de la vela H4 de distribución.
    for (const m of models.filter((x) => x.key.startsWith('A_') || x.key.startsWith('B_'))) {
      if (!m.range || m.range.length < 3 || m.manip.length < 4) continue;
      const rH = Math.max(...m.range.map((b) => b.h)), rL = Math.min(...m.range.map((b) => b.l)); if (!(rH > rL)) continue;
      const mH = Math.max(...m.manip.map((b) => b.h)), mL = Math.min(...m.manip.map((b) => b.l)), mC = m.manip[m.manip.length - 1].c;
      const up = mH > rH, dn = mL < rL; if (up === dn) continue; // ninguno o los dos lados
      const side = up ? 1 : -1; if (side > 0 ? !(mC < rH) : !(mC > rL)) continue; // debe cerrar dentro
      const dir = -side; const ext = side > 0 ? mH : mL;
      const entry = dir > 0 ? mC + sp : mC; const stop = dir > 0 ? ext - sp : ext + sp; const risk = dir > 0 ? entry - stop : stop - entry; if (!(risk > 0)) continue;
      const mid = (rH + rL) / 2, opposite = dir > 0 ? rH : rL;
      const startIdx = idxOf(m.manip[m.manip.length - 1]) + 1; const li0 = dayBars.findIndex((b) => b.hour > m.distrEnd) - 1; const li = li0 < 0 ? dayBars.length - 1 : li0;
      const sim = simulate(dayBars, startIdx, dir, entry, stop, { mid, opposite, r1: dir > 0 ? entry + risk : entry - risk, r2: dir > 0 ? entry + 2 * risk : entry - 2 * risk }, li);
      if (!sim) continue;
      trades.push({ sym, date: d, year: d.slice(0, 4), model: m.key.replace('_H4_', '_H4cierre_'), dir, sameBar: true, sweepAtr: (side > 0 ? mH - rH : rL - mL) / atr, rangeAtr: (rH - rL) / atr, riskPips: risk / pip, midR: (dir > 0 ? mid - entry : entry - mid) / risk, oppR: (dir > 0 ? opposite - entry : entry - opposite) / risk, r_mid: sim.mid, r_opp: sim.opposite, r1: sim.r1, r2: sim.r2, radarOk: diff !== null && Math.sign(diff) === dir && Math.abs(diff) >= 3, radarAgainst: diff !== null && Math.sign(diff) === -dir && Math.abs(diff) >= 3, hourNY: NY(m.manip[m.manip.length - 1].hour) });
    }
    for (const m of models) {
      if (!m.range || m.range.length < 3 || m.manip.length < 3) continue;
      const rH = Math.max(...m.range.map((b) => b.h)), rL = Math.min(...m.range.map((b) => b.l)); const rangeSize = rH - rL; if (!(rangeSize > 0)) continue;
      // Primera barrida de UN lado dentro de la ventana de manipulación, y vuelta dentro (cierre H1 dentro del rango)
      let side = 0, ext = null, sweepIdx = -1, backIdx = -1, bothSides = false;
      for (let k = 0; k < m.manip.length; k++) {
        const b = m.manip[k];
        if (side === 0) {
          const up = b.h > rH, dn = b.l < rL;
          if (up && dn) { bothSides = true; break; }
          if (up) { side = 1; ext = b.h; } else if (dn) { side = -1; ext = b.l; } else continue;
          if (side > 0 ? b.c < rH : b.c > rL) { backIdx = k; sweepIdx = k; break; }
          sweepIdx = k; continue;
        }
        if (side > 0) { if (b.l < rL) { bothSides = true; break; } ext = Math.max(ext, b.h); if (b.c < rH) { backIdx = k; break; } }
        else { if (b.h > rH) { bothSides = true; break; } ext = Math.min(ext, b.l); if (b.c > rL) { backIdx = k; break; } }
      }
      if (side === 0 || bothSides || backIdx < 0) { if (side !== 0 && !bothSides) trades.push({ sym, date: d, model: m.key, dir: -side, noReturn: true }); continue; }
      const entryBar = m.manip[backIdx]; const dir = -side;
      const entry = dir > 0 ? entryBar.c + sp : entryBar.c; const stop = dir > 0 ? ext - sp : ext + sp;
      const sweepAtr = (side > 0 ? ext - rH : rL - ext) / atr;
      const mid = (rH + rL) / 2; const opposite = dir > 0 ? rH : rL;
      const startIdx = idxOf(entryBar) + 1; const lastIdx = dayBars.findIndex((b) => b.hour > m.distrEnd) - 1; const li = lastIdx < 0 ? dayBars.length - 1 : lastIdx;
      const risk = dir > 0 ? entry - stop : stop - entry;
      const sim = simulate(dayBars, startIdx, dir, entry, stop, { mid, opposite, r1: dir > 0 ? entry + risk : entry - risk, r2: dir > 0 ? entry + 2 * risk : entry - 2 * risk }, li);
      if (!sim) continue;
      const midR = (dir > 0 ? mid - entry : entry - mid) / risk, oppR = (dir > 0 ? opposite - entry : entry - opposite) / risk;
      trades.push({ sym, date: d, year: d.slice(0, 4), model: m.key, dir, sameBar: backIdx === sweepIdx, sweepAtr, rangeAtr: rangeSize / atr, riskPips: risk / pip, midR, oppR, r_mid: sim.mid, r_opp: sim.opposite, r1: sim.r1, r2: sim.r2, radarOk: diff !== null && Math.sign(diff) === dir && Math.abs(diff) >= 3, radarAgainst: diff !== null && Math.sign(diff) === -dir && Math.abs(diff) >= 3, hourNY: NY(entryBar.hour) });
    }
  }
}

const pct = (a, n) => (n ? `${Math.round((100 * a) / n)} %` : '—');
const st = (L, k) => { const v = L.map((t) => t[k]).filter((x) => x !== null && x !== undefined); if (!v.length) return '   —   '; return `${String(Math.round((100 * v.filter((x) => x > 0).length) / v.length)).padStart(3)} % ${mean(v) >= 0 ? '+' : ''}${mean(v).toFixed(2)}R`; };
const row = (name, L) => console.log(`  ${name.padEnd(34)} n=${String(L.length).padStart(5)} · 50 % ${st(L, 'r_mid')} · lado opuesto ${st(L, 'r_opp')} · 1R ${st(L, 'r1')} · 2R ${st(L, 'r2')} · obj. opuesto medio ${L.length ? mean(L.map((t) => t.oppR)).toFixed(2) : '—'}R · stop ${L.length ? Math.round(mean(L.map((t) => t.riskPips))) : '—'} pips`);
const valid = trades.filter((t) => !t.noReturn);
console.log(`\nCRT en Londres · ${symbols.length} activos · desde ${FROM} · ${valid.length} setups con vuelta dentro (${trades.filter((t) => t.noReturn).length} barridas que no volvieron)\n`);
for (const model of ['A_H4_1-5-9', 'A_H4cierre_1-5-9', 'B_H4_21-1-5', 'B_H4cierre_21-1-5', 'C_diario_Londres']) {
  const M = valid.filter((t) => t.model === model);
  const nr = trades.filter((t) => t.model === model && t.noReturn).length;
  console.log(`== ${model} · ${M.length} setups · la barrida NO volvió dentro en ${pct(nr, nr + M.length)} de los casos ==`);
  row('todas', M);
  row('vuelta dentro en la misma vela', M.filter((t) => t.sameBar));
  row('barrida ≥ 0,1 ATR', M.filter((t) => t.sweepAtr >= 0.1));
  row('barrida ≥ 0,25 ATR', M.filter((t) => t.sweepAtr >= 0.25));
  row('rango ≥ 0,5 ATR', M.filter((t) => t.rangeAtr >= 0.5));
  row('radar a favor de la entrada', M.filter((t) => t.radarOk));
  row('radar en contra de la entrada', M.filter((t) => t.radarAgainst));
  row('radar a favor + barrida ≥ 0,1 ATR', M.filter((t) => t.radarOk && t.sweepAtr >= 0.1));
  console.log('  por año (lado opuesto):', ['2024', '2025', '2026'].map((y) => `${y} ${st(M.filter((t) => t.year === y), 'r_opp')}`).join(' · '));
  console.log('  por hora NY de la entrada (lado opuesto):', [...new Set(M.map((t) => t.hourNY))].sort((a, b) => a - b).map((h) => `${h}h ${st(M.filter((t) => t.hourNY === h), 'r_opp')} (${M.filter((t) => t.hourNY === h).length})`).join(' · '));
  console.log('  por par (lado opuesto · 1R), ordenado por acierto al lado opuesto:');
  const bySym = symbols.map((s) => ({ s, L: M.filter((t) => t.sym === s) })).filter((x) => x.L.length >= 25).sort((a, b) => { const w = (L) => L.filter((t) => t.r_opp > 0).length / L.length; return w(b.L) - w(a.L); });
  for (const { s, L } of bySym) console.log(`    ${s.padEnd(8)} n=${String(L.length).padStart(4)} · lado opuesto ${st(L, 'r_opp')} · 1R ${st(L, 'r1')} · 2R ${st(L, 'r2')} · por año opuesto ${['2024', '2025', '2026'].map((y) => { const Y = L.filter((t) => t.year === y); return Y.length >= 8 ? `${Math.round((100 * Y.filter((t) => t.r_opp > 0).length) / Y.length)} %` : '—'; }).join('/')}`);
  console.log('');
}
