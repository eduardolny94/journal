// El "Oops" de Larry Williams en forex, a fondo (25-10-2026). Regla original: el día abre FUERA del rango de ayer (hueco) y el
// precio vuelve al extremo de ayer → entrada stop en ese extremo, en contra del hueco; stop tras el extremo del día; salida fin de día.
// Aquí: distribución del riesgo, por par, por día de la semana, tamaño del hueco, hora del llenado, stop mínimo, salidas,
// y combinaciones con otras piezas documentadas (hueco más allá del extremo de 20 días = Turtle Soup; radar desde 2023).
// Uso: node server/scripts/oops-fx.mjs [--dir data/mt5-fxcm] [--coste-extra 1]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5-fxcm')); const EXTRA = Number(argOf('--coste-extra', '1'));
const PAIRS = readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => !['XAUUSD', 'US500F', 'NAS100F', 'US30F'].includes(s));
const SPREAD0 = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5, GBPCAD: 2.5, EURNZD: 3, GBPNZD: 3.5, AUDCAD: 2, AUDCHF: 2, CADCHF: 2.2, NZDCHF: 2.5, NZDCAD: 2.5, AUDNZD: 2.2, GBPAUD: 2.8, GBPCHF: 2.5, EURCHF: 1.8, CHFJPY: 2.5, NZDJPY: 2.2 };
const pipOf = (s) => (s.endsWith('JPY') ? 0.01 : 0.0001);
let biasBy = {}; try { const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true }); for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) (biasBy[r.symbol] ||= []).push(r); } catch { biasBy = {}; }
const biasAt = (sym, date) => { const rows = biasBy[sym]; if (!rows) return null; let a = null; for (const r of rows) { if (r.date < date) a = r; else break; } return a ? a.diff : null; };
function load(sym) { const days = new Map(); for (const line of readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue; const date = d.replace(/\./g, '-'); if (!days.has(date)) days.set(date, []); days.get(date).push({ hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c }); } const D = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars, o: bars[0].o, c: bars.at(-1).c, h: Math.max(...bars.map((b) => b.h)), l: Math.min(...bars.map((b) => b.l)) })).filter((d) => d.bars.length >= 20); D.forEach((d, i) => { const w = D.slice(Math.max(0, i - 14), i); d.atr = w.length ? w.reduce((s, x) => s + (x.h - x.l), 0) / w.length : null; const w20 = D.slice(Math.max(0, i - 20), i); d.low20 = w20.length ? Math.min(...w20.map((x) => x.l)) : null; d.high20 = w20.length ? Math.max(...w20.map((x) => x.h)) : null; }); return D; }
const T = [];
const sim = (bars, fillIdx, dir, entry, stop, ex) => { const risk = Math.abs(entry - stop); const SL = -1 - ex / risk; const out = { r1: null, r15: null, r2: null, r3: null }; for (let k = fillIdx; k < bars.length; k++) { const b = bars[k]; const hs = dir > 0 ? b.l <= stop : b.h >= stop; const up = (m) => (dir > 0 ? b.h >= entry + m * risk : b.l <= entry - m * risk); for (const [key, m] of [['r1', 1], ['r15', 1.5], ['r2', 2], ['r3', 3]]) if (out[key] === null) { if (hs) out[key] = SL; else if (up(m)) out[key] = m; } if (Object.values(out).every((v) => v !== null)) break; } const last = bars.at(-1).c; const fl = Math.max(-1, (dir > 0 ? last - entry : entry - last) / risk); for (const k of Object.keys(out)) if (out[k] === null) out[k] = fl; return out; };
for (const sym of PAIRS) {
  const pip = pipOf(sym), sp = ((SPREAD0[sym] ?? 2.5) + EXTRA) * pip, ex = EXTRA * pip; const D = load(sym);
  for (let i = 21; i < D.length - 1; i++) {
    const d = D[i], p = D[i - 1], nx = D[i + 1]; if (!d.atr) continue;
    for (const dir of [1, -1]) {
      const gap = dir > 0 ? p.l - d.o : d.o - p.h; if (gap <= 0) continue; // abre por debajo del mínimo de ayer (compra) / por encima del máximo (venta)
      const lvl = dir > 0 ? p.l : p.h; let fill = -1; for (let k = 0; k < d.bars.length; k++) { const b = d.bars[k]; if (dir > 0 ? b.h >= lvl : b.l <= lvl) { fill = k; break; } }
      const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay(); const beyond20 = dir > 0 ? d.o < d.low20 : d.o > d.high20; const radar = biasAt(sym, d.date);
      const base = { sym, date: d.date, year: d.date.slice(0, 4), dir, dow, gapPips: gap / pip, gapAtr: gap / d.atr, beyond20, radar, filled: fill >= 0, fillHour: fill >= 0 ? d.bars[fill].hour : null };
      if (fill < 0) { T.push(base); continue; }
      const ext = dir > 0 ? Math.min(...d.bars.slice(0, fill + 1).map((b) => b.l)) : Math.max(...d.bars.slice(0, fill + 1).map((b) => b.h));
      const entry = dir > 0 ? lvl + sp : lvl; const stopA = dir > 0 ? ext - pip : ext + pip; const riskA = Math.abs(entry - stopA);
      const stopB = Math.abs(entry - stopA) < 8 * pip ? (dir > 0 ? entry - 8 * pip : entry + 8 * pip) : stopA; // stop mínimo 8 pips
      const stopC = dir > 0 ? entry - 0.25 * d.atr : entry + 0.25 * d.atr; // stop 0,25 ATR diario
      const bars2 = [...d.bars, ...nx.bars];
      T.push({ ...base, riskPips: riskA / pip, A: sim(d.bars, fill, dir, entry, stopA, ex), A2: sim(bars2, fill, dir, entry, stopA, ex), B: sim(d.bars, fill, dir, entry, stopB, ex), C: sim(d.bars, fill, dir, entry, stopC, ex), riskB: Math.abs(entry - stopB) / pip, riskC: Math.abs(entry - stopC) / pip });
    }
  }
}
const pct = (a, n) => (n ? `${String(Math.round((100 * a) / n)).padStart(3)} %` : '  — '); const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const F = T.filter((t) => t.filled);
const row = (name, L, k = 'A') => { if (L.length < 15) return; const g = (key) => L.map((t) => t[k][key]); console.log(`  ${name.padEnd(46)} n=${String(L.length).padStart(4)} · 1R ${pct(g('r1').filter((x) => x > 0).length, L.length)} ${mean(g('r1')) >= 0 ? '+' : ''}${mean(g('r1')).toFixed(2)}R · 1,5R ${pct(g('r15').filter((x) => x > 0).length, L.length)} ${mean(g('r15')) >= 0 ? '+' : ''}${mean(g('r15')).toFixed(2)}R · 2R ${pct(g('r2').filter((x) => x > 0).length, L.length)} ${mean(g('r2')) >= 0 ? '+' : ''}${mean(g('r2')).toFixed(2)}R · 3R ${pct(g('r3').filter((x) => x > 0).length, L.length)} ${mean(g('r3')) >= 0 ? '+' : ''}${mean(g('r3')).toFixed(2)}R`); };
console.log(`\nOops de Larry Williams en forex · ${PAIRS.length} pares · ${path.basename(DATA)} · costes spread + ${EXTRA} pip · huecos ${T.length}, se llenan ${pct(F.length, T.length)}`);
const med = (v) => { const s = [...v].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
console.log(`  hueco mediano ${med(F.map((t) => t.gapPips)).toFixed(0)} pips (${(100 * med(F.map((t) => t.gapAtr))).toFixed(0)} % del ATR) · riesgo mediano ${med(F.map((t) => t.riskPips)).toFixed(0)} pips · riesgo < 5 pips: ${pct(F.filter((t) => t.riskPips < 5).length, F.length)} · llenado: hora ${[1, 2, 3, 4, 9, 13].map((h) => `≤${h}h ${pct(F.filter((t) => t.fillHour <= h).length, F.length).trim()}`).join(' · ')}`);
console.log('\n-- stop y salida --');
row('A · stop tras el extremo del día, salida fin de día', F, 'A'); row('A2 · igual, salida fin del día siguiente', F, 'A2'); row('B · stop mínimo 8 pips', F, 'B'); row('C · stop 0,25 ATR diario', F, 'C');
console.log('\n-- por día de la semana (A) --'); for (const [dn, dw] of [['lunes', 1], ['martes', 2], ['miércoles', 3], ['jueves', 4], ['viernes', 5]]) row(dn, F.filter((t) => t.dow === dw));
console.log('\n-- tamaño del hueco (A) --'); const [g1, g2] = [med(F.map((t) => t.gapPips)) / 2, med(F.map((t) => t.gapPips)) * 1.5]; row(`hueco pequeño (< ${g1.toFixed(0)} pips)`, F.filter((t) => t.gapPips < g1)); row('hueco mediano', F.filter((t) => t.gapPips >= g1 && t.gapPips < g2)); row(`hueco grande (≥ ${g2.toFixed(0)} pips)`, F.filter((t) => t.gapPips >= g2)); row('hueco ≥ 15 % del ATR', F.filter((t) => t.gapAtr >= 0.15)); row('hueco < 15 % del ATR', F.filter((t) => t.gapAtr < 0.15));
console.log('\n-- riesgo (A) --'); row('riesgo < 5 pips', F.filter((t) => t.riskPips < 5)); row('riesgo 5–15 pips', F.filter((t) => t.riskPips >= 5 && t.riskPips < 15)); row('riesgo ≥ 15 pips', F.filter((t) => t.riskPips >= 15));
console.log('\n-- hora del llenado (A) --'); row('se llena en la 1.ª hora (Asia abre)', F.filter((t) => t.fillHour === 0)); row('se llena en Asia (1–8h)', F.filter((t) => t.fillHour >= 1 && t.fillHour <= 8)); row('se llena en Londres o después (≥ 9h)', F.filter((t) => t.fillHour >= 9));
console.log('\n-- combinaciones documentadas (A) --'); row('hueco más allá del extremo de 20 días (Turtle Soup)', F.filter((t) => t.beyond20)); row('hueco dentro del rango de 20 días', F.filter((t) => !t.beyond20)); row('compras', F.filter((t) => t.dir > 0)); row('ventas', F.filter((t) => t.dir < 0));
row('radar a favor (≥ 2, 2023→)', F.filter((t) => t.radar !== null && Math.sign(t.radar) === t.dir && Math.abs(t.radar) >= 2)); row('radar en contra', F.filter((t) => t.radar !== null && Math.sign(t.radar) === -t.dir && Math.abs(t.radar) >= 2)); row('sin radar (antes de 2023-09)', F.filter((t) => t.radar === null));
row('lunes + riesgo ≥ 5 pips', F.filter((t) => t.dow === 1 && t.riskPips >= 5)); row('lunes + stop mínimo 8 (B)', F.filter((t) => t.dow === 1), 'B');
console.log('\n-- por par (A) --'); for (const s of PAIRS) row(s, F.filter((t) => t.sym === s));
console.log('\n-- por año (A, 2R) --'); console.log('  ' + [...new Set(F.map((t) => t.year))].sort().map((y) => { const Y = F.filter((t) => t.year === y); return `${y}:${pct(Y.filter((t) => t.A.r2 > 0).length, Y.length).trim()} ${mean(Y.map((t) => t.A.r2)) >= 0 ? '+' : ''}${mean(Y.map((t) => t.A.r2)).toFixed(2)} (${Y.length})`; }).join(' · '));
const eq = (L, k, key) => { let e = 1, pk = 1, dd = 0, mx = 0, c = 0; for (const t of [...L].sort((a, b) => (a.date < b.date ? -1 : 1))) { e *= 1 + 0.01 * t[k][key]; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); if (t[k][key] < 0) { c++; mx = Math.max(mx, c); } else c = 0; } return `${((e - 1) * 100).toFixed(0)} % · caída máx. ${(dd * 100).toFixed(0)} % · racha ${mx}`; };
console.log(`\n-- cuenta al 1 % por operación, 11,7 años --\n  A 1R ${eq(F, 'A', 'r1')} · A 2R ${eq(F, 'A', 'r2')} · B 2R ${eq(F, 'B', 'r2')} · A 3R ${eq(F, 'A', 'r3')} · ${(F.length / 11.7).toFixed(0)} operaciones/año en 10 pares`);
// ---- prueba de estrés de costes: en la primera hora del domingo (17:00–18:00 NY) el spread real es mucho mayor.
// Se recalcula con un coste extra de 4 pips de spread + 2 pips de deslizamiento para los llenados en la hora 0, y se mira
// también la alternativa ejecutable: poner la orden a partir de las 18:00 NY (hora 1), y el "cierre del hueco" a mercado en la apertura.
{
  const STRESS = 4, SLIP = 2; const T2 = [];
  for (const sym of PAIRS) {
    const pip = pipOf(sym); const D = load(sym);
    for (let i = 21; i < D.length - 1; i++) { const d = D[i], p = D[i - 1]; if (!d.atr) continue;
      for (const dir of [1, -1]) { const gap = dir > 0 ? p.l - d.o : d.o - p.h; if (gap <= 0) continue; const lvl = dir > 0 ? p.l : p.h;
        let fill = -1; for (let k = 0; k < d.bars.length; k++) { const b = d.bars[k]; if (dir > 0 ? b.h >= lvl : b.l <= lvl) { fill = k; break; } } if (fill < 0) continue;
        const h0 = d.bars[fill].hour === 0; const sp = (((SPREAD0[sym] ?? 2.5) + EXTRA) + (h0 ? STRESS : 0)) * pip; const ex = (EXTRA + (h0 ? SLIP : 0)) * pip;
        const ext = dir > 0 ? Math.min(...d.bars.slice(0, fill + 1).map((b) => b.l)) : Math.max(...d.bars.slice(0, fill + 1).map((b) => b.h)); const entry = dir > 0 ? lvl + sp : lvl; const stopA = dir > 0 ? ext - pip : ext + pip; const risk = Math.abs(entry - stopA);
        const stopB = risk < 8 * pip ? (dir > 0 ? entry - 8 * pip : entry + 8 * pip) : stopA;
        // a mercado en la apertura, objetivo = cierre del hueco (el extremo de ayer), stop = 1 × hueco (RR 1:1 en pips) y 2 × hueco
        const entryO = dir > 0 ? d.o + sp : d.o; const gapR = dir > 0 ? lvl - entryO : entryO - lvl; const simGap = (stopMult) => { if (gapR <= 2 * pip) return null; const stop = dir > 0 ? entryO - stopMult * gapR : entryO + stopMult * gapR; let out = null; for (let k = 0; k < d.bars.length; k++) { const b = d.bars[k]; if (dir > 0 ? b.l <= stop : b.h >= stop) { out = -1 - ex / (stopMult * gapR); break; } if (dir > 0 ? b.h >= lvl : b.l <= lvl) { out = 1 / stopMult; break; } } if (out === null) { const last = d.bars.at(-1).c; out = Math.max(-1, (dir > 0 ? last - entryO : entryO - last) / (stopMult * gapR)); } return out; };
        T2.push({ sym, date: d.date, year: d.date.slice(0, 4), h0, gapPips: gap / pip, gapAtr: gap / d.atr, riskPips: risk / pip, A: sim(d.bars, fill, dir, entry, stopA, ex), B: sim(d.bars, fill, dir, entry, stopB, ex), gap1: simGap(1), gap2: simGap(2) });
      } }
  }
  console.log(`\n==================== Estrés de costes: hora 0 con +${STRESS} pips de spread y +${SLIP} de deslizamiento ====================`);
  const rowS = (name, L, k = 'A') => { if (L.length < 15) return; const g = (key) => L.map((t) => t[k][key]); console.log(`  ${name.padEnd(46)} n=${String(L.length).padStart(4)} · 1R ${pct(g('r1').filter((x) => x > 0).length, L.length)} ${mean(g('r1')) >= 0 ? '+' : ''}${mean(g('r1')).toFixed(2)}R · 2R ${pct(g('r2').filter((x) => x > 0).length, L.length)} ${mean(g('r2')) >= 0 ? '+' : ''}${mean(g('r2')).toFixed(2)}R · 3R ${pct(g('r3').filter((x) => x > 0).length, L.length)} ${mean(g('r3')) >= 0 ? '+' : ''}${mean(g('r3')).toFixed(2)}R`); };
  rowS('A · todo (coste estresado)', T2, 'A'); rowS('B · stop mínimo 8 pips (coste estresado)', T2, 'B'); rowS('A · solo llenados a partir de las 18:00 NY (sin hora 0)', T2.filter((t) => !t.h0), 'A'); rowS('A · hora 0, hueco < 15 % ATR', T2.filter((t) => t.h0 && t.gapAtr < 0.15), 'A'); rowS('A · hora 0, hueco ≥ 15 % ATR', T2.filter((t) => t.h0 && t.gapAtr >= 0.15), 'A'); rowS('B · hueco < 15 % ATR (todo)', T2.filter((t) => t.gapAtr < 0.15), 'B'); rowS('B · riesgo ≥ 8 pips de verdad (sin ajuste)', T2.filter((t) => t.riskPips >= 8), 'B');
  const gp = (L0, k) => { const L = L0.filter((t) => t[k] !== null); return `${pct(L.filter((t) => t[k] > 0).length, L.length)} ${mean(L.map((t) => t[k])) >= 0 ? '+' : ''}${mean(L.map((t) => t[k])).toFixed(2)}R (n=${L.length})`; };
  console.log(`  cierre del hueco a mercado en la apertura · stop = 1 × hueco: ${gp(T2, 'gap1')} · stop = 2 × hueco: ${gp(T2, 'gap2')} · solo huecos ≥ 8 pips: ${gp(T2.filter((t) => t.gapPips >= 8), 'gap1')}`);
  console.log('  por año (B, 2R, coste estresado): ' + [...new Set(T2.map((t) => t.year))].sort().map((y) => { const Y = T2.filter((t) => t.year === y); return `${y.slice(2)}:${pct(Y.filter((t) => t.B.r2 > 0).length, Y.length).trim()}`; }).join(' '));
  const eq2 = (L, k, key) => { let e = 1, pk = 1, dd = 0; for (const t of [...L].sort((a, b) => (a.date < b.date ? -1 : 1))) { e *= 1 + 0.01 * t[k][key]; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); } return `${((e - 1) * 100).toFixed(0)} % (caída ${(dd * 100).toFixed(0)} %)`; };
  console.log(`  cuenta al 1 %, 11,7 años, coste estresado: B 1R ${eq2(T2, 'B', 'r1')} · B 2R ${eq2(T2, 'B', 'r2')} · A 2R ${eq2(T2, 'A', 'r2')}`);
}
