// ¿Se repite "sesgo diario + FVG de Asia tocado en Londres + continuación"? EURUSD y GBPUSD, H1 (servidor = NY+7).
//   · Día = vela diaria de forex (17:00 NY → 17:00 NY = 00:00 → 23:59 servidor).
//   · Sesgo del día D (estricto, el de César): el día D−1 cerró POR ENCIMA del máximo de D−2 → alcista; POR DEBAJO del
//     mínimo de D−2 → bajista; si no, sin sesgo. Alternativa (simple): el día D−1 cerró alcista/bajista (cierre vs apertura).
//   · Asia = 18:00–02:00 NY = horas 01–08 del servidor. Londres = 02:00–08:00 NY = horas 09–14.
//   · FVG 1 h en Asia: tres velas seguidas dentro de Asia con hueco (alcista: mínimo de la 3.ª > máximo de la 1.ª; bajista al
//     revés), a favor del sesgo (alcista con sesgo alcista = soporte por debajo) e intacto a la apertura de Londres (el precio
//     no volvió a entrar en el hueco). FVG 4 h: velas de 4 h alineadas con Asia (21–01, 01–05, 05–09 servidor) con el hueco en
//     la vela 01–05 (18–22 NY): formado por completo al terminar Asia.
//   · Londres: ¿toca el FVG? Tras tocarlo, ¿rompe el extremo de Asia a favor del sesgo antes de atravesar el FVG? ¿cierra el
//     día a favor? Operación: límite en el borde cercano del FVG, stop 2 pips tras el borde lejano, objetivos 1R, 2R y el
//     extremo de Asia; se cierra al final del día. Spread descontado.
// Uso: node server/scripts/backtest-fvg-asia-londres.mjs [--dir data/mt5-fxcm] [--pares EURUSD,GBPUSD] [--desde 2015-01-01]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5-fxcm')); const FROM = argOf('--desde', '2015-01-01');
const PAIRS = argOf('--pares', 'EURUSD,GBPUSD').split(',').map((s) => s.trim().toUpperCase());
const SPREAD = { EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, AUDUSD: 1.2, USDCAD: 1.5 };
const ASIA = [1, 8], LONDON = [9, 14]; // horas del servidor incluidas
const BUFFER_PIPS = 2;

