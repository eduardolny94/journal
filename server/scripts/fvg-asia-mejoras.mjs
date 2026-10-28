// ¿Cómo mejorar la entrada en el FVG de Asia tocado en Londres? Mide filtros sobre la misma operación (límite en el borde del
// FVG más cercano, stop 10 pips tras el borde lejano, objetivo 1R y extremo de Asia, cierre al final del día), FVG alcistas y
// bajistas sin sesgo previo. Filtros: dirección del radar (desde 2023-09), tamaño del FVG, desplazamiento de la vela que lo deja,
// hora del toque, dirección de Asia, barrido previo del día anterior, día de la semana, entrada al 50 % del hueco.
// Uso: node server/scripts/fvg-asia-mejoras.mjs [--dir data/mt5-fxcm] [--pares EURUSD,GBPUSD] [--desde 2015-01-01]
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5-fxcm')); const FROM = argOf('--desde', '2015-01-01');
import { readdirSync } from 'node:fs';
const SKIP = new Set(['XAUUSD', 'US500F', 'NAS100F', 'US30F']);
const PAIRS = argOf('--pares', null) ? argOf('--pares', '').split(',').map((s) => s.trim().toUpperCase()) : readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => !SKIP.has(s));
const RESUMEN = process.argv.includes('--resumen');
const pipOf = (s) => (s === 'XAUUSD' ? 0.1 : s.endsWith('JPY') ? 0.01 : 0.0001); // oro: 1 pip = 10 centavos
const EXTRA = Number(argOf('--coste-extra', '0')); // pips extra de spread + deslizamiento en el stop (prueba de costes reales)
const SPREAD0 = { XAUUSD: 3, EURUSD: 1, GBPUSD: 1.3, USDJPY: 1, USDCHF: 1.3, USDCAD: 1.5, AUDUSD: 1.2, NZDUSD: 1.6, EURGBP: 1.4, EURJPY: 1.6, GBPJPY: 2.2, AUDJPY: 1.8, CADJPY: 2, EURAUD: 2.5, EURCAD: 2.5, GBPCAD: 2.5, EURNZD: 3, GBPNZD: 3.5 }; const SPREAD = Object.fromEntries(Object.entries(SPREAD0).map(([k, v]) => [k, v + EXTRA])); const ASIA = [1, 8], LONDON = [9, 14]; const STOP_PIPS = Number(argOf('--stop', '10'));
let biasBy = {}; try { const db = new DatabaseSync(path.join(ROOT, 'server', 'data', 'journal.db'), { readOnly: true }); for (const r of db.prepare('SELECT date, symbol, diff FROM radar_daily_bias ORDER BY symbol, date').all()) (biasBy[r.symbol] ||= []).push(r); } catch { biasBy = {}; }
const biasAt = (sym, date) => { const rows = biasBy[sym]; if (!rows) return null; let a = null; for (const r of rows) { if (r.date < date) a = r; else break; } return a ? a.diff : null; };
function load(sym) { const days = new Map(); for (const line of readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue; const date = d.replace(/\./g, '-'); if (!days.has(date)) days.set(date, []); days.get(date).push({ hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c }); } return [...days.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([date, bars]) => ({ date, bars, o: bars[0].o, c: bars.at(-1).c, h: Math.max(...bars.map((b) => b.h)), l: Math.min(...bars.map((b) => b.l)) })).filter((d) => d.bars.length >= 20); }
const T = [];
for (const sym of PAIRS) {
  const pip = pipOf(sym), sp = (SPREAD[sym] ?? 2.5 + EXTRA) * pip; const D = load(sym);
  for (let i = 2; i < D.length; i++) {
    const d = D[i], p1 = D[i - 1]; if (d.date < FROM) continue;
    const asia = d.bars.filter((b) => b.hour >= ASIA[0] && b.hour <= ASIA[1]); const london = d.bars.filter((b) => b.hour >= LONDON[0] && b.hour <= LONDON[1]); if (asia.length < 6 || london.length < 4) continue;
    const asiaH = Math.max(...asia.map((b) => b.h)), asiaL = Math.min(...asia.map((b) => b.l)), asiaRange = (asiaH - asiaL) / pip; const londonOpen = london[0].o;
    const asiaDir = Math.sign(asia.at(-1).c - asia[0].o); const sweptPDH = asiaH > p1.h, sweptPDL = asiaL < p1.l;
    const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay(); const radar = biasAt(sym, d.date);
    const prevTail = p1.bars.filter((b) => b.hour >= 21); const c1 = prevTail.length ? { h: Math.max(...prevTail.map((b) => b.h)), l: Math.min(...prevTail.map((b) => b.l)) } : null;
    const mk = (hs) => { const bb = asia.filter((b) => hs.includes(b.hour)); return bb.length ? { o: bb[0].o, c: bb.at(-1).c, h: Math.max(...bb.map((b) => b.h)), l: Math.min(...bb.map((b) => b.l)) } : null; };
    const c2 = mk([1, 2, 3, 4]), c3 = mk([5, 6, 7, 8]);
    for (const dir of [1, -1]) {
      const cands = [];
      // 1 h
      for (let k = 2; k < asia.length; k++) { const a = asia[k - 2], m = asia[k - 1], c = asia[k]; if (dir > 0 && c.l > a.h) cands.push({ tf: '1h', top: c.l, bot: a.h, formedHour: c.hour, mid: m }); if (dir < 0 && c.h < a.l) cands.push({ tf: '1h', top: a.l, bot: c.h, formedHour: c.hour, mid: m }); }
      // 4 h
      if (c1 && c2 && c3) { if (dir > 0 && c3.l > c1.h) cands.push({ tf: '4h', top: c3.l, bot: c1.h, formedHour: 8, mid: c2 }); if (dir < 0 && c3.h < c1.l) cands.push({ tf: '4h', top: c1.l, bot: c3.h, formedHour: 8, mid: c2 }); }
      for (const tf of ['1h', '4h']) {
        const intact = cands.filter((f) => f.tf === tf).filter((f) => { const after = asia.filter((b) => b.hour > f.formedHour); return !after.some((b) => (dir > 0 ? b.l <= f.top : b.h >= f.bot)) && (dir > 0 ? londonOpen > f.top : londonOpen < f.bot); });
        if (!intact.length) continue;
        const f = intact.sort((a, b) => (dir > 0 ? b.top - a.top : a.bot - b.bot))[0];
        const near = dir > 0 ? f.top : f.bot, far = dir > 0 ? f.bot : f.top; const size = (f.top - f.bot) / pip;
        const midRange = (f.mid.h - f.mid.l) / pip; const midBody = Math.abs(f.mid.c - f.mid.o) / Math.max(1e-9, f.mid.h - f.mid.l);
        const target = dir > 0 ? asiaH : asiaL;
        for (const entryMode of ['borde', '50 %']) {
          const level = entryMode === 'borde' ? near : (f.top + f.bot) / 2; const entryPx = dir > 0 ? level + sp : level; const stop = dir > 0 ? far - STOP_PIPS * pip : far + STOP_PIPS * pip; const risk = Math.abs(entryPx - stop);
          let filled = false, touchHour = null; const r = { r1: null, r2: null, r15: null, asia: null }; let cont = false;
          for (const b of d.bars.filter((b) => b.hour >= LONDON[0])) {
            if (!filled) { if (b.hour > LONDON[1]) break; if (dir > 0 ? b.l <= entryPx : b.h >= entryPx) { filled = true; touchHour = b.hour; } else continue; }
            const hitStop = dir > 0 ? b.l <= stop : b.h >= stop; const reach1 = dir > 0 ? b.h >= entryPx + risk : b.l <= entryPx - risk; const reachA = dir > 0 ? b.h >= target : b.l <= target; const reach2 = dir > 0 ? b.h >= entryPx + 2 * risk : b.l <= entryPx - 2 * risk; const reach15 = dir > 0 ? b.h >= entryPx + 1.5 * risk : b.l <= entryPx - 1.5 * risk;
            const SL = -1 - (EXTRA * pip) / risk; if (r.r1 === null) { if (hitStop) r.r1 = SL; else if (reach1) r.r1 = 1; }
            if (r.r2 === null) { if (hitStop) r.r2 = SL; else if (reach2) r.r2 = 2; }
            if (r.r15 === null) { if (hitStop) r.r15 = SL; else if (reach15) r.r15 = 1.5; }
            if (r.asia === null) { if (hitStop) r.asia = SL; else if (reachA) { r.asia = Math.abs(target - entryPx) / risk; cont = true; } }
            if (r.r1 !== null && r.asia !== null && r.r2 !== null && r.r15 !== null) break;
          }
          if (!filled) continue;
          const open = (v) => (v === null ? Math.max(-1, (dir > 0 ? d.c - entryPx : entryPx - d.c) / risk) : v); r.r1 = open(r.r1); r.asia = open(r.asia); r.r2 = open(r.r2); r.r15 = open(r.r15);
          T.push({ sym, date: d.date, year: d.date.slice(0, 4), dir, tf, entryMode, size, midRange, midBody, asiaRange, touchHour, r1: r.r1, r2: r.r2, r15: r.r15, rAsia: r.asia, cont, asiaAlign: asiaDir === dir, sweptAgainst: dir > 0 ? sweptPDL : sweptPDH, sweptWith: dir > 0 ? sweptPDH : sweptPDL, dow, radar, radarOk: radar !== null && Math.sign(radar) === dir && Math.abs(radar) >= 2, radarStrong: radar !== null && Math.sign(radar) === dir && Math.abs(radar) >= 3, radarContra: radar !== null && Math.sign(radar) === -dir && Math.abs(radar) >= 2, riskPips: risk / pip });
        }
      }
    }
  }
}
const pct = (a, n) => (n ? `${String(Math.round((100 * a) / n)).padStart(3)} %` : '  — '); const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const line = (name, L) => { if (L.length < 25) return; console.log(`  ${name.padEnd(46)} n=${String(L.length).padStart(4)} · 1R ${pct(L.filter((t) => t.r1 > 0).length, L.length)} ${mean(L.map((t) => t.r1)) >= 0 ? '+' : ''}${mean(L.map((t) => t.r1)).toFixed(2)}R · continúa ${pct(L.filter((t) => t.cont).length, L.length)} · obj. Asia ${mean(L.map((t) => t.rAsia)) >= 0 ? '+' : ''}${mean(L.map((t) => t.rAsia)).toFixed(2)}R · riesgo med. ${Math.round([...L].map((t) => t.riskPips).sort((a, b) => a - b)[Math.floor(L.length / 2)])} pips`); };
const q = (L, key) => { const v = [...L].map((t) => t[key]).sort((a, b) => a - b); return [v[Math.floor(v.length / 3)], v[Math.floor((2 * v.length) / 3)]]; };
if (RESUMEN) {
  const K = argOf('--objetivo', 'r1'); const cell = (L) => (L.length < 20 ? '      —       ' : `${pct(L.filter((t) => t[K] > 0).length, L.length)} ${mean(L.map((t) => t[K])) >= 0 ? '+' : ''}${mean(L.map((t) => t[K])).toFixed(2)}R (${String(L.length).padStart(3)})`);
  console.log(`\nResumen por par · ${path.basename(DATA)} · desde ${FROM} · coste extra ${EXTRA} pips · objetivo ${K} · stop ${STOP_PIPS} pips tras el FVG`);
  console.log(`  ${'par'.padEnd(8)} | 4h borde, todo   | 4h 50 %, toque ≥10h | 1h borde, todo   | 1h borde, toque ≥10h | 1h 50 %, toque ≥10h`);
  const rows = PAIRS.map((s) => { const P = T.filter((t) => t.sym === s); const f = (tf, mode, late) => P.filter((t) => t.tf === tf && t.entryMode === mode && (!late || t.touchHour >= 10)); const key = f('4h', '50 %', true); return { s, txt: `  ${s.padEnd(8)} | ${cell(f('4h', 'borde', false))} | ${cell(key)} | ${cell(f('1h', 'borde', false))} | ${cell(f('1h', 'borde', true))} | ${cell(f('1h', '50 %', true))}`, score: key.length >= 20 ? mean(key.map((t) => t[K])) : -9 }; });
  for (const r of rows.sort((a, b) => b.score - a.score)) console.log(r.txt);
  const all = T.filter((t) => t.tf === '4h' && t.entryMode === '50 %' && t.touchHour >= 10); console.log(`  ${'TODOS'.padEnd(8)} | 4h 50 % toque ≥10h ${cell(all)} · por año: ` + [...new Set(all.map((t) => t.year))].sort().map((y) => { const Y = all.filter((t) => t.year === y); return `${y}:${pct(Y.filter((t) => t[K] > 0).length, Y.length).trim()}`; }).join(' '));
  process.exit(0);
}
for (const tf of ['4h', '1h']) {
  const B = T.filter((t) => t.tf === tf && t.entryMode === 'borde'); const H = T.filter((t) => t.tf === tf && t.entryMode === '50 %');
  console.log(`\n==================== FVG ${tf} · ${PAIRS.join('+')} · ${B.length} operaciones (borde) ====================`);
  line('base (borde, sin filtro)', B); line('entrada al 50 % del hueco', H);
  for (const s of PAIRS) line(`  ${s}`, B.filter((t) => t.sym === s));
  console.log('-- dirección --');
  line('radar a favor (≥ 2, desde 2023-09)', B.filter((t) => t.radarOk)); line('radar fuerte a favor (≥ 3)', B.filter((t) => t.radarStrong)); line('radar en contra (≥ 2)', B.filter((t) => t.radarContra)); line('sin radar (antes de 2023-09)', B.filter((t) => t.radar === null));
  line('Asia cerró en la dirección del FVG', B.filter((t) => t.asiaAlign)); line('Asia cerró en contra', B.filter((t) => !t.asiaAlign));
  line('Asia barrió el extremo de ayer CONTRA la dirección (trampa)', B.filter((t) => t.sweptAgainst)); line('Asia barrió el extremo de ayer A FAVOR', B.filter((t) => t.sweptWith)); line('Asia no barrió nada', B.filter((t) => !t.sweptWith && !t.sweptAgainst));
  console.log('-- forma del FVG --');
  const [s1, s2] = q(B, 'size'); line(`FVG pequeño (< ${s1.toFixed(0)} pips)`, B.filter((t) => t.size < s1)); line(`FVG mediano`, B.filter((t) => t.size >= s1 && t.size < s2)); line(`FVG grande (≥ ${s2.toFixed(0)} pips)`, B.filter((t) => t.size >= s2));
  const [m1, m2] = q(B, 'midRange'); line(`vela del hueco pequeña (< ${m1.toFixed(0)} pips)`, B.filter((t) => t.midRange < m1)); line(`vela del hueco grande (≥ ${m2.toFixed(0)} pips, desplazamiento)`, B.filter((t) => t.midRange >= m2));
  line('vela del hueco con cuerpo ≥ 70 %', B.filter((t) => t.midBody >= 0.7)); const [a1, a2] = q(B, 'asiaRange'); line(`Asia estrecha (< ${a1.toFixed(0)} pips)`, B.filter((t) => t.asiaRange < a1)); line(`Asia ancha (≥ ${a2.toFixed(0)} pips)`, B.filter((t) => t.asiaRange >= a2));
  console.log('-- cuándo --');
  for (const h of [9, 10, 11, 12]) line(`toque a las ${h}h servidor (${h - 1}:00 España)`, B.filter((t) => t.touchHour === h)); line('toque a las 13–14h', B.filter((t) => t.touchHour >= 13));
  for (const [dn, dw] of [['lunes', 1], ['martes', 2], ['miércoles', 3], ['jueves', 4], ['viernes', 5]]) line(dn, B.filter((t) => t.dow === dw));
  console.log('-- combinaciones --');
  line('radar a favor + Asia cerró a favor', B.filter((t) => t.radarOk && t.asiaAlign)); line('radar a favor + desplazamiento', B.filter((t) => t.radarOk && t.midRange >= m2)); line('radar a favor + toque 9h', B.filter((t) => t.radarOk && t.touchHour === 9));
  line('desplazamiento + Asia barrió en contra (trampa)', B.filter((t) => t.midRange >= m2 && t.sweptAgainst)); line('desplazamiento + toque 9–10h', B.filter((t) => t.midRange >= m2 && t.touchHour <= 10)); line('FVG grande + toque 9h', B.filter((t) => t.size >= s2 && t.touchHour === 9));
  console.log('-- estabilidad por año del mejor filtro estructural (desplazamiento), 1R --');
  console.log('  ' + [...new Set(B.map((t) => t.year))].sort().map((y) => { const L = B.filter((t) => t.year === y && t.midRange >= m2); return `${y}:${L.length ? pct(L.filter((t) => t.r1 > 0).length, L.length).trim() : '—'}`; }).join(' · '));
}
// ---- robustez de lo que destaca: toque tardío (≥ 10h servidor), entrada al 50 %, Asia a favor sin barrido
console.log('\n==================== Robustez de los filtros que destacan ====================');
for (const tf of ['4h', '1h']) {
  for (const mode of ['borde', '50 %']) {
    const L = T.filter((t) => t.tf === tf && t.entryMode === mode); const late = L.filter((t) => t.touchHour >= 10); const combo = late.filter((t) => t.asiaAlign && !t.sweptAgainst);
    console.log(`\n-- FVG ${tf} · entrada ${mode} --`);
    line('toque desde las 10h (9:00 España)', late); line('toque a las 9h (8:00 España)', L.filter((t) => t.touchHour === 9));
    line('toque ≥ 10h + Asia a favor + sin barrido en contra', combo);
    for (const s of PAIRS) { line(`  ${s} · toque ≥ 10h`, late.filter((t) => t.sym === s)); line(`  ${s} · combo`, combo.filter((t) => t.sym === s)); }
    console.log('  por año (toque ≥ 10h, 1R): ' + [...new Set(L.map((t) => t.year))].sort().map((y) => { const Y = late.filter((t) => t.year === y); return `${y}:${Y.length ? pct(Y.filter((t) => t.r1 > 0).length, Y.length).trim() : '—'}(${Y.length})`; }).join(' '));
    console.log('  por año (combo, 1R):       ' + [...new Set(L.map((t) => t.year))].sort().map((y) => { const Y = combo.filter((t) => t.year === y); return `${y}:${Y.length ? pct(Y.filter((t) => t.r1 > 0).length, Y.length).trim() : '—'}(${Y.length})`; }).join(' '));
    // equity 1 % por operación
    const eq = (S) => { let e = 1, pk = 1, dd = 0; for (const t of [...S].sort((a, b) => (a.date < b.date ? -1 : 1))) { e *= 1 + 0.01 * t.r1; pk = Math.max(pk, e); dd = Math.max(dd, 1 - e / pk); } return `${((e - 1) * 100).toFixed(0)} % · DD ${(dd * 100).toFixed(0)} %`; };
    console.log(`  cuenta al 1 %, 1R, 2015–2026: todo ${eq(L)} · toque ≥ 10h ${eq(late)} · combo ${eq(combo)}`);
  }
}
