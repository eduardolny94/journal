// Pruebas de las señales a Discord con recuento semanal (server/src/services/senales.js): base temporal, sin red.
import os from 'node:os';
import path from 'node:path';
const DB = path.join(os.tmpdir(), `senales-test-${Date.now()}.db`);
process.env.JOURNAL_DB = DB; process.env.NODE_ENV = 'test';
const { getDb } = await import('../src/db.js');
const S = await import('../src/services/senales.js');
let fallos = 0; const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { console.log(`  ✗ ${m}`); fallos++; } };
const db = getDb(); const HOOK = 'https://discord.com/api/webhooks/123456789012345678/' + 'a'.repeat(60);
console.log('Lectura de mensajes del indicador');
{ const s = S.parseMensaje('🔴 **SELL Gold NOW**\nGold Entrada: 4012.5 (o cercano)\nSL: 4020.0\nTP1: 4005.0  (1R)\nTP2: 3997.5  (2R)\n⚠️ Gestiona tu riesgo');
  ok(s && s.tipo === 'senal' && s.lado === -1 && s.activo === 'Gold' && s.entrada === 4012.5 && s.sl === 4020 && s.tp1 === 4005 && s.tp2 === 3997.5 && !s.limite, 'señal de venta en inglés');
  const c = S.parseMensaje('@everyone\n🟢 **COMPRA EURUSD LÍMITE**\nEURUSD Entrada: 1.0850\nSL: 1.0840\nTP1: 1.0860  (1R)\nTP2: 1.0870  (2R)');
  ok(c && c.tipo === 'senal' && c.lado === 1 && c.activo === 'EURUSD' && c.limite && c.entrada === 1.085, 'señal de compra límite en español, con mención');
  const e = S.parseMensaje('✅ TP1 alcanzado (1R) · Gold\nSELL Gold · Entrada 4012.5 · SL 4020 · TP1 4005 · TP2 3997.5');
  ok(e && e.tipo === 'evento' && e.evento === 'tp1' && e.lado === -1 && e.entrada === 4012.5, 'evento TP1');
  ok(S.parseMensaje('🎯 TP2 alcanzado (2R) · Gold\nSELL Gold · Entrada 4012.5 · SL 4020 · TP1 4005 · TP2 3997.5').evento === 'tp2', 'evento TP2');
  ok(S.parseMensaje('❌ Stop tocado · Gold\nSELL Gold · Entrada 4012.5 · SL 4020 · TP1 4005 · TP2 3997.5').evento === 'sl', 'evento stop');
  ok(S.parseMensaje('⚖️ Cierre en la entrada (BE) · Gold\nSELL Gold · Entrada 4012.5 · SL 4020 · TP1 4005 · TP2 3997.5').evento === 'be', 'evento BE');
  ok(S.parseMensaje('▶️ Entrada activada · EURUSD\nCOMPRA EURUSD · Entrada 1.085 · SL 1.084 · TP1 1.086 · TP2 1.087').evento === 'entrada', 'evento entrada activada');
  ok(S.parseMensaje('hola a todos') === null && S.parseMensaje('') === null, 'un texto cualquiera no se toma por señal'); }
console.log('Webhook');
{ ok(S.WEBHOOK_RE.test(HOOK) && !S.WEBHOOK_RE.test('https://evil.example/api/webhooks/1/abc') && !S.WEBHOOK_RE.test('http://discord.com/api/webhooks/123456/' + 'a'.repeat(60)) && !S.WEBHOOK_RE.test(HOOK + '/slack?x=1'), 'solo admite URLs de webhook de Discord (https)');
  ok(!S.maskWebhook(HOOK).includes('a'.repeat(30)) && S.maskWebhook(HOOK).endsWith('aaaa'), 'el webhook se enseña recortado'); }
