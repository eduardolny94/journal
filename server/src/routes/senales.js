// Señales a Discord con recuento semanal. Dos routers:
//  · `publico` (sin sesión): POST /api/senales/in/:clave. Es la URL que el usuario pega en la alerta de TradingView en lugar de la de
//    Discord. La clave es larga y aleatoria (como un webhook); el mensaje se anota y se reenvía tal cual a su canal de Discord.
//  · `privado` (con sesión): ver y configurar el canal, ver el recuento de la semana y enviarlo a mano.
import express from 'express';
import { getDb } from '../db.js';
import { parseMensaje, registrar, canalPorClave, getCanal, saveCanal, deleteCanal, maskWebhook, semanaDe, recuento, enviarDiscord, enviarResumen, textoResumen, importar, ponerBE, fijarResultado, textoStopBE, textoCierreBE } from '../services/senales.js';

export const publico = express.Router();
export const privado = express.Router();

// Límite por clave (en memoria): 40 mensajes por minuto bastan para cualquier uso real y cortan un bucle o un abuso.
const golpes = new Map();
const permitido = (clave, now = Date.now()) => { const g = golpes.get(clave) || []; const rec = g.filter((t) => now - t < 60_000); if (rec.length >= 40) { golpes.set(clave, rec); return false; } rec.push(now); golpes.set(clave, rec); if (golpes.size > 5000) golpes.clear(); return true; };

publico.post('/in/:clave', express.text({ type: () => true, limit: '8kb' }), async (req, res) => {
  const db = getDb(); const canal = canalPorClave(db, req.params.clave);
  if (!canal) return res.status(404).json({ error: 'Canal no encontrado.' });
  if (!permitido(canal.clave)) return res.status(429).json({ error: 'Demasiados mensajes seguidos.' });
  // TradingView manda JSON ({"content":"…"}) si el mensaje es JSON válido, o texto plano si no.
  let content = '';
  if (req.body && typeof req.body === 'object') content = typeof req.body.content === 'string' ? req.body.content : '';
  else if (typeof req.body === 'string') { const raw = req.body.trim(); try { const j = JSON.parse(raw); content = j && typeof j.content === 'string' ? j.content : raw; } catch { content = raw; } }
  content = content.slice(0, 1990);
  if (!content) return res.status(400).json({ error: 'Mensaje vacío.' });
  let reg = { ok: false };
  try { reg = registrar(db, canal, parseMensaje(content)); } catch (e) { console.warn('[senales] no se pudo anotar:', e.message); }
  // Avisos que solo son para el journal (vuelta a la entrada sin BE puesto, o de una señal ya cerrada aquí): no van a Discord.
  if (reg.silenciar) return res.json({ ok: true, anotada: false, discord: false, silenciada: true });
  if (reg.cierreBE) content = textoCierreBE(reg.senal);
  const env = await enviarDiscord(canal.webhook, content, { timeoutMs: 2500 });
  if (!env.ok) console.warn(`[senales] Discord no aceptó el mensaje del canal ${canal.id} (${env.status || env.error})`);
  return res.json({ ok: true, anotada: !!reg.ok, discord: env.ok });
});

const vista = (req, canal) => {
  if (!canal) return { canal: null };
  const db = getDb(); const sem = semanaDe(new Date()); const rec = recuento(db, canal.id, sem.desde, sem.hasta);
  const base = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  return {
    canal: { url: `${base.replace(/\/$/, '')}/api/senales/in/${canal.clave}`, webhook: maskWebhook(canal.webhook), ultimo_resumen: canal.ultimo_resumen || null, creado: canal.created_at },
    semana: { desde: sem.desde, hasta: sem.hasta, total: rec.total, tp2: rec.tp2, be: rec.be, sl: rec.sl, sl_tras_tp1: rec.sl_tras_tp1, abiertas: rec.tp1_en_curso + rec.en_curso + rec.pendientes, tocaron_tp1: rec.tocaron_tp1,
      senales: rec.senales.map((s) => ({ id: s.id, activo: s.activo, lado: s.lado, entrada: s.entrada, sl: s.sl, tp1: s.tp1, tp2: s.tp2, estado: s.estado, abierta_at: s.abierta_at, cerrada_at: s.cerrada_at, be: !!s.be_at })), texto: textoResumen(rec, sem) },
  };
};

privado.get('/', (req, res) => res.json(vista(req, getCanal(getDb(), req.user.id))));
privado.post('/canal', (req, res) => {
  try { const canal = saveCanal(getDb(), req.user.id, req.body && req.body.webhook); return res.json(vista(req, canal)); }
  catch (e) { return res.status(e.status || 500).json({ error: e.message || 'No se pudo guardar.' }); }
});
privado.delete('/canal', (req, res) => { deleteCanal(getDb(), req.user.id); res.json({ canal: null }); });
// «Stop a BE»: el usuario movió su stop a la entrada. Se anuncia en el canal y, desde ahora, si el precio vuelve a la entrada cierra en BE.
privado.post('/:id/be', async (req, res) => {
  const db = getDb(); const canal = getCanal(db, req.user.id);
  if (!canal) return res.status(400).json({ error: 'Primero guarda el webhook de tu canal.' });
  try {
    const quitar = !!(req.body && req.body.quitar); const s = ponerBE(db, canal.id, req.params.id, { quitar });
    const env = quitar ? { ok: true } : await enviarDiscord(canal.webhook, textoStopBE(s));
    return res.json({ ...vista(req, canal), avisado: !quitar && env.ok });
  } catch (e) { return res.status(e.status || 500).json({ error: e.message || 'No se pudo cambiar.' }); }
});
privado.post('/:id/resultado', (req, res) => {
  const db = getDb(); const canal = getCanal(db, req.user.id);
  if (!canal) return res.status(400).json({ error: 'Primero guarda el webhook de tu canal.' });
  try { fijarResultado(db, canal.id, req.params.id, req.body && req.body.estado); return res.json(vista(req, canal)); }
  catch (e) { return res.status(e.status || 500).json({ error: e.message || 'No se pudo cambiar.' }); }
});
// Importar mensajes copiados de Discord (señales que no pasaron por el journal). No publica nada en Discord.
privado.post('/importar', (req, res) => {
  const db = getDb(); const canal = getCanal(db, req.user.id);
  if (!canal) return res.status(400).json({ error: 'Primero guarda el webhook de tu canal.' });
  const texto = req.body && typeof req.body.texto === 'string' ? req.body.texto : '';
  if (texto.trim().length < 20) return res.status(400).json({ error: 'Pega primero los mensajes copiados de Discord.' });
  if (texto.length > 60_000) return res.status(400).json({ error: 'Es demasiado texto de una vez: pega unos días cada vez.' });
  const importacion = importar(db, canal, texto);
  return res.json({ ...vista(req, canal), importacion });
});
privado.post('/resumen', async (req, res) => {
  const db = getDb(); const canal = getCanal(db, req.user.id);
  if (!canal) return res.status(400).json({ error: 'Primero guarda el webhook de tu canal.' });
  const r = await enviarResumen(db, canal, { forzar: true });
  if (!r.enviado) return res.status(502).json({ error: 'Discord no aceptó el mensaje. Revisa que el webhook siga existiendo.' });
  return res.json({ ok: true, total: r.recuento.total });
});
