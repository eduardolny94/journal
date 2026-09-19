// Panel de administración: suscriptores, suscripciones, pagos manuales, plantillas y registro de emails,
// ajustes y tareas automáticas. Solo administradores. La pasarela de pago queda reservada (provider = 'manual').
import { Router } from 'express';
import { getDb } from '../db.js';
import { adminLevel, permissionsFor, requireOwner } from '../services/admin.js';
import {
  PLANS, STATUSES, PAYMENT_METHODS, DEFAULT_SETTINGS, isYmd, todayYmd, getSettings, saveSettings, getSubscription, upsertSubscription, registerPayment,
  cancelSubscription, reactivateSubscription, extendSubscription, listUsers, userDetail, listPayments, overview, logEvent,
} from '../services/subscriptions.js';
import { listTemplates, mailerInfo, sendToUser, templateVars, render } from '../services/mailer.js';
import { runSubscriptionJobs, lastJobRun } from '../services/subscriptionJobs.js';

const router = Router();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador inválido.');
  return id;
}
function getUser(db, rawId) {
  const user = db.prepare('SELECT id, email, name, role, is_disabled FROM users WHERE id = ?').get(parseId(rawId));
  if (!user) throw new HttpError(404, 'Usuario no encontrado.');
  return user;
}
/** Usuario sobre el que se va a actuar: un administrador limitado no puede tocar la ficha del dueño. */
function getManagedUser(db, req) {
  const user = getUser(db, req.params.id);
  if (req.adminLevel !== 'owner' && adminLevel(db, user) === 'owner') throw new HttpError(403, 'Solo el dueño puede modificar su propia ficha.');
  return user;
}
function optYmd(v, label) {
  if (v === undefined || v === null || v === '') return undefined;
  if (!isYmd(String(v))) throw new HttpError(400, `${label} debe tener el formato AAAA-MM-DD.`);
  return String(v);
}
function optMoney(v, label) {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 1e7) throw new HttpError(400, `${label} debe ser un número mayor o igual que 0.`);
  return Math.round(n * 100) / 100;
}

