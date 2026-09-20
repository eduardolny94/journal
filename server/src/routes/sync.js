// Entrada de la sincronización automática. No usa la sesión del navegador: se autentica con el token de la cuenta
// (cabecera `Authorization: Bearer gtfx_…`) que envía el servicio GTFX_JournalSync desde MetaTrader 5.
//
//   POST /api/sync/mt5  { account: { login, server, currency, balance, equity, floating, open_positions, server_time, gmt_time },
//                         positions: [{ id, symbol, type: 'buy'|'sell', volume, open_price, close_price, open_time, close_time,
//                                       profit, commission, swap, fee }] }
//     -> { ok, imported, duplicates, errors, locked, lock_reason, lock_until }
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { getDb } from '../db.js';
import { SyncError, accountForToken, applySync } from '../services/mt5Sync.js';
import { requireSubscription } from '../services/subscriptions.js';

const router = Router();
const isTest = process.env.NODE_ENV === 'test';

// Un terminal envía como mucho unas pocas peticiones por minuto; el límite frena a quien pruebe tokens.
router.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => isTest, message: { error: 'Demasiadas sincronizaciones. Espera un minuto.' } }));

function tokenAuth(req, res, next) {
  try {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const account = accountForToken(getDb(), token);
    if (!account) return res.status(401).json({ error: 'Token de sincronización no válido o revocado. Genera uno nuevo en Cuentas.', code: 'bad_sync_token' });
    if (account.is_archived) return res.status(409).json({ error: 'La cuenta está archivada: no recibe operaciones.', code: 'account_archived' });
    req.syncAccount = account;
    req.user = { id: account.user_id };
    return next();
  } catch (err) {
    return next(err);
  }
}

router.post('/mt5', tokenAuth, requireSubscription(getDb), (req, res, next) => {
  try {
    res.json(applySync(getDb(), req.syncAccount, req.body || {}));
  } catch (err) {
    if (err instanceof SyncError) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
});

export default router;
