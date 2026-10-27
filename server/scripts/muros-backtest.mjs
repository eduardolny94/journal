// Backtest de los muros de opciones con histórico de Databento: para cada día D, los muros de la sesión D−1 (publicados a las
// 02:40 UTC de D, antes de Londres) y las velas de 1 h de D. Mide (1) si el precio llega al muro, (2) si al tocarlo rebota ≥ 0,25 %
// antes de atravesarlo 0,25 %, por estrellas, frente a niveles de control desplazados 15 pips (oro: 6 $) donde no hay strike.
// Coste: ~0,003 $/día por par de divisas, ~0,056 $/día el oro (se descarga una vez y queda en radar_opciones).
// Uso: node server/scripts/muros-backtest.mjs --par EURUSD --desde 2026-07-27 --hasta 2026-10-23 [--solo-evaluar] [--dir data/mt5-fxcm]
import dotenv from 'dotenv';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ quiet: true, path: path.resolve(__dirname, '..', '..', '.env') });
const { getDb, closeDb } = await import('../src/db.js');
const { murosDeRaiz, guardar, leerMuros, RAICES, configMuros } = await import('../src/radar/opciones.js');
const argOf = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const SYM = argOf('--par', 'EURUSD').toUpperCase(); const DESDE = argOf('--desde', '2026-07-27'); const HASTA = argOf('--hasta', '2026-10-23'); const SOLO = process.argv.includes('--solo-evaluar');
const DIR = path.resolve(__dirname, '..', '..', argOf('--dir', SYM === 'XAUUSD' ? 'data/mt5' : 'data/mt5-fxcm'));
const raiz = RAICES.find((r) => r.symbol === SYM); if (!raiz) throw new Error(`Par sin opciones del CME: ${SYM}`);
const pip = SYM === 'XAUUSD' ? 1 : SYM.endsWith('JPY') ? 0.01 : 0.0001; const control = SYM === 'XAUUSD' ? 6 : 15 * pip;
// velas 1 h (servidor = NY+7) por día
const days = new Map();
for (const line of readFileSync(path.join(DIR, `${SYM}_PERIOD_H1.csv`), 'utf8').trim().split(/\r?\n/).slice(1)) { const [t, o, h, l, c] = line.split(','); if (!t) continue; const [d, hm] = t.split(' '); if (hm.slice(3, 5) !== '00') continue; const date = d.replace(/\./g, '-'); if (!days.has(date)) days.set(date, []); days.get(date).push({ hour: Number(hm.slice(0, 2)), o: +o, h: +h, l: +l, c: +c }); }
const fechas = [...days.keys()].filter((d) => d >= DESDE && d <= HASTA).sort();
const db = getDb(); try { db.exec('PRAGMA busy_timeout = 10000;'); } catch { /* sin pragma */ } const cfg = configMuros();
const prev = (d) => { const i = fechas.indexOf(d); return i > 0 ? fechas[i - 1] : null; };
// 1) descarga (sesión D−1 para cada D), si no está guardada
if (!SOLO) {
  if (!cfg.api_key) throw new Error('Falta DATABENTO_API_KEY');
  let n = 0; const PAR = Number(argOf('--paralelo', '4'));
  const pendientes = fechas.filter((d) => prev(d) && !db.prepare('SELECT 1 FROM radar_opciones WHERE fecha = ? AND symbol = ? LIMIT 1').get(prev(d), SYM));
  console.log(`${SYM}: ${pendientes.length} sesiones pendientes, ${PAR} a la vez`);
  const defsCache = {}; let idx = 0; const worker = async () => { while (idx < pendientes.length) { const d = pendientes[idx++]; const s = prev(d); const precio = days.get(d)[0].o; try { const m = await murosDeRaiz(cfg.api_key, raiz, s, { log: () => {}, precioVivo: precio, defsCache }); if (m) { guardar(db, m); n++; if (n % 25 === 0) console.log(`${SYM}: ${n} sesiones descargadas (${new Date().toISOString().slice(11, 16)} UTC)`); } } catch (e) { console.log(`${s}: ${e.message.slice(0, 120)}`); } } };
  await Promise.all(Array.from({ length: PAR }, worker));
  console.log(`descargadas ${n} sesiones nuevas`);
}
// 2) evaluación
const MAXD = Number(argOf('--max-dist', '1.0')) / 100; // solo muros a menos de este % del precio de apertura (los lejanos no se alcanzan en el día)
const res = { muro: {}, control: {}, dist: {} }; const bump = (k, star, field) => { const o = (res[k][star] ||= { n: 0, touch: 0, bounce: 0, through: 0 }); o[field]++; };
const thr = (p) => p * 0.0025;
function evalLevel(bars, lvl, side, k, star) { // side +1: nivel por encima (call), −1: por debajo (put)
  bump(k, star, 'n'); const i = bars.findIndex((b) => b.l <= lvl && b.h >= lvl); if (i < 0) return; bump(k, star, 'touch');
  for (const b of bars.slice(i + 1)) { const away = side > 0 ? lvl - b.l : b.h - lvl; const thru = side > 0 ? b.h - lvl : lvl - b.l; if (thru >= thr(lvl)) { bump(k, star, 'through'); return; } if (away >= thr(lvl)) { bump(k, star, 'bounce'); return; } }
}
const bucket = (d) => (d < 0.003 ? '0–0,3 %' : d < 0.006 ? '0,3–0,6 %' : '0,6–1 %');
let dias = 0;
for (const d of fechas) { const s = prev(d); if (!s) continue; const m = leerMuros(db, s).pares.find((p) => p.symbol === SYM); if (!m) continue; const bars = days.get(d).filter((b) => b.hour >= 9 && b.hour <= 21); if (bars.length < 8) continue; const open = bars[0].o; dias++;
  for (const c of m.calls) { const d = c.price / open - 1; if (d > 0 && d <= MAXD) { evalLevel(bars, c.price, 1, 'muro', c.stars); evalLevel(bars, c.price + control, 1, 'control', c.stars); evalLevel(bars, c.price, 1, 'dist', bucket(d)); } }
  for (const p of m.puts) { const d = 1 - p.price / open; if (d > 0 && d <= MAXD) { evalLevel(bars, p.price, -1, 'muro', p.stars); evalLevel(bars, p.price - control, -1, 'control', p.stars); evalLevel(bars, p.price, -1, 'dist', bucket(d)); } } }