// GET /api/admin/overview
router.get('/overview', (req, res, next) => {
  try {
    const db = getDb();
    res.json({ ...overview(db), mailer: mailerInfo(), last_job: lastJobRun(db), settings: getSettings(db), level: req.adminLevel, permissions: permissionsFor(req.adminLevel) });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/meta -> catálogos para los formularios
router.get('/meta', (_req, res) => {
  res.json({ plans: Object.entries(PLANS).map(([key, p]) => ({ key, ...p })), statuses: STATUSES, payment_methods: PAYMENT_METHODS, provider: { name: null, status: 'pendiente', note: 'La pasarela de pago todavía no está conectada. Los pagos se registran a mano.' } });
});

// GET /api/admin/users?search&status&plan
router.get('/users', (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : '';
    const plan = req.query.plan ? String(req.query.plan) : '';
    if (status && ![...STATUSES, 'sin_suscripcion'].includes(status)) throw new HttpError(400, 'Estado inválido.');
    if (plan && !PLANS[plan]) throw new HttpError(400, 'Plan inválido.');
    res.json(listUsers(getDb(), { search: String(req.query.search || ''), status, plan }));
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/users/:id
router.get('/users/:id', (req, res, next) => {
  try {
    const detail = userDetail(getDb(), parseId(req.params.id));
    if (!detail) throw new HttpError(404, 'Usuario no encontrado.');
    res.json(detail);
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/users/:id/subscription
router.put('/users/:id/subscription', (req, res, next) => {
  try {
    const db = getDb();
    const user = getManagedUser(db, req);
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const data = {};
    if (b.plan !== undefined) {
      if (!PLANS[b.plan]) throw new HttpError(400, `Plan inválido. Opciones: ${Object.keys(PLANS).join(', ')}.`);
      data.plan = b.plan;
    }
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) throw new HttpError(400, `Estado inválido. Opciones: ${STATUSES.join(', ')}.`);
      data.status = b.status;
    }
    data.price = optMoney(b.price, 'El precio');
    data.current_period_start = optYmd(b.current_period_start, 'El inicio del periodo');
    data.current_period_end = optYmd(b.current_period_end, 'La fecha de vencimiento');
    if (b.currency !== undefined) {
      const c = String(b.currency).trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(c)) throw new HttpError(400, 'La moneda debe ser un código de 3 letras.');
      data.currency = c;
    }
    if (b.auto_renew !== undefined) data.auto_renew = b.auto_renew === true || b.auto_renew === 1 || b.auto_renew === '1';
    if (b.notes !== undefined) data.notes = String(b.notes).slice(0, 500);
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
    if (data.current_period_start && data.current_period_end && data.current_period_end < data.current_period_start) throw new HttpError(400, 'El vencimiento no puede ser anterior al inicio.');
    upsertSubscription(db, user.id, data, req.user.id);
    res.json(userDetail(db, user.id));
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:id/payments  { amount, currency?, paid_at?, method?, reference?, note?, plan?, periods?, send_email? }
router.post('/users/:id/payments', async (req, res, next) => {
  try {
    const db = getDb();
    const user = getManagedUser(db, req);
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const amount = optMoney(b.amount, 'El importe');
    if (amount === undefined) throw new HttpError(400, 'El importe es obligatorio.');
    const plan = b.plan === undefined || b.plan === '' ? undefined : String(b.plan);
    if (plan !== undefined && (!PLANS[plan] || plan === 'prueba')) throw new HttpError(400, 'Plan inválido para un pago.');
    const method = b.method ? String(b.method) : 'manual';
    if (!PAYMENT_METHODS.includes(method)) throw new HttpError(400, `Método inválido. Opciones: ${PAYMENT_METHODS.join(', ')}.`);
    const periods = b.periods === undefined || b.periods === '' ? 1 : Number(b.periods);
    if (!Number.isInteger(periods) || periods < 1 || periods > 36) throw new HttpError(400, 'Los periodos deben ser un entero entre 1 y 36.');
    const settings = getSettings(db);
    const currency = b.currency ? String(b.currency).trim().toUpperCase() : settings.currency || 'USD';
    if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'La moneda debe ser un código de 3 letras.');
    const result = registerPayment(db, user.id, { amount, currency, paid_at: optYmd(b.paid_at, 'La fecha del pago') || todayYmd(), method, reference: String(b.reference || '').slice(0, 120), note: String(b.note || '').slice(0, 300), plan, periods }, req.user.id);
    let email = null;
    if (b.send_email === true || b.send_email === 1) {
      const tpl = listTemplates(db).find((t) => t.key === 'pago_recibido');
      if (tpl) email = await sendToUser(db, { user, sub: result.subscription, template: tpl, actorId: req.user.id, periodEnd: result.subscription.current_period_end });
    }
    res.status(201).json({ ...userDetail(db, user.id), email });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/admin/payments/:id  (corrige un pago mal registrado; no toca el periodo)
router.delete('/payments/:id', requireOwner, (req, res, next) => {
  try {
    const db = getDb();
    const id = parseId(req.params.id);
    const row = db.prepare('SELECT * FROM subscription_payments WHERE id = ?').get(id);
    if (!row) throw new HttpError(404, 'Pago no encontrado.');
    db.prepare('DELETE FROM subscription_payments WHERE id = ?').run(id);
    logEvent(db, { user_id: row.user_id, actor_id: req.user.id, kind: 'pago_eliminado', detail: `${row.amount} ${row.currency} del ${row.paid_at}` });
    res.json({ ok: true, id });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:id/subscription/cancel | reactivate | extend
router.post('/users/:id/subscription/:action', (req, res, next) => {
  try {
    const db = getDb();
    const user = getManagedUser(db, req);
    if (!getSubscription(db, user.id)) throw new HttpError(404, 'Este usuario no tiene suscripción. Créala primero.');
    const action = req.params.action;
    if (action === 'cancel') cancelSubscription(db, user.id, req.user.id, String((req.body && req.body.reason) || '').slice(0, 200));
    else if (action === 'reactivate') reactivateSubscription(db, user.id, req.user.id);
    else if (action === 'extend') {
      const days = Number(req.body && req.body.days);
      if (!Number.isInteger(days) || days === 0 || Math.abs(days) > 730) throw new HttpError(400, 'Los días deben ser un entero distinto de 0 (máximo 730).');
      extendSubscription(db, user.id, days, req.user.id);
    } else throw new HttpError(404, 'Acción no reconocida.');
    res.json(userDetail(db, user.id));
  } catch (err) {
    next(err);
  }
});

// PUT /api/admin/users/:id/access  { role?, is_disabled? }
router.put('/users/:id/access', requireOwner, (req, res, next) => {
  try {
    const db = getDb();
    const user = getUser(db, req.params.id);
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    if (b.role !== undefined) {
      if (!['user', 'admin', 'owner'].includes(b.role)) throw new HttpError(400, 'Rol inválido.');
      if (user.id === req.user.id && b.role !== 'owner') throw new HttpError(400, 'No puedes quitarte a ti mismo el rol de dueño. Nombra antes a otro dueño y que él lo cambie.');
      // Si el dueño actual lo es solo por ser el primero (o por OWNER_EMAILS), se fija su rol antes de repartir otros.
      db.prepare("UPDATE users SET role = 'owner' WHERE id = ? AND role != 'owner'").run(req.user.id);
      db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role, user.id);
      logEvent(db, { user_id: user.id, actor_id: req.user.id, kind: 'rol', detail: b.role });
    }
    if (b.is_disabled !== undefined) {
      const off = b.is_disabled === true || b.is_disabled === 1 || b.is_disabled === '1';
      if (user.id === req.user.id && off) throw new HttpError(400, 'No puedes desactivar tu propia cuenta.');
      db.prepare('UPDATE users SET is_disabled = ? WHERE id = ?').run(off ? 1 : 0, user.id);
      logEvent(db, { user_id: user.id, actor_id: req.user.id, kind: off ? 'acceso_desactivado' : 'acceso_activado' });
    }
    res.json(userDetail(db, user.id));
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:id/email  { template_key } | { subject, body }
router.post('/users/:id/email', async (req, res, next) => {
  try {
    const db = getDb();
    const user = getManagedUser(db, req);
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    let template;
    if (b.template_key) {
      template = listTemplates(db).find((t) => t.key === b.template_key);
      if (!template) throw new HttpError(404, 'Plantilla no encontrada.');
    } else {
      const subject = String(b.subject || '').trim();
      const body = String(b.body || '').trim();
      if (!subject || !body) throw new HttpError(400, 'Asunto y mensaje son obligatorios.');
      if (subject.length > 200 || body.length > 5000) throw new HttpError(400, 'El mensaje es demasiado largo.');
      template = { key: 'personalizado', subject, body };
    }
    const sub = getSubscription(db, user.id);
    const r = await sendToUser(db, { user, sub, template, actorId: req.user.id, periodEnd: null });
    res.status(201).json(r);
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/payments?from&to
router.get('/payments', (req, res, next) => {
  try {
    res.json(listPayments(getDb(), { from: optYmd(req.query.from, 'from') || null, to: optYmd(req.query.to, 'to') || null }));
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/email-templates · PUT /api/admin/email-templates/:key · POST .../:key/preview · POST .../:key/test
router.get('/email-templates', (_req, res, next) => {
  try {
    res.json({ templates: listTemplates(getDb()), mailer: mailerInfo(), variables: ['nombre', 'email', 'plan', 'fecha_vencimiento', 'dias', 'enlace_pago', 'remitente', 'soporte'] });
  } catch (err) {
    next(err);
  }
});
router.put('/email-templates/:key', requireOwner, (req, res, next) => {
  try {
    const db = getDb();
    const tpl = listTemplates(db).find((t) => t.key === req.params.key);
    if (!tpl) throw new HttpError(404, 'Plantilla no encontrada.');
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const subject = b.subject !== undefined ? String(b.subject).trim() : tpl.subject;
    const body = b.body !== undefined ? String(b.body) : tpl.body;
    if (!subject || !body.trim()) throw new HttpError(400, 'Asunto y mensaje no pueden quedar vacíos.');
    if (subject.length > 200 || body.length > 5000) throw new HttpError(400, 'La plantilla es demasiado larga.');
    let days = tpl.days_before;
    if (b.days_before !== undefined && tpl.days_before !== null) {
      days = Number(b.days_before);
      if (!Number.isInteger(days) || days < 0 || days > 60) throw new HttpError(400, 'Los días de antelación deben ser un entero entre 0 y 60.');
    }
    const enabled = b.enabled !== undefined ? (b.enabled === true || b.enabled === 1 ? 1 : 0) : tpl.enabled ? 1 : 0;
    db.prepare(`UPDATE email_templates SET subject = ?, body = ?, days_before = ?, enabled = ?, updated_at = datetime('now') WHERE key = ?`).run(subject, body, days, enabled, tpl.key);
    res.json(listTemplates(db).find((t) => t.key === tpl.key));
  } catch (err) {
    next(err);
  }
});
router.post('/email-templates/:key/preview', (req, res, next) => {
  try {
    const db = getDb();
    const tpl = listTemplates(db).find((t) => t.key === req.params.key);
    if (!tpl) throw new HttpError(404, 'Plantilla no encontrada.');
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const me = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(req.user.id);
    const sample = { plan: 'mensual', current_period_end: new Date(Date.now() + (tpl.days_before ?? 5) * 86400000).toISOString().slice(0, 10) };
    const vars = templateVars(me, sample, getSettings(db));
    res.json({ subject: render(b.subject ?? tpl.subject, vars), body: render(b.body ?? tpl.body, vars) });
  } catch (err) {
    next(err);
  }
});
router.post('/email-templates/:key/test', async (req, res, next) => {
  try {
    const db = getDb();
    const tpl = listTemplates(db).find((t) => t.key === req.params.key);
    if (!tpl) throw new HttpError(404, 'Plantilla no encontrada.');
    const me = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(req.user.id);
    const sample = getSubscription(db, me.id) || { plan: 'mensual', current_period_end: new Date(Date.now() + (tpl.days_before ?? 5) * 86400000).toISOString().slice(0, 10) };
    res.status(201).json(await sendToUser(db, { user: me, sub: sample, template: { ...tpl, key: `prueba:${tpl.key}` }, actorId: me.id }));
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/emails?status
router.get('/emails', (req, res, next) => {
  try {
    const status = req.query.status ? String(req.query.status) : '';
    if (status && !['enviado', 'simulado', 'error'].includes(status)) throw new HttpError(400, 'Estado inválido.');
    const rows = getDb().prepare(`SELECT l.id, l.user_id, l.to_email, l.template_key, l.subject, l.status, l.error, l.created_at, u.name AS user_name
      FROM email_log l LEFT JOIN users u ON u.id = l.user_id ${status ? 'WHERE l.status = ?' : ''} ORDER BY l.id DESC LIMIT 300`).all(...(status ? [status] : []));
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET/PUT /api/admin/settings
router.get('/settings', (_req, res, next) => {
  try {
    res.json({ settings: getSettings(getDb()), defaults: DEFAULT_SETTINGS, mailer: mailerInfo() });
  } catch (err) {
    next(err);
  }
});
router.put('/settings', requireOwner, (req, res, next) => {
  try {
    const b = req.body && typeof req.body === 'object' ? req.body : {};
    const patch = {};
    for (const k of ['reminders_enabled', 'enforce']) if (b[k] !== undefined) patch[k] = b[k] === true || b[k] === 1 || b[k] === '1';
    for (const [k, max] of [['trial_days', 90], ['grace_days', 30]]) {
      if (b[k] === undefined) continue;
      const n = Number(b[k]);
      if (!Number.isInteger(n) || n < 0 || n > max) throw new HttpError(400, `${k} debe ser un entero entre 0 y ${max}.`);
      patch[k] = n;
    }
    for (const k of ['sender_name', 'support_email', 'payment_link']) if (b[k] !== undefined) patch[k] = String(b[k]).trim().slice(0, 300);
    if (patch.payment_link && !/^https?:\/\//i.test(patch.payment_link)) throw new HttpError(400, 'El enlace de pago debe empezar por http:// o https://');
    if (b.currency !== undefined) {
      const c = String(b.currency).trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(c)) throw new HttpError(400, 'La moneda debe ser un código de 3 letras.');
      patch.currency = c;
    }
    if (b.prices !== undefined) {
      const prices = {};
      for (const plan of ['mensual', 'trimestral', 'semestral', 'anual']) {
        const v = optMoney(b.prices && b.prices[plan], `El precio ${plan}`);
        prices[plan] = v === undefined ? DEFAULT_SETTINGS.prices[plan] : v;
      }
      patch.prices = prices;
    }
    res.json({ settings: saveSettings(getDb(), patch), mailer: mailerInfo() });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/jobs/run -> ejecuta ahora los recordatorios y el marcado de vencidas
router.post('/jobs/run', async (_req, res, next) => {
  try {
    res.json(await runSubscriptionJobs(getDb()));
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/whoami -> útil para el cliente
router.get('/whoami', (req, res) => {
  res.json({ admin: true, level: req.adminLevel, permissions: permissionsFor(req.adminLevel) });
});

export default router;
