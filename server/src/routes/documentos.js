// Documentos de Finanzas: certificado de cuenta fondeada (cuelga de la cuenta) y comprobante de payout
// (cuelga del movimiento de retiro). Imagen o PDF, privados por usuario (misma carpeta que las capturas).
// También sirve la vista «Fondeos y payouts»: la historia de cada cuenta (compra → fondeo → payouts).
import { Router } from 'express';
import { getDb } from '../db.js';
import { publicPathFor, removeOwnedUpload, uploadDocument } from '../upload.js';

const router = Router();

export const DOCUMENT_KINDS = ['certificado_fondeo', 'comprobante_payout', 'otro'];
export const DOCUMENT_KIND_LABELS = {
  certificado_fondeo: 'Certificado de cuenta fondeada',
  comprobante_payout: 'Comprobante de payout',
  otro: 'Otro documento',
};
const MAX_TITLE = 120;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function parseId(raw, label = 'Identificador') {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, `${label} inválido.`);
  return id;
}
function cleanTitle(v) {
  return String(v ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, MAX_TITLE);
}

const SELECT_DOC = `
  SELECT d.*, a.name AS account_name, a.firm AS account_firm, a.currency AS account_currency,
         t.kind AS transaction_kind, t.amount AS transaction_amount, t.gross_amount AS transaction_gross,
         t.occurred_at AS transaction_at, t.currency AS transaction_currency
  FROM account_documents d
  LEFT JOIN accounts a ON a.id = d.account_id
  LEFT JOIN account_transactions t ON t.id = d.transaction_id`;

function getOwnedDoc(db, userId, rawId) {
  const id = parseId(rawId, 'El documento');
  const row = db.prepare(`${SELECT_DOC} WHERE d.id = ? AND d.user_id = ?`).get(id, userId);
  if (!row) throw new HttpError(404, 'Documento no encontrado.');
  return row;
}

/** Valida el destino del documento: la cuenta y/o el movimiento deben ser del usuario y encajar con el tipo. */
function resolveTarget(db, userId, body) {
  const kind = String(body.kind ?? '').trim().toLowerCase();
  if (!DOCUMENT_KINDS.includes(kind)) throw new HttpError(400, `Tipo de documento inválido. Opciones: ${DOCUMENT_KINDS.join(', ')}.`);
  let accountId = body.account_id === undefined || body.account_id === '' || body.account_id === null ? null : parseId(body.account_id, 'La cuenta');
  let transactionId = body.transaction_id === undefined || body.transaction_id === '' || body.transaction_id === null ? null : parseId(body.transaction_id, 'El movimiento');

  let tx = null;
  if (transactionId !== null) {
    tx = db.prepare('SELECT id, account_id, kind FROM account_transactions WHERE id = ? AND user_id = ?').get(transactionId, userId);
    if (!tx) throw new HttpError(404, 'Movimiento no encontrado.');
    if (kind === 'comprobante_payout' && tx.kind !== 'retiro') throw new HttpError(400, 'El comprobante de payout debe ir en un movimiento de tipo retiro.');
    // El documento hereda la cuenta del movimiento (si la tiene).
    if (accountId === null) accountId = tx.account_id ?? null;
    else if (tx.account_id !== null && tx.account_id !== accountId) throw new HttpError(400, 'El movimiento pertenece a otra cuenta.');
  }
  if (accountId !== null) {
    const acc = db.prepare('SELECT id FROM accounts WHERE id = ? AND user_id = ?').get(accountId, userId);
    if (!acc) throw new HttpError(404, 'Cuenta no encontrada.');
  }
  if (kind === 'certificado_fondeo' && accountId === null) throw new HttpError(400, 'El certificado de fondeo necesita una cuenta.');
  if (kind === 'comprobante_payout' && transactionId === null) throw new HttpError(400, 'El comprobante de payout necesita el movimiento de retiro.');
  if (accountId === null && transactionId === null) throw new HttpError(400, 'Indica la cuenta o el movimiento del documento.');
  return { kind, accountId, transactionId };
}

