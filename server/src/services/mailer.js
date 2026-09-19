// Correo de la plataforma: plantillas con variables, envío (Resend por HTTP si hay clave; si no, modo simulado)
// y registro de todo lo enviado. Sin clave nada sale de verdad: queda en el registro como "simulado".
import { getSettings, daysLeft, PLANS } from './subscriptions.js';

export const DEFAULT_TEMPLATES = [
  { key: 'aviso_7d', name: 'Aviso: vence en 7 días', days_before: 7, subject: 'Tu plan {{plan}} vence en {{dias}} días',
    body: 'Hola {{nombre}}:\n\nTu plan {{plan}} del journal vence el {{fecha_vencimiento}} (faltan {{dias}} días).\n\nPara no perder el acceso, renueva aquí: {{enlace_pago}}\n\nSi ya pagaste, ignora este mensaje.\n\n{{remitente}}' },
  { key: 'aviso_3d', name: 'Aviso: vence en 3 días', days_before: 3, subject: 'Quedan {{dias}} días de tu plan {{plan}}',
    body: 'Hola {{nombre}}:\n\nTe recordamos que tu plan {{plan}} vence el {{fecha_vencimiento}}.\n\nRenueva aquí: {{enlace_pago}}\n\n{{remitente}}' },
  { key: 'aviso_1d', name: 'Aviso: vence mañana', days_before: 1, subject: 'Tu plan {{plan}} vence mañana',
    body: 'Hola {{nombre}}:\n\nMañana ({{fecha_vencimiento}}) vence tu plan {{plan}}. Renueva hoy para seguir usando el journal sin interrupciones: {{enlace_pago}}\n\n{{remitente}}' },
  { key: 'vencida', name: 'Suscripción vencida', days_before: null, subject: 'Tu plan {{plan}} ha vencido',
    body: 'Hola {{nombre}}:\n\nTu plan {{plan}} venció el {{fecha_vencimiento}}. Tus datos siguen guardados; al renovar recuperas el acceso de inmediato: {{enlace_pago}}\n\n{{remitente}}' },
  { key: 'pago_recibido', name: 'Pago recibido', days_before: null, subject: 'Pago recibido: tu plan {{plan}} está activo',
    body: 'Hola {{nombre}}:\n\nHemos registrado tu pago. Tu plan {{plan}} está activo hasta el {{fecha_vencimiento}}.\n\nGracias por seguir con nosotros.\n\n{{remitente}}' },
  { key: 'bienvenida', name: 'Bienvenida', days_before: null, subject: 'Bienvenido al journal, {{nombre}}',
    body: 'Hola {{nombre}}:\n\nTu cuenta está lista. Tienes una prueba gratuita hasta el {{fecha_vencimiento}}.\n\nCualquier duda, responde a este correo.\n\n{{remitente}}' },
];

export function ensureTemplates(db) {
  const ins = db.prepare(`INSERT OR IGNORE INTO email_templates (key, name, subject, body, days_before, enabled, updated_at) VALUES (?, ?, ?, ?, ?, 1, datetime('now'))`);
  for (const t of DEFAULT_TEMPLATES) ins.run(t.key, t.name, t.subject, t.body, t.days_before);
}
export function listTemplates(db) {
  ensureTemplates(db);
  return db.prepare('SELECT * FROM email_templates ORDER BY CASE WHEN days_before IS NULL THEN 1 ELSE 0 END, days_before DESC, key').all().map((t) => ({ ...t, enabled: !!t.enabled }));
}

export function mailerInfo() {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || '';
  const configured = !!(key && from);
  return { driver: configured ? 'resend' : 'simulado', configured, from: from || null };
}

const fmtDate = (ymd) => {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
};
const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function templateVars(user, sub, settings) {
  const dias = daysLeft(sub);
  return {
    nombre: user.name || user.email,
    email: user.email,
    plan: sub && PLANS[sub.plan] ? PLANS[sub.plan].label : '—',
    fecha_vencimiento: fmtDate(sub && sub.current_period_end),
    dias: dias === null ? '—' : String(Math.max(0, dias)),
    enlace_pago: settings.payment_link || '(enlace de pago pendiente de configurar)',
    remitente: settings.sender_name || 'Global Traders FX',
    soporte: settings.support_email || '',
  };
}
export function render(text, vars) {
  return String(text || '').replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (vars[k] !== undefined ? vars[k] : `{{${k}}}`));
}

/** Envía (o simula) un correo. Nunca lanza: devuelve { status, error }. */
export async function sendMail({ to, subject, text }) {
  const info = mailerInfo();
  if (!info.configured) return { status: 'simulado', error: null };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: info.from, to: [to], subject, text, html: `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111">${escapeHtml(text).replace(/\n/g, '<br>')}</div>` }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return { status: 'error', error: `Resend ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { status: 'enviado', error: null };
  } catch (e) {
    return { status: 'error', error: e.message || 'error de red' };
  }
}

/** Renderiza, envía y registra. `template` puede ser una fila de email_templates o { key, subject, body } libre. */
export async function sendToUser(db, { user, sub, template, actorId = null, periodEnd = null }) {
  const settings = getSettings(db);
  const vars = templateVars(user, sub, settings);
  const subject = render(template.subject, vars).slice(0, 200);
  const body = render(template.body, vars);
  const r = await sendMail({ to: user.email, subject, text: body });
  const info = db.prepare(`INSERT INTO email_log (user_id, to_email, template_key, subject, body, status, error, period_end, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(user.id, user.email, template.key || 'personalizado', subject, body, r.status, r.error, periodEnd, actorId);
  db.prepare('INSERT INTO subscription_events (user_id, actor_id, kind, detail) VALUES (?, ?, ?, ?)').run(user.id, actorId, 'email', `${template.key || 'personalizado'} · ${r.status}${r.error ? ` · ${r.error}` : ''}`);
  return { id: Number(info.lastInsertRowid), status: r.status, error: r.error, subject, body };
}

export function alreadySent(db, userId, templateKey, periodEnd) {
  const row = db.prepare(`SELECT 1 AS x FROM email_log WHERE user_id = ? AND template_key = ? AND period_end = ? AND status IN ('enviado', 'simulado') LIMIT 1`).get(userId, templateKey, periodEnd);
  return !!row;
}
