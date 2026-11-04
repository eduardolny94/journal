// Escribe los sesgos del radar en el indicador «GTFX · Zonas de reacción» del TradingView Desktop abierto, sin copiar ni pegar.
// Calcula el radar con las fuentes en vivo, monta la línea «PAR:sesgo, …» (neutro cuando la fuerza es «sin sesgo») y la pone en
// el ajuste «Sesgos del radar» (in_1) de la instancia del gráfico activo. Requiere TradingView abierto en modo depuración
// (comando tv-debug) y el MCP tradingview-mcp en ~/.local/mcp/tradingview-mcp.
// Uso: node server/scripts/tv-sesgos.mjs [--solo-imprimir]
import dotenv from 'dotenv';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ quiet: true, path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ quiet: true, path: path.resolve(__dirname, '..', '.env') });
const { getDb, closeDb } = await import('../src/db.js');
const { getSnapshot } = await import('../src/radar/engine.js');

getDb();
const snap = await getSnapshot({ force: true });
const pares = [...(snap.pairs || []), ...(snap.instruments || [])].filter((p) => p.symbol && p.bias);
const linea = pares.map((p) => `${p.symbol}:${p.strength === 'sin sesgo' ? 'neutro' : p.bias}`).join(', ');
console.log(`Radar ${snap.computed_at || ''}`);
console.log(linea);
closeDb?.();
if (process.argv.includes('--solo-imprimir')) process.exit(0);

const base = path.join(os.homedir(), '.local', 'mcp', 'tradingview-mcp', 'src', 'core');
try {
  const chart = await import(pathToFileURL(path.join(base, 'chart.js')).href);
  const ind = await import(pathToFileURL(path.join(base, 'indicators.js')).href);
  const st = await chart.getState();
  const zonas = (st.studies || []).filter((s) => /Zonas de reacci/i.test(s.name || ''));
  if (!zonas.length) { console.log(`TradingView abierto (${st.symbol}), pero el gráfico no tiene el indicador «GTFX · Zonas de reacción». Añádelo y repite.`); process.exit(2); }
  const data = await import(pathToFileURL(path.join(base, 'data.js')).href);
  for (const s of zonas) {
    // seguridad: solo se escribe si la instancia tiene sus ajustes cargados (si no, setInputs la dejaría vacía)
    const info = await data.getIndicator({ entity_id: s.id });
    const actual = (info.inputs || []).find((i) => i.id === 'in_1');
    if (!actual) { console.log(`La instancia ${s.id} aún no tiene los ajustes cargados; espera unos segundos y repite.`); process.exit(3); }
    if (actual.value === linea) { console.log(`Sesgos ya al día en la instancia ${s.id}.`); continue; }
    const r = await ind.setInputs({ entity_id: s.id, inputs: { in_1: linea } });
    console.log(Object.keys(r.updated_inputs || {}).length ? `✔ Sesgos puestos en la instancia ${s.id}` : `No se pudo escribir en la instancia ${s.id}`);
  }
  process.exit(0);
} catch (e) {
  console.log(`No pude escribir en TradingView: ${e.message}. Ábrelo con el comando tv-debug y repite.`);
  process.exit(1);
}