console.log('Canal, señales y recuento');
{ db.prepare("INSERT INTO users (email, password_hash, name) VALUES ('s@example.test', 'x', 'Prueba')").run(); const uid = db.prepare("SELECT id FROM users WHERE email = 's@example.test'").get().id;
  let lanzo = false; try { S.saveCanal(db, uid, 'https://example.com/hook'); } catch { lanzo = true; } ok(lanzo, 'rechaza un webhook que no es de Discord');
  const canal = S.saveCanal(db, uid, HOOK); ok(canal && /^[A-Za-z0-9_-]{30,}$/.test(canal.clave) && S.canalPorClave(db, canal.clave).id === canal.id && S.canalPorClave(db, 'corta') === null, 'crea el canal con una clave larga');
  const clave0 = canal.clave; ok(S.saveCanal(db, uid, HOOK.replace(/a{60}$/, 'b'.repeat(60))).clave === clave0, 'cambiar el webhook no cambia la URL del journal');
  const lunes = Date.parse('2026-11-16T09:00:00Z'); const t = (h) => new Date(lunes + h * 3600e3);
  const sig = (lado, act, e, sl, t1, t2) => `${lado > 0 ? '🟢' : '🔴'} **${lado > 0 ? 'BUY' : 'SELL'} ${act} NOW**\n${act} Entrada: ${e}\nSL: ${sl}\nTP1: ${t1}  (1R)\nTP2: ${t2}  (2R)`; const evn = (tit, lado, act, e, sl, t1, t2) => `${tit} · ${act}\n${lado > 0 ? 'BUY' : 'SELL'} ${act} · Entrada ${e} · SL ${sl} · TP1 ${t1} · TP2 ${t2}`;
  const reg = (txt, when) => S.registrar(db, canal, S.parseMensaje(txt), when);
  ok(reg(sig(-1, 'Gold', 4012.5, 4020, 4005, 3997.5), t(0)).nueva, 'señal 1 anotada'); ok(reg(sig(-1, 'Gold', 4012.5, 4020, 4005, 3997.5), t(0.01)).duplicada, 'la misma señal repetida al momento no se duplica');
  reg(evn('✅ TP1 alcanzado (1R)', -1, 'Gold', 4012.5, 4020, 4005, 3997.5), t(1)); ok(reg(evn('🎯 TP2 alcanzado (2R)', -1, 'Gold', 4012.5, 4020, 4005, 3997.5), t(2)).estado === 'tp2', 'señal 1 → TP2');
  reg(sig(1, 'EURUSD', 1.085, 1.084, 1.086, 1.087), t(5)); ok(reg(evn('❌ Stop tocado', 1, 'EURUSD', 1.085, 1.084, 1.086, 1.087), t(6)).estado === 'sl', 'señal 2 → SL');
  reg(sig(1, 'NAS100', 25000, 24900, 25100, 25200), t(24)); reg(evn('✅ TP1 alcanzado (1R)', 1, 'NAS100', 25000, 24900, 25100, 25200), t(25)); ok(reg(evn('⚖️ Cierre en la entrada (BE)', 1, 'NAS100', 25000, 24900, 25100, 25200), t(26)).estado === 'be', 'señal 3 → BE tras TP1');
  reg(sig(1, 'EURUSD', 1.09, 1.089, 1.091, 1.092), t(30)); reg(evn('✅ TP1 alcanzado (1R)', 1, 'EURUSD', 1.09, 1.089, 1.091, 1.092), t(31)); ok(reg(evn('❌ Stop tocado', 1, 'EURUSD', 1.09, 1.089, 1.091, 1.092), t(32)).estado === 'sl_tras_tp1', 'señal 4 → TP1 y luego stop');
  reg(sig(-1, 'US30', 48000, 48200, 47800, 47600), t(50));
  ok(!reg(evn('❌ Stop tocado', 1, 'GBPUSD', 1.3, 1.29, 1.31, 1.32), t(51)).ok, 'un evento sin señal previa no inventa nada');
  // BE manual: la vuelta a la entrada no hace nada hasta que el usuario pone el stop en la entrada.
  const us30 = db.prepare("SELECT id FROM senales WHERE activo = 'US30'").get().id; const vuelta = evn('↩️ Precio de vuelta en la entrada', -1, 'US30', 48000, 48200, 47800, 47600);
  ok(S.parseMensaje(vuelta).evento === 'vuelta', 'la vuelta a la entrada es un aviso propio (no un BE)');
  const v1 = reg(vuelta, t(52)); ok(v1.silenciar && S.senalDe(db, canal.id, us30).estado === 'en_curso', 'sin «Stop a BE» la vuelta a la entrada no cierra nada ni se publica');
  ok(S.ponerBE(db, canal.id, us30).be_at && /Stop movido a la entrada/.test(S.textoStopBE(S.senalDe(db, canal.id, us30))), '«Stop a BE» queda puesto y tiene su aviso');
  ok(!S.ponerBE(db, canal.id, us30, { quitar: true }).be_at && reg(vuelta, t(52.5)).silenciar, 'quitarlo vuelve a dejar la vuelta sin efecto'); S.ponerBE(db, canal.id, us30);
  const v2 = reg(vuelta, t(53)); ok(v2.cierreBE && v2.estado === 'be' && /Cierre en la entrada \(BE\) · US30/.test(S.textoCierreBE(v2.senal)), 'con «Stop a BE» puesto, la vuelta a la entrada cierra en BE');
  ok(reg(evn('❌ Stop tocado', -1, 'US30', 48000, 48200, 47800, 47600), t(54)).silenciar && S.senalDe(db, canal.id, us30).estado === 'be', 'tras el BE, el stop que avisa después el indicador no cambia nada ni se publica');
  let lanza = false; try { S.ponerBE(db, canal.id, us30); } catch { lanza = true; } ok(lanza, 'no se puede poner BE en una señal cerrada');
  ok(S.fijarResultado(db, canal.id, us30, 'en_curso').estado === 'en_curso' && S.fijarResultado(db, canal.id, us30, 'be').estado === 'be', 'el resultado se puede corregir a mano');
  let lanza2 = false; try { S.fijarResultado(db, canal.id, 999999, 'sl'); } catch { lanza2 = true; } ok(lanza2, 'no se toca una señal de otro canal o inexistente');
  db.prepare("UPDATE senales SET estado = 'en_curso', cerrada_at = NULL, be_at = NULL WHERE id = ?").run(us30);
  const sem = S.semanaDe(t(60)); const rec = S.recuento(db, canal.id, sem.desde, sem.hasta);
  ok(rec.total === 5 && rec.tp2 === 1 && rec.sl === 1 && rec.be === 1 && rec.sl_tras_tp1 === 1 && rec.en_curso === 1 && rec.tocaron_tp1 === 3, `recuento: 5 señales · TP2 1 · SL 1 · BE 1 · TP1 y stop 1 · en curso 1 (${JSON.stringify({ t: rec.total, tp2: rec.tp2, sl: rec.sl, be: rec.be })})`);
  const txt = S.textoResumen(rec, sem); ok(/Recuento semanal/.test(txt) && /TP \(objetivo final\): \*\*1\*\*/.test(txt) && /BE[^\n]*\*\*1\*\*/.test(txt) && /SL: \*\*1\*\*/.test(txt) && txt.length < 2000 && /16 nov/.test(txt), 'texto del recuento con TP, BE y SL');
  const enviados = []; const enviar = async (hook, content) => { enviados.push({ hook, content }); return { ok: true, status: 204 }; };
  ok(!S.tocaResumen(new Date('2026-11-19T12:00:00Z')) && S.tocaResumen(new Date('2026-11-20T22:30:00Z')) && S.tocaResumen(new Date('2026-11-21T09:00:00Z')), 'el recuento toca desde el viernes a las 23:00 (España) y el fin de semana');
  ok((await S.tickResumenes(db, { now: new Date('2026-11-19T12:00:00Z'), enviar })) === 0 && enviados.length === 0, 'un jueves no envía');
  ok((await S.tickResumenes(db, { now: new Date('2026-11-20T22:30:00Z'), enviar })) === 1 && enviados.length === 1 && enviados[0].hook.startsWith('https://discord.com/api/webhooks/'), 'el viernes por la noche envía el recuento al canal');
  ok((await S.tickResumenes(db, { now: new Date('2026-11-21T09:00:00Z'), enviar })) === 0 && enviados.length === 1, 'no lo repite el sábado');
  const man = await S.enviarResumen(db, S.getCanal(db, uid), { now: new Date('2026-11-21T10:00:00Z'), forzar: true, enviar }); ok(man.enviado && enviados.length === 2, '«enviar ahora» lo manda aunque ya se enviara');
  ok((await S.enviarDiscord('https://example.com/x', 'hola', { fetchImpl: async () => { throw new Error('no debía llamar'); } })).ok === false, 'nunca se envía a una URL que no sea de Discord');
  ok(S.deleteCanal(db, uid) && S.getCanal(db, uid) === null && db.prepare('SELECT COUNT(*) c FROM senales').get().c === 0, 'borrar el canal borra sus señales'); }
