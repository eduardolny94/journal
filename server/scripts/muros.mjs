// Muros de opciones desde la terminal. Uso:
//   npm run muros -w server                 descarga la última sesión (necesita DATABENTO_API_KEY en .env) y la guarda
//   npm run muros -w server -- --fecha 2026-10-23
//   npm run muros -w server -- --ver         imprime los muros guardados y la tabla para el indicador
//   npm run muros -w server -- --coste       coste estimado de un día en Databento, por raíz
//   npm run muros -w server -- --pine        regenera client/public/descargas/GTFX_MurosOpciones.pine con la tabla guardada
import dotenv from 'dotenv';
import path from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ quiet: true, path: path.resolve(__dirname, '..', '..', '.env') });
dotenv.config({ quiet: true, path: path.resolve(__dirname, '..', '.env') });
const { getDb, closeDb } = await import('../src/db.js');
const { actualizarMuros, leerMuros, tablaPine, costeEstimado, configMuros, raicesActivas, ultimaSesion } = await import('../src/radar/opciones.js');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes(k);
const db = getDb();
try {
  if (flag('--coste')) {
    const cfg = configMuros(); if (!cfg.api_key) throw new Error('Falta DATABENTO_API_KEY en .env');
    const fecha = argOf('--fecha', ultimaSesion()); let total = 0;
    for (const r of raicesActivas()) { const c = await costeEstimado(cfg.api_key, r.root, fecha); const t = (Number(c.definition) || 0) + (Number(c.statistics) || 0); total += t; console.log(`${r.symbol.padEnd(7)} (${r.root}.OPT) definiciones ${c.definition} $ · estadísticas ${c.statistics} $`); }
    console.log(`Total estimado por día: ${total.toFixed(4)} $ (≈ ${(total * 21).toFixed(2)} $/mes)`);
  } else if (flag('--ver') || flag('--pine')) {
    const m = leerMuros(db); if (!m.fecha) { console.log('Sin muros guardados todavía.'); }
    else {
      console.log(`Muros del ${m.fecha}` + (m.ultima ? ` · descargados ${m.ultima.at}` : ''));
      for (const p of m.pares) console.log(`  ${p.symbol} (venc. ${p.vencimiento}) · calls ${p.calls.map((x) => `${x.price}:${x.stars}★`).join(' ')} · puts ${p.puts.map((x) => `${x.price}:${x.stars}★`).join(' ')}`);
      console.log('\nTabla para el indicador:\n' + tablaPine(m));
      if (flag('--pine')) {
        const f = path.resolve(__dirname, '..', '..', 'client', 'public', 'descargas', 'GTFX_MurosOpciones.pine'); let src = readFileSync(f, 'utf8');
        const i0 = src.indexOf('tabla     = input.text_area("'); const i1 = src.indexOf('", "Niveles por símbolo', i0); if (i0 < 0 || i1 < 0) throw new Error('No encuentro el campo tabla en el Pine');
        src = src.slice(0, i0) + 'tabla     = input.text_area("' + tablaPine(m).replace(/\n/g, '\\n') + src.slice(i1);
        src = src.replace(/fecha     = input\.string\("[^"]*"/, `fecha     = input.string("${m.fecha}"`);
        writeFileSync(f, src); console.log(`\nPine regenerado: ${f}`);
      }
    }
  } else {
    const r = await actualizarMuros({ fecha: argOf('--fecha', null), trigger: 'cli' });
    console.log(`Sesión ${r.fecha}: ${r.pares.length} pares` + (r.errores.length ? ` · errores: ${r.errores.join(' | ')}` : ''));
    console.log('\nTabla para el indicador:\n' + tablaPine(leerMuros(db, r.fecha)));
  }
} finally { closeDb && closeDb(); }
