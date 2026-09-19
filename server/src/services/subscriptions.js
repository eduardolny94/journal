// Suscripciones: planes, estados, periodos, pagos manuales, eventos, ajustes y consultas del panel de administración.
// La pasarela de pago todavía no existe: `provider` queda en 'manual' y los campos provider_* están reservados.
import { adminLevel, isAdmin } from './admin.js';

export const PLANS = {
  prueba: { label: 'Prueba', months: 0 },
  mensual: { label: 'Mensual', months: 1 },
  trimestral: { label: 'Trimestral', months: 3 },
  semestral: { label: 'Semestral', months: 6 },
  anual: { label: 'Anual', months: 12 },
  cortesia: { label: 'Cortesía', months: 12 },
};
export const STATUSES = ['prueba', 'activa', 'vencida', 'cancelada', 'pausada'];
export const PAYMENT_METHODS = ['manual', 'transferencia', 'paypal', 'zelle', 'binance', 'tarjeta', 'efectivo', 'otro'];

export const DEFAULT_SETTINGS = {
  reminders_enabled: true,
  trial_days: 14,
  grace_days: 3,
  enforce: false,
  sender_name: 'Global Traders FX',
  support_email: '',
  payment_link: '',
  currency: 'USD',
  prices: { mensual: 29, trimestral: 79, semestral: 149, anual: 279 },
};

export const todayYmd = (now = new Date()) => new Date(now).toISOString().slice(0, 10);
const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());

export function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function addMonths(ymd, n) {
  const [y, m, day] = ymd.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return target.toISOString().slice(0, 10);
}
export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000);
}
/** Fin del periodo para un plan desde una fecha de inicio. */
export function periodEnd(start, plan, settings, periods = 1) {
  if (plan === 'prueba') return addDays(start, Number(settings.trial_days) || 14);
  const months = (PLANS[plan] ? PLANS[plan].months : 1) || 1;
  return addMonths(start, months * Math.max(1, periods));
}

// ---------- Ajustes ----------

