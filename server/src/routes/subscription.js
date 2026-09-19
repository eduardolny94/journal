// Suscripción del propio usuario: estado, días restantes y enlace de pago (cuando exista la pasarela).
import { Router } from 'express';
import { getDb } from '../db.js';
import { adminLevel } from '../services/admin.js';
import { PLANS, getSettings, getSubscription, effectiveStatus, daysLeft } from '../services/subscriptions.js';

const router = Router();

// GET /api/subscription/me
router.get('/me', (req, res, next) => {
  try {
    const db = getDb();
    const settings = getSettings(db);
    const sub = getSubscription(db, req.user.id);
    res.json({
      subscription: sub ? { plan: sub.plan, plan_label: PLANS[sub.plan] ? PLANS[sub.plan].label : sub.plan, status: sub.status, price: sub.price, currency: sub.currency, current_period_start: sub.current_period_start, current_period_end: sub.current_period_end, auto_renew: !!sub.auto_renew } : null,
      effective_status: effectiveStatus(sub),
      days_left: daysLeft(sub),
      enforce: !!settings.enforce,
      grace_days: settings.grace_days,
      payment_link: settings.payment_link || null,
      support_email: settings.support_email || null,
      prices: settings.prices,
      currency: settings.currency,
      is_admin: adminLevel(db, req.user) !== null,
      admin_level: adminLevel(db, req.user),
      payments: db.prepare('SELECT amount, currency, paid_at, plan, period_end FROM subscription_payments WHERE user_id = ? ORDER BY paid_at DESC, id DESC LIMIT 12').all(req.user.id),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
