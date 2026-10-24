// ¿Se puede llegar al 60 % con objetivo 1:2 en el FVG de Asia? Palancas medidas sobre la regla base (FVG de Asia, Asia a favor,
// límite al 50 % (4 h) o en el borde (1 h), stop 10 pips tras el borde lejano, toque desde las 10h servidor, cierre al final del día):
//   gestión (BE en 1R, parcial 50 % en 1R), objetivo por estructura (extremo de Asia, máximo/mínimo de ayer), filtro de espacio
//   (que el 2R quepa antes de la liquidez de ayer), volatilidad (ATR diario), tendencia (EMA 50 de 4 h y de 1 h), confluencia
//   (FVG de 1 h dentro del de 4 h), entrada en el borde lejano, día de la semana. Costes: --coste-extra 1.5.
// Uso: node server/scripts/fvg-asia-2r.mjs [--dir data/mt5-fxcm] [--desde 2015-01-01] [--coste-extra 1.5] [--pares ...]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url)); const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5-fxcm')); const FROM = argOf('--desde', '2015-01-01'); const EXTRA = Number(argOf('--coste-extra', '1.5'));
const SKIP = new Set(['XAUUSD', 'US500F', 'NAS100F', 'US30F']);
const PAIRS = argOf('--pares', null) ? argOf('--pares', '').split(',') : readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => !SKIP.has(s));
const SPREAD0 = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5, GBPCAD: 2.5, EURNZD: 3, GBPNZD: 3.5 };
const pipOf = (s) => (s.endsWith('JPY') ? 0.01 : 0.0001); const STOP = Number(argOf('--stop', '10'));
import { DatabaseSync } from 'node:sqlite';
let biasBy = {}; try { const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true }); for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) (biasBy[r.symbol] ||= []).push(r); } catch { biasBy = {}; }
const biasAt = (sym, date) => { const rows = biasBy[sym]; if (!rows) return null; let a = null; for (const r of rows) { if (r.date < date) a = r; else break; } return a ? a.diff : null; };
const yields = {}; for (const [ccy, f] of [['USD', 'US2Y.csv'], ['EUR', 'EUR2Y.csv'], ['JPY', 'JPY2Y.csv']]) { try { yields[ccy] = readFileSync(path.join(ROOT, 'data', 'yields', f), 'utf8').trim().split(/\r?\n/).slice(1).map((l) => { const [d, v] = l.split(','); return { d, v: +v }; }).filter((r) => Number.isFinite(r.v)); } catch { /* sin serie */ } }
const idxAt = (rows, date) => { let lo = 0, hi = rows.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m].d < date) { a = m; lo = m + 1; } else hi = m - 1; } return a; };
const fundAt = (sym, date) => { const b = yields[sym.slice(0, 3)], q = yields[sym.slice(3)]; if (!b || !q) return null; const ib = idxAt(b, date), iq = idxAt(q, date); if (ib < 120 || iq < 120) return null; const ch = (b[ib].v - q[iq].v) - (b[ib - 120].v - q[iq - 120].v); return Math.abs(ch) < 0.15 ? 0 : Math.sign(ch); };
function load(sym) { const all = []; for (const line of readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue; all.push({ date: d.replace(/\./g, '-'), hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c }); }
  // EMA 50 de 1 h y EMA 50 de 4 h (velas 4 h alineadas a 01,05,09,13,17,21)
  let e1 = null; const k1 = 2 / 51; let f8 = null, f18 = null; all.forEach((b) => { e1 = e1 === null ? b.c : e1 + k1 * (b.c - e1); b.ema1 = e1; f8 = f8 === null ? b.c : f8 + (2 / 9) * (b.c - f8); f18 = f18 === null ? b.c : f18 + (2 / 19) * (b.c - f18); b.cruce1 = Math.sign(f8 - f18); });
  { // velas 4 h alineadas a 01,05,09,13,17,21 → EMA 8/18 de 4 h con el cierre de cada vela
    let g8 = null, g18 = null, cur = null; all.forEach((b) => { const slot = `${b.date}-${Math.floor(((b.hour + 3) % 24) / 4)}`; if (cur !== null && cur.slot !== slot) { g8 = g8 === null ? cur.c : g8 + (2 / 9) * (cur.c - g8); g18 = g18 === null ? cur.c : g18 + (2 / 19) * (cur.c - g18); } cur = cur && cur.slot === slot ? { slot, c: b.c } : { slot, c: b.c }; b.cruce4 = g8 === null ? 0 : Math.sign(g8 - g18); });
  }
  let e4 = null, acc = null; const k4 = 2 / 51; all.forEach((b) => { const slot = Math.floor(((b.hour + 3) % 24) / 4); if (!acc || acc.slot !== slot || acc.date !== b.date && !(b.hour < 1)) { if (acc) { e4 = e4 === null ? acc.c : e4 + k4 * (acc.c - e4); } acc = { slot, date: b.date, c: b.c }; } else acc.c = b.c; b.ema4 = e4; });
  const days = new Map(); for (const b of all) { if (!days.has(b.date)) days.set(b.date, []); days.get(b.date).push(b); }
  const D = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars, o: bars[0].o, c: bars.at(-1).c, h: Math.max(...bars.map((b) => b.h)), l: Math.min(...bars.map((b) => b.l)) })).filter((d) => d.bars.length >= 20);
  D.forEach((d, i) => { const w = D.slice(Math.max(0, i - 14), i); d.atr = w.length ? w.reduce((s, x) => s + (x.h - x.l), 0) / w.length : null; }); return D; }
