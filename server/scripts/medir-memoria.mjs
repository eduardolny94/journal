// Mide el pico de memoria (RSS) de cada tarea pesada del radar, una a una, para saber cuál dispara el consumo.
// Uso: node server/scripts/medir-memoria.mjs [tarea ...]   (sin argumentos: todas)
import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });
process.env.NODE_ENV = process.env.NODE_ENV || 'development';

const mb = (n) => Math.round(n / 1048576);
const { getDb } = await import('../src/db.js');
const db = getDb();

async function measure(label, fn) {
  if (global.gc) global.gc();
  const before = process.memoryUsage().rss;
  let peak = before;
  const timer = setInterval(() => {
    const r = process.memoryUsage().rss;
    if (r > peak) peak = r;
  }, 25);
  const t0 = Date.now();
  let note = 'ok';
  try {
    const out = await fn();
    if (out && typeof out === 'object' && 'count' in out) note = `ok (${out.count} filas)`;
  } catch (e) {
    note = `error: ${e.message}`;
  }
  clearInterval(timer);
  const after = process.memoryUsage().rss;
  console.log(`${label.padEnd(34)} antes ${String(mb(before)).padStart(4)} MB · pico ${String(mb(peak)).padStart(4)} MB (+${mb(peak - before)}) · después ${String(mb(after)).padStart(4)} MB · ${((Date.now() - t0) / 1000).toFixed(1)} s · ${note}`);
}

const tasks = {
  cot: async () => (await import('../src/radar/sources/cot.js')).refreshCot(db),
  fred: async () => (await import('../src/radar/sources/fred.js')).refreshFred(db),
  bonos_oficiales: async () => (await import('../src/radar/sources/yields.js')).refreshYieldsOfficial(db),
  bonos_tv: async () => (await import('../src/radar/sources/yields.js')).refreshYieldsLive(db),
  calendario_historico: async () => (await import('../src/radar/engine.js')).ensureCalendarHistory({}),
  radar_completo: async () => (await import('../src/radar/engine.js')).getSnapshot({ force: true }),
  radar_segunda_pasada: async () => (await import('../src/radar/engine.js')).getSnapshot({ force: true }),
  backtest: async () => (await import('../src/radar/backtest.js')).runBacktest(db, { log: () => {} }),
};

const wanted = process.argv.slice(2);
console.log(`Node ${process.version} · arranque ${mb(process.memoryUsage().rss)} MB`);
for (const [name, fn] of Object.entries(tasks)) {
  if (wanted.length && !wanted.includes(name)) continue;
  await measure(name, fn);
}
process.exit(0);
