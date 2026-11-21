// SEÑALES A DISCORD CON RECUENTO SEMANAL (21-11-2026). El indicador «GTFX · Señal a Discord» de TradingView escribe directo al webhook
// de Discord y nadie recuerda qué pasó con cada señal. Aquí el aviso pasa por el journal: se anota la señal y cada evento (entrada, TP1,
// TP2, BE, stop), se reenvía tal cual al canal de Discord del usuario y, al cerrar la semana, se publica el recuento en ese mismo canal.
// El BE es MANUAL: el usuario pulsa «Stop a BE» en el journal (be_at) y, desde entonces, si el indicador avisa de que el precio volvió a
// la entrada (evento «vuelta», que solo ve el journal), la señal se cierra como BE. Sin ese botón, la vuelta a la entrada no hace nada.
// El webhook de Discord es un secreto: solo se admite una URL de Discord, se guarda en el servidor y nunca se devuelve entero.
import crypto from 'node:crypto';

export const WEBHOOK_RE = /^https:\/\/(?:discord\.com|discordapp\.com|ptb\.discord\.com|canary\.discord\.com)\/api\/webhooks\/\d{5,25}\/[\w-]{20,200}$/;
export const maskWebhook = (u) => (typeof u === 'string' && u.length > 12 ? `${u.slice(0, 33)}…${u.slice(-4)}` : '');
const num = (s) => { const v = Number(String(s ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
const LADO = { SELL: -1, VENTA: -1, BUY: 1, COMPRA: 1 };
const limpia = (l) => l.replace(/\*\*/g, '').replace(/^[^A-Za-zÁÉÍÓÚáéíóú0-9]+/, '').trim();

/** Lee un mensaje del indicador. Devuelve { tipo: 'senal' | 'evento', … } o null si no lo reconoce (se reenvía igual). */
export function parseMensaje(text) {
  const lines = String(text || '').split(/\r?\n|\\n/).map((l) => l.trim()).filter(Boolean);
  const ev = lines.map(limpia).map((l) => /^(SELL|BUY|VENTA|COMPRA)\s+(.+?)\s+·\s+Entrada\s+([-\d.,]+)\s+·\s+SL\s+([-\d.,]+)\s+·\s+TP1\s+([-\d.,]+)\s+·\s+TP2\s+([-\d.,]+)/i.exec(l)).find(Boolean);
  if (ev) {
    const titulo = lines.find((l) => /Entrada activada|Stop tocado|TP1|TP2|\bBE\b|en la entrada/i.test(l) && !/·\s+Entrada\s+[-\d.,]+\s+·\s+SL/i.test(l)) || '';
    const evento = /vuelta en la entrada/i.test(titulo) ? 'vuelta' : /\bBE\b|en la entrada/i.test(titulo) ? 'be' : /Stop tocado/i.test(titulo) ? 'sl' : /TP2/i.test(titulo) ? 'tp2' : /TP1/i.test(titulo) ? 'tp1' : /Entrada activada/i.test(titulo) ? 'entrada' : null;
    if (!evento) return null;
    return { tipo: 'evento', evento, lado: LADO[ev[1].toUpperCase()], activo: ev[2].trim(), entrada: num(ev[3]), sl: num(ev[4]), tp1: num(ev[5]), tp2: num(ev[6]) };
  }
  const head = lines.map(limpia).map((l) => /^(SELL|BUY|VENTA|COMPRA)\s+(.+?)\s+(NOW|LIMIT|AHORA|L[IÍ]MITE)\s*$/i.exec(l)).find(Boolean);
  const get = (re) => { for (const l of lines.map(limpia)) { const m = re.exec(l); if (m) return num(m[1]); } return null; };
  const entrada = get(/Entrada:\s*([-\d.,]+)/i), sl = get(/^SL:\s*([-\d.,]+)/i), tp1 = get(/^TP1:\s*([-\d.,]+)/i), tp2 = get(/^TP2:\s*([-\d.,]+)/i);
  if (head && entrada !== null && sl !== null) return { tipo: 'senal', lado: LADO[head[1].toUpperCase()], activo: head[2].trim(), limite: /LIMIT|L[IÍ]MITE/i.test(head[3]), entrada, sl, tp1, tp2 };
  return null;
}

const igual = (a, b) => a !== null && b !== null && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
export const FINALES = new Set(['tp2', 'sl', 'sl_tras_tp1', 'be']);

export function getCanal(db, userId) { return db.prepare('SELECT * FROM senal_canales WHERE user_id = ?').get(userId) || null; }
export function canalPorClave(db, clave) { return typeof clave === 'string' && /^[A-Za-z0-9_-]{20,80}$/.test(clave) ? db.prepare('SELECT * FROM senal_canales WHERE clave = ?').get(clave) || null : null; }
export function saveCanal(db, userId, webhook, now = new Date()) {
  if (!WEBHOOK_RE.test(String(webhook || '').trim())) { const e = new Error('Eso no parece un webhook de Discord. Tiene que empezar por https://discord.com/api/webhooks/…'); e.status = 400; throw e; }
  const prev = getCanal(db, userId); const iso = new Date(now).toISOString();
  if (prev) db.prepare('UPDATE senal_canales SET webhook = ?, updated_at = ? WHERE id = ?').run(webhook.trim(), iso, prev.id);
  else db.prepare('INSERT INTO senal_canales (user_id, clave, webhook, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(userId, crypto.randomBytes(24).toString('base64url'), webhook.trim(), iso, iso);
  return getCanal(db, userId);
}
export function deleteCanal(db, userId) { const c = getCanal(db, userId); if (!c) return false; db.prepare('DELETE FROM senales WHERE canal_id = ?').run(c.id); db.prepare('DELETE FROM senal_canales WHERE id = ?').run(c.id); return true; }

/** Anota una señal nueva o aplica un evento a la señal abierta que coincide (mismo activo, sentido, entrada y stop). */
export function registrar(db, canal, p, now = new Date()) {
  if (!p) return { ok: false, motivo: 'no reconocido' };
  const iso = new Date(now).toISOString();
  if (p.tipo === 'senal') {
    const dup = db.prepare('SELECT id, abierta_at, entrada, sl FROM senales WHERE canal_id = ? AND activo = ? AND lado = ? ORDER BY id DESC LIMIT 1').get(canal.id, p.activo, p.lado);
    if (dup && igual(dup.entrada, p.entrada) && igual(dup.sl, p.sl) && Date.parse(iso) - Date.parse(dup.abierta_at) < 120_000) return { ok: true, id: dup.id, duplicada: true };
    const r = db.prepare('INSERT INTO senales (canal_id, activo, lado, entrada, sl, tp1, tp2, limite, estado, abierta_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(canal.id, p.activo, p.lado, p.entrada, p.sl, p.tp1, p.tp2, p.limite ? 1 : 0, p.limite ? 'pendiente' : 'en_curso', iso);
    return { ok: true, id: Number(r.lastInsertRowid), nueva: true };
  }
  const iguales = db.prepare('SELECT * FROM senales WHERE canal_id = ? AND activo = ? AND lado = ? ORDER BY id DESC LIMIT 12').all(canal.id, p.activo, p.lado).filter((s) => igual(s.entrada, p.entrada) && igual(s.sl, p.sl));
  const cand = iguales.find((s) => !FINALES.has(s.estado));
  // La señal ya se cerró aquí (p. ej. BE manual) y el indicador sigue avisando: no se anota ni se publica.
  if (!cand) return iguales.length ? { ok: true, id: iguales[0].id, silenciar: true, motivo: 'la señal ya estaba cerrada' } : { ok: false, motivo: 'sin señal abierta que coincida' };
  if (p.evento === 'vuelta') {
    // Aviso técnico: el precio volvió a la entrada. Solo cuenta si el usuario había puesto el stop en la entrada.
    if (!cand.be_at || !['en_curso', 'tp1'].includes(cand.estado)) return { ok: true, id: cand.id, silenciar: true, motivo: 'sin BE puesto' };
    db.prepare("UPDATE senales SET estado = 'be', cerrada_at = ? WHERE id = ?").run(iso, cand.id);
    return { ok: true, id: cand.id, estado: 'be', cierreBE: true, senal: { ...cand, estado: 'be' } };
  }
  const estado = p.evento === 'entrada' ? 'en_curso' : p.evento === 'tp1' ? 'tp1' : p.evento === 'tp2' ? 'tp2' : p.evento === 'be' ? 'be' : cand.estado === 'tp1' ? 'sl_tras_tp1' : 'sl';
  db.prepare('UPDATE senales SET estado = ?, tp1_at = COALESCE(tp1_at, ?), cerrada_at = ? WHERE id = ?').run(estado, p.evento === 'tp1' ? iso : null, FINALES.has(estado) ? iso : null, cand.id);
  return { ok: true, id: cand.id, estado };
}

const LADO_TXT = (l) => (l > 0 ? 'BUY' : 'SELL');
const lineaSenal = (s) => `${LADO_TXT(s.lado)} ${s.activo} · Entrada ${fnum(s.entrada)} · SL ${fnum(s.sl)} · TP1 ${fnum(s.tp1)} · TP2 ${fnum(s.tp2)}`;
/** Textos que el journal publica por su cuenta en Discord. */
export const textoStopBE = (s) => `🔒 Stop movido a la entrada (BE) · ${s.activo}\n${LADO_TXT(s.lado)} ${s.activo} · Entrada ${fnum(s.entrada)}`;
export const textoCierreBE = (s) => `⚖️ Cierre en la entrada (BE) · ${s.activo}\n${lineaSenal(s)}`;

export function senalDe(db, canalId, id) { return db.prepare('SELECT * FROM senales WHERE id = ? AND canal_id = ?').get(Number(id), canalId) || null; }
/** El usuario pone (o quita) el stop en la entrada. Solo en señales abiertas y ya activadas. */
export function ponerBE(db, canalId, id, { quitar = false, now = new Date() } = {}) {
  const s = senalDe(db, canalId, id); const err = (m) => { const e = new Error(m); e.status = 400; return e; };
  if (!s) throw err('No encuentro esa señal.');
  if (!['en_curso', 'tp1'].includes(s.estado)) throw err(s.estado === 'pendiente' ? 'La entrada aún no se ha activado.' : 'Esa señal ya está cerrada.');
  db.prepare('UPDATE senales SET be_at = ? WHERE id = ?').run(quitar ? null : new Date(now).toISOString(), s.id);
  return senalDe(db, canalId, s.id);
}
/** Borra una señal anotada (p. ej. una importada por error o una prueba). No toca Discord. */
export function borrarSenal(db, canalId, id) {
  const s = senalDe(db, canalId, id); if (!s) { const e = new Error('No encuentro esa señal.'); e.status = 404; throw e; }
  db.prepare('DELETE FROM senales WHERE id = ?').run(s.id); return s;
}
/** Corrección a mano del resultado de una señal (p. ej. la cerraste tú o el aviso no llegó). */
export function fijarResultado(db, canalId, id, estado, now = new Date()) {
  const s = senalDe(db, canalId, id); const err = (m) => { const e = new Error(m); e.status = 400; return e; };
  if (!s) throw err('No encuentro esa señal.');
  if (!['tp2', 'be', 'sl', 'en_curso'].includes(estado)) throw err('Resultado no válido.');
  db.prepare('UPDATE senales SET estado = ?, cerrada_at = ? WHERE id = ?').run(estado, estado === 'en_curso' ? null : (s.cerrada_at || new Date(now).toISOString()), s.id);
  return senalDe(db, canalId, s.id);
}

// ── Importar mensajes ya publicados en Discord (copiados y pegados), para señales que no pasaron por el journal.
const msMadrid = (ms) => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000; };
/** Hora escrita en España (la que ves en Discord) → instante real (ISO). */
export function madridAIso(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi); let t = guess - msMadrid(guess); const o2 = msMadrid(t); if (guess - o2 !== t) t = guess - o2; return new Date(t).toISOString();
}
const CABECERA = /^\s*(?:\d+\s*[.)]\s*)?(.+?)\s+[—–-]\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s+(\d{1,2}):(\d{2})\s*$/;
const INICIO_SENAL = /^\W*(?:SELL|BUY|VENTA|COMPRA)\s+.+?\s+(?:NOW|LIMIT|AHORA|L[IÍ]MITE)\s*$/i;
const INICIO_EVENTO = /^\W*(?:Entrada activada|TP1 alcanzado|TP2 alcanzado|Stop tocado|Cierre en la entrada|Precio de vuelta)/i;
/** Parte un pegado de Discord en mensajes {cuando: ISO|null, texto}. Con cabeceras «Autor — 16/11/26, 16:36» usa su fecha; sin ellas, parte por el inicio de cada aviso. */
export function partirMensajes(texto) {
  const lineas = String(texto || '').replace(/\r/g, '').split('\n'); const out = []; let cur = null;
  const hayCabeceras = lineas.some((l) => CABECERA.test(l));
  const abre = (cuando) => { cur = { cuando, texto: '' }; out.push(cur); };
  for (const l of lineas) {
    const h = CABECERA.exec(l);
    if (h) { const y = +h[4] < 100 ? 2000 + +h[4] : +h[4]; abre(madridAIso(y, +h[3], +h[2], +h[5], +h[6])); continue; }
    if (!hayCabeceras && (INICIO_SENAL.test(l.trim()) || INICIO_EVENTO.test(l.trim()))) abre(null);
    if (!cur) { if (!l.trim()) continue; abre(null); }
    cur.texto += `${l}\n`;
  }
  return out.filter((m) => m.texto.trim());
}

/** Importa un pegado de Discord. No manda nada a Discord. Los avisos de TP/stop de una señal que no se conoce la crean con sus datos. */
export function importar(db, canal, texto, now = new Date()) {
  const msgs = partirMensajes(texto); const r = { leidos: msgs.length, nuevas: 0, actualizadas: 0, repetidas: 0, ignorados: 0 };
  const fechados = msgs.length > 0 && msgs.every((m) => m.cuando); if (fechados) msgs.sort((a, b) => Date.parse(a.cuando) - Date.parse(b.cuando));
  for (const m of msgs) {
    const p = parseMensaje(m.texto); if (!p) { r.ignorados++; continue; }
    const cuando = m.cuando ? new Date(m.cuando) : new Date(now); const iso = cuando.toISOString();
    if (p.tipo === 'senal') {
      const ya = db.prepare('SELECT abierta_at, entrada, sl FROM senales WHERE canal_id = ? AND activo = ? AND lado = ?').all(canal.id, p.activo, p.lado).some((s) => igual(s.entrada, p.entrada) && igual(s.sl, p.sl) && (!m.cuando || Math.abs(Date.parse(s.abierta_at) - cuando.getTime()) < 30 * 60_000));
      if (ya) { r.repetidas++; continue; }
      db.prepare('INSERT INTO senales (canal_id, activo, lado, entrada, sl, tp1, tp2, limite, estado, abierta_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(canal.id, p.activo, p.lado, p.entrada, p.sl, p.tp1, p.tp2, p.limite ? 1 : 0, p.limite ? 'pendiente' : 'en_curso', iso);
      r.nuevas++; continue;
    }
    let g = registrar(db, canal, p, cuando);
    if (!g.ok && g.motivo === 'sin señal abierta que coincida') {
      db.prepare("INSERT INTO senales (canal_id, activo, lado, entrada, sl, tp1, tp2, limite, estado, abierta_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 'en_curso', ?)").run(canal.id, p.activo, p.lado, p.entrada, p.sl, p.tp1, p.tp2, iso);
      r.nuevas++; g = registrar(db, canal, p, cuando);
    }
    if (g.silenciar) r.repetidas++; else if (g.ok && !g.nueva) r.actualizadas++;
  }
  return r;
}

/** Lunes 00:00 (hora de España, aproximada a UTC − 2 h) de la semana que contiene `now`, y el lunes siguiente. */
export function semanaDe(now = new Date()) {
  const d = new Date(new Date(now).getTime() + 2 * 3600e3); const wd = (d.getUTCDay() + 6) % 7;
  const lunes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - wd) - 2 * 3600e3);
  return { desde: lunes.toISOString(), hasta: new Date(lunes.getTime() + 7 * 86400e3).toISOString(), clave: new Date(lunes.getTime() + 2 * 3600e3).toISOString().slice(0, 10) };
}

export function recuento(db, canalId, desde, hasta) {
  const rows = db.prepare('SELECT * FROM senales WHERE canal_id = ? AND abierta_at >= ? AND abierta_at < ? ORDER BY abierta_at').all(canalId, desde, hasta);
  const n = (f) => rows.filter(f).length;
  const c = { total: rows.length, tp2: n((s) => s.estado === 'tp2'), be: n((s) => s.estado === 'be'), sl: n((s) => s.estado === 'sl'), sl_tras_tp1: n((s) => s.estado === 'sl_tras_tp1'), tp1_en_curso: n((s) => s.estado === 'tp1'), en_curso: n((s) => s.estado === 'en_curso'), pendientes: n((s) => s.estado === 'pendiente') };
  c.tocaron_tp1 = n((s) => s.estado === 'tp2' || s.estado === 'sl_tras_tp1' || s.estado === 'tp1' || !!s.tp1_at); c.cerradas = c.tp2 + c.be + c.sl + c.sl_tras_tp1;
  return { ...c, senales: rows };
}

const ICONO = { tp2: '🎯 TP2', be: '⚖️ BE', sl: '❌ SL', sl_tras_tp1: '✅ TP1 y luego stop', tp1: '✅ TP1 · sigue abierta', en_curso: '⏳ en curso', pendiente: '⏳ sin activar' };
const fnum = (v) => (v === null || v === undefined ? '—' : String(Number(v)));
const dia = (iso) => new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', day: 'numeric', month: 'short' }).format(new Date(iso));

/** Texto del recuento semanal para Discord (máx. 2.000 caracteres). */
export function textoResumen(rec, { desde, hasta }) {
  const fin = new Date(Date.parse(hasta) - 2 * 86400e3 - 3600e3).toISOString(); // viernes
  const l = [`📊 **Recuento semanal de señales** · ${dia(new Date(Date.parse(desde) + 3 * 3600e3).toISOString())} – ${dia(fin)}`, `Señales publicadas: **${rec.total}**`];
  if (!rec.total) { l.push('Esta semana no se publicó ninguna señal.'); return l.join('\n'); }
  l.push(`🎯 TP (objetivo final): **${rec.tp2}**`, `⚖️ BE (cerró en la entrada): **${rec.be}**`, `❌ SL: **${rec.sl}**`);
  if (rec.sl_tras_tp1) l.push(`✅ TP1 y luego stop: **${rec.sl_tras_tp1}**`);
  const abiertas = rec.tp1_en_curso + rec.en_curso + rec.pendientes; if (abiertas) l.push(`⏳ Siguen abiertas o sin activar: **${abiertas}**`);
  if (rec.cerradas) l.push(`Tocaron TP1 o más: **${rec.tocaron_tp1}** de ${rec.total} (${Math.round((100 * rec.tocaron_tp1) / rec.total)} %)`);
  l.push('');
  for (const s of rec.senales.slice(0, 20)) l.push(`${s.lado > 0 ? '🟢' : '🔴'} ${s.lado > 0 ? 'BUY' : 'SELL'} ${s.activo} ${fnum(s.entrada)} → ${ICONO[s.estado] || s.estado}`);
  if (rec.senales.length > 20) l.push(`… y ${rec.senales.length - 20} más`);
  let out = l.join('\n'); if (out.length > 1950) out = `${out.slice(0, 1940)}…`;
  return out;
}

/** Publica en Discord. Devuelve { ok, status }. Nunca lanza. */
export async function enviarDiscord(webhook, content, { fetchImpl = fetch, timeoutMs = 4000 } = {}) {
  if (!WEBHOOK_RE.test(String(webhook || ''))) return { ok: false, status: 0, error: 'webhook no válido' };
  try { const r = await fetchImpl(webhook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: String(content).slice(0, 1990), allowed_mentions: { parse: ['everyone', 'roles', 'users'] } }), signal: AbortSignal.timeout(timeoutMs) }); return { ok: r.ok, status: r.status }; }
  catch (e) { return { ok: false, status: 0, error: e.message || 'error de red' }; }
}

