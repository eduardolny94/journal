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

// Se escribe SOLO el ajuste de los sesgos (in_1): reescribir todos los ajustes a la vez deja la instancia vacía en TradingView 3.4.
const conn = path.join(os.homedir(), '.local', 'mcp', 'tradingview-mcp', 'src', 'connection.js');
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const { evaluate } = await import(pathToFileURL(conn).href);
  const leer = () => evaluate(`(function(){ var chart = window.TradingViewApi._activeChartWidgetWV.value(); var out = []; chart.getAllStudies().forEach(function(s){ if (/Zonas de reacc/i.test(s.name || s.title || '')) { var ins = chart.getStudyById(s.id).getInputValues(); var v = null; for (var i = 0; i < ins.length; i++) if (ins[i].id === 'in_1') v = ins[i].value; out.push({ id: s.id, n: ins.length, in1: v }); } }); return { symbol: chart.symbol(), studies: out }; })()`);
  const antes = await leer();
  if (!antes.studies.length) { console.log(`TradingView abierto (${antes.symbol}), pero el gráfico no tiene el indicador «GTFX · Zonas de reacción». Añádelo y repite.`); process.exit(2); }
  for (const s of antes.studies) {
    if (s.in1 === null || s.n < 5) { console.log(`La instancia ${s.id} aún no tiene los ajustes cargados; espera unos segundos y repite.`); process.exit(3); }
    if (s.in1 === linea) { console.log(`Sesgos ya al día en la instancia ${s.id}.`); continue; }
    await evaluate(`(function(){ var chart = window.TradingViewApi._activeChartWidgetWV.value(); chart.getStudyById(${JSON.stringify(s.id)}).setInputValues([{ id: 'in_1', value: ${JSON.stringify(linea)} }]); return true; })()`);
  }
  await espera(4000);
  const despues = await leer();
  for (const s of despues.studies) console.log(s.in1 === linea ? `✔ Sesgos puestos en la instancia ${s.id} (${despues.symbol})` : `✘ La instancia ${s.id} no tomó la lista (ajustes: ${s.n}); repite en unos segundos.`);
  process.exit(despues.studies.every((s) => s.in1 === linea) ? 0 : 4);
} catch (e) {
  console.log(`No pude escribir en TradingView: ${e.message}. Ábrelo con el comando tv-debug y repite.`);
  process.exit(1);
}
