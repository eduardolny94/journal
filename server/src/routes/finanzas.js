// Finanzas: movimientos de dinero real (evaluaciones, resets, datos, retiros, reembolsos) y resumen con ROI.
import { Router } from 'express';
import { getDb } from '../db.js';
import { KINDS, KIND_LABELS, EXPENSE_KINDS, INCOME_KINDS, isExpense, listTransactions, summarize } from '../services/finanzas.js';

const router = Router();

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const ymdRe = /^\d{4}-\d{2}-\d{2}$/;
function optionalYmd(v, label) {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim();
  if (!ymdRe.test(s) || Number.isNaN(new Date(`${s}T00:00:00Z`).getTime())) throw new HttpError(400, `${label} debe tener el formato AAAA-MM-DD.`);
  return s;
}
function money(v, label, { allowNull = false, min = 0 } = {}) {
  if (v === undefined || v === null || v === '') {
    if (allowNull) return null;
    throw new HttpError(400, `${label} es obligatorio.`);
  }
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > 1e9) throw new HttpError(400, `${label} debe ser un número${min > 0 ? ' mayor que 0' : ' mayor o igual que 0'}.`);
  return Math.round(n * 100) / 100;
}
function parseId(raw, label = 'Identificador') {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `${label} inválido.`);
  return id;
}

function parseTransaction(db, userId, body, existing = null) {
  const b = body && typeof body === 'object' ? body : {};
  const pick = (key, fallback) => (b[key] !== undefined ? b[key] : existing ? existing[key] : fallback);
  const kind = String(pick('kind', '') ?? '').trim().toLowerCase();
  if (!KINDS.includes(kind)) throw new HttpError(400, `Tipo de movimiento inválido. Opciones: ${KINDS.join(', ')}.`);
  let account_id = pick('account_id', null);
  if (account_id === '' || account_id === undefined) account_id = null;
  if (account_id !== null) {
    account_id = parseId(account_id, 'La cuenta');
    const acc = db.prepare('SELECT id, currency FROM accounts WHERE id = ? AND user_id = ?').get(account_id, userId);
    if (!acc) throw new HttpError(404, 'Cuenta no encontrada.');
  }
  const amount = money(pick('amount', null), 'El importe', { min: 0.01 });
  const gross_amount = money(pick('gross_amount', null), 'El importe bruto', { allowNull: true });
  const fee_amount = money(pick('fee_amount', 0), 'La comisión', { allowNull: true }) ?? 0;
  const currency = String(pick('currency', 'USD') ?? 'USD').trim().toUpperCase() || 'USD';
  if (!/^[A-Z]{3}$/.test(currency)) throw new HttpError(400, 'La moneda debe ser un código de 3 letras.');
  const occurred_at = optionalYmd(pick('occurred_at', null), 'La fecha') || new Date().toISOString().slice(0, 10);
  const recRaw = pick('recurring', 0);
  const recurring = recRaw === true || recRaw === 1 || recRaw === '1' || recRaw === 'true' ? 1 : 0;
  if (recurring && !isExpense(kind)) throw new HttpError(400, 'Solo los gastos pueden marcarse como fijos mensuales.');
  const note = String(pick('note', '') ?? '').trim().slice(0, 300);
  return { kind, account_id, amount, gross_amount, fee_amount, currency, occurred_at, recurring, note };
}

function getOwnedTx(db, userId, rawId) {
  const id = parseId(rawId, 'El movimiento');
  const row = db.prepare('SELECT * FROM account_transactions WHERE id = ? AND user_id = ?').get(id, userId);
  if (!row) throw new HttpError(404, 'Movimiento no encontrado.');
  return row;
}
function withAccount(db, id) {
  return db.prepare('SELECT t.*, a.name AS account_name, a.firm AS account_firm FROM account_transactions t LEFT JOIN accounts a ON a.id = t.account_id WHERE t.id = ?').get(id);
}

// GET /api/finanzas/tipos
router.get('/tipos', (_req, res) => {
  res.json({ kinds: KINDS, labels: KIND_LABELS, expense: EXPENSE_KINDS, income: INCOME_KINDS });
});

// GET /api/finanzas/movimientos?from&to&account_id&kind
router.get('/movimientos', (req, res, next) => {
  try {
    const db = getDb();
    const from = optionalYmd(req.query.from, 'from');
    const to = optionalYmd(req.query.to, 'to');
    const accountId = req.query.account_id ? parseId(req.query.account_id, 'La cuenta') : null;
    const kind = req.query.kind ? String(req.query.kind).toLowerCase() : null;
    if (kind && !KINDS.includes(kind)) throw new HttpError(400, 'Tipo de movimiento inválido.');
    res.json(listTransactions(db, req.user.id, { from, to, accountId, kind }));
  } catch (err) {
    next(err);
  }
});

// POST /api/finanzas/movimientos
router.post('/movimientos', (req, res, next) => {
  try {
    const db = getDb();
    const d = parseTransaction(db, req.user.id, req.body);
    const r = db
      .prepare('INSERT INTO account_transactions (user_id, account_id, kind, amount, gross_amount, fee_amount, currency, occurred_at, recurring, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, d.account_id, d.kind, d.amount, d.gross_amount, d.fee_amount, d.currency, d.occurred_at, d.recurring, d.note);
    res.status(201).json(withAccount(db, Number(r.lastInsertRowid)));
  } catch (err) {
    next(err);
  }
});

// PUT /api/finanzas/movimientos/:id
router.put('/movimientos/:id', (req, res, next) => {
  try {
    const db = getDb();
    const row = getOwnedTx(db, req.user.id, req.params.id);
    const d = parseTransaction(db, req.user.id, req.body, row);
    db.prepare('UPDATE account_transactions SET account_id = ?, kind = ?, amount = ?, gross_amount = ?, fee_amount = ?, currency = ?, occurred_at = ?, recurring = ?, note = ? WHERE id = ? AND user_id = ?').run(
      d.account_id, d.kind, d.amount, d.gross_amount, d.fee_amount, d.currency, d.occurred_at, d.recurring, d.note, row.id, req.user.id,
    );
    res.json(withAccount(db, row.id));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/finanzas/movimientos/:id
router.delete('/movimientos/:id', (req, res, next) => {
  try {
    const db = getDb();
    const row = getOwnedTx(db, req.user.id, req.params.id);
    db.prepare('DELETE FROM account_transactions WHERE id = ? AND user_id = ?').run(row.id, req.user.id);
    res.json({ ok: true, id: row.id });
  } catch (err) {
    next(err);
  }
});

// GET /api/finanzas/resumen?from&to
router.get('/resumen', (req, res, next) => {
  try {
    const db = getDb();
    const from = optionalYmd(req.query.from, 'from');
    const to = optionalYmd(req.query.to, 'to');
    res.json(summarize(db, req.user.id, { from, to }));
  } catch (err) {
    next(err);
  }
});

export default router;
