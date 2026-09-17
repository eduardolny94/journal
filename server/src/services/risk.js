// Evaluación de riesgo de una cuenta: calcula el estado (PnL de hoy/semana, límites
// restantes) y aplica los bloqueos automáticos (pérdida diaria, pérdida semanal,
// máximo de operaciones por día). También ofrece isLocked(account, now).
//
// Contrato: evaluateAccountRisk(db, accountId) -> status (misma forma que GET /accounts/:id/status)
//           isLocked(account, now) -> boolean
import { currentTradingDay, nextResetIso, nextWeekResetIso, weekOf } from './tradingDay.js';

/** Etiquetas en español para los motivos de bloqueo. */
export const LOCK_REASON_LABELS = {
  daily_loss: 'Pérdida máxima diaria alcanzada',
  weekly_loss: 'Pérdida máxima semanal alcanzada',
  max_trades: 'Máximo de operaciones por día alcanzado',
  manual: 'Bloqueo manual',
};

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round1(n) {
  return Math.round((Number(n) || 0) * 10) / 10;
}

function positiveOrNull(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * ¿Está la cuenta bloqueada en el instante `now`?
 * @param {object} account fila de accounts (usa lock_until)
 * @param {Date} [now]
 */
export function isLocked(account, now = new Date()) {
  if (!account || !account.lock_until) return false;
  const t = new Date(account.lock_until).getTime();
  if (Number.isNaN(t)) return false;
  return t > now.getTime();
}

/** Últimos N eventos de bloqueo de la cuenta (más recientes primero). */
export function listLockEvents(db, accountId, limit = 20) {
  return db
    .prepare('SELECT * FROM lock_events WHERE account_id = ? ORDER BY created_at DESC, id DESC LIMIT ?')
    .all(accountId, limit);
}

/**
 * Comprueba una regla y aplica el bloqueo si procede.
 * Devuelve true si la regla está violada (aunque el usuario la haya anulado con un desbloqueo manual).
 */
function applyRule(db, account, { kind, violated, lockUntil, dayFrom, dayTo, pnl, message, now }) {
  if (!violated) return false;

  // Último evento de este tipo dentro del ámbito (día o semana).
  const lastEvent = db
    .prepare(
      `SELECT * FROM lock_events WHERE account_id = ? AND kind = ? AND trading_day BETWEEN ? AND ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(account.id, kind, dayFrom, dayTo);

  if (lastEvent) {
    // Si el usuario desbloqueó manualmente DESPUÉS de este bloqueo, respetamos su decisión
    // (no volvemos a bloquear por la misma violación).
    const unlockAfter = db
      .prepare(
        `SELECT id FROM lock_events WHERE account_id = ? AND kind = 'unlock'
         AND (created_at > ? OR (created_at = ? AND id > ?)) LIMIT 1`,
      )
      .get(account.id, lastEvent.created_at, lastEvent.created_at, lastEvent.id);
    if (unlockAfter) return true;
  }

  // Nunca reducir un lock_until existente más lejano.
  const currentUntil = account.lock_until ? new Date(account.lock_until).getTime() : 0;
  const desiredUntil = new Date(lockUntil).getTime();
  const stillLocked = currentUntil > now.getTime();

  if (!stillLocked || desiredUntil > currentUntil) {
    db.prepare('UPDATE accounts SET lock_until = ?, lock_reason = ? WHERE id = ?').run(lockUntil, kind, account.id);
    account.lock_until = lockUntil;
    account.lock_reason = kind;
  }

  // Insertar evento solo si no hay ya uno activo del mismo tipo en este ámbito.
  const activeEvent = lastEvent && lastEvent.lock_until && new Date(lastEvent.lock_until).getTime() > now.getTime();
  if (!activeEvent) {
    db.prepare(
      'INSERT INTO lock_events (account_id, kind, trading_day, pnl_at_lock, lock_until, message) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(account.id, kind, dayTo === dayFrom ? dayFrom : currentTradingDay(account), round2(pnl), lockUntil, message);
  }
  return true;
}

/**
 * Calcula el estado de riesgo de la cuenta y aplica bloqueos automáticos.
 * @param {import('node:sqlite').DatabaseSync} db
 * @param {number} accountId
 * @returns {object|null} status, o null si la cuenta no existe
 */
export function evaluateAccountRisk(db, accountId) {
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  if (!account) return null;

  const now = new Date();
  const tradingDay = currentTradingDay(account);
  const week = weekOf(tradingDay);

  // Limpiar bloqueos caducados.
  if (account.lock_until && !isLocked(account, now)) {
    db.prepare('UPDATE accounts SET lock_until = NULL, lock_reason = NULL WHERE id = ?').run(account.id);
    account.lock_until = null;
    account.lock_reason = null;
  }

  const today = db
    .prepare('SELECT COALESCE(SUM(pnl), 0) AS pnl, COUNT(*) AS n FROM trades WHERE account_id = ? AND trading_day = ?')
    .get(account.id, tradingDay);
  const weekRow = db
    .prepare(
      'SELECT COALESCE(SUM(pnl), 0) AS pnl, COUNT(*) AS n FROM trades WHERE account_id = ? AND trading_day BETWEEN ? AND ?',
    )
    .get(account.id, week.start, week.end);

  const todayPnl = round2(today.pnl);
  const todayTrades = Number(today.n) || 0;
  const weekPnl = round2(weekRow.pnl);
  const weekTrades = Number(weekRow.n) || 0;

  const dailyMax = positiveOrNull(account.daily_max_loss);
  const weeklyMax = positiveOrNull(account.weekly_max_loss);
  const maxTrades = Number.isInteger(Number(account.max_trades_per_day)) && Number(account.max_trades_per_day) > 0
    ? Number(account.max_trades_per_day)
    : null;

  // Reglas automáticas
  if (dailyMax !== null) {
    applyRule(db, account, {
      kind: 'daily_loss',
      violated: todayPnl <= -dailyMax,
      lockUntil: nextResetIso(account, now),
      dayFrom: tradingDay,
      dayTo: tradingDay,
      pnl: todayPnl,
      message: `Pérdida diaria de ${Math.abs(todayPnl).toFixed(2)} ${account.currency || 'USD'} (límite ${dailyMax.toFixed(2)}).`,
      now,
    });
  }
  if (weeklyMax !== null) {
    applyRule(db, account, {
      kind: 'weekly_loss',
      violated: weekPnl <= -weeklyMax,
      lockUntil: nextWeekResetIso(account, now),
      dayFrom: week.start,
      dayTo: week.end,
      pnl: weekPnl,
      message: `Pérdida semanal de ${Math.abs(weekPnl).toFixed(2)} ${account.currency || 'USD'} (límite ${weeklyMax.toFixed(2)}).`,
      now,
    });
  }
  if (maxTrades !== null) {
    applyRule(db, account, {
      kind: 'max_trades',
      violated: todayTrades >= maxTrades,
      lockUntil: nextResetIso(account, now),
      dayFrom: tradingDay,
      dayTo: tradingDay,
      pnl: todayPnl,
      message: `${todayTrades} operaciones hoy (máximo ${maxTrades}).`,
      now,
    });
  }

  const locked = isLocked(account, now);

  return {
    locked,
    lock_until: locked ? account.lock_until : null,
    lock_reason: locked ? account.lock_reason : null,
    trading_day: tradingDay,
    week_start: week.start,
    week_end: week.end,
    today_pnl: todayPnl,
    today_trades: todayTrades,
    week_pnl: weekPnl,
    week_trades: weekTrades,
    remaining_daily: dailyMax === null ? null : round2(Math.max(0, dailyMax + Math.min(0, todayPnl))),
    remaining_weekly: weeklyMax === null ? null : round2(Math.max(0, weeklyMax + Math.min(0, weekPnl))),
    remaining_trades: maxTrades === null ? null : Math.max(0, maxTrades - todayTrades),
    daily_used_pct: dailyMax === null ? 0 : round1((Math.max(0, -todayPnl) / dailyMax) * 100),
    weekly_used_pct: weeklyMax === null ? 0 : round1((Math.max(0, -weekPnl) / weeklyMax) * 100),
    next_reset: nextResetIso(account, now),
    events: listLockEvents(db, account.id, 20),
  };
}
