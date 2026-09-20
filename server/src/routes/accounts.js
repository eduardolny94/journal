// Cuentas de prop firm: CRUD, reglas de riesgo, bloqueo/desbloqueo manual, estado y eventos.
import { Router } from 'express';
import { getDb } from '../db.js';
import { createSyncToken, revokeSyncToken, stripSyncSecrets } from '../services/mt5Sync.js';
import { evaluateAccountRisk, listLockEvents, LOCK_REASON_LABELS } from '../services/risk.js';
import { currentTradingDay, nextResetIso } from '../services/tradingDay.js';
import { OUTCOMES } from '../services/finanzas.js';

const router = Router();

export const PLATFORMS = ['tradovate', 'projectx', 'rithmic', 'ninjatrader', 'mt5', 'mt4', 'ctrader', 'otro'];
export const ACCOUNT_TYPES = ['evaluacion', 'financiada', 'personal'];

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function isValidTimezone(tz) {
  if (typeof tz !== 'string' || !tz.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** Número >= 0 o null (acepta '', null, undefined como null). Lanza 400 si no es numérico. */
function optionalNonNegative(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `${label} debe ser un número mayor o igual que 0.`);
  return n;
}

/** Fecha AAAA-MM-DD o null. */
function optionalYmd(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())) throw new HttpError(400, `${label} debe tener el formato AAAA-MM-DD.`);
  return s;
}

/** Entero > 0 o null. */
function optionalPositiveInt(value, label) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw new HttpError(400, `${label} debe ser un número entero mayor o igual que 0.`);
  return n === 0 ? null : n;
}

/**
 * Valida y normaliza los campos de una cuenta.
 * @param {object} body
 * @param {object|null} existing fila actual (para PUT parcial) o null (POST)
 */
function parseAccountInput(body, existing = null) {
  const b = body && typeof body === 'object' ? body : {};
  const pick = (key, fallback) => (b[key] !== undefined ? b[key] : existing ? existing[key] : fallback);

  const name = String(pick('name', '') ?? '').trim();
  if (!name) throw new HttpError(400, 'El nombre de la cuenta es obligatorio.');
  if (name.length > 80) throw new HttpError(400, 'El nombre de la cuenta es demasiado largo (máximo 80 caracteres).');

  const firm = String(pick('firm', '') ?? '').trim().slice(0, 80);

  const platform = String(pick('platform', 'otro') ?? 'otro').trim().toLowerCase();
  if (!PLATFORMS.includes(platform)) throw new HttpError(400, `Plataforma inválida. Opciones: ${PLATFORMS.join(', ')}.`);

  const account_type = String(pick('account_type', 'evaluacion') ?? 'evaluacion').trim().toLowerCase();
  if (!ACCOUNT_TYPES.includes(account_type)) {
    throw new HttpError(400, `Tipo de cuenta inválido. Opciones: ${ACCOUNT_TYPES.join(', ')}.`);
  }

  const size = optionalNonNegative(pick('size', 0), 'El tamaño de la cuenta') ?? 0;

  const currency = String(pick('currency', 'USD') ?? 'USD').trim().toUpperCase() || 'USD';
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'La moneda debe ser un código de 3 letras (p. ej. USD).');

  const timezone = String(pick('timezone', 'America/New_York') ?? 'America/New_York').trim();
  if (!isValidTimezone(timezone)) throw new HttpError(400, 'Zona horaria inválida (usa un identificador IANA, p. ej. America/New_York).');

  const resetRaw = pick('day_reset_hour', 17);
  const day_reset_hour = resetRaw === '' || resetRaw === null || resetRaw === undefined ? 17 : Number(resetRaw);
  if (!Number.isInteger(day_reset_hour) || day_reset_hour < 0 || day_reset_hour > 23) {
    throw new HttpError(400, 'La hora de reset debe ser un entero entre 0 y 23.');
  }

  const risk = parseRiskInput(b, existing);

  let is_archived = existing ? existing.is_archived : 0;
  if (b.is_archived !== undefined) is_archived = b.is_archived === true || b.is_archived === 1 || b.is_archived === '1' ? 1 : 0;

  // Economía de la cuenta (Finanzas)
  const outcome = String(pick('outcome', 'activa') ?? 'activa').trim().toLowerCase() || 'activa';
  if (!OUTCOMES.includes(outcome)) throw new HttpError(400, `Estado de la cuenta inválido. Opciones: ${OUTCOMES.join(', ')}.`);
  const purchased_at = optionalYmd(pick('purchased_at', null), 'La fecha de compra');
  const funded_at = optionalYmd(pick('funded_at', null), 'La fecha de financiación');
  const ended_at = optionalYmd(pick('ended_at', null), 'La fecha de cierre');
  const profit_split = optionalNonNegative(pick('profit_split', null), 'El reparto de beneficios');
  if (profit_split !== null && profit_split > 100) throw new HttpError(400, 'El reparto de beneficios es un porcentaje entre 0 y 100.');

  return { name, firm, platform, account_type, size, currency, timezone, day_reset_hour, ...risk, is_archived, outcome, purchased_at, funded_at, ended_at, profit_split };
}

