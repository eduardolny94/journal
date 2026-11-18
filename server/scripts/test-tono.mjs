// Pruebas del tono automático con rueda de prensa (server/src/radar/sources/tono.js): base temporal, sin red y sin modelo real.
import os from 'node:os';
import path from 'node:path';
const DB = path.join(os.tmpdir(), `tono-test-${Date.now()}.db`);
process.env.JOURNAL_DB = DB; process.env.NODE_ENV = 'test';
const { getDb } = await import('../src/db.js');
const T = await import('../src/radar/sources/tono.js');
let fallos = 0; const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { console.log(`  ✗ ${m}`); fallos++; } };
const db = getDb();
console.log('Rueda de prensa (descarga)');
{ const pdf = Buffer.concat([Buffer.from('%PDF-1.6\n'), Buffer.alloc(30_000, 65)]);
  const f = (code, body) => async () => ({ ok: code === 200, arrayBuffer: async () => body });
  const r = await T.pressConferenceFor('USD', '2026-12-09T19:00:00.000Z', { fetchImpl: async () => ({ ok: true, arrayBuffer: async () => pdf }) });
  ok(r && r.link.endsWith('FOMCpresconf20261209.pdf') && r.base64.length > 1000, 'USD: URL con la fecha y PDF en base64');
  ok((await T.pressConferenceFor('USD', '2026-12-09T19:00:00.000Z', { fetchImpl: f(404, Buffer.alloc(0)) })) === null, 'aún no publicada (404) → null');
  ok((await T.pressConferenceFor('USD', '2026-12-09T19:00:00.000Z', { fetchImpl: f(200, Buffer.from('<html>no soy pdf</html>'.padEnd(30_000, ' '))) })) === null, 'una página que no es PDF → null');
  ok((await T.pressConferenceFor('EUR', '2026-12-10T13:15:00.000Z', { fetchImpl: f(200, pdf) })) === null, 'otros bancos: sin rueda de prensa todavía');
  ok(T.hasPressConference('USD') && !T.hasPressConference('GBP'), 'solo la Fed la tiene'); }
console.log('Modelo: el contenido lleva el PDF y la base queda «comunicado+rueda»');
{ let visto = null; const llamar = async (p) => { visto = p; return { content: [{ type: 'text', text: JSON.stringify({ tono: 2, resumen: 'Warsh no cierra la puerta a más subidas.', base: 'comunicado' }) }], model: 'falso', usage: { input_tokens: 123 } }; };
  const dec = { at_utc: '2026-12-09T19:00:00.000Z', actual: '4%', forecast: '4%', previous: '3.75%' };
  const r = await T.toneByModel(llamar, { ccy: 'USD', decision: dec, statement: { title: 'FOMC statement', text: 'x'.repeat(300) }, bp: 5, news: [], previous: { date: '2026-10-28', text: 'texto anterior' }, press: { title: 'Rueda', base64: 'QUJD' } });
  ok(Array.isArray(visto.messages[0].content) && visto.messages[0].content[0].type === 'document' && visto.messages[0].content[0].source.media_type === 'application/pdf', 'el PDF va como bloque documento');
  ok(/Comunicado de la reunión anterior \(2026-10-28\)/.test(visto.messages[0].content[1].text), 'el comunicado anterior va para comparar');
  ok(r.tone === 2 && r.base === 'comunicado+rueda', 'tono y base devueltos');
  const r2 = await T.toneByModel(llamar, { ccy: 'USD', decision: dec, statement: { title: 'x', text: 'y'.repeat(300) }, bp: null, news: [] });
  ok(typeof visto.messages[0].content === 'string' && r2.base === 'comunicado', 'sin rueda de prensa: texto simple, como antes'); }
console.log('Ciclo completo: lectura del comunicado, relectura con la rueda y nada más');
{ const now = new Date('2026-12-09T21:00:00.000Z');
  const ins = db.prepare('INSERT INTO radar_calendar (id, title, country, at_utc, impact, forecast, previous, actual, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  ins.run('d1', 'Fed Interest Rate Decision', 'USD', '2026-10-28T18:00:00.000Z', 'High', '4%', '4%', '4%', now.toISOString());
  ins.run('d2', 'Fed Interest Rate Decision', 'USD', '2026-12-09T19:00:00.000Z', 'High', '4.25%', '4%', '4.25%', now.toISOString());
  let llamadas = 0, ultimo = null; const llamar = async (p) => { llamadas++; ultimo = p; const conRueda = Array.isArray(p.messages[0].content); return { content: [{ type: 'text', text: JSON.stringify({ tono: conRueda ? 2 : 1, resumen: conRueda ? 'Con rueda' : 'Solo comunicado', base: 'comunicado' }) }], model: 'falso', usage: { input_tokens: 10 } }; };
  let pressLista = false; const io = { statement: async (c, at) => ({ title: 'FOMC statement', link: `https://x/${at.slice(0, 10)}`, text: `Comunicado del ${at.slice(0, 10)} `.padEnd(400, '.') }), press: async () => (pressLista ? { link: 'https://x/p.pdf', title: 'Rueda', base64: 'QUJD' } : null), sep: async () => null };
  const m = () => db.prepare("SELECT cb_tone, note FROM radar_manual WHERE currency = 'USD'").get();
  await T.refreshTono(db, { now, llamar, io });
  ok(m() && m().cb_tone === 1 && /^auto 2026-12-09 \(comunicado, /.test(m().note) && llamadas === 1, 'primera lectura (sin rueda): tono +1');
  ok(/Comunicado de la reunión anterior \(2026-10-28\)/.test(ultimo.messages[0].content), 'compara con el comunicado de octubre');
  await T.refreshTono(db, { now: new Date(now.getTime() + 3600_000), llamar, io });
  ok(llamadas === 1, 'sin rueda aún: no se vuelve a llamar al modelo');
  pressLista = true;
  await T.refreshTono(db, { now: new Date(now.getTime() + 2 * 3600_000), llamar, io });
  ok(llamadas === 2 && m().cb_tone === 2 && /\+rueda/.test(m().note), 'aparece la rueda de prensa: relectura y tono +2');
  await T.refreshTono(db, { now: new Date(now.getTime() + 3 * 3600_000), llamar, io });
  ok(llamadas === 2, 'ya leída con la rueda: no se repite');
  // lectura a mano posterior: prevalece
  db.prepare("UPDATE radar_manual SET note = 'manual: lo pongo yo', updated_at = ? WHERE currency = 'USD'").run(new Date(now.getTime() + 4 * 3600_000).toISOString());
  await T.refreshTono(db, { now: new Date(now.getTime() + 5 * 3600_000), llamar, io });
  ok(llamadas === 2 && /^manual/.test(m().note), 'un tono puesto a mano después manda'); }
console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien');
process.exit(fallos ? 1 : 0);
