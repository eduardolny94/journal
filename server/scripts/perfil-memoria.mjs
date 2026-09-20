// Perfil de reservas de memoria del cálculo del radar: qué funciones reservan más (incluido lo que luego se libera).
// Uso: node server/scripts/perfil-memoria.mjs
import dotenv from 'dotenv';
import path from 'node:path';
import inspector from 'node:inspector';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') });

const session = new inspector.Session();
session.connect();
const post = (method, params) => new Promise((resolve, reject) => session.post(method, params, (err, r) => (err ? reject(err) : resolve(r))));

const engine = await import('../src/radar/engine.js');
await engine.getSnapshot({ force: false }); // primera pasada: descarga y calienta cachés
await post('HeapProfiler.startSampling', { samplingInterval: 65536, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
const t0 = Date.now();
await engine.getSnapshot({ force: true });
const { profile } = await post('HeapProfiler.stopSampling');
console.log(`segunda pasada: ${((Date.now() - t0) / 1000).toFixed(1)} s`);

const self = new Map();
const incl = new Map();
function walk(node, stack) {
  const f = node.callFrame;
  const file = (f.url || '').split('/').slice(-2).join('/');
  const key = `${f.functionName || '(anónima)'} ${file}:${f.lineNumber + 1}`;
  const own = node.selfSize || 0;
  let total = own;
  const next = stack.includes(key) ? stack : [...stack, key];
  for (const c of node.children || []) total += walk(c, next);
  self.set(key, (self.get(key) || 0) + own);
  if (!stack.includes(key)) incl.set(key, (incl.get(key) || 0) + total);
  return total;
}
const total = walk(profile.head, []);
const mb = (n) => (n / 1048576).toFixed(0).padStart(6);
console.log(`\nTotal reservado en la pasada: ${mb(total)} MB\n\nPropio (quién reserva directamente):`);
for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`${mb(v)} MB  ${k}`);
console.log('\nAcumulado (incluye lo que llama), solo código del proyecto:');
for (const [k, v] of [...incl.entries()].filter(([k]) => /radar\/|sources\/|services\//.test(k)).sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`${mb(v)} MB  ${k}`);
process.exit(0);
