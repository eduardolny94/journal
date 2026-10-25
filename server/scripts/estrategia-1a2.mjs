// Estrategia 1:2 construida sobre lo único medido con ≥ 50 % a 2R: la "barrida de Asia a favor del radar" (docs/MANIPULACION-ASIA.md,
// intradia.js): radar fuerte (|diff| ≥ 3) → Londres (02:00–03:59 NY) barre el lado del rango de Asia que va A FAVOR del radar →
// una vela H1 cierra de vuelta dentro antes de las 06:00 NY → entrada EN CONTRA de la barrida, stop tras la mecha, objetivo 2R.
// Aquí se prueba en los 28 pares de MT5 (2024–2026, que es cuando hay radar), con costes reales, y se intenta mejorar con lo
// aprendido en el FVG: entrada límite (retest del extremo barrido / 50 % de la vela de vuelta) en vez de a mercado, filtros de
// rango de Asia, profundidad de la barrida, hora, fuerza del radar; y se valida con walk-forward (elegir en 2024, probar 2025–26)
// y permutación del signo del radar. Uso: node server/scripts/estrategia-1a2.mjs [--dir data/mt5] [--coste-extra 1]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5')); const EXTRA = Number(argOf('--coste-extra', '1')); const MIN = Number(argOf('--min', '3'));
const SKIP = new Set(['XAUUSD', 'US500F', 'NAS100F', 'US30F']);
const PAIRS = argOf('--pares', null) ? argOf('--pares', '').split(',') : readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => !SKIP.has(s));
const SPREAD0 = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5, GBPCAD: 2.5, EURNZD: 3, GBPNZD: 3.5, AUDCAD: 2, AUDCHF: 2, CADCHF: 2.2, NZDCHF: 2.5, NZDCAD: 2.5, AUDNZD: 2.2, GBPAUD: 2.8, GBPCHF: 2.5, EURCHF: 1.8, CHFJPY: 2.5, NZDJPY: 2.2 };
const pipOf = (s) => (s.endsWith('JPY') ? 0.01 : 0.0001);
const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true });
const biasBy = {}; for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) (biasBy[r.symbol] ||= []).push(r);
const biasAt = (sym, date) => { const rows = biasBy[sym]; if (!rows) return null; let a = null; for (const r of rows) { if (r.date < date) a = r; else break; } return a ? a.diff : null; };
function load(sym) { const days = new Map(); for (const line of readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue; const date = d.replace(/\./g, '-'); if (!days.has(date)) days.set(date, []); days.get(date).push({ hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c }); } return [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars })).filter((d) => d.bars.length >= 20); }
const T = [];
for (const sym of PAIRS) {
  const pip = pipOf(sym), sp = ((SPREAD0[sym] ?? 2.5) + EXTRA) * pip; const D = load(sym);
  for (let i = 1; i < D.length; i++) {
    const d = D[i]; const diff = biasAt(sym, d.date); if (diff === null || Math.abs(diff) < 2) continue;
    const side = Math.sign(diff); // lado que debe barrerse: +1 máximo de Asia
    const asia = d.bars.filter((b) => b.hour >= 2 && b.hour <= 8); if (asia.length < 5) continue; // 19:00–01:59 NY
    const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), range = aH - aL; if (range <= 0) continue;
    const after = d.bars.filter((b) => b.hour >= 9); let first = 0, ext = null, sweepHour = null, closeBar = null, closeIdx = -1;
    for (let k = 0; k < after.length; k++) { const b = after[k]; if (!first) { if (b.hour >= 11) break; const up = b.h > aH, dn = b.l < aL; if (up && dn) { first = 2; break; } if (up) { first = 1; ext = b.h; sweepHour = b.hour; } else if (dn) { first = -1; ext = b.l; sweepHour = b.hour; } if (first && b.c < aH && b.c > aL) { closeBar = b; closeIdx = k; break; } continue; }
      if (b.hour > 12) break; ext = first > 0 ? Math.max(ext, b.h) : Math.min(ext, b.l); if (b.c < aH && b.c > aL) { closeBar = b; closeIdx = k; break; } }
    if (first !== side || !closeBar) continue; // la barrida tiene que ser del lado del radar y volver dentro
    const depth = Math.abs(ext - (first > 0 ? aH : aL)) / range; if (depth > 1) continue;
    const dir = -first; const SL = (risk) => -1 - (EXTRA * pip) / risk;
    const sim = (entry, stop, fromIdx, pending) => { // pending: la entrada es límite y hay que esperar a que la toque (≤ 3 velas)
      const risk = Math.abs(entry - stop); let filled = !pending, fillIdx = fromIdx; if (pending) { filled = false; for (let k = fromIdx; k < Math.min(after.length, fromIdx + 3); k++) { const b = after[k]; if (dir > 0 ? b.l <= entry : b.h >= entry) { filled = true; fillIdx = k; break; } if (dir > 0 ? b.l <= stop : b.h >= stop) break; } }
      if (!filled) return null; const out = { r1: null, r15: null, r2: null, r3: null, asia: null }; const tgtA = dir > 0 ? aH : aL; const rA = Math.abs(tgtA - entry) / risk;
      for (let k = fillIdx; k < after.length; k++) { const b = after[k]; const hs = dir > 0 ? b.l <= stop : b.h >= stop; const up = (m) => (dir > 0 ? b.h >= entry + m * risk : b.l <= entry - m * risk); for (const [key, m] of [['r1', 1], ['r15', 1.5], ['r2', 2], ['r3', 3]]) if (out[key] === null) { if (hs) out[key] = SL(risk); else if (up(m)) out[key] = m; } if (out.asia === null) { if (hs) out.asia = SL(risk); else if (dir > 0 ? b.h >= tgtA : b.l <= tgtA) out.asia = rA; } if (Object.values(out).every((v) => v !== null)) break; }
      const last = after.at(-1).c; const fl = Math.max(-1, (dir > 0 ? last - entry : entry - last) / risk); for (const k of Object.keys(out)) if (out[k] === null) out[k] = fl; return { ...out, riskPips: risk / pip, rA };
    };
    const buf = 1 * pip; const stop = dir > 0 ? ext - buf : ext + buf;
    const mkt = sim(dir > 0 ? closeBar.c + sp : closeBar.c, stop, closeIdx + 1, false);
    const lvl = first > 0 ? aH : aL; const retest = sim(dir > 0 ? lvl + sp : lvl, stop, closeIdx + 1, true); // límite en el extremo barrido (retest)
    const mid = (closeBar.h + closeBar.l) / 2; const half = sim(dir > 0 ? mid + sp : mid, stop, closeIdx + 1, true); // límite al 50 % de la vela de vuelta
    T.push({ sym, date: d.date, year: d.date.slice(0, 4), dir, diff: Math.abs(diff), sweepHour, closeHour: closeBar.hour, rangePips: range / pip, depth, dow: new Date(`${d.date}T00:00:00Z`).getUTCDay(), mkt, retest, half });
  }
}
const pct = (a, n) => (n ? `${String(Math.round((100 * a) / n)).padStart(3)} %` : '  — '); const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const row = (name, L, mode = 'mkt', keys = ['r1', 'r2']) => { const V = L.filter((t) => t[mode]); if (V.length < 25) return; console.log(`  ${name.padEnd(48)} n=${String(V.length).padStart(4)} · ` + keys.map((k) => `${k.padEnd(3)} ${pct(V.filter((t) => t[mode][k] > 0).length, V.length)} ${mean(V.map((t) => t[mode][k])) >= 0 ? '+' : ''}${mean(V.map((t) => t[mode][k])).toFixed(2)}R`).join(' · ') + ` · riesgo med. ${Math.round([...V].map((t) => t[mode].riskPips).sort((a, b) => a - b)[Math.floor(V.length / 2)])} pips`); };
const S = T.filter((t) => t.diff >= MIN);
console.log(`\nEstrategia 1:2 "barrida de Asia a favor del radar" · ${PAIRS.length} pares · ${path.basename(DATA)} · radar ≥ ${MIN} · coste extra ${EXTRA} pip · señales ${S.length} (≥ 2: ${T.length})`);
console.log('\n-- entrada --');
row('a mercado al cierre de la vela de vuelta (producción)', S, 'mkt', ['r1', 'r15', 'r2', 'r3']); row('límite en el extremo barrido (retest, ≤ 3 velas)', S, 'retest', ['r1', 'r15', 'r2', 'r3']); row('límite al 50 % de la vela de vuelta', S, 'half', ['r1', 'r15', 'r2', 'r3']);
row('a mercado · objetivo = otro extremo de Asia', S, 'mkt', ['asia']);
console.log('\n-- filtros (entrada a mercado, 1R y 2R) --');
row('radar ≥ 2 (todo)', T); row('radar ≥ 3', S); row('radar ≥ 4', T.filter((t) => t.diff >= 4)); row('radar ≥ 5', T.filter((t) => t.diff >= 5));
row('barrida en la vela de las 08:00 España', S.filter((t) => t.sweepHour === 9)); row('barrida a las 09:00', S.filter((t) => t.sweepHour === 10));
row('vuelve dentro en la misma vela', S.filter((t) => t.closeHour === t.sweepHour)); row('vuelve dentro 1–3 velas después', S.filter((t) => t.closeHour > t.sweepHour));
const q = (L, key) => { const v = [...L].map((t) => t[key]).sort((a, b) => a - b); return [v[Math.floor(v.length / 3)], v[Math.floor((2 * v.length) / 3)]]; };
const [r1, r2] = q(S, 'rangePips'); row(`Asia estrecha (< ${r1.toFixed(0)} pips)`, S.filter((t) => t.rangePips < r1)); row('Asia media', S.filter((t) => t.rangePips >= r1 && t.rangePips < r2)); row(`Asia ancha (≥ ${r2.toFixed(0)} pips)`, S.filter((t) => t.rangePips >= r2));
const [d1, d2] = q(S, 'depth'); row(`barrida corta (< ${(100 * d1).toFixed(0)} % del rango)`, S.filter((t) => t.depth < d1)); row(`barrida profunda (≥ ${(100 * d2).toFixed(0)} %)`, S.filter((t) => t.depth >= d2));
for (const [dn, dw] of [['lunes', 1], ['martes', 2], ['miércoles', 3], ['jueves', 4], ['viernes', 5]]) row(dn, S.filter((t) => t.dow === dw));
console.log('\n-- por par (radar ≥ 3, a mercado) · 2R --');
const perPair = PAIRS.map((s) => { const L = S.filter((t) => t.sym === s && t.mkt); return { s, n: L.length, w: L.length ? L.filter((t) => t.mkt.r2 > 0).length / L.length : 0, r: mean(L.map((t) => t.mkt.r2)), y: Object.fromEntries(['2024', '2025', '2026'].map((y) => [y, mean(L.filter((t) => t.year === y).map((t) => t.mkt.r2))])) }; }).filter((p) => p.n >= 15).sort((a, b) => b.r - a.r);
for (const p of perPair) console.log(`  ${p.s.padEnd(8)} n=${String(p.n).padStart(3)} · 2R ${pct(Math.round(p.w * p.n), p.n)} ${p.r >= 0 ? '+' : ''}${p.r.toFixed(2)}R · por año ${['2024', '2025', '2026'].map((y) => `${y} ${p.y[y] >= 0 ? '+' : ''}${p.y[y].toFixed(2)}`).join(' · ')}`);
console.log('\n-- walk-forward: pares elegidos por 2024 (R medio a 2R > 0 y n ≥ 8), probados en 2025–2026 --');
const chosen = PAIRS.filter((s) => { const L = S.filter((t) => t.sym === s && t.year === '2024' && t.mkt); return L.length >= 8 && mean(L.map((t) => t.mkt.r2)) > 0; });
console.log('  elegidos: ' + chosen.join(', '));
row('elegidos · 2025–2026 · a mercado', S.filter((t) => chosen.includes(t.sym) && t.year >= '2025'), 'mkt', ['r1', 'r15', 'r2']); row('elegidos · 2025–2026 · límite al 50 %', S.filter((t) => chosen.includes(t.sym) && t.year >= '2025'), 'half', ['r1', 'r15', 'r2']);
row('NO elegidos · 2025–2026 · a mercado', S.filter((t) => !chosen.includes(t.sym) && t.year >= '2025'), 'mkt', ['r1', 'r15', 'r2']);
row('los 3 de producción (AUDCAD/AUDCHF/CADCHF) · todo', S.filter((t) => ['AUDCAD', 'AUDCHF', 'CADCHF'].includes(t.sym)), 'mkt', ['r1', 'r15', 'r2']);
row('los 3 de producción · 2025–2026', S.filter((t) => ['AUDCAD', 'AUDCHF', 'CADCHF'].includes(t.sym) && t.year >= '2025'), 'mkt', ['r1', 'r15', 'r2']);
console.log('\n-- permutación: ¿importa que la barrida sea del lado del radar? (la barrida del lado CONTRARIO, misma regla) --');
// recomputar rápido: casos donde la primera barrida fue del lado contrario al radar
{ const C = []; for (const sym of PAIRS) { const pip = pipOf(sym), sp = ((SPREAD0[sym] ?? 2.5) + EXTRA) * pip; const D = load(sym); for (let i = 1; i < D.length; i++) { const d = D[i]; const diff = biasAt(sym, d.date); if (diff === null || Math.abs(diff) < MIN) continue; const side = -Math.sign(diff); const asia = d.bars.filter((b) => b.hour >= 2 && b.hour <= 8); if (asia.length < 5) continue; const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l)), range = aH - aL; const after = d.bars.filter((b) => b.hour >= 9); let first = 0, ext = null, closeBar = null, closeIdx = -1; for (let k = 0; k < after.length; k++) { const b = after[k]; if (!first) { if (b.hour >= 11) break; const up = b.h > aH, dn = b.l < aL; if (up && dn) { first = 2; break; } if (up) { first = 1; ext = b.h; } else if (dn) { first = -1; ext = b.l; } if (first && b.c < aH && b.c > aL) { closeBar = b; closeIdx = k; break; } continue; } if (b.hour > 12) break; ext = first > 0 ? Math.max(ext, b.h) : Math.min(ext, b.l); if (b.c < aH && b.c > aL) { closeBar = b; closeIdx = k; break; } } if (first !== side || !closeBar) continue; if (Math.abs(ext - (first > 0 ? aH : aL)) / range > 1) continue; const dir = -first; const stop = dir > 0 ? ext - pip : ext + pip; const entry = dir > 0 ? closeBar.c + sp : closeBar.c; const risk = Math.abs(entry - stop); let r2v = null; for (let k = closeIdx + 1; k < after.length; k++) { const b = after[k]; if (dir > 0 ? b.l <= stop : b.h >= stop) { r2v = -1 - (EXTRA * pip) / risk; break; } if (dir > 0 ? b.h >= entry + 2 * risk : b.l <= entry - 2 * risk) { r2v = 2; break; } } if (r2v === null) { const last = after.at(-1).c; r2v = Math.max(-1, (dir > 0 ? last - entry : entry - last) / risk); } C.push(r2v); } }
  console.log(`  barrida del lado CONTRARIO al radar, entrada a favor del radar: n=${C.length} · 2R ${pct(C.filter((x) => x > 0).length, C.length)} ${mean(C) >= 0 ? '+' : ''}${mean(C).toFixed(2)}R`); }
