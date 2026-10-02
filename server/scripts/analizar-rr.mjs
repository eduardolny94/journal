// Analiza hasta dónde llegan las operaciones (recorrido máximo a favor, MFE) y qué objetivo en R deja más esperanza.
// Lee data/mt5/backtest-swing-h4.json (generado por backtest-swing-h4.mjs, p. ej. con --stop-pips 35 --max-bars 90).
// Uso: node scripts/analizar-rr.mjs [patrón=sweep] [filtro=ab|ab2|todos]   (carpeta server)
import { readFileSync } from 'node:fs';
import path from 'node:path';

const pattern = process.argv[2] || 'sweep';
const filter = process.argv[3] || 'ab';
const j = JSON.parse(readFileSync(path.resolve(process.cwd(), '..', 'data', 'mt5', 'backtest-swing-h4.json'), 'utf8'));
const FILTERS = {
  ab: (r) => r.bias_aligned && (r.tier === 'A' || r.tier === 'B'),
  ab2: (r) => r.bias_aligned && (r.tier === 'A' || r.tier === 'B') && r.bias_level >= 2,
  todos: () => true,
};
const rows = j.records.filter((r) => r.pattern === pattern && FILTERS[filter](r));
const risk = rows.length ? rows[0].risk_pips : null;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const r2 = (v) => Math.round(v * 100) / 100;
const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

console.log(`${pattern} · filtro ${filter} · n=${rows.length} · stop ${risk} pips · tiempo máximo ${Math.max(...rows.map((r) => r.mfe_run_bar))}+ velas H4\n`);
const mfe = rows.map((r) => r.mfe_run);
console.log('Recorrido máximo a favor con solo el stop (R y pips):');
for (const p of [25, 50, 75, 90, 95]) console.log(`  percentil ${p}: ${r2(pct(mfe, p))}R (${Math.round(pct(mfe, p) * risk)} pips)`);
console.log(`  máximo: ${r2(Math.max(...mfe))}R (${Math.round(Math.max(...mfe) * risk)} pips) · media ${r2(mean(mfe))}R`);
console.log(`  velas H4 hasta el máximo (mediana): ${pct(rows.map((r) => r.mfe_run_bar), 50)} · percentil 75: ${pct(rows.map((r) => r.mfe_run_bar), 75)}`);
console.log('\nCuántas llegan a cada R antes de que salte el stop:');
const targets = Object.keys(rows[0].hit_by_target).map(Number).sort((a, b) => a - b);
for (const t of targets) {
  const reach = rows.filter((r) => r.mfe_run >= t).length;
  const hit = rows.filter((r) => r.hit_by_target[t]).length;
  const rs = rows.map((r) => r.r_by_target[t]);
  const g = rs.filter((x) => x > 0).reduce((a, b) => a + b, 0), l = -rs.filter((x) => x <= 0).reduce((a, b) => a + b, 0);
  console.log(`  ${String(t).padStart(4)}R (${String(Math.round(t * risk)).padStart(4)} pips): llegan ${String(Math.round((100 * reach) / rows.length)).padStart(3)} % · con objetivo fijo ahí: gana ${String(Math.round((100 * hit) / rows.length)).padStart(3)} % · esperanza ${mean(rs) >= 0 ? '+' : ''}${r2(mean(rs))}R · factor ${l ? r2(g / l) : '∞'}`);
}
console.log(`\nTrailing a 2 ATR: esperanza ${r2(mean(rows.map((r) => r.r_trail)))}R · salida por tiempo: ${r2(mean(rows.map((r) => r.r_time)))}R`);