export function getSettings(db) {
  const rows = db.prepare('SELECT key, value FROM app_settings').all();
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) {
    if (!(r.key in DEFAULT_SETTINGS)) continue; // la tabla también guarda marcas internas (última tarea, migraciones)
    try {
      out[r.key] = JSON.parse(r.value);
    } catch {
      // valor corrupto: se ignora y queda el predeterminado
    }
  }
  return out;
}
export function saveSettings(db, patch) {
  const up = db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`);
  for (const [k, v] of Object.entries(patch)) if (k in DEFAULT_SETTINGS) up.run(k, JSON.stringify(v));
  return getSettings(db);
}

// ---------- Suscripción ----------

export function getSubscription(db, userId) {
  return db.prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId) || null;
}

/** Estado real hoy: una suscripción activa o en prueba cuyo periodo terminó cuenta como vencida. */
export function effectiveStatus(sub, today = todayYmd()) {
  if (!sub) return 'sin_suscripcion';
  if ((sub.status === 'activa' || sub.status === 'prueba') && sub.current_period_end && sub.current_period_end < today) return 'vencida';
  return sub.status;
}
export function daysLeft(sub, today = todayYmd()) {
  if (!sub || !sub.current_period_end) return null;
  return daysBetween(today, sub.current_period_end);
}

export function logEvent(db, { user_id, actor_id = null, kind, detail = '' }) {
  db.prepare('INSERT INTO subscription_events (user_id, actor_id, kind, detail) VALUES (?, ?, ?, ?)').run(user_id, actor_id, kind, typeof detail === 'string' ? detail : JSON.stringify(detail));
}

/** Crea la prueba gratuita al registrarse (si el usuario aún no tiene suscripción). */
export function createTrial(db, userId, now = new Date()) {
  if (getSubscription(db, userId)) return getSubscription(db, userId);
  const settings = getSettings(db);
  const start = todayYmd(now);
  const end = periodEnd(start, 'prueba', settings);
  db.prepare(`INSERT INTO subscriptions (user_id, plan, status, price, currency, started_at, current_period_start, current_period_end, provider)
    VALUES (?, 'prueba', 'prueba', 0, ?, ?, ?, ?, 'manual')`).run(userId, settings.currency || 'USD', start, start, end);
  logEvent(db, { user_id: userId, kind: 'creada', detail: `Prueba gratuita hasta ${end}` });
  return getSubscription(db, userId);
}

/** Da la prueba gratuita a los usuarios que se registraron antes de existir las suscripciones. Devuelve cuántos. */
export function backfillTrials(db) {
  const rows = db.prepare('SELECT id FROM users WHERE id NOT IN (SELECT user_id FROM subscriptions)').all();
  for (const r of rows) createTrial(db, r.id);
  return rows.length;
}

/** Crea o actualiza la suscripción desde el panel. */
export function upsertSubscription(db, userId, data, actorId = null) {
  const settings = getSettings(db);
  const cur = getSubscription(db, userId);
  const today = todayYmd();
  const plan = data.plan ?? (cur ? cur.plan : 'mensual');
  const status = data.status ?? (cur ? cur.status : plan === 'prueba' ? 'prueba' : 'activa');
  const start = data.current_period_start ?? (cur ? cur.current_period_start : today) ?? today;
  const end = data.current_period_end ?? (cur && data.plan === undefined ? cur.current_period_end : periodEnd(start, plan, settings));
  const price = data.price ?? (cur && data.plan === undefined ? cur.price : settings.prices[plan] ?? 0);
  const currency = data.currency ?? (cur ? cur.currency : settings.currency) ?? 'USD';
  const autoRenew = data.auto_renew !== undefined ? (data.auto_renew ? 1 : 0) : cur ? cur.auto_renew : 0;
  const notes = data.notes ?? (cur ? cur.notes : '');
  if (cur) {
    db.prepare(`UPDATE subscriptions SET plan = ?, status = ?, price = ?, currency = ?, current_period_start = ?, current_period_end = ?, auto_renew = ?, notes = ?,
      canceled_at = CASE WHEN ? = 'cancelada' THEN COALESCE(canceled_at, datetime('now')) ELSE NULL END, updated_at = datetime('now') WHERE user_id = ?`)
      .run(plan, status, price, currency, start, end, autoRenew, notes, status, userId);
    const changes = [];
    if (cur.plan !== plan) changes.push(`plan ${cur.plan} → ${plan}`);
    if (cur.status !== status) changes.push(`estado ${cur.status} → ${status}`);
    if (cur.current_period_end !== end) changes.push(`vence ${cur.current_period_end || '—'} → ${end}`);
    if (Number(cur.price) !== Number(price)) changes.push(`precio ${cur.price} → ${price}`);
    if (changes.length) logEvent(db, { user_id: userId, actor_id: actorId, kind: 'editada', detail: changes.join(' · ') });
  } else {
    db.prepare(`INSERT INTO subscriptions (user_id, plan, status, price, currency, started_at, current_period_start, current_period_end, auto_renew, provider, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)`).run(userId, plan, status, price, currency, start, start, end, autoRenew, notes);
    logEvent(db, { user_id: userId, actor_id: actorId, kind: 'creada', detail: `${plan} hasta ${end}` });
  }
  return getSubscription(db, userId);
}

/** Registra un pago manual y extiende el periodo. */
export function registerPayment(db, userId, p, actorId = null) {
  const settings = getSettings(db);
  const today = todayYmd();
  const cur = getSubscription(db, userId);
  const plan = p.plan || (cur && cur.plan !== 'prueba' && cur.plan !== 'cortesia' ? cur.plan : 'mensual');
  const periods = Math.max(1, Number(p.periods) || 1);
  const stillRunning = cur && cur.status === 'activa' && cur.current_period_end && cur.current_period_end >= today;
  const start = stillRunning ? cur.current_period_end : p.paid_at && p.paid_at > today ? p.paid_at : today;
  const end = periodEnd(start, plan, settings, periods);
  const price = p.amount / periods;
  if (cur) {
    db.prepare(`UPDATE subscriptions SET plan = ?, status = 'activa', price = ?, currency = ?, current_period_start = ?, current_period_end = ?, canceled_at = NULL, updated_at = datetime('now') WHERE user_id = ?`)
      .run(plan, price, p.currency, stillRunning ? cur.current_period_start : start, end, userId);
  } else {
    db.prepare(`INSERT INTO subscriptions (user_id, plan, status, price, currency, started_at, current_period_start, current_period_end, provider) VALUES (?, ?, 'activa', ?, ?, ?, ?, ?, 'manual')`)
      .run(userId, plan, price, p.currency, start, start, end);
  }
  const sub = getSubscription(db, userId);
  const r = db.prepare(`INSERT INTO subscription_payments (user_id, subscription_id, amount, currency, paid_at, method, reference, plan, period_start, period_end, note, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(userId, sub.id, p.amount, p.currency, p.paid_at || today, p.method || 'manual', p.reference || '', plan, start, end, p.note || '', actorId);
  logEvent(db, { user_id: userId, actor_id: actorId, kind: 'pago', detail: `${p.amount} ${p.currency} · ${plan} · hasta ${end}` });
  return { subscription: sub, payment: db.prepare('SELECT * FROM subscription_payments WHERE id = ?').get(Number(r.lastInsertRowid)) };
}

export function cancelSubscription(db, userId, actorId = null, reason = '') {
  const cur = getSubscription(db, userId);
  if (!cur) return null;
  db.prepare(`UPDATE subscriptions SET status = 'cancelada', auto_renew = 0, canceled_at = datetime('now'), updated_at = datetime('now') WHERE user_id = ?`).run(userId);
  logEvent(db, { user_id: userId, actor_id: actorId, kind: 'cancelada', detail: reason });
  return getSubscription(db, userId);
}
export function reactivateSubscription(db, userId, actorId = null) {
  const cur = getSubscription(db, userId);
  if (!cur) return null;
  const today = todayYmd();
  const settings = getSettings(db);
  const end = cur.current_period_end && cur.current_period_end >= today ? cur.current_period_end : periodEnd(today, cur.plan === 'prueba' ? 'mensual' : cur.plan, settings);
  db.prepare(`UPDATE subscriptions SET status = 'activa', plan = CASE WHEN plan = 'prueba' THEN 'mensual' ELSE plan END, current_period_end = ?, canceled_at = NULL, updated_at = datetime('now') WHERE user_id = ?`).run(end, userId);
  logEvent(db, { user_id: userId, actor_id: actorId, kind: 'reactivada', detail: `hasta ${end}` });
  return getSubscription(db, userId);
}
export function extendSubscription(db, userId, days, actorId = null) {
  const cur = getSubscription(db, userId);
  if (!cur) return null;
  const today = todayYmd();
  const base = cur.current_period_end && cur.current_period_end >= today ? cur.current_period_end : today;
  const end = addDays(base, days);
  db.prepare(`UPDATE subscriptions SET current_period_end = ?, status = CASE WHEN status IN ('vencida') THEN 'activa' ELSE status END, updated_at = datetime('now') WHERE user_id = ?`).run(end, userId);
  logEvent(db, { user_id: userId, actor_id: actorId, kind: 'extendida', detail: `${days >= 0 ? '+' : ''}${days} días · hasta ${end}` });
  return getSubscription(db, userId);
}

// ---------- Consultas del panel ----------

function monthlyValue(sub) {
  if (!sub || effectiveStatus(sub) !== 'activa') return 0;
  const months = PLANS[sub.plan] ? PLANS[sub.plan].months : 1;
  if (!months || sub.plan === 'cortesia') return 0;
  return (Number(sub.price) || 0) / months;
}

export function listUsers(db, { search = '', status = '', plan = '' } = {}) {
  const today = todayYmd();
  const rows = db.prepare(`SELECT u.id, u.email, u.name, u.created_at, u.role, u.is_disabled, u.last_login_at,
      (SELECT COUNT(*) FROM trades t WHERE t.user_id = u.id) AS trades,
      (SELECT COUNT(*) FROM accounts a WHERE a.user_id = u.id) AS accounts,
      (SELECT COALESCE(SUM(amount), 0) FROM subscription_payments p WHERE p.user_id = u.id) AS paid_total
    FROM users u ORDER BY u.created_at DESC, u.id DESC`).all();
  const subs = Object.fromEntries(db.prepare('SELECT * FROM subscriptions').all().map((s) => [s.user_id, s]));
  const q = search.trim().toLowerCase();
  return rows
    .map((u) => {
      const sub = subs[u.id] || null;
      return { ...u, is_disabled: !!u.is_disabled, is_admin: isAdmin(db, u), admin_level: adminLevel(db, u), subscription: sub, effective_status: effectiveStatus(sub, today), days_left: daysLeft(sub, today) };
    })
    .filter((u) => (!q || u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q)) && (!status || u.effective_status === status) && (!plan || (u.subscription && u.subscription.plan === plan)));
}

