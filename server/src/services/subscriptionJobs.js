// Tareas automáticas de suscripciones: marcar vencidas y enviar recordatorios por email antes del vencimiento.
// Se ejecuta cada hora (y bajo demanda desde el panel). Cada aviso se envía una sola vez por periodo.
import { getDb } from '../db.js';
import { getSettings, todayYmd, daysBetween, addDays, logEvent } from './subscriptions.js';
import { listTemplates, sendToUser, alreadySent } from './mailer.js';

let timer = null;
let running = null;

/**
 * @returns {Promise<{ checked: number, expired: number, reminders: number, skipped: number, details: string[] }>}
 */
export async function runSubscriptionJobs(db = getDb(), { now = new Date() } = {}) {
  if (running) return running;
  running = (async () => {
    const settings = getSettings(db);
    const today = todayYmd(now);
    const templates = listTemplates(db);
    const reminderTpls = templates.filter((t) => t.enabled && t.days_before !== null && t.days_before !== undefined).sort((a, b) => a.days_before - b.days_before);
    const expiredTpl = templates.find((t) => t.key === 'vencida' && t.enabled) || null;
    const subs = db.prepare(`SELECT s.*, u.email, u.name, u.is_disabled FROM subscriptions s JOIN users u ON u.id = s.user_id WHERE s.status IN ('activa', 'prueba')`).all();
    const out = { checked: subs.length, expired: 0, reminders: 0, skipped: 0, details: [] };
    for (const s of subs) {
      if (!s.current_period_end) continue;
      const user = { id: s.user_id, email: s.email, name: s.name };
      const days = daysBetween(today, s.current_period_end);
      if (days < 0) {
        // Vencida: se marca al terminar el periodo de gracia; el aviso de "vencida" sale el primer día.
        if (settings.reminders_enabled && expiredTpl && !s.is_disabled && !alreadySent(db, s.user_id, 'vencida', s.current_period_end)) {
          const r = await sendToUser(db, { user, sub: s, template: expiredTpl, periodEnd: s.current_period_end });
          out.reminders++;
          out.details.push(`${s.email}: aviso de vencida (${r.status})`);
        }
        if (addDays(s.current_period_end, Number(settings.grace_days) || 0) < today) {
          db.prepare(`UPDATE subscriptions SET status = 'vencida', updated_at = datetime('now') WHERE user_id = ?`).run(s.user_id);
          logEvent(db, { user_id: s.user_id, kind: 'vencida', detail: `Venció el ${s.current_period_end}` });
          out.expired++;
          out.details.push(`${s.email}: marcada como vencida`);
        }
        continue;
      }
      if (!settings.reminders_enabled || s.is_disabled) continue;
      // El aviso más cercano que toque (si el servidor estuvo apagado, no se mandan los tres de golpe).
      const tpl = reminderTpls.find((t) => days <= t.days_before);
      if (!tpl) continue;
      if (alreadySent(db, s.user_id, tpl.key, s.current_period_end)) {
        out.skipped++;
        continue;
      }
      const r = await sendToUser(db, { user, sub: s, template: tpl, periodEnd: s.current_period_end });
      out.reminders++;
      out.details.push(`${s.email}: ${tpl.key} (${r.status})`);
    }
    db.prepare(`INSERT INTO app_settings (key, value, updated_at) VALUES ('last_job_run', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`).run(JSON.stringify({ at: new Date(now).toISOString(), ...out, details: out.details.slice(0, 20) }));
    return out;
  })().finally(() => {
    running = null;
  });
  return running;
}

export function lastJobRun(db = getDb()) {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = 'last_job_run'").get();
  try {
    return row ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}

/** Arranca el ciclo horario (no hace nada en pruebas). */
export function startSubscriptionJobs() {
  if (process.env.NODE_ENV === 'test' || timer) return;
  const tick = () => runSubscriptionJobs().catch((e) => console.warn('[suscripciones] tarea:', e.message));
  const first = setTimeout(tick, 3 * 60_000);
  if (first.unref) first.unref();
  timer = setInterval(tick, 3600_000);
  if (timer.unref) timer.unref();
}