console.log('Importar mensajes pegados de Discord');
{ db.prepare("INSERT INTO users (email, password_hash, name) VALUES ('i@example.test', 'x', 'Importa')").run(); const uid2 = db.prepare("SELECT id FROM users WHERE email = 'i@example.test'").get().id;
  const canal2 = S.saveCanal(db, uid2, HOOK);
  ok(S.madridAIso(2026, 11, 16, 16, 36) === '2026-11-16T15:36:00.000Z' && S.madridAIso(2026, 7, 1, 12, 0) === '2026-07-01T10:00:00.000Z', 'la hora de Discord (España) se convierte bien en invierno y en verano');
  const pegado = `ELL USDJPY NOW
USDJPY Entrada: 159.551 (o cercano)
SL: 159.75
TP1: 159.352 (1R)
TP2: 159.153 (2R)
⚠️ Gestiona tu riesgo

1. GlobalFXAPP — 16/11/26, 16:36
🔴 SELL Gold NOW
Gold Entrada: 3863.125 (o cercano)
SL: 3885
TP1: 3841.25 (1R)
TP2: 3819.375 (2R)
⚠️ Gestiona tu riesgo
2. Edu FX — 16/11/26, 17:02
Vayan rodando el stop o a be gestionen su riesgo si van en profit
3. GlobalFXAPP — 16/11/26, 19:10
✅ TP1 alcanzado (1R) · Gold
SELL Gold · Entrada 3863.125 · SL 3885 · TP1 3841.25 · TP2 3819.375
4. GlobalFXAPP — 17/11/26, 1:22
✅ TP1 alcanzado (1R) · USDJPY
SELL USDJPY · Entrada 159.551 · SL 159.75 · TP1 159.352 · TP2 159.153
5. GlobalFXAPP — 17/11/26, 5:29
🎯 TP2 alcanzado (2R) · USDJPY
SELL USDJPY · Entrada 159.551 · SL 159.75 · TP1 159.352 · TP2 159.153
6. GlobalFXAPP — 17/11/26, 6:30
❌ Stop tocado · Gold
SELL Gold · Entrada 3863.125 · SL 3885 · TP1 3841.25 · TP2 3819.375
7. GlobalFXAPP — 17/11/26, 15:16
🟢 BUY EURUSD NOW
EURUSD Entrada: 1.09862 (o cercano)
SL: 1.0971
TP1: 1.10014 (1R)
TP2: 1.10166 (2R)
⚠️ Gestiona tu riesgo
8. Edu FX — 17/11/26, 15:17
9. GlobalFXAPP — 17/11/26, 16:39
✅ TP1 alcanzado (1R) · EURUSD
BUY EURUSD · Entrada 1.09862 · SL 1.0971 · TP1 1.10014 · TP2 1.10166
10. GlobalFXAPP — 17/11/26, 17:24
🎯 TP2 alcanzado (2R) · EURUSD
BUY EURUSD · Entrada 1.09862 · SL 1.0971 · TP1 1.10014 · TP2 1.10166
11. GlobalFXAPP — 18/11/26, 13:31
🔴 SELL Nasdaq NOW
Nasdaq Entrada: 27195.4 (o cercano)
SL: 27500
TP1: 26890.8 (1R)
TP2: 26586.2 (2R)
⚠️ Gestiona tu riesgo
12. Edu FX — 18/11/26, 15:48
Mover a be
13. GlobalFXAPP — 18/11/26, 15:49
✅ TP1 alcanzado (1R) · Nasdaq
SELL Nasdaq · Entrada 27195.4 · SL 27500 · TP1 26890.8 · TP2 26586.2`;
  ok(S.partirMensajes(pegado).length === 13, 'parte el pegado en 13 mensajes con texto (el primero sin cabecera; el vacío se descarta)');
  const r = S.importar(db, canal2, pegado, new Date('2026-11-21T10:00:00Z'));
  ok(r.nuevas === 4 && r.ignorados >= 3, `4 señales nuevas y los mensajes de otros se ignoran (${JSON.stringify(r)})`);
  const sem2 = S.semanaDe(new Date('2026-11-21T10:00:00Z')); const rc = S.recuento(db, canal2.id, sem2.desde, sem2.hasta);
  const est = Object.fromEntries(rc.senales.map((s) => [s.activo, s.estado]));
  ok(est.USDJPY === 'tp2' && est.EURUSD === 'tp2' && est.Gold === 'sl_tras_tp1' && est.Nasdaq === 'tp1', `estados: USDJPY TP2 · EURUSD TP2 · Gold TP1 y stop · Nasdaq TP1 abierta (${JSON.stringify(est)})`);
  ok(rc.total === 4 && rc.tp2 === 2 && rc.sl_tras_tp1 === 1 && rc.tp1_en_curso === 1 && rc.tocaron_tp1 === 4, 'recuento de la semana importada: 4 señales, 2 TP, 1 TP1 y stop, 1 abierta, 4 tocaron TP1');
  const gold = rc.senales.find((s) => s.activo === 'Gold'); ok(gold.abierta_at === '2026-11-16T15:36:00.000Z', 'la señal conserva su hora real de Discord');
  const r2 = S.importar(db, canal2, pegado, new Date('2026-11-21T10:00:00Z')); const rc2 = S.recuento(db, canal2.id, sem2.desde, sem2.hasta);
  ok(r2.nuevas === 0 && rc2.total === 4 && rc2.tp2 === 2, 'pegar lo mismo otra vez no duplica nada');
  const solo = S.importar(db, canal2, '🎯 TP2 alcanzado (2R) · US30\nSELL US30 · Entrada 48000 · SL 48200 · TP1 47800 · TP2 47600', new Date('2026-11-21T10:00:00Z'));
  ok(solo.nuevas === 1 && S.recuento(db, canal2.id, sem2.desde, sem2.hasta).tp2 === 3, 'pegado sin cabeceras: un aviso de una señal desconocida la crea con sus datos');
  const gold2 = S.recuento(db, canal2.id, sem2.desde, sem2.hasta).senales.find((s) => s.activo === 'Gold');
  S.borrarSenal(db, canal2.id, gold2.id); ok(S.recuento(db, canal2.id, sem2.desde, sem2.hasta).total === 4 && !S.senalDe(db, canal2.id, gold2.id), 'eliminar una señal la quita del recuento');
  let nolanza = true; try { S.borrarSenal(db, canal2.id, gold2.id); } catch (e) { nolanza = e.status === 404 ? false : true; } ok(!nolanza, 'eliminar una señal que no existe da error 404');
  S.deleteCanal(db, uid2); }
console.log(fallos ? `\n${fallos} fallo(s)` : '\nTodo bien'); process.exit(fallos ? 1 : 0);
