// Pruebas del vigilante de datos (server/src/radar/vigilante.js): base temporal, sin red ni correo real.
import os from 'node:os';
import path from 'node:path';
const DB = path.join(os.tmpdir(), `vigilante-test-${Date.now()}.db`);
process.env.JOURNAL_DB = DB; process.env.NODE_ENV = 'test'; process.env.OWNER_EMAILS = 'dueno@example.test';
const { getDb } = await import('../src/db.js');
const { dataWatch, alertIfStale } = await import('../src/radar/vigilante.js');
const { FRED_MARKET } = await import('../src/radar/constants.js');
let fallos = 0; const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { console.log(`  ✗ ${m}`); fallos++; } };
const db = getDb(); const now = Date.parse('2026-12-10T12:00:00Z'); const day = (n) => new Date(now - n * 86400000).toISOString().slice(0, 10);
const put = db.prepare('INSERT OR REPLACE INTO radar_series (source, series_id, date, value) VALUES (?, ?, ?, ?)');
const fill = (ages) => { for (const [id, age] of Object.entries(ages)) put.run('fred', id, day(age), 1); };
const sec = (d) => Math.floor((now - d * 86400000) / 1000); const bars = (age) => Array.from({ length: 60 }, (_, i) => ({ time: sec(age) - (59 - i) * 3600, open: 1, high: 1, low: 1, close: 1 }));
const market = (age) => ({ vix: { value: 20, times: [sec(age)] }, dxy: { value: 100, times: [sec(age)] }, move: { value: 90, times: [sec(age)] } });
const symbols = (age) => Object.fromEntries(['XAUUSD', 'USOIL', 'US500', 'NAS100', 'US30'].map((s) => [s, { h1: bars(age), d1: bars(age) }]));
const src = (h) => ({ ok: true, last_fetch: new Date(now - h * 3600000).toISOString() }); const sources = { calendar: src(0.2), lecturas: src(0.05), tono: src(0.5), cot: src(3) };
console.log('Todo al día');
{ fill({ [FRED_MARKET.walcl]: 6, [FRED_MARKET.wtregen]: 6, [FRED_MARKET.rrp]: 1, [FRED_MARKET.nfci]: 9, [FRED_MARKET.dgs10]: 1, [FRED_MARKET.gvz]: 1 });
  const w = dataWatch(db, { now, market: market(0.5), symbols: symbols(0.1), sources });
  ok(w.ok && w.stale.length === 0 && w.checked >= 18, `sin atrasos (${w.checked} datos comprobados)`);
  const r = await alertIfStale(db, w, { now, send: async () => { throw new Error('no debía enviar'); } }); ok(!r.sent, 'sin atrasos no se envía nada'); }
console.log('Fin de semana largo');
{ const w = dataWatch(db, { now, market: market(3.8), symbols: symbols(3.5), sources }); ok(w.ok, 'cotizaciones de hace 3–4 días (fin de semana) no cuentan como atraso'); }
console.log('Datos atrasados');
{ put.run('fred', FRED_MARKET.nfci, day(0), 1); db.prepare('DELETE FROM radar_series WHERE series_id = ?').run(FRED_MARKET.nfci); put.run('fred', FRED_MARKET.nfci, day(40), 1);
  const w = dataWatch(db, { now, market: { ...market(0.5), move: { value: null, times: [] } }, symbols: { ...symbols(0.1), USOIL: undefined }, sources: { ...sources, lecturas: src(30) } });
  const k = w.stale.map((c) => c.key);
  ok(!w.ok && k.includes('condiciones') && k.includes('move') && k.includes('precio_USOIL') && k.includes('lecturas'), `detecta NFCI viejo, MOVE sin datos, petróleo sin precio y lecturas paradas (${k.join(', ')})`);
  process.env.RESEND_API_KEY = 'prueba'; process.env.MAIL_FROM = 'radar@example.test'; const enviados = []; const send = async (m) => { enviados.push(m); return { status: 'enviado' }; };
  const a = await alertIfStale(db, w, { now, send }); ok(!a.sent && enviados.length === 0, 'no avisa hasta que el atraso dura 6 horas');
  const b = await alertIfStale(db, w, { now: now + 7 * 3600000, send }); ok(b.sent && enviados.length === 1 && /datos atrasados/.test(enviados[0].subject) && enviados[0].to === 'dueno@example.test' && /Condiciones financieras/.test(enviados[0].text), 'a las 7 horas avisa al dueño con la lista');
  const c = await alertIfStale(db, w, { now: now + 9 * 3600000, send }); ok(!c.sent && enviados.length === 1, 'no repite el aviso el mismo día');
  const d = await alertIfStale(db, w, { now: now + 33 * 3600000, send }); ok(d.sent && enviados.length === 2, 'si sigue igual al día siguiente, avisa otra vez');
  const al = dataWatch(db, { now, market: market(0.5), symbols: symbols(0.1), sources }); fill({ [FRED_MARKET.nfci]: 5 }); const bien = dataWatch(db, { now, market: market(0.5), symbols: symbols(0.1), sources });
  const e = await alertIfStale(db, bien, { now: now + 34 * 3600000, send }); ok(bien.ok && e.recovered && enviados.length === 3 && /al día otra vez/.test(enviados[2].subject), 'cuando se arregla, avisa de que todo vuelve a estar al día');
  delete process.env.RESEND_API_KEY; }
console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien'); process.exit(fallos ? 1 : 0);
