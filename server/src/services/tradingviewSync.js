// Sincronización automática desde TradingView: la extensión «GTFX Journal Sync» lee la pestaña History del panel de
// trading en el navegador del usuario y envía las órdenes ejecutadas con el token de la cuenta. Vale para cualquier
// bróker conectado a TradingView (Plus500 Futures, OANDA, Tradovate…). No hay API del bróker ni credenciales: el
// bróker solo ve la sesión normal de TradingView del usuario.
//
//   POST /api/sync/tradingview  { account: { broker, account_id, timezone, balance, equity, open_positions },
//                                 orders: [{ symbol, side, type, qty, fill_price, status, commission, placing_time, closing_time, order_id }] }
//     -> { ok, orders, trades, imported, duplicates, errors, locked, lock_reason, lock_until, account_name }
//
// La extensión envía siempre el historial visible completo (no solo lo nuevo): las compras y ventas se emparejan
// FIFO en cada envío y las operaciones que ya existen se descartan por su identificador.
import { alignmentFor } from '../radar/engine.js';
import { evaluateAccountRisk } from './risk.js';
import { tradingDayFor } from './tradingDay.js';
import { normalizeRows } from './csvParsers.js';
import { SyncError } from './mt5Sync.js';

export const MAX_ORDERS_PER_SYNC = 1000;
const COLUMNS = ['Symbol', 'Side', 'Type', 'Qty', 'Fill Price', 'Status', 'Commission', 'Placing Time', 'Closing Time', 'Order ID'];
const KEYS = { Symbol: 'symbol', Side: 'side', Type: 'type', Qty: 'qty', 'Fill Price': 'fill_price', Status: 'status', Commission: 'commission', 'Placing Time': 'placing_time', 'Closing Time': 'closing_time', 'Order ID': 'order_id' };
const num = (v) => { const n = Number(v); return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n; };

export function applyTradingviewSync(db, account, body) {
  const info = body && typeof body.account === 'object' && body.account ? body.account : {};
  const broker = String(info.broker ?? '').trim().slice(0, 64);
  const accountId = String(info.account_id ?? '').trim().slice(0, 64);
  const login = accountId ? `${broker ? `${broker}:` : ''}${accountId}` : null;
  // El token queda ligado a la primera cuenta del bróker que sincroniza (si la extensión puede leerla).
  if (login && account.sync_login && account.sync_login !== login) {
    throw new SyncError(409, `Este token pertenece a la cuenta ${account.sync_login}, pero el panel de TradingView muestra la ${login}. No se ha guardado nada.`, 'login_mismatch');
  }
  if (login && !account.sync_login) {
    const other = db.prepare('SELECT name FROM accounts WHERE user_id = ? AND id != ? AND sync_token_hash IS NOT NULL AND sync_login = ?').get(account.user_id, account.id, login);
    if (other) throw new SyncError(409, `La cuenta ${login} ya está sincronizada con «${other.name}». Este token es de otra cuenta del journal.`, 'login_in_use');
  }
  const timezone = typeof info.timezone === 'string' && /^[A-Za-z_]+\/[A-Za-z_\-/]+$|^UTC$/.test(info.timezone) ? info.timezone : 'UTC';
  const list = Array.isArray(body?.orders) ? body.orders.slice(0, MAX_ORDERS_PER_SYNC) : [];
  const rows = list.map((o) => {
    const r = {};
    for (const c of COLUMNS) { const v = o && typeof o === 'object' ? o[KEYS[c]] : undefined; r[c] = v === undefined || v === null ? '' : String(v).slice(0, 80); }
    return r;
  });
  let normalized;
  try {
    normalized = normalizeRows(rows, { source: 'tradingview', variant: 'orders', mapping: {}, timezone, columns: COLUMNS });
  } catch (e) {
    throw new SyncError(400, e.message || 'Órdenes no válidas.', 'bad_orders');
  }

  const insert = db.prepare(
    `INSERT INTO trades (user_id, account_id, symbol, side, qty, entry_price, exit_price, entry_time, exit_time,
       trading_day, pnl, fees, notes, violated_lock, source, external_id, bias_diff, bias_alignment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, 'sync:tradingview', ?, ?, ?)`,
  );
  const exists = db.prepare('SELECT 1 AS x FROM trades WHERE account_id = ? AND external_id = ?');
  let imported = 0;
  let duplicates = 0;
  const errors = [];
  let trades = 0;

  db.exec('BEGIN');
  try {
    for (const r of normalized.rows) {
      if (r.error) { if (errors.length < 10) errors.push(`fila ${r.row}: ${r.error}`); continue; }
      trades += 1;
      const d = r.data;
      if (exists.get(account.id, d.external_id)) { duplicates += 1; continue; }
      let bias = { bias_diff: null, bias_alignment: null };
      try { bias = alignmentFor(d.symbol, d.side); } catch { /* sin radar disponible */ }
      try {
        insert.run(account.user_id, account.id, d.symbol, d.side, d.qty, d.entry_price, d.exit_price, d.entry_time, d.exit_time, tradingDayFor(d.exit_time, account), d.pnl, d.fees, d.external_id, bias.bias_diff, bias.bias_alignment);
        imported += 1;
      } catch (e) {
        if (/UNIQUE constraint failed/i.test(e.message)) duplicates += 1;
        else throw e;
      }
    }
    db.prepare(
      `UPDATE accounts SET sync_last_at = datetime('now'), sync_login = COALESCE(?, sync_login), sync_server = COALESCE(?, sync_server),
         sync_balance = COALESCE(?, sync_balance), sync_equity = COALESCE(?, sync_equity), sync_open_positions = COALESCE(?, sync_open_positions),
         sync_trades_total = COALESCE(sync_trades_total, 0) + ? WHERE id = ?`,
    ).run(login, broker || null, num(info.balance), num(info.equity), num(info.open_positions), imported, account.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  const status = evaluateAccountRisk(db, account.id);
  return { ok: true, orders: list.length, trades, imported, duplicates, errors, warnings: normalized.warnings, locked: !!status.locked, lock_reason: status.lock_reason || null, lock_until: status.lock_until || null, account_name: account.name };
}