/** Envía el recuento de la semana de `now` a un canal y lo marca como enviado. `forzar` = aunque ya se enviara o no haya señales. */
export async function enviarResumen(db, canal, { now = new Date(), forzar = false, enviar = enviarDiscord } = {}) {
  const sem = semanaDe(now); const rec = recuento(db, canal.id, sem.desde, sem.hasta);
  if (!forzar && (canal.ultimo_resumen === sem.clave || rec.total === 0)) return { enviado: false, motivo: rec.total === 0 ? 'sin señales' : 'ya enviado', recuento: rec };
  const r = await enviar(canal.webhook, textoResumen(rec, sem));
  if (r.ok && !forzar) db.prepare('UPDATE senal_canales SET ultimo_resumen = ? WHERE id = ?').run(sem.clave, canal.id);
  return { enviado: r.ok, status: r.status, recuento: rec };
}

/** ¿Toca publicar el recuento? Viernes desde las 23:00, sábado o domingo (hora de España). */
export function tocaResumen(now = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Madrid', weekday: 'short', hour: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(now)).map((x) => [x.type, x.value]));
  return p.weekday === 'Sat' || p.weekday === 'Sun' || (p.weekday === 'Fri' && Number(p.hour) >= 23);
}
export async function tickResumenes(db, { now = new Date(), enviar = enviarDiscord, log = () => {} } = {}) {
  if (!tocaResumen(now)) return 0; let n = 0;
  for (const canal of db.prepare('SELECT * FROM senal_canales').all()) { try { const r = await enviarResumen(db, canal, { now, enviar }); if (r.enviado) { n++; log(`recuento semanal enviado (canal ${canal.id}: ${r.recuento.total} señales)`); } } catch (e) { log(`recuento del canal ${canal.id} falló: ${e.message}`); } }
  return n;
}