function load(sym) {
  const days = new Map();
  for (const line of readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) {
    const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue;
    const date = d.replace(/\./g, '-'); if (!days.has(date)) days.set(date, []); days.get(date).push({ hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  const list = [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars, o: bars[0].o, c: bars.at(-1).c, h: Math.max(...bars.map((b) => b.h)), l: Math.min(...bars.map((b) => b.l)) }));
  return list.filter((d) => d.bars.length >= 20); // días completos
}
const pct = (a, n) => (n ? `${String(Math.round((100 * a) / n)).padStart(3)} %` : '  — ');
const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const fvgs = (bars, dir) => { // tríos consecutivos; dir +1 busca FVG alcista (hueco por debajo), −1 bajista
  const out = []; for (let i = 2; i < bars.length; i++) { const a = bars[i - 2], c = bars[i]; if (dir > 0 && c.l > a.h) out.push({ top: c.l, bot: a.h, formedIdx: i }); if (dir < 0 && c.h < a.l) out.push({ top: a.l, bot: c.h, formedIdx: i }); } return out; };
const results = [];
for (const sym of PAIRS) {
  const pip = sym.endsWith('JPY') ? 0.01 : 0.0001; const sp = (SPREAD[sym] ?? 2) * pip; const D = load(sym);
  for (let i = 2; i < D.length; i++) {
    const d = D[i], p1 = D[i - 1], p2 = D[i - 2]; if (d.date < FROM) continue;
    const strict = p1.c > p2.h ? 1 : p1.c < p2.l ? -1 : 0; const simple = p1.c > p1.o ? 1 : p1.c < p1.o ? -1 : 0;
    const asia = d.bars.filter((b) => b.hour >= ASIA[0] && b.hour <= ASIA[1]); const london = d.bars.filter((b) => b.hour >= LONDON[0] && b.hour <= LONDON[1]);
    if (asia.length < 6 || london.length < 4) continue;
    const asiaH = Math.max(...asia.map((b) => b.h)), asiaL = Math.min(...asia.map((b) => b.l)); const londonOpen = london[0].o;
    const row = { sym, date: d.date, strict, simple, dayDir: Math.sign(d.c - d.o), tookPDH: d.h > p1.h, tookPDL: d.l < p1.l, closeAbovePDH: d.c > p1.h, closeBelowPDL: d.c < p1.l };
    results.push(row);
    const combos = [['strict', strict], ['simple', simple], ['contra', -strict], ['nosesgo_up', strict === 0 ? 1 : 0], ['nosesgo_dn', strict === 0 ? -1 : 0]];
    for (const [biasName, bias] of combos) {
      if (!bias) continue;
      for (const tf of ['1h', '4h']) {
        let list;
        if (tf === '1h') list = fvgs(asia, bias).map((f) => ({ ...f, formedHour: asia[f.formedIdx].hour }));
        else { // velas 4 h 21–01 (día anterior), 01–05, 05–09
          const prevTail = p1.bars.filter((b) => b.hour >= 21); const c1 = prevTail.length ? { o: prevTail[0].o, h: Math.max(...prevTail.map((b) => b.h)), l: Math.min(...prevTail.map((b) => b.l)), c: prevTail.at(-1).c } : null;
          const mk = (hs) => { const bb = asia.filter((b) => hs.includes(b.hour)); return bb.length ? { h: Math.max(...bb.map((b) => b.h)), l: Math.min(...bb.map((b) => b.l)) } : null; };
          const c2 = mk([1, 2, 3, 4]), c3 = mk([5, 6, 7, 8]); list = [];
          if (c1 && c2 && c3) { if (bias > 0 && c3.l > c1.h) list.push({ top: c3.l, bot: c1.h, formedHour: 8 }); if (bias < 0 && c3.h < c1.l) list.push({ top: c1.l, bot: c3.h, formedHour: 8 }); }
        }
        // intacto a la apertura de Londres: tras formarse, el precio no entró en el hueco; y Londres abre al lado correcto
        const intact = list.filter((f) => { const after = asia.filter((b) => b.hour > f.formedHour); const entered = after.some((b) => (bias > 0 ? b.l <= f.top : b.h >= f.bot)); return !entered && (bias > 0 ? londonOpen > f.top : londonOpen < f.bot); });
        if (!intact.length) { row[`${biasName}_${tf}`] = { has: false }; continue; }
        const f = intact.sort((a, b) => (bias > 0 ? b.top - a.top : a.bot - b.bot))[0]; // el más cercano al precio
        const near = bias > 0 ? f.top : f.bot, far = bias > 0 ? f.bot : f.top;
        const entryPx = bias > 0 ? near + sp : near; const stop = bias > 0 ? far - BUFFER_PIPS * pip : far + BUFFER_PIPS * pip; const risk = Math.abs(entryPx - stop);
        const stopB = bias > 0 ? far - 10 * pip : far + 10 * pip; const riskB = Math.abs(entryPx - stopB);
        const target = bias > 0 ? asiaH : asiaL; // extremo de Asia a favor
        let touchHour = null, filled = false, outcome = null; const r = { r1: null, r2: null, asia: null, b1: null, b2: null, basia: null };
        const rest = d.bars.filter((b) => b.hour >= LONDON[0]);
        for (const b of rest) {
          if (!filled) { if (b.hour > LONDON[1]) break; if (bias > 0 ? b.l <= entryPx : b.h >= entryPx) { filled = true; touchHour = b.hour; } else continue; }
          // tras el llenado, evaluar en la misma vela y siguientes (orden conservador: stop primero)
          const hitStop = bias > 0 ? b.l <= stop : b.h >= stop;
          const reach = (m) => (bias > 0 ? b.h >= entryPx + m * risk : b.l <= entryPx - m * risk);
          const reachAsia = bias > 0 ? b.h >= target : b.l <= target;
          if (r.r1 === null) { if (hitStop) r.r1 = -1; else if (reach(1)) r.r1 = 1; }
          if (r.r2 === null) { if (hitStop) r.r2 = -1; else if (reach(2)) r.r2 = 2; }
          if (r.asia === null) { if (hitStop) r.asia = -1; else if (reachAsia) r.asia = Math.abs(target - entryPx) / risk; }
          const hitStopB = bias > 0 ? b.l <= stopB : b.h >= stopB; const reachB = (m) => (bias > 0 ? b.h >= entryPx + m * riskB : b.l <= entryPx - m * riskB);
          if (r.b1 === null) { if (hitStopB) r.b1 = -1; else if (reachB(1)) r.b1 = 1; }
          if (r.b2 === null) { if (hitStopB) r.b2 = -1; else if (reachB(2)) r.b2 = 2; }
          if (r.basia === null) { if (hitStopB) r.basia = -1; else if (reachAsia) r.basia = Math.abs(target - entryPx) / riskB; }
          if (Object.values(r).every((v) => v !== null)) break;
        }
        if (filled) { const last = d.c; const open = (v) => (v === null ? Math.max(-1, (bias > 0 ? last - entryPx : entryPx - last) / risk) : v); r.r1 = open(r.r1); r.r2 = open(r.r2); r.asia = open(r.asia); const openB = (v) => (v === null ? Math.max(-1, (bias > 0 ? last - entryPx : entryPx - last) / riskB) : v); r.b1 = openB(r.b1); r.b2 = openB(r.b2); r.basia = openB(r.basia); outcome = { touched: true, continued: r.asia > 0, closeWithBias: Math.sign(d.c - d.o) === bias, riskPips: risk / pip, asiaRR: Math.abs(target - entryPx) / risk }; }
        row[`${biasName}_${tf}`] = { has: true, filled, touchHour, r: filled ? r : null, ...outcome, closeWithBias: Math.sign(d.c - d.o) === bias };
      }
    }
  }
}
// ---------- informes
const byPair = (sym) => results.filter((r) => r.sym === sym);
console.log(`\nFVG de Asia tocado en Londres · ${PAIRS.join(', ')} · ${path.basename(DATA)} · desde ${FROM}`);
for (const sym of PAIRS) {
  const R = byPair(sym); console.log(`\n==================== ${sym} · ${R.length} días ====================`);
  console.log('\n-- 1) ¿El sesgo diario acierta el día? --');
  const base = pct(R.filter((r) => r.dayDir > 0).length, R.length);
  console.log(`  base: el día cierra alcista ${base} (lo demás, bajista)`);
  for (const [name, key] of [['estricto (cierre fuera del rango del día anterior)', 'strict'], ['simple (dirección del día anterior)', 'simple']]) {
    const B = R.filter((r) => r[key] !== 0);
    console.log(`  sesgo ${name}: días con sesgo ${pct(B.length, R.length)} (n=${B.length})`);
    console.log(`     el día cierra a favor del sesgo ${pct(B.filter((r) => r.dayDir === r[key]).length, B.length)} · barre el extremo del día anterior a favor ${pct(B.filter((r) => (r[key] > 0 ? r.tookPDH : r.tookPDL)).length, B.length)} · en contra ${pct(B.filter((r) => (r[key] > 0 ? r.tookPDL : r.tookPDH)).length, B.length)} · cierra fuera del rango anterior a favor ${pct(B.filter((r) => (r[key] > 0 ? r.closeAbovePDH : r.closeBelowPDL)).length, B.length)}`);
  }
  console.log('\n-- 2) FVG de Asia a favor del sesgo, intacto en la apertura de Londres --');
  for (const biasName of ['strict', 'simple', 'contra', 'nosesgo_up', 'nosesgo_dn']) for (const tf of ['1h', '4h']) {
    const k = `${biasName}_${tf}`; const B = R.filter((r) => (biasName === 'contra' ? r.strict !== 0 : biasName.startsWith('nosesgo') ? r.strict === 0 : r[biasName] !== 0)); const H = B.filter((r) => r[k] && r[k].has); const T = H.filter((r) => r[k].filled);
    if (!H.length) { console.log(`  ${biasName} ${tf}: sin casos`); continue; }
    const rr = (key) => { const v = T.map((r) => r[k].r[key]); return `${pct(v.filter((x) => x > 0).length, v.length)} ${mean(v) >= 0 ? '+' : ''}${mean(v).toFixed(2)}R`; };
    console.log(`  sesgo ${biasName.padEnd(6)} FVG ${tf}: hay FVG a favor ${pct(H.length, B.length)} de los días con sesgo (n=${H.length}) · Londres lo toca ${pct(T.length, H.length)} (n=${T.length})`);
    console.log(`     tras tocarlo: rompe el extremo de Asia a favor antes del stop ${pct(T.filter((r) => r[k].continued).length, T.length)} · el día cierra a favor ${pct(T.filter((r) => r[k].closeWithBias).length, T.length)} (días con FVG sin toque: ${pct(H.filter((r) => !r[k].filled && r[k].closeWithBias).length, H.length - T.length)})`);
    console.log(`     operación (límite en el borde, stop tras el FVG +2 pips, cierre al final del día): 1R ${rr('r1')} · 2R ${rr('r2')} · objetivo extremo de Asia ${rr('asia')} | stop +10 pips: 1R ${rr('b1')} · 2R ${rr('b2')} · Asia ${rr('basia')} · riesgo mediano ${Math.round([...T].map((r) => r[k].riskPips).sort((a, b) => a - b)[Math.floor(T.length / 2)] || 0)} pips · objetivo Asia mediano ${([...T].map((r) => r[k].asiaRR).sort((a, b) => a - b)[Math.floor(T.length / 2)] || 0).toFixed(1)}R`);
    const hours = {}; for (const r of T) hours[r[k].touchHour] = (hours[r[k].touchHour] || 0) + 1; console.log(`     hora del toque (servidor, −7 = NY, −1 = España): ${Object.entries(hours).sort((a, b) => a[0] - b[0]).map(([h, n]) => `${h}h:${n}`).join(' ')}`);
  }
  console.log('\n-- 4) Por año · sesgo estricto · FVG 1h · objetivo extremo de Asia --');
  for (const y of [...new Set(R.map((r) => r.date.slice(0, 4)))].sort()) { const T = R.filter((r) => r.date.startsWith(y) && r.strict_1h && r.strict_1h.filled); if (!T.length) continue; const v = T.map((r) => r.strict_1h.r.asia); console.log(`  ${y}: n=${String(T.length).padStart(3)} · continúa ${pct(T.filter((r) => r.strict_1h.continued).length, T.length)} · ${pct(v.filter((x) => x > 0).length, v.length)} ${mean(v) >= 0 ? '+' : ''}${mean(v).toFixed(2)}R · 1R ${pct(T.map((r) => r.strict_1h.r.r1).filter((x) => x > 0).length, T.length)}`); }
}
