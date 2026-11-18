// Pruebas de la lectura de noticias (server/src/radar/lecturas.js) con una base temporal y sin red.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const DB = path.join(os.tmpdir(), `lecturas-test-${Date.now()}.db`);
process.env.JOURNAL_DB = DB; process.env.NODE_ENV = 'test';
const { getDb } = await import('../src/db.js');
const L = await import('../src/radar/lecturas.js');
let fallos = 0; const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { console.log(`  ✗ ${m}`); fallos++; } };
const db = getDb();
const ev = (title, country, actual, forecast, impact = 'High', at = '2026-11-16T13:30:00.000Z') => ({ title, country, at_utc: at, impact, actual, forecast, previous: null });
console.log('Lectura de datos');
{ const r = L.lecturaDeDato(db, 'USD', [ev('Inflation Rate YoY', 'USD', '3.4%', '3.1%')], '2026-11-16T13:30:00.000Z');
  ok(r.dir === 1 && /A favor del dólar/.test(r.esperar) && /77 %/.test(r.esperar), 'inflación por encima → a favor del dólar, con lo medido'); }
{ const r = L.lecturaDeDato(db, 'GBP', [ev('Unemployment Rate', 'GBP', '4.6%', '4.7%')], '2026-11-17T07:00:00.000Z');
  ok(r.dir === 1 && /A favor de la libra/.test(r.esperar), 'paro por debajo de lo esperado → a favor de la libra'); }
{ const r = L.lecturaDeDato(db, 'CAD', [ev('Inflation Rate YoY', 'CAD', '3.1%', '3.2%')], '2026-11-16T13:30:00.000Z');
  ok(r.dir === -1 && /En contra del dólar canadiense/.test(r.esperar), 'inflación por debajo → en contra del dólar canadiense'); }
{ const r = L.lecturaDeDato(db, 'USD', [ev('Retail Sales MoM', 'USD', '0.2%', '0.2%')], '2026-11-17T13:30:00.000Z', [ev('Retail Sales Ex Autos MoM', 'USD', '0.6%', '0.4%', 'Medium', '2026-11-17T13:30:00.000Z')]);
  ok(r.dir === 1 && /Ligeramente a favor/.test(r.esperar) && /titular en línea/.test(r.lectura), 'titular en línea y detalle mejor → ligeramente a favor'); }
{ const r = L.lecturaDeDato(db, 'USD', [ev('Retail Sales MoM', 'USD', '0.2%', '0.2%')], '2026-11-17T13:30:00.000Z');
  ok(r.dir === 0 && /Sin sorpresa/.test(r.esperar), 'en línea → sin efecto medido'); }
{ const r = L.lecturaDeDato(db, 'USD', [ev('Inflation Rate YoY', 'USD', '3.4%', '3.1%'), ev('Core Inflation Rate MoM', 'USD', '0.1%', '0.3%')], '2026-11-16T13:30:00.000Z');
  ok(r.dir === 0 && /mixta/.test(r.lectura), 'componentes opuestos → lectura mixta'); }
console.log('Actas sin texto ni bono');
{ const r = await L.lecturaDeActas(db, 'GBP', { title: 'MPC Meeting Minutes', country: 'GBP', at_utc: '2026-11-05T12:00:00.000Z' }, { llamar: null });
  ok(r.kind === 'actas' && r.dir === 0 && /^regla/.test(r.fuente), 'sin texto ni bono: regla, neutral'); }
console.log('Guardado y lectura');
{ const now = Date.now(); const at = new Date(now - 3600_000).toISOString();
  db.prepare('INSERT INTO radar_calendar (id, title, country, at_utc, impact, forecast, previous, actual, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('t1', 'Inflation Rate YoY', 'CAD', at, 'High', '3.2%', '3.1%', '3.1%', new Date(now).toISOString());
  db.prepare('INSERT INTO radar_calendar (id, title, country, at_utc, impact, forecast, previous, actual, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run('t2', 'Inflation Rate YoY', 'JPY', at, 'High', '2.0%', '2.1%', '2.4%', new Date(now).toISOString());
  const r = await L.refreshLecturas(db, { now, llamar: null }); const out = L.latestLecturas(db, { now });
  ok(r.ok && r.count === 1, 'solo se leen las cinco divisas (el yen queda fuera)');
  ok(out.currencies.join(',') === 'USD,EUR,GBP,CHF,CAD' && out.por_divisa.CAD && out.por_divisa.CAD.dir === -1 && out.por_divisa.USD === null, 'el radar recibe la última lectura por divisa');
  await L.refreshLecturas(db, { now, llamar: null }); ok(db.prepare('SELECT COUNT(*) n FROM radar_lecturas').get().n === 1, 'repetir no duplica'); }
try { db.close(); } catch { /* */ } for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) { try { fs.unlinkSync(f); } catch { /* */ } }
console.log(fallos ? `\nLecturas: ${fallos} fallo(s)` : '\nLecturas: todo correcto'); process.exit(fallos ? 1 : 0);