export function userDetail(db, userId) {
  const user = db.prepare('SELECT id, email, name, created_at, role, is_disabled, last_login_at FROM users WHERE id = ?').get(userId);
  if (!user) return null;
  const sub = getSubscription(db, userId);
  return {
    user: { ...user, is_disabled: !!user.is_disabled, is_admin: isAdmin(db, user), admin_level: adminLevel(db, user) },
    subscription: sub,
    effective_status: effectiveStatus(sub),
    days_left: daysLeft(sub),
    payments: db.prepare('SELECT * FROM subscription_payments WHERE user_id = ? ORDER BY paid_at DESC, id DESC').all(userId),
    events: db.prepare(`SELECT e.*, a.name AS actor_name FROM subscription_events e LEFT JOIN users a ON a.id = e.actor_id WHERE e.user_id = ? ORDER BY e.id DESC LIMIT 50`).all(userId),
    emails: db.prepare('SELECT id, template_key, to_email, subject, status, error, created_at FROM email_log WHERE user_id = ? ORDER BY id DESC LIMIT 30').all(userId),
  };
}

export function listPayments(db, { from = null, to = null } = {}) {
  const where = [];
  const params = [];
  if (from) { where.push('p.paid_at >= ?'); params.push(from); }
  if (to) { where.push('p.paid_at <= ?'); params.push(to); }
  return db.prepare(`SELECT p.*, u.name AS user_name, u.email AS user_email FROM subscription_payments p JOIN users u ON u.id = p.user_id
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY p.paid_at DESC, p.id DESC LIMIT 500`).all(...params);
}

