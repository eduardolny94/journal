// Mesa de agentes desde la línea de comandos (sin arrancar el servidor web).
//   npm run mesa -w server              → pasa la mesa hoy (necesita ANTHROPIC_API_KEY en .env) y guarda las fichas
//   npm run mesa -w server -- --paquete → solo arma e imprime el paquete del día (sin llamar a la API)
//   npm run mesa -w server -- --fichas [AAAA-MM-DD] → muestra las fichas guardadas de ese día (o del último)
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ quiet: true, path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ quiet: true, path: path.resolve(__dirname, '..', '.env') });

const { getDb, closeDb } = await import('../src/db.js');
const { armarPaquete, pasarMesaHoy, fichasDe, listarFechas, configMesa } = await import('../src/mesa/index.js');
const { paqueteVariable } = await import('../src/mesa/paquete.js');
const { ensureCalendarHistory } = await import('../src/radar/engine.js');

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const db = getDb();

try {
  if (flag('--fichas')) {
    const fecha = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) || listarFechas(db, 1)[0];
    if (!fecha) {
      console.log('Todavía no hay fichas guardadas.');
    } else {
      const r = fichasDe(db, fecha);
      console.log(JSON.stringify(r, null, 2));
    }
  } else if (flag('--paquete')) {
    const cfg = configMesa();
    const paquete = await armarPaquete(db, { tz: cfg.tz });
    const texto = JSON.stringify(paqueteVariable(paquete), null, 2);
    console.log(texto);
    const docsChars = paquete.documentos.fichas.length + paquete.documentos.metodo.length + paquete.documentos.estrella.reduce((a, d) => a + d.texto.length, 0);
    console.error(`\n[mesa] paquete variable: ${texto.length} caracteres (~${Math.round(texto.length / 3.5)} tokens); documentos fijos: ${docsChars} caracteres (~${Math.round(docsChars / 3.5)} tokens, en caché tras la primera llamada).`);
  } else {
    const cfg = configMesa();
    if (!cfg.api_key) {
      console.error('Falta ANTHROPIC_API_KEY en .env. Añádela y vuelve a ejecutar; con --paquete puedes ver el paquete sin clave.');
      process.exitCode = 1;
    } else {
      await ensureCalendarHistory().catch(() => {});
      const r = await pasarMesaHoy({ trigger: 'cli' });
      console.log(`\nPasada ${r.fecha} guardada (id ${r.pasada_id}): ${Object.keys(r.fichas).length} fichas · ${r.cost_usd.toFixed(3)} $ · tokens entrada ${r.usage.input_tokens} / caché ${r.usage.cache_read_input_tokens} / salida ${r.usage.output_tokens}.`);
      if (r.fichas.jefe_de_mesa) console.log(`\nNota del jefe:\n${r.fichas.jefe_de_mesa.nota_jefe}`);
    }
  }
} catch (err) {
  console.error(`[mesa] ${err.message || err}`);
  process.exitCode = 1;
} finally {
  closeDb();
  process.exit();
}