function parseRiskInput(body, existing = null) {
  const b = body && typeof body === 'object' ? body : {};
  const pick = (key) => (b[key] !== undefined ? b[key] : existing ? existing[key] : null);
  const daily_max_loss = optionalNonNegative(pick('daily_max_loss'), 'La pérdida máxima diaria');
  const weekly_max_loss = optionalNonNegative(pick('weekly_max_loss'), 'La pérdida máxima semanal');
  const max_trades_per_day = optionalPositiveInt(pick('max_trades_per_day'), 'El máximo de operaciones por día');
  return {
    daily_max_loss: daily_max_loss === 0 ? null : daily_max_loss,
    weekly_max_loss: weekly_max_loss === 0 ? null : weekly_max_loss,
    max_trades_per_day,
  };
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Identificador de cuenta inválido.');
  return id;
}

/** Devuelve la cuenta del usuario o lanza 404. */
function getOwnedAccount(db, userId, rawId) {
  const id = parseId(rawId);
  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, userId);
  if (!account) throw new HttpError(404, 'Cuenta no encontrada.');
  return account;
}

function accountWithStatus(db, accountId) {
  const status = evaluateAccountRisk(db, accountId);
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(accountId);
  return { ...stripSyncSecrets(account), status };
}

// ---------- Rutas ----------

