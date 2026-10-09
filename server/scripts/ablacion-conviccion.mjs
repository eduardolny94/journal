// Ablación de la capa de convicción: mide fuera de muestra qué condiciones aportan y cuánta regularización conviene.
// Reconstruye el radar (3 años) una sola vez y reajusta el modelo con distintos subconjuntos de condiciones y λ.
// Uso (con el servidor local parado para no competir por la base de datos):
//   node server/scripts/ablacion-conviccion.mjs
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const { getDb } = await import('../src/db.js');
const { runBacktest } = await import('../src/radar/backtest.js');
const { buildConvictionModel, FEATURE_NAMES, LAMBDA } = await import('../src/radar/conviction.js');

const db = getDb();
const t0 = Date.now();
const report = await runBacktest(db, { keepRows: true, log: (s) => process.stdout.write(`  · ${s}\n`) });
const rows = report.conv_rows;
console.log(`\n${rows.length} filas (día × par) en ${Math.round((Date.now() - t0) / 1000)} s\n`);

const idx = (names) => names.map((n) => FEATURE_NAMES.indexOf(n)).filter((i) => i >= 0);
const NEW = ['taylor', 'descontado', 'real', 'tot', 'ciclo', 'sorpresa_grande'];
const BASE = FEATURE_NAMES.filter((n) => !NEW.includes(n));
const configs = [
  { name: 'base (16, v1)', mask: idx(BASE), lambda: LAMBDA },
  ...NEW.map((n) => ({ name: `base + ${n}`, mask: idx([...BASE, n]), lambda: LAMBDA })),
  { name: 'todas λ=2', mask: null, lambda: 2 },
  { name: 'todas λ=20', mask: null, lambda: 20 },
  { name: 'base λ=8', mask: idx(BASE), lambda: 8 },
  { name: 'base + descontado λ=8', mask: idx([...BASE, 'descontado']), lambda: 8 },
  { name: 'base + desc + real', mask: idx([...BASE, 'descontado', 'real']), lambda: LAMBDA },
  { name: 'base + desc + taylor', mask: idx([...BASE, 'descontado', 'taylor']), lambda: LAMBDA },
  { name: 'base + desc + tot', mask: idx([...BASE, 'descontado', 'tot']), lambda: LAMBDA },
  // Robustez: otros cortes temporales (prueba = última mitad / últimos dos tercios).
  { name: 'base · corte 1/2', mask: idx(BASE), lambda: LAMBDA, split: 0.5 },
  { name: 'base + descontado · corte 1/2', mask: idx([...BASE, 'descontado']), lambda: LAMBDA, split: 0.5 },
  { name: 'base + real · corte 1/2', mask: idx([...BASE, 'real']), lambda: LAMBDA, split: 0.5 },
  { name: 'base + tot · corte 1/2', mask: idx([...BASE, 'tot']), lambda: LAMBDA, split: 0.5 },
  { name: 'base + ciclo · corte 1/2', mask: idx([...BASE, 'ciclo']), lambda: LAMBDA, split: 0.5 },
  { name: 'base + sorpresa_grande · corte 1/2', mask: idx([...BASE, 'sorpresa_grande']), lambda: LAMBDA, split: 0.5 },
  { name: 'base · corte 1/3', mask: idx(BASE), lambda: LAMBDA, split: 1 / 3 },
  { name: 'base + descontado · corte 1/3', mask: idx([...BASE, 'descontado']), lambda: LAMBDA, split: 1 / 3 },
  { name: 'base + ciclo · corte 1/3', mask: idx([...BASE, 'ciclo']), lambda: LAMBDA, split: 1 / 3 },
  { name: 'base + sorpresa_grande · corte 1/3', mask: idx([...BASE, 'sorpresa_grande']), lambda: LAMBDA, split: 1 / 3 },
];

const f = (b) => (b && b.n ? `${String(b.hit_rate).padStart(5)} % ${b.avg_r >= 0 ? '+' : ''}${b.avg_r.toFixed(2)}R n=${String(b.n).padStart(4)}` : '        —          ');
for (const h of [5, 1, 20]) {
  console.log(`\nHorizonte ${h} d · fuera de muestra (último tercio) · nivel A | nivel B`);
  for (const c of configs) {
    const m = buildConvictionModel(rows, { horizon: h, lambda: c.lambda, mask: c.mask, splitIndexFraction: c.split || 2 / 3 });
    if (!m) { console.log(`  ${c.name.padEnd(32)} sin modelo`); continue; }
    console.log(`  ${c.name.padEnd(32)} A ${f(m.test.tiers.A)} | B ${f(m.test.tiers.B)}`);
  }
}
// Pesos de las condiciones nuevas en el modelo completo (entrenamiento), para ver signo y tamaño.
const full = buildConvictionModel(rows, { horizon: 5, lambda: 2 });
console.log('\nPesos (modelo de prueba, 5 d, λ=2):');
for (const n of NEW) console.log(`  ${n.padEnd(12)} ${full.model_test.w[FEATURE_NAMES.indexOf(n) + 1]}`);