export function overview(db, now = new Date()) {
  const today = todayYmd(now);
  const users = listUsers(db);
  const month = today.slice(0, 7);
  const prevMonth = addMonths(`${month}-01`, -1).slice(0, 7);
  const cutoff30 = addDays(today, -30);
  const count = (s) => users.filter((u) => u.effective_status === s).length;
  const payments = db.prepare('SELECT amount, currency, paid_at FROM subscription_payments').all();
  const sumMonth = (m) => payments.filter((p) => p.paid_at.startsWith(m)).reduce((a, p) => a + Number(p.amount || 0), 0);
  const active = users.filter((u) => u.effective_status === 'activa');
  const mrr = active.reduce((a, u) => a + monthlyValue(u.subscription), 0);
  const expiring = users
    .filter((u) => (u.effective_status === 'activa' || u.effective_status === 'prueba') && u.days_left !== null && u.days_left <= 7)
    .sort((a, b) => a.days_left - b.days_left)
    .slice(0, 12)
    .map((u) => ({ id: u.id, name: u.name, email: u.email, plan: u.subscription.plan, status: u.effective_status, current_period_end: u.subscription.current_period_end, days_left: u.days_left }));
  const months = [];
  for (let i = 11; i >= 0; i--) months.push(addMonths(`${month}-01`, -i).slice(0, 7));
  const series = months.map((m) => ({ month: m, altas: users.filter((u) => String(u.created_at || '').startsWith(m)).length, ingresos: Math.round(sumMonth(m) * 100) / 100 }));
  const churn = db.prepare(`SELECT COUNT(*) AS n FROM subscription_events WHERE kind IN ('vencida', 'cancelada') AND created_at >= ?`).get(`${cutoff30} 00:00:00`).n;
  const emails = db.prepare(`SELECT status, COUNT(*) AS n FROM email_log WHERE created_at >= ? GROUP BY status`).all(`${cutoff30} 00:00:00`);
  const recent = db.prepare(`SELECT e.id, e.kind, e.detail, e.created_at, u.name AS user_name, u.email AS user_email, a.name AS actor_name
    FROM subscription_events e JOIN users u ON u.id = e.user_id LEFT JOIN users a ON a.id = e.actor_id ORDER BY e.id DESC LIMIT 15`).all();
  return {
    today,
    currency: getSettings(db).currency || 'USD',
    totals: {
      users: users.length,
      new_30d: users.filter((u) => String(u.created_at || '').slice(0, 10) >= cutoff30).length,
      activas: count('activa'),
      prueba: count('prueba'),
      vencidas: count('vencida'),
      canceladas: count('cancelada'),
      pausadas: count('pausada'),
      sin_suscripcion: count('sin_suscripcion'),
      por_vencer_7d: expiring.length,
      mrr: Math.round(mrr * 100) / 100,
      arpu: active.length ? Math.round((mrr / active.length) * 100) / 100 : 0,
      ingresos_mes: Math.round(sumMonth(month) * 100) / 100,
      ingresos_mes_anterior: Math.round(sumMonth(prevMonth) * 100) / 100,
      ingresos_total: Math.round(payments.reduce((a, p) => a + Number(p.amount || 0), 0) * 100) / 100,
      bajas_30d: churn,
      emails_30d: Object.fromEntries(emails.map((e) => [e.status, e.n])),
    },
    expiring,
    series,
    recent,
  };
}

// ---------- Exigir suscripción (opcional) ----------

/** Middleware: con `enforce` activo, bloquea a quien no tenga suscripción vigente (los admins pasan siempre). */
export function requireSubscription(getDb) {
  return (req, res, next) => {
    try {
      const db = getDb();
      const u = db.prepare('SELECT is_disabled FROM users WHERE id = ?').get(req.user.id);
      if (!u || u.is_disabled) return res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta con el administrador.', code: 'account_disabled' });
      const settings = getSettings(db);
      if (!settings.enforce) return next();
      if (isAdmin(db, req.user)) return next();
      const sub = getSubscription(db, req.user.id);
      const today = todayYmd();
      const grace = Number(settings.grace_days) || 0;
      const ok = sub && (sub.status === 'activa' || sub.status === 'prueba') && sub.current_period_end && addDays(sub.current_period_end, grace) >= today;
      if (ok) return next();
      return res.status(402).json({ error: 'Tu suscripción no está activa. Renueva para seguir usando el journal.', code: 'subscription_required' });
    } catch (err) {
      return next(err);
    }
  };
}

export { isYmd };
