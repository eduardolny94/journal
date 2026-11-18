// Pruebas de la liquidez neta de la Fed y de la nota del MOVE (server/src/radar/liquidity.js y clarity.js). Sin red.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { netLiquidity } from '../src/radar/liquidity.js';
import { clarityFor } from '../src/radar/clarity.js';
let fallos = 0; const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { console.log(`  ✗ ${m}`); fallos++; } };
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
console.log('Liquidez neta');
{ const mk = (id) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data/historico/fred', `${id}.json`), 'utf8')).observations.filter((o) => o.value !== '.').map((o) => ({ date: o.date, value: Number(o.value) }));
  if (fs.existsSync(path.join(ROOT, 'data/historico/fred/WALCL.json'))) {
    const r = netLiquidity(mk('WALCL'), mk('WTREGEN'), mk('RRPONTSYD'), Date.parse('2026-11-13T12:00:00Z'));
    ok(r && r.date === '2026-11-11' && Math.abs(r.net - 5844) < 3, `a 13-11-2026: dato del 11-11, liquidez ${r && r.net.toFixed(0)} mil M$ (≈ 5.844)`);
    ok(r && Math.abs(r.pct13 - 0.8) < 0.15, `cambio a 13 semanas ≈ +0,8 % (${r && r.pct13.toFixed(2)})`);
    const viejo = netLiquidity(mk('WALCL'), mk('WTREGEN'), mk('RRPONTSYD'), Date.parse('2026-12-20T12:00:00Z'));
    ok(viejo === null, 'dato de hace más de 14 días → null');
    const antes = netLiquidity(mk('WALCL'), mk('WTREGEN'), mk('RRPONTSYD'), Date.parse('2026-11-12T12:00:00Z'));
    ok(antes && antes.date === '2026-11-04', 'el dato del miércoles aún no se usa el jueves (point-in-time)');
  } else console.log('  (sin datos históricos locales: se omite la comparación con FRED)');
  ok(netLiquidity([], [], [], Date.now()) === null, 'sin series → null'); }
console.log('Nota del MOVE en «a 3 días»');
{ const bars = []; let c = 1.1; for (let i = 0; i < 60; i++) { c += (i % 2 ? 0.002 : -0.0015); bars.push({ close: c, high: c + 0.003, low: c - 0.003 }); }
  const base = { symbol: 'EURUSD', diff: 3, prevDiff20: 2, expectDiff: 0, totDiff: 0, digits: 5, bars };
  const a = clarityFor({ ...base, moveUpPct: null }), b = clarityFor({ ...base, moveUpPct: 22 }), d = clarityFor({ ...base, moveUpPct: 5 });
  ok(a.timing.move === null, 'sin MOVE: null');
  ok(b.timing.move && b.timing.move.active && b.timing.move.with === 57.1, 'MOVE +22 %: activo, con la evidencia medida');
  ok(d.timing.move && !d.timing.move.active, 'MOVE +5 %: no activo');
  ok(a.timing.state === b.timing.state && a.tier === b.tier, 'no cambia el estado ni la claridad (solo informa)'); }
console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
