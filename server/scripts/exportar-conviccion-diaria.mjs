// Exporta la probabilidad de la capa de convicción por día y par (p5 con el modelo de prueba walk-forward y con el
// modelo final) para medir estrategias de entrada sobre ella (scripts/backtest-swing-h4.mjs).
// Ejecuta la reconstrucción completa (~70 s). Con el servidor local parado (comparte la base de datos).
// Uso: node server/scripts/exportar-conviccion-diaria.mjs   (desde la raíz del proyecto)
import dotenv from 'dotenv';
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const { getDb } = await import('../src/db.js');
const { runBacktest } = await import('../src/radar/backtest.js');
const { predictProb, tierOf } = await import('../src/radar/conviction.js');

const report = await runBacktest(getDb(), { keepRows: true, log: (s) => process.stdout.write(`  · ${s}\n`) });
const h5 = report.conviction.h5;
const rows = report.conv_rows.map((r) => {
  const pt = predictProb(h5.model_test, r.x);
  const pf = predictProb(h5.model, r.x);
  return { date: r.date, sym: r.sym, p5_test: Math.round(pt * 1000) / 10, tier_test: tierOf(pt), p5_full: Math.round(pf * 1000) / 10, tier_full: tierOf(pf) };
});
const out = { generated_at: new Date().toISOString(), split_date: h5.test.from, features_active: h5.features_active, rows };
const file = path.resolve(__dirname, '..', '..', 'data', 'mt5', 'conviccion-diaria.json');
writeFileSync(file, JSON.stringify(out));
console.log(`${rows.length} filas · prueba desde ${h5.test.from} · guardado en data/mt5/conviccion-diaria.json`);