router.get('/', (req, res, next) => {
  try {
    const db = getDb();
    const rows = db
      .prepare('SELECT id FROM accounts WHERE user_id = ? ORDER BY is_archived ASC, created_at ASC, id ASC')
      .all(req.user.id);
    res.json(rows.map((r) => accountWithStatus(db, r.id)));
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const db = getDb();
    const data = parseAccountInput(req.body, null);
    const result = db
      .prepare(
        `INSERT INTO accounts (user_id, name, firm, platform, account_type, size, currency, timezone, day_reset_hour,
           daily_max_loss, weekly_max_loss, max_trades_per_day, is_archived, outcome, purchased_at, funded_at, ended_at, profit_split)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        req.user.id,
        data.name,
        data.firm,
        data.platform,
        data.account_type,
        data.size,
        data.currency,
        data.timezone,
        data.day_reset_hour,
        data.daily_max_loss,
        data.weekly_max_loss,
        data.max_trades_per_day,
        data.is_archived,
        data.outcome,
        data.purchased_at,
        data.funded_at,
        data.ended_at,
        data.profit_split,
      );
    const newId = Number(result.lastInsertRowid);
    // Coste de la evaluación (solo al crear): se registra como gasto en Finanzas.
    const price = optionalNonNegative(req.body && req.body.purchase_price, 'El coste de la evaluación');
    if (price) {
      db.prepare('INSERT INTO account_transactions (user_id, account_id, kind, amount, currency, occurred_at, note) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
        req.user.id, newId, data.account_type === 'financiada' ? 'activacion' : 'evaluacion', price, data.currency, data.purchased_at || new Date().toISOString().slice(0, 10), `Compra de ${data.name}`,
      );
    }
    res.status(201).json(accountWithStatus(db, newId));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const account = getOwnedAccount(db, req.user.id, req.params.id);
    res.json(accountWithStatus(db, account.id));
  } catch (err) {
    next(err);
  }
});

router.put('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const account = getOwnedAccount(db, req.user.id, req.params.id);
    const data = parseAccountInput(req.body, account);
    db.prepare(
      `UPDATE accounts SET name = ?, firm = ?, platform = ?, account_type = ?, size = ?, currency = ?, timezone = ?,
         day_reset_hour = ?, daily_max_loss = ?, weekly_max_loss = ?, max_trades_per_day = ?, is_archived = ?,
         outcome = ?, purchased_at = ?, funded_at = ?, ended_at = ?, profit_split = ?
       WHERE id = ? AND user_id = ?`,
    ).run(
      data.name,
      data.firm,
      data.platform,
      data.account_type,
      data.size,
      data.currency,
      data.timezone,
      data.day_reset_hour,
      data.daily_max_loss,
      data.weekly_max_loss,
      data.max_trades_per_day,
      data.is_archived,
      data.outcome,
      data.purchased_at,
      data.funded_at,
      data.ended_at,
      data.profit_split,
      account.id,
      req.user.id,
    );
    res.json(accountWithStatus(db, account.id));
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', (req, res, next) => {
  try {
    const db = getDb();
    const account = getOwnedAccount(db, req.user.id, req.params.id);
    db.prepare('DELETE FROM accounts WHERE id = ? AND user_id = ?').run(account.id, req.user.id);
    res.json({ ok: true, id: account.id });
  } catch (err) {
    next(err);
  }
});

router.put('/:id/risk', (req, res, next) => {
  try {
    const db = getDb();
    const account = getOwnedAccount(db, req.user.id, req.params.id);
    const risk = parseRiskInput(req.body, account);
    db.prepare('UPDATE accounts SET daily_max_loss = ?, weekly_max_loss = ?, max_trades_per_day = ? WHERE id = ? AND user_id = ?').run(
      risk.daily_max_loss,
      risk.weekly_max_loss,
      risk.max_trades_per_day,
      account.id,
      req.user.id,
    );
    res.json(accountWithStatus(db, account.id));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/lock', (req, res, next) => {
  try {
    const db = getDb();
    const account = getOwnedAccount(db, req.user.id, req.params.id);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const now = new Date();

    let until;
    if (body.until !== undefined && body.until !== null && body.until !== '') {
      const d = new Date(body.until);
      if (Number.isNaN(d.getTime())) throw new HttpError(400, 'La fecha de desbloqueo (until) no es válida.');
      until = d;
    } else if (body.hours !== undefined && body.hours !== null && body.hours !== '') {
      const hours = Number(body.hours);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 365) {
        throw new HttpError(400, 'Las horas de bloqueo deben ser un número mayor que 0.');
      }
      until = new Date(now.getTime() + hours * 3600 * 1000);
    } else {
      until = new Date(nextResetIso(account, now));
    }
    if (until.getTime() <= now.getTime()) throw new HttpError(400, 'La fecha de desbloqueo debe ser posterior a ahora.');

    // Nunca reducir un bloqueo existente más lejano.
    const existingUntil = account.lock_until ? new Date(account.lock_until).getTime() : 0;
    const finalUntil = existingUntil > until.getTime() ? new Date(existingUntil) : until;
    const finalReason = existingUntil > until.getTime() ? account.lock_reason || 'manual' : 'manual';
    const reason = String(body.reason ?? '').trim().slice(0, 300);

    db.prepare('UPDATE accounts SET lock_until = ?, lock_reason = ? WHERE id = ? AND user_id = ?').run(
      finalUntil.toISOString(),
      finalReason,
      account.id,
      req.user.id,
    );
    const tradingDay = currentTradingDay(account);
    const today = db
      .prepare('SELECT COALESCE(SUM(pnl), 0) AS pnl FROM trades WHERE account_id = ? AND trading_day = ?')
      .get(account.id, tradingDay);
    db.prepare(
      'INSERT INTO lock_events (account_id, kind, trading_day, pnl_at_lock, lock_until, message) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(account.id, 'manual', tradingDay, Number(today.pnl) || 0, until.toISOString(), reason || LOCK_REASON_LABELS.manual);

    res.json(accountWithStatus(db, account.id));
  } catch (err) {
    next(err);
  }
});

router.post('/:id/unlock', (req, res, next) => {
  try {
    const db = getDb();
    const account = getOwnedAccount(db, req.user.id, req.params.id);
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const tradingDay = currentTradingDay(account);
    const wasLocked = !!account.lock_until;
    const previousReason = account.lock_reason;

    db.prepare('UPDATE accounts SET lock_until = NULL, lock_reason = NULL WHERE id = ? AND user_id = ?').run(account.id, req.user.id);

    const today = db
      .prepare('SELECT COALESCE(SUM(pnl), 0) AS pnl FROM trades WHERE account_id = ? AND trading_day = ?')
      .get(account.id, tradingDay);
    const note = String(body.reason ?? '').trim().slice(0, 300);
    const message = wasLocked
      ? `Desbloqueo manual (motivo anterior: ${LOCK_REASON_LABELS[previousReason] || previousReason || 'desconocido'})${note ? ` — ${note}` : ''}`
      : `Desbloqueo manual (la cuenta no estaba bloqueada)${note ? ` — ${note}` : ''}`;
    db.prepare(
      'INSERT INTO lock_events (account_id, kind, trading_day, pnl_at_lock, lock_until, message) VALUES (?, ?, ?, ?, NULL, ?)',
    ).run(account.id, 'unlock', tradingDay, Number(today.pnl) || 0, message);

    res.json(accountWithStatus(db, account.id));
  } catch (err) {
    next(err);
  }
});

// POST /api/accounts/:id/sync-token -> { token, sync }  (crea o rota el token; el token en claro solo se ve aquí)
router.post('/:id/sync-token', (req, res, next) => {
  try {
    const db = getDb();
    const account = getOwnedAccount(db, req.user.id, req.params.id);
    const token = createSyncToken(db, account.id);
    res.status(201).json({ token, account: accountWithStatus(db, account.id) });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/accounts/:id/sync-token  (revoca: el servicio de MT5 deja de poder enviar)
router.delete('/:id/sync-token', (req, res, next) => {
  try {
    const db = getDb();
    const account = getOwnedAccount(db, req.user.id, req.params.id);
    revokeSyncToken(db, account.id);
    res.json(accountWithStatus(db, account.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/status', (req, res, next) => {
  try {
    const db = getDb();
    const account = getOwnedAccount(db, req.user.id, req.params.id);
    res.json(evaluateAccountRisk(db, account.id));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/events', (req, res, next) => {
  try {
    const db = getDb();
    const account = getOwnedAccount(db, req.user.id, req.params.id);
    let limit = Number(req.query.limit) || 100;
    limit = Math.min(Math.max(limit, 1), 500);
    res.json(listLockEvents(db, account.id, limit));
  } catch (err) {
    next(err);
  }
});

export default router;