// GET /api/finanzas/documentos?account_id&transaction_id&kind
router.get('/documentos', (req, res, next) => {
  try {
    const db = getDb();
    const where = ['d.user_id = ?'];
    const params = [req.user.id];
    if (req.query.account_id) { where.push('d.account_id = ?'); params.push(parseId(req.query.account_id, 'La cuenta')); }
    if (req.query.transaction_id) { where.push('d.transaction_id = ?'); params.push(parseId(req.query.transaction_id, 'El movimiento')); }
    if (req.query.kind) {
      const kind = String(req.query.kind).toLowerCase();
      if (!DOCUMENT_KINDS.includes(kind)) throw new HttpError(400, 'Tipo de documento inválido.');
      where.push('d.kind = ?');
      params.push(kind);
    }
    res.json(db.prepare(`${SELECT_DOC} WHERE ${where.join(' AND ')} ORDER BY d.created_at DESC, d.id DESC`).all(...params));
  } catch (err) {
    next(err);
  }
});

// POST /api/finanzas/documentos (multipart: file, kind, account_id?, transaction_id?, title?) -> documento
router.post('/documentos', uploadDocument.single('file'), async (req, res, next) => {
  const file = req.file || null;
  try {
    if (!file) throw new HttpError(400, 'Adjunta el archivo en el campo "file" (imagen o PDF).');
    const db = getDb();
    const { kind, accountId, transactionId } = resolveTarget(db, req.user.id, req.body || {});
    const p = publicPathFor(file, req.user.id);
    const originalName = cleanTitle(file.originalname || '');
    const title = cleanTitle(req.body?.title);
    const r = db
      .prepare('INSERT INTO account_documents (user_id, account_id, transaction_id, kind, path, original_name, mime, size, title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(req.user.id, accountId, transactionId, kind, p, originalName, file.mimetype || '', file.size || 0, title);
    res.status(201).json(getOwnedDoc(db, req.user.id, Number(r.lastInsertRowid)));
  } catch (err) {
    // Si la validación o la DB fallan, no dejamos el archivo huérfano.
    if (file) await removeOwnedUpload(publicPathFor(file, req.user.id), req.user.id);
    next(err);
  }
});

// PUT /api/finanzas/documentos/:id { title }
router.put('/documentos/:id', (req, res, next) => {
  try {
    const db = getDb();
    const row = getOwnedDoc(db, req.user.id, req.params.id);
    const title = cleanTitle(req.body?.title);
    db.prepare('UPDATE account_documents SET title = ? WHERE id = ? AND user_id = ?').run(title, row.id, req.user.id);
    res.json(getOwnedDoc(db, req.user.id, row.id));
  } catch (err) {
    next(err);
  }
});

// DELETE /api/finanzas/documentos/:id
router.delete('/documentos/:id', async (req, res, next) => {
  try {
    const db = getDb();
    const row = getOwnedDoc(db, req.user.id, req.params.id);
    db.prepare('DELETE FROM account_documents WHERE id = ? AND user_id = ?').run(row.id, req.user.id);
    await removeOwnedUpload(row.path, req.user.id);
    res.json({ ok: true, id: row.id });
  } catch (err) {
    next(err);
  }
});

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Historia de fondeos y payouts por cuenta. Entran las cuentas fondeadas, las que tienen retiros o las que tienen
 * algún documento; las demás no aportan nada aquí. Las archivadas sí entran: esta vista es histórica.
 */
export function fondeos(db, userId) {
  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY COALESCE(funded_at, purchased_at, created_at) DESC, id DESC').all(userId);
  const payouts = db.prepare("SELECT * FROM account_transactions WHERE user_id = ? AND kind = 'retiro' ORDER BY occurred_at DESC, id DESC").all(userId);
  const docs = db.prepare(`${SELECT_DOC} WHERE d.user_id = ? ORDER BY d.created_at DESC, d.id DESC`).all(userId);

  const docsByTx = new Map();
  const certsByAccount = new Map();
  const otherByAccount = new Map();
  for (const d of docs) {
    if (d.kind === 'comprobante_payout' && d.transaction_id) {
      if (!docsByTx.has(d.transaction_id)) docsByTx.set(d.transaction_id, []);
      docsByTx.get(d.transaction_id).push(d);
    } else if (d.kind === 'certificado_fondeo' && d.account_id) {
      if (!certsByAccount.has(d.account_id)) certsByAccount.set(d.account_id, []);
      certsByAccount.get(d.account_id).push(d);
    } else if (d.account_id) {
      if (!otherByAccount.has(d.account_id)) otherByAccount.set(d.account_id, []);
      otherByAccount.get(d.account_id).push(d);
    }
  }
  const payoutsByAccount = new Map();
  const sinCuenta = [];
  for (const p of payouts) {
    const row = { ...p, comprobantes: docsByTx.get(p.id) || [] };
    if (p.account_id === null) { sinCuenta.push(row); continue; }
    if (!payoutsByAccount.has(p.account_id)) payoutsByAccount.set(p.account_id, []);
    payoutsByAccount.get(p.account_id).push(row);
  }

  const cuentas = [];
  let cuentasFondeadas = 0;
  for (const acc of accounts) {
    const funded = acc.account_type === 'financiada' || acc.outcome === 'superada' || !!acc.funded_at;
    const certificados = certsByAccount.get(acc.id) || [];
    const otros = otherByAccount.get(acc.id) || [];
    const pays = payoutsByAccount.get(acc.id) || [];
    if (funded) cuentasFondeadas++;
    if (!funded && !pays.length && !certificados.length && !otros.length) continue;
    const total = pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    const bruto = pays.reduce((s, p) => s + (Number(p.gross_amount) || 0), 0);
    cuentas.push({
      account_id: acc.id,
      name: acc.name,
      firm: acc.firm || '',
      size: Number(acc.size) || 0,
      currency: acc.currency || 'USD',
      account_type: acc.account_type,
      outcome: acc.outcome || 'activa',
      is_archived: !!acc.is_archived,
      purchased_at: acc.purchased_at || null,
      funded_at: acc.funded_at || null,
      ended_at: acc.ended_at || null,
      profit_split: acc.profit_split ?? null,
      fondeada: funded,
      certificados,
      otros,
      payouts: pays,
      n_payouts: pays.length,
      total_payouts: round2(total),
      bruto_payouts: round2(bruto),
      ultimo_payout_at: pays.length ? pays[0].occurred_at : null,
    });
  }

  const totalPayouts = payouts.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const mayor = payouts.reduce((m, p) => (Number(p.amount) > (m ? Number(m.amount) : -1) ? p : m), null);
  const currency = (accounts[0] && accounts[0].currency) || (payouts[0] && payouts[0].currency) || 'USD';
  return {
    currency,
    totals: {
      cuentas_fondeadas: cuentasFondeadas,
      cuentas_con_payouts: payoutsByAccount.size,
      n_payouts: payouts.length,
      total_payouts: round2(totalPayouts),
      payout_medio: payouts.length ? round2(totalPayouts / payouts.length) : null,
      mayor_payout: mayor ? round2(Number(mayor.amount)) : null,
      ultimo_payout_at: payouts.length ? payouts[0].occurred_at : null,
      certificados: docs.filter((d) => d.kind === 'certificado_fondeo').length,
      comprobantes: docs.filter((d) => d.kind === 'comprobante_payout').length,
      payouts_sin_comprobante: payouts.filter((p) => !(docsByTx.get(p.id) || []).length).length,
      fondeadas_sin_certificado: cuentas.filter((c) => c.fondeada && !c.certificados.length).length,
    },
    cuentas,
    payouts_sin_cuenta: sinCuenta,
  };
}

// GET /api/finanzas/fondeos
router.get('/fondeos', (req, res, next) => {
  try {
    res.json(fondeos(getDb(), req.user.id));
  } catch (err) {
    next(err);
  }
});

export default router;
