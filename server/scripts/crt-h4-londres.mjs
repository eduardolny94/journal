// ¿Qué vela H4 de Londres manipula más el rango de Asia y completa el rango? (18-10-2026)
// Velas H4 (hora NY): Asia = 21:00–01:00 · L1 = 01:00–05:00 (07:00–11:00 España) · L2 = 05:00–09:00 (11:00–15:00 ES) · NY = 09:00–13:00.
// Para cada día y cada vela H4 posterior a Asia: barre un lado del rango asiático (mecha fuera) · cierra dentro (manipulación)
// · completa el rango (toca el lado opuesto) en la misma vela, en la siguiente H4 o antes de las 17:00 NY.
// Uso: node server/scripts/crt-h4-londres.mjs --dir data/mt5-fxcm --desde 2015-01-01 [--pares AUDCAD,AUDCHF,CADCHF]
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DATA = path.resolve(ROOT, argOf('--dir', 'data/mt5'));
const FROM = argOf('--desde', '2015-01-01');
const ONLY = argOf('--pares', null) ? argOf('--pares', '').split(',').map((x) => x.trim().toUpperCase()) : null;
const pct = (a, n) => (n ? `${String(Math.round((100 * a) / n)).padStart(3)} %` : '  — ');
function load(sym) {
  const byDay = new Map();
  for (const line of readFileSync(path.join(DATA, `${sym}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) {
    const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue;
    const date = d.replace(/\./g, '-'); (byDay.get(date) || byDay.set(date, []).get(date)).push({ hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c });
  }
  return { byDay, dates: [...byDay.keys()].sort() };
}
// velas H4 en hora de servidor (NY+7): Asia 04–07 · L1 08–11 · L2 12–15 · NY 16–19
const H4 = [['L1 · 01:00–05:00 NY (07:00–11:00 ES)', 8, 11], ['L2 · 05:00–09:00 NY (11:00–15:00 ES)', 12, 15], ['NY · 09:00–13:00 NY (15:00–19:00 ES)', 16, 19]];
const symbols = readdirSync(DATA).filter((f) => f.endsWith('_PERIOD_H1.csv')).map((f) => f.replace('_PERIOD_H1.csv', '')).filter((s) => !ONLY || ONLY.includes(s));
const acc = () => ({ days: 0, sweep: 0, inside: 0, insideSame: 0, insideNext: 0, insideDay: 0, outsideDay: 0, both: 0 });
const S = {}; const P = {};
for (const sym of symbols) {
  const D = load(sym);
  for (const d of D.dates) {
    if (d < FROM) continue; const bars = D.byDay.get(d); if (!bars || bars.length < 18) continue;
    const asia = bars.filter((b) => b.hour >= 4 && b.hour <= 7); if (asia.length < 3) continue;
    const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l));
    let takenSide = 0; // la primera H4 que barre define la manipulación del día; las siguientes se miden igual pero solo si Asia sigue intacta por ese lado
    for (const [key, h0, h1] of H4) {
      const C = bars.filter((b) => b.hour >= h0 && b.hour <= h1); if (C.length < 3) continue;
      const a = (S[key] ||= acc()); const pp = ((P[key] ||= {})[sym] ||= acc()); a.days++; pp.days++;
      const cH = Math.max(...C.map((b) => b.h)), cL = Math.min(...C.map((b) => b.l)), cC = C[C.length - 1].c;
      const up = cH > aH, dn = cL < aL;
      if (up && dn) { a.both++; pp.both++; continue; }
      if (!up && !dn) continue;
      const side = up ? 1 : -1; a.sweep++; pp.sweep++;
      const closedInside = side > 0 ? cC < aH : cC > aL; if (!closedInside) { a.outsideDay++; pp.outsideDay++; continue; }
      a.inside++; pp.inside++;
      const opp = side > 0 ? aL : aH; const hit = (b) => (side > 0 ? b.l <= opp : b.h >= opp);
      if (C.some(hit)) { a.insideSame++; pp.insideSame++; a.insideDay++; pp.insideDay++; continue; }
      const next = bars.filter((b) => b.hour > h1 && b.hour <= h1 + 4), rest = bars.filter((b) => b.hour > h1 && b.hour <= 23);
      if (next.some(hit)) { a.insideNext++; pp.insideNext++; }
      if (rest.some(hit)) { a.insideDay++; pp.insideDay++; }
    }
  }
}
console.log(`\nVelas H4 de Londres y Nueva York contra el rango de Asia (H4 21:00–01:00 NY) · ${symbols.length} activos · ${path.basename(DATA)} · desde ${FROM}`);
console.log('  vela H4                                   días   barre un lado   cierra dentro (manipula)   completa el rango: misma H4 · siguiente H4 · antes de 17:00 NY   cierra fuera (ruptura)   barre los dos');
for (const [key] of H4) { const a = S[key]; if (!a) continue; console.log(`  ${key.padEnd(40)} ${String(a.days).padStart(6)}   ${pct(a.sweep, a.days)}           ${pct(a.inside, a.sweep)} de las barridas      ${pct(a.insideSame, a.inside)}   ·   ${pct(a.insideNext, a.inside)}   ·   ${pct(a.insideDay, a.inside)}                 ${pct(a.outsideDay, a.sweep)}              ${pct(a.both, a.days)}`); }
for (const [key] of H4) {
  console.log(`\n  [${key}] por par: días · barre · manipula (cierra dentro) · completa antes de 17:00 NY · completa en la misma H4`);
  const rows = Object.entries(P[key] || {}).map(([s, a]) => ({ s, a })).sort((x, y) => (y.a.insideDay / (y.a.inside || 1)) - (x.a.insideDay / (x.a.inside || 1)));
  for (const { s, a } of rows) console.log(`    ${s.padEnd(8)} ${String(a.days).padStart(5)} · barre ${pct(a.sweep, a.days)} · manipula ${pct(a.inside, a.sweep)} · completa ${pct(a.insideDay, a.inside)} (n=${a.inside}) · misma H4 ${pct(a.insideSame, a.inside)}`);
}

// Ejemplos recientes de la vela L1 (07:00–11:00 España) que barre Asia, cierra dentro y luego el precio completa el rango:
//   node server/scripts/crt-h4-londres.mjs --dir data/mt5 --ejemplos AUDCAD,AUDCHF,CADCHF --n 4
const ae = process.argv.indexOf('--ejemplos');
if (ae >= 0) {
  const ES = (h) => ((h - 1 + 24) % 24);
  const N = Number(argOf('--n', 4));
  for (const sym of process.argv[ae + 1].split(',')) {
    const D = load(sym); const dec = sym.endsWith('JPY') ? 3 : 5; const f = (x) => x.toFixed(dec); const pip = sym.endsWith('JPY') ? 0.01 : 0.0001;
    const out = [];
    for (const d of [...D.dates].reverse()) {
      const bars = D.byDay.get(d); if (!bars || bars.length < 18) continue;
      const asia = bars.filter((b) => b.hour >= 4 && b.hour <= 7); if (asia.length < 3) continue;
      const aH = Math.max(...asia.map((b) => b.h)), aL = Math.min(...asia.map((b) => b.l));
      const C = bars.filter((b) => b.hour >= 8 && b.hour <= 11); if (C.length < 3) continue;
      const cH = Math.max(...C.map((b) => b.h)), cL = Math.min(...C.map((b) => b.l)), cC = C[C.length - 1].c;
      const up = cH > aH, dn = cL < aL; if (up === dn) continue; const side = up ? 1 : -1;
      if (!(side > 0 ? cC < aH : cC > aL)) continue;
      const opp = side > 0 ? aL : aH; const rest = bars.filter((b) => b.hour > 11 && b.hour <= 23);
      const hitBar = rest.find((b) => (side > 0 ? b.l <= opp : b.h >= opp));
      const sweepBar = C.find((b) => (side > 0 ? b.h > aH : b.l < aL));
      out.push({ d, aH, aL, side, ext: side > 0 ? cH : cL, cC, sweepBar, hitBar, C });
      if (out.length >= N) break;
    }
    console.log(`\n== ${sym} · últimos ${out.length} días en que la H4 de 07:00–11:00 España barrió Asia y cerró dentro ==`);
    for (const e of out) {
      const lado = e.side > 0 ? 'barrió el MÁXIMO' : 'barrió el MÍNIMO';
      const mecha = Math.round(Math.abs(e.ext - (e.side > 0 ? e.aH : e.aL)) / pip);
      const res = e.hitBar ? `COMPLETÓ el rango: tocó ${f(e.side > 0 ? e.aL : e.aH)} en la vela de las ${String(ES(e.hitBar.hour)).padStart(2, '0')}:00 ES` : 'NO completó el rango antes de las 23:00 ES';
      console.log(`  ${e.d} · Asia ${f(e.aL)}–${f(e.aH)} (${Math.round((e.aH - e.aL) / pip)} pips) · ${lado} a las ${String(ES(e.sweepBar.hour)).padStart(2, '0')}:00 ES hasta ${f(e.ext)} (mecha ${mecha} pips) · la H4 cerró en ${f(e.cC)}, dentro · ${res}`);
      console.log(`      velas H1 de la H4: ${e.C.map((b) => `${String(ES(b.hour)).padStart(2, '0')}:00 O${f(b.o)} H${f(b.h)} L${f(b.l)} C${f(b.c)}`).join(' | ')}`);
    }
  }
}