const pct = (a, n) => (n ? `${Math.round((100 * a) / n)} %` : '—');
console.log(`\n${SYM} · ${dias} días con muros · ${DESDE} → ${HASTA} · Londres+NY (09–21h servidor) · solo muros a ≤ ${(MAXD * 100).toFixed(1)} % de la apertura`);
console.log(`  ${'estrellas'.padEnd(10)} | ${'muros: n · llega · rebota (de los tocados) · atraviesa'.padEnd(52)} | control (mismo nivel ±${SYM === 'XAUUSD' ? '6 $' : '15 pips'})`);
const all = (k) => Object.values(res[k]).reduce((t, o) => ({ n: t.n + o.n, touch: t.touch + o.touch, bounce: t.bounce + o.bounce, through: t.through + o.through }), { n: 0, touch: 0, bounce: 0, through: 0 });
for (const star of [5, 4, 3, 2, 'todas']) { const a = star === 'todas' ? all('muro') : res.muro[star]; const c = star === 'todas' ? all('control') : res.control[star]; if (!a) continue; console.log(`  ${String(star).padEnd(10)} | n=${String(a.n).padStart(4)} · llega ${pct(a.touch, a.n).padStart(5)} · rebota ${pct(a.bounce, a.touch).padStart(5)} · atraviesa ${pct(a.through, a.touch).padStart(5)}      | llega ${pct(c.touch, c.n).padStart(5)} · rebota ${pct(c.bounce, c.touch).padStart(5)} · atraviesa ${pct(c.through, c.touch).padStart(5)}`); }
console.log('  por distancia a la apertura (muros):'); for (const b of ['0–0,3 %', '0,3–0,6 %', '0,6–1 %']) { const a = res.dist[b]; if (a) console.log(`    ${b.padEnd(10)} n=${String(a.n).padStart(4)} · llega ${pct(a.touch, a.n).padStart(5)} · rebota ${pct(a.bounce, a.touch).padStart(5)} · atraviesa ${pct(a.through, a.touch).padStart(5)}`); }
closeDb && closeDb();
