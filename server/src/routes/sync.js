// Entrada de la sincronización automática. No usa la sesión del navegador: se autentica con el token único del usuario
// (`Authorization: Bearer gtfxu_…`) o con el de una cuenta (`gtfx_…`) que envía el servicio GTFX_JournalSync desde MT5.
//
//   POST /api/sync/mt5  { account: { login, server, currency, balance, equity, floating, open_positions, server_time, gmt_time },
//                         positions: [{ id, symbol, type: 'buy'|'sell', volume, open_price, close_price, open_time, close_time,
//                                       profit, commission, swap, fee }] }
//     -> { ok, imported, duplicates, errors, locked, lock_reason, lock_until }
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { getDb } from '../db.js';
import { SyncError, accountForToken, applySync, resolveAccountForUser, touchUserSync, userForToken } from '../services/mt5Sync.js';
import { applyTradingviewSync } from '../services/tradingviewSync.js';
import { requireSubscription } from '../services/subscriptions.js';
import { evaluateAccountRisk } from '../services/risk.js';

const router = Router();
const isTest = process.env.NODE_ENV === 'test';

// Un terminal envía como mucho unas pocas peticiones por minuto; el límite frena a quien pruebe tokens.
router.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false, skip: () => isTest, message: { error: 'Demasiadas sincronizaciones. Espera un minuto.' } }));

// Dos tipos de token: el único del usuario (`gtfxu_…`, vale para cualquier cuenta de MT5 del trader) y el de una cuenta
// concreta (`gtfx_…`). Con el de usuario, la cuenta del journal se decide por el login y el servidor que manda MT5.
function tokenAuth(req, res, next) {
  try {
    const header = String(req.headers.authorization || '');
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const db = getDb();
    if (token.startsWith('gtfxu_')) {
      const user = userForToken(db, token);
      if (!user) return res.status(401).json({ error: 'Token de sincronización no válido o revocado. Genera uno nuevo en Conectar → Sincronización automática.', code: 'bad_sync_token' });
      req.syncUser = user;
      req.user = { id: user.id };
      return next();
    }
    const account = accountForToken(db, token);
    if (!account) return res.status(401).json({ error: 'Token de sincronización no válido o revocado. Genera uno nuevo en Cuentas.', code: 'bad_sync_token' });
    if (account.is_archived) return res.status(409).json({ error: 'La cuenta está archivada: no recibe operaciones.', code: 'account_archived' });
    req.syncAccount = account;
    req.user = { id: account.user_id };
    return next();
  } catch (err) {
    return next(err);
  }
}

/** Cuenta del journal para esta petición: la del token de cuenta, o la que corresponde al login de MT5 con el token de usuario. */
function resolveAccount(req, info) {
  if (req.syncAccount) return { account: req.syncAccount, created: false };
  const r = resolveAccountForUser(getDb(), req.syncUser, info);
  touchUserSync(getDb(), req.syncUser.id);
  return r;
}

router.post('/mt5', tokenAuth, requireSubscription(getDb), (req, res, next) => {
  try {
    const body = req.body || {};
    const { account, created } = resolveAccount(req, body.account);
    res.json({ ...applySync(getDb(), account, body), account_id: account.id, account_name: account.name, account_created: created });
  } catch (err) {
    if (err instanceof SyncError) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
});

// GET /api/sync/mt5/estado[?login=…&server=…] → el guardián (GTFX_JournalGuard) pregunta si debe cerrar todo y no dejar
// operar. Con el token de usuario necesita el login (y servidor) de la cuenta de MT5 en la URL.
router.get('/mt5/estado', tokenAuth, requireSubscription(getDb), (req, res, next) => {
  try {
    let account = req.syncAccount;
    if (!account) {
      const login = String(req.query.login ?? '').trim();
      if (!/^\d{1,20}$/.test(login)) return res.status(400).json({ error: 'Con el token único hay que indicar la cuenta de MT5: ?login=<número>&server=<servidor>. Actualiza GTFX_JournalGuard.', code: 'bad_login' });
      const db = getDb();
      const server = String(req.query.server ?? '').trim().slice(0, 64);
      account = db.prepare("SELECT * FROM accounts WHERE user_id = ? AND is_archived = 0 AND sync_login = ? ORDER BY CASE WHEN COALESCE(sync_server, '') = ? THEN 0 ELSE 1 END, id").get(req.syncUser.id, login, server);
      if (!account) return res.json({ ok: true, locked: false, hard_lock: false, action: 'ninguna', lock_reason: null, lock_until: null, pending: 'La cuenta de MT5 aún no ha sincronizado: el guardián vigilará en cuanto el servicio envíe algo.' });
    }
    const status = evaluateAccountRisk(getDb(), account.id);
    res.json({ ok: true, locked: !!status.locked, hard_lock: !!status.hard_lock, action: status.locked && status.hard_lock ? 'cerrar_todo' : 'ninguna', lock_reason: status.lock_reason || null, lock_until: status.lock_until || null, trading_day: status.trading_day, next_reset: status.next_reset });
  } catch (err) {
    next(err);
  }
});

// TradingView: la extensión del navegador envía las órdenes ejecutadas del panel de trading (ver services/tradingviewSync.js).
router.post('/tradingview', tokenAuth, requireSubscription(getDb), (req, res, next) => {
  try {
    if (!req.syncAccount) return res.status(400).json({ error: 'La extensión de TradingView usa el token de la cuenta (Cuentas → Conectar), no el token único de MT5.', code: 'account_token_required' });
    res.json(applyTradingviewSync(getDb(), req.syncAccount, req.body || {}));
  } catch (err) {
    if (err instanceof SyncError) return res.status(err.status).json({ error: err.message, code: err.code });
    next(err);
  }
});

export default router;