console.log('\n-- el único filtro que asomó (vuelve dentro 1–3 velas después de barrer): ¿aguanta fuera de muestra? --');
const late = (L) => L.filter((t) => t.closeHour > t.sweepHour);
row('vuelve tarde · 2024', late(S.filter((t) => t.year === '2024')), 'mkt', ['r1', 'r15', 'r2']); row('vuelve tarde · 2025', late(S.filter((t) => t.year === '2025')), 'mkt', ['r1', 'r15', 'r2']); row('vuelve tarde · 2026', late(S.filter((t) => t.year === '2026')), 'mkt', ['r1', 'r15', 'r2']);
row('vuelve tarde · sin los 3 de producción', late(S.filter((t) => !['AUDCAD', 'AUDCHF', 'CADCHF'].includes(t.sym))), 'mkt', ['r1', 'r15', 'r2']);
row('vuelve tarde · los 3 de producción', late(S.filter((t) => ['AUDCAD', 'AUDCHF', 'CADCHF'].includes(t.sym))), 'mkt', ['r1', 'r15', 'r2']); row('vuelve en la misma vela · los 3 de producción', S.filter((t) => ['AUDCAD', 'AUDCHF', 'CADCHF'].includes(t.sym) && t.closeHour === t.sweepHour), 'mkt', ['r1', 'r15', 'r2']);
row('vuelve tarde + barrida profunda (≥ 22 %)', late(S.filter((t) => t.depth >= d2)), 'mkt', ['r1', 'r15', 'r2']); row('vuelve tarde + radar ≥ 4', late(S.filter((t) => t.diff >= 4)), 'mkt', ['r1', 'r15', 'r2']);
{ const L = late(S); const eq = (k) => { let e = 1, pk = 1, dd = 0; for (const t of [...L].sort((a, b) => (a.date < b.date ? -1 : 1))) { e *= 1 + 0.01 * t.mkt[k]; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); } return `${((e - 1) * 100).toFixed(0)} % (DD ${(dd * 100).toFixed(0)} %)`; }; console.log(`  cuenta al 1 % (2024–26, 28 pares, vuelve tarde): 1R ${eq('r1')} · 1,5R ${eq('r15')} · 2R ${eq('r2')} · ${(L.length / 2.78).toFixed(0)} ops/año`); }