const mk = (bb) => (bb.length ? { o: bb[0].o, c: bb.at(-1).c, h: Math.max(...bb.map((b) => b.h)), l: Math.min(...bb.map((b) => b.l)) } : null);
const T = [];
for (const sym of PAIRS) {
  const pip = pipOf(sym), sp = ((SPREAD0[sym] ?? 2.5) + EXTRA) * pip; const D = load(sym);
  for (let i = 2; i < D.length; i++) {
    const d = D[i], p1 = D[i - 1]; if (d.date < FROM || !d.atr) continue;
    const asia = d.bars.filter((b) => b.hour >= 1 && b.hour <= 8), london = d.bars.filter((b) => b.hour >= 9 && b.hour <= 14); if (asia.length < 6 || london.length < 4) continue;
    const asiaH = Math.max(...asia.map((b) => b.h)), asiaL = Math.min(...asia.map((b) => b.l)), lonOpen = london[0].o, asiaDir = Math.sign(asia.at(-1).c - asia[0].o);
    const c1 = mk(p1.bars.filter((b) => b.hour >= 21)), c2 = mk(asia.filter((b) => b.hour <= 4)), c3 = mk(asia.filter((b) => b.hour >= 5)); if (!c1 || !c2 || !c3) continue;
    const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    for (const dir of [1, -1]) {
      if (asiaDir !== dir) continue;
      const cands = [];
      if (dir > 0 && c3.l > c1.h) cands.push({ tf: '4h', top: c3.l, bot: c1.h, formed: 8 }); if (dir < 0 && c3.h < c1.l) cands.push({ tf: '4h', top: c1.l, bot: c3.h, formed: 8 });
      for (let k = 2; k < asia.length; k++) { const a = asia[k - 2], c = asia[k]; if (dir > 0 && c.l > a.h) cands.push({ tf: '1h', top: c.l, bot: a.h, formed: c.hour }); if (dir < 0 && c.h < a.l) cands.push({ tf: '1h', top: a.l, bot: c.h, formed: c.hour }); }
      const intact = cands.filter((f) => !asia.filter((b) => b.hour > f.formed).some((b) => (dir > 0 ? b.l <= f.top : b.h >= f.bot)) && (dir > 0 ? lonOpen > f.top : lonOpen < f.bot));
      const f4 = intact.filter((f) => f.tf === '4h')[0]; const f1s = intact.filter((f) => f.tf === '1h').sort((a, b) => (dir > 0 ? b.top - a.top : a.bot - b.bot)); const f1 = f1s[0];
      for (const [tf, f, mode] of [['4h', f4, '50 %'], ['1h', f1, 'borde'], ['4h', f4, 'lejano']]) {
        if (!f) continue;
        const near = dir > 0 ? f.top : f.bot, far = dir > 0 ? f.bot : f.top; const level = mode === '50 %' ? (f.top + f.bot) / 2 : mode === 'lejano' ? far : near;
        const entry = dir > 0 ? level + sp : level, stop = dir > 0 ? far - STOP * pip : far + STOP * pip, risk = Math.abs(entry - stop);
        const liq = dir > 0 ? p1.h : p1.l; const roomLiq = Math.abs(liq - entry) / risk; const roomAsia = Math.abs((dir > 0 ? asiaH : asiaL) - entry) / risk;
        let filled = false, touch = null; const res = { r2: null, r15: null, be: null, part: null, asia: null, liq: null }; let r1hit = false, beStop = false;
        const SL = -1 - (EXTRA * pip) / risk;
        for (const b of d.bars.filter((b) => b.hour >= 9)) {
          if (!filled) { if (b.hour > 14) break; if (dir > 0 ? b.l <= entry : b.h >= entry) { filled = true; touch = b.hour; } else continue; }
          const hitStop = dir > 0 ? b.l <= stop : b.h >= stop, hitEntry = dir > 0 ? b.l <= entry : b.h >= entry; const up = (m) => (dir > 0 ? b.h >= entry + m * risk : b.l <= entry - m * risk);
          if (res.r2 === null) { if (hitStop) res.r2 = SL; else if (up(2)) res.r2 = 2; }
          if (res.r15 === null) { if (hitStop) res.r15 = SL; else if (up(1.5)) res.r15 = 1.5; }
          // BE en 1R: hasta tocar 1R, stop normal; después stop en la entrada
          if (res.be === null) { if (!r1hit) { if (hitStop) { res.be = SL; res.part = SL; } else if (up(1)) { r1hit = true; if (up(2)) { res.be = 2; res.part = 1.5; } } } else { if (b !== null && hitEntry && !beStop) { beStop = true; if (res.be === null) { res.be = 0; res.part = 0.5; } } else if (up(2)) { res.be = 2; res.part = 1.5; } } }
          if (res.asia === null) { if (hitStop) res.asia = SL; else if (dir > 0 ? b.h >= asiaH : b.l <= asiaL) res.asia = roomAsia; }
          if (res.liq === null) { if (hitStop) res.liq = SL; else if (dir > 0 ? b.h >= liq : b.l <= liq) res.liq = roomLiq; }
          if (Object.values(res).every((v) => v !== null)) break;
        }
        if (!filled || touch < 10) continue;
        const openR = (v, floor) => (v === null ? Math.max(floor, (dir > 0 ? d.c - entry : entry - d.c) / risk) : v);
        res.r2 = openR(res.r2, -1); res.r15 = openR(res.r15, -1); res.asia = openR(res.asia, -1); res.liq = openR(res.liq, -1); if (res.be === null) res.be = r1hit ? Math.max(0, (dir > 0 ? d.c - entry : entry - d.c) / risk) : openR(null, -1); if (res.part === null) res.part = r1hit ? 0.5 + 0.5 * Math.max(0, (dir > 0 ? d.c - entry : entry - d.c) / risk) : openR(null, -1);
        let r2hold = null, r3hold = null; { const ext = [...d.bars.filter((b) => b.hour >= touch), ...(D[i + 1] ? D[i + 1].bars : []), ...(D[i + 2] ? D[i + 2].bars : [])]; let st = false; for (const b of ext) { const hitStop = dir > 0 ? b.l <= stop : b.h >= stop; const up = (m) => (dir > 0 ? b.h >= entry + m * risk : b.l <= entry - m * risk); if (r2hold === null) { if (hitStop) r2hold = SL; else if (up(2)) r2hold = 2; } if (r3hold === null) { if (hitStop) r3hold = SL; else if (up(3)) r3hold = 3; } if (r2hold !== null && r3hold !== null) break; } const lastC = ext.at(-1).c; const fl = Math.max(-1, (dir > 0 ? lastC - entry : entry - lastC) / risk); if (r2hold === null) r2hold = fl; if (r3hold === null) r3hold = fl; void st; }
        const b0 = london[0]; const emaOk4 = b0.ema4 !== null && (dir > 0 ? b0.o > b0.ema4 : b0.o < b0.ema4); const emaOk1 = dir > 0 ? b0.ema1 > asia[0].ema1 : b0.ema1 < asia[0].ema1;
        const radar = biasAt(sym, d.date); const fund = fundAt(sym, d.date); const b9 = london[0]; const cruce1 = b9.cruce1 === dir, cruce4 = b9.cruce4 === dir;
        const conflu = tf === '4h' && f1 && f1.top <= f.top + 2 * pip && f1.bot >= f.bot - 2 * pip;
        T.push({ sym, date: d.date, year: d.date.slice(0, 4), dir, tf, mode, ...res, r2hold, r3hold, roomLiq, roomAsia, atrPips: d.atr / pip, asiaRange: (asiaH - asiaL) / pip, emaOk4, emaOk1, conflu, dow, cruce1, cruce4, radar, radarOk: radar !== null && Math.sign(radar) === dir && Math.abs(radar) >= 2, radarStrong: radar !== null && Math.sign(radar) === dir && Math.abs(radar) >= 3, radarContra: radar !== null && Math.sign(radar) === -dir && Math.abs(radar) >= 2, fund, prevDay: Math.sign(p1.c - p1.o) === dir, riskPips: risk / pip });
      }
    }
  }
}
const pct = (a, n) => (n ? `${String(Math.round((100 * a) / n)).padStart(3)} %` : '  — '); const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const row = (name, L, key = 'r2') => { if (L.length < 30) return; const v = L.map((t) => t[key]); console.log(`  ${name.padEnd(52)} n=${String(L.length).padStart(4)} · gana ${pct(v.filter((x) => x > 0).length, v.length)} · ${mean(v) >= 0 ? '+' : ''}${mean(v).toFixed(2)}R`); };
const q = (L, key) => { const v = [...L].map((t) => t[key]).sort((a, b) => a - b); return [v[Math.floor(v.length / 3)], v[Math.floor((2 * v.length) / 3)]]; };
console.log(`\nObjetivo 1:2 · ${PAIRS.length} pares · ${path.basename(DATA)} · desde ${FROM} · coste extra ${EXTRA} pips · toque ≥ 10h · Asia a favor`);
for (const [tf, mode] of [['4h', '50 %'], ['1h', 'borde']]) {
  const B = T.filter((t) => t.tf === tf && t.mode === mode);
  console.log(`\n==================== FVG ${tf} · entrada ${mode} · ${B.length} operaciones ====================`);
  console.log('-- gestión y objetivo --');
  row('2R fijo (base)', B); row('2R con stop a BE al tocar 1R', B, 'be'); row('parcial 50 % en 1R + resto a 2R con BE', B, 'part'); row('objetivo = extremo de Asia', B, 'asia'); row('objetivo = máximo/mínimo de ayer', B, 'liq'); row('2R manteniendo hasta 2 días más (sin cerrar el día)', B, 'r2hold'); row('3R manteniendo hasta 2 días más', B, 'r3hold'); row('2R a 2 días + Asia ancha + volatilidad alta', B.filter((t) => t.asiaRange >= q(B, 'asiaRange')[1] && t.atrPips >= q(B, 'atrPips')[1]), 'r2hold');
  if (tf === '4h') row('entrada en el borde LEJANO (stop 10 pips, riesgo menor)', T.filter((t) => t.tf === '4h' && t.mode === 'lejano'));
  console.log('-- filtros para 2R --');
  row('espacio: liquidez de ayer a ≥ 2R (sin obstáculo)', B.filter((t) => t.roomLiq >= 2)); row('espacio: liquidez de ayer a < 2R (obstáculo)', B.filter((t) => t.roomLiq < 2)); row('liquidez de ayer entre 1R y 2R', B.filter((t) => t.roomLiq >= 1 && t.roomLiq < 2));
  const [a1, a2] = q(B, 'atrPips'); row(`volatilidad alta (ATR 14 d ≥ ${a2.toFixed(0)} pips)`, B.filter((t) => t.atrPips >= a2)); row(`volatilidad baja (ATR < ${a1.toFixed(0)} pips)`, B.filter((t) => t.atrPips < a1));
  const [s1, s2] = q(B, 'asiaRange'); row(`Asia ancha (≥ ${s2.toFixed(0)} pips)`, B.filter((t) => t.asiaRange >= s2)); row(`Asia estrecha (< ${s1.toFixed(0)} pips)`, B.filter((t) => t.asiaRange < s1));
  row('precio al lado correcto de la EMA 50 de 4 h', B.filter((t) => t.emaOk4)); row('…al lado contrario', B.filter((t) => !t.emaOk4)); row('EMA 50 de 1 h inclinada a favor en Asia', B.filter((t) => t.emaOk1)); row('día anterior en la misma dirección', B.filter((t) => t.prevDay));
  if (tf === '4h') { row('confluencia: FVG de 1 h dentro del de 4 h', B.filter((t) => t.conflu)); row('sin confluencia', B.filter((t) => !t.conflu)); }
  for (const [dn, dw] of [['lunes', 1], ['martes', 2], ['miércoles', 3], ['jueves', 4], ['viernes', 5]]) row(dn, B.filter((t) => t.dow === dw));
  console.log('-- combinaciones --');
  row('espacio ≥ 2R + EMA 4 h a favor', B.filter((t) => t.roomLiq >= 2 && t.emaOk4)); row('espacio ≥ 2R + volatilidad alta', B.filter((t) => t.roomLiq >= 2 && t.atrPips >= a2)); row('espacio ≥ 2R + EMA 4 h + BE en 1R', B.filter((t) => t.roomLiq >= 2 && t.emaOk4), 'be'); row('espacio ≥ 2R + EMA 4 h + parcial', B.filter((t) => t.roomLiq >= 2 && t.emaOk4), 'part');
  for (const K of ['r15', 'r2']) {
    console.log(`-- ${K === 'r15' ? '1,5R' : '2R'}: medias, radar y fundamental --`);
    row('base', B, K); row('EMA 50 de 4 h a favor', B.filter((t) => t.emaOk4), K); row('cruce EMA 8/18 de 1 h a favor', B.filter((t) => t.cruce1), K); row('…en contra', B.filter((t) => !t.cruce1), K); row('cruce EMA 8/18 de 4 h a favor', B.filter((t) => t.cruce4), K); row('…en contra', B.filter((t) => !t.cruce4), K); row('cruce 1 h + cruce 4 h a favor', B.filter((t) => t.cruce1 && t.cruce4), K);
    row('radar a favor (≥ 2, desde 2023-09)', B.filter((t) => t.radarOk), K); row('radar fuerte (≥ 3)', B.filter((t) => t.radarStrong), K); row('radar en contra (≥ 2)', B.filter((t) => t.radarContra), K); row('sin radar (antes de 2023-09)', B.filter((t) => t.radar === null), K);
    row('fundamental 2a (120 s.) a favor · EURUSD+USDJPY', B.filter((t) => t.fund === t.dir), K); row('fundamental en contra', B.filter((t) => t.fund === -t.dir), K); row('fundamental a favor + cruce 4 h', B.filter((t) => t.fund === t.dir && t.cruce4), K);
    row('Asia ancha + volatilidad alta', B.filter((t) => t.asiaRange >= q(B, 'asiaRange')[1] && t.atrPips >= q(B, 'atrPips')[1]), K); row('GBPNZD solo', B.filter((t) => t.sym === 'GBPNZD'), K); row('GBPNZD + Asia ancha', B.filter((t) => t.sym === 'GBPNZD' && t.asiaRange >= q(B, 'asiaRange')[1]), K);
  }
  console.log('-- por par, 2R fijo / BE / espacio ≥ 2R + EMA 4 h --');
  for (const s of PAIRS) { const P = B.filter((t) => t.sym === s); if (P.length < 30) continue; const C = P.filter((t) => t.roomLiq >= 2 && t.emaOk4); console.log(`  ${s.padEnd(8)} 2R ${pct(P.filter((t) => t.r2 > 0).length, P.length)} ${mean(P.map((t) => t.r2)) >= 0 ? '+' : ''}${mean(P.map((t) => t.r2)).toFixed(2)}R (${P.length}) · BE ${pct(P.filter((t) => t.be > 0).length, P.length)} ${mean(P.map((t) => t.be)) >= 0 ? '+' : ''}${mean(P.map((t) => t.be)).toFixed(2)}R · combo ${C.length >= 20 ? `${pct(C.filter((t) => t.r2 > 0).length, C.length)} ${mean(C.map((t) => t.r2)) >= 0 ? '+' : ''}${mean(C.map((t) => t.r2)).toFixed(2)}R (${C.length})` : '—'}`); }
  const C = B.filter((t) => t.roomLiq >= 2 && t.emaOk4); console.log('  combo por año (2R): ' + [...new Set(C.map((t) => t.year))].sort().map((y) => { const Y = C.filter((t) => t.year === y); return `${y}:${pct(Y.filter((t) => t.r2 > 0).length, Y.length).trim()}(${Y.length})`; }).join(' '));
}
// ---- por par a 1,5R con la regla final (FVG 4 h al 50 %) y con Asia ancha + volatilidad alta
{
  const B = T.filter((t) => t.tf === '4h' && t.mode === '50 %'); const [, a2] = q(B, 'asiaRange'); const [, v2] = q(B, 'atrPips');
  console.log(`\n==================== Por par · FVG 4 h al 50 % · 1,5R · Asia ancha = ≥ ${a2.toFixed(0)} pips · volatilidad alta = ATR ≥ ${v2.toFixed(0)} pips ====================`);
  const cell = (L) => (L.length < 20 ? '      —          ' : `${pct(L.filter((t) => t.r15 > 0).length, L.length)} ${mean(L.map((t) => t.r15)) >= 0 ? '+' : ''}${mean(L.map((t) => t.r15)).toFixed(2)}R (${String(L.length).padStart(3)})`);
  console.log(`  ${'par'.padEnd(8)} | todo              | Asia ancha        | Asia ancha + vol. alta | 1R con Asia ancha + vol.`);
  const rows = PAIRS.map((s) => { const P = B.filter((t) => t.sym === s); const A = P.filter((t) => t.asiaRange >= a2); const C = A.filter((t) => t.atrPips >= v2); return { s, sc: A.length >= 20 ? mean(A.map((t) => t.r15)) : -9, txt: `  ${s.padEnd(8)} | ${cell(P)} | ${cell(A)} | ${cell(C)} | ${C.length >= 20 ? `${pct(C.filter((t) => t.r2 > -2 && (t.r15 > 0 || t.asia > 0)).length, C.length)}` : '—'}` }; });
  for (const r of rows.sort((a, b) => b.sc - a.sc)) console.log(r.txt);
  const A = B.filter((t) => t.asiaRange >= a2); console.log('  TODOS Asia ancha 1,5R por año: ' + [...new Set(A.map((t) => t.year))].sort().map((y) => { const Y = A.filter((t) => t.year === y); return `${y}:${pct(Y.filter((t) => t.r15 > 0).length, Y.length).trim()}(${Y.length})`; }).join(' '));
}
// ---- GBPNZD con Asia ancha, por año, 1,5R y 2R (para ver si el stop elegido aguanta en el tiempo)
{
  const B = T.filter((t) => t.tf === '4h' && t.mode === '50 %'); const [, a2] = q(B, 'asiaRange'); const G = B.filter((t) => t.sym === 'GBPNZD' && t.asiaRange >= a2);
  console.log(`\n==================== GBPNZD · Asia ancha · stop ${STOP} pips · por año ====================`);
  for (const K of ['r15', 'r2']) console.log(`  ${K === 'r15' ? '1,5R' : '2R  '}: ` + [...new Set(G.map((t) => t.year))].sort().map((y) => { const Y = G.filter((t) => t.year === y); return `${y}:${pct(Y.filter((t) => t[K] > 0).length, Y.length).trim()}(${Y.length})`; }).join(' '));
  const eq = (K) => { let e = 1, pk = 1, dd = 0, mx = 0, c = 0; for (const t of [...G].sort((a, b) => (a.date < b.date ? -1 : 1))) { e *= 1 + 0.01 * t[K]; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); if (t[K] < 0) { c++; mx = Math.max(mx, c); } else c = 0; } return `${((e - 1) * 100).toFixed(0)} % · caída máx. ${(dd * 100).toFixed(0)} % · racha máx. ${mx} pérdidas`; };
  console.log(`  cuenta al 1 % (11 años): 1,5R ${eq('r15')} · 2R ${eq('r2')} · riesgo mediano ${Math.round([...G].map((t) => t.riskPips).sort((a, b) => a - b)[Math.floor(G.length / 2)])} pips`);
}
