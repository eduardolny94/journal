// Sincronización automática desde MetaTrader 5: un servicio de MT5 (GTFX_JournalSync) envía las posiciones cerradas y
// el balance de la cuenta con un token por cuenta. Nunca se usan ni se guardan contraseñas del bróker.
import crypto from 'node:crypto';
import { alignmentFor } from '../radar/engine.js';
import { evaluateAccountRisk } from './risk.js';
import { tradingDayFor, zonedTimeToUtc } from './tradingDay.js';

const TOKEN_PREFIX = 'gtfx';
const SYMBOL_RE = /^[A-Z0-9][A-Z0-9 ._\-/:!&=#]{0,19}$/;
export const MAX_POSITIONS_PER_SYNC = 500;

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

/** Campos de sincronización que ve el cliente (nunca el hash del token). */
export function publicSync(account) {
  return {
    enabled: !!account.sync_token_hash,
    token_hint: account.sync_token_hint || null,
    created_at: account.sync_created_at || null,
    last_at: account.sync_last_at || null,
    login: account.sync_login || null,
    server: account.sync_server || null,
    balance: account.sync_balance ?? null,
    equity: account.sync_equity ?? null,
    floating: account.sync_floating ?? null,
    open_positions: account.sync_open_positions ?? null,
    trades_total: account.sync_trades_total ?? 0,
  };
}

/** Quita de una fila de `accounts` lo que no debe salir del servidor y añade el bloque `sync`. */
export function stripSyncSecrets(account) {
  if (!account) return account;
  const { sync_token_hash: _hash, ...rest } = account;
  return { ...rest, sync: publicSync(account) };
}

/** Crea (o rota) el token de una cuenta. El token en claro solo se devuelve aquí, una vez. */
export function createSyncToken(db, accountId) {
  const token = `${TOKEN_PREFIX}_${accountId}_${crypto.randomBytes(24).toString('hex')}`;
  // Un token nuevo desvincula la cuenta de MT5 anterior: la siguiente que sincronice queda asociada.
  db.prepare("UPDATE accounts SET sync_token_hash = ?, sync_token_hint = ?, sync_created_at = datetime('now'), sync_login = NULL, sync_server = NULL WHERE id = ?").run(sha256(token), token.slice(-4), accountId);
  return token;
}

export function revokeSyncToken(db, accountId) {
  db.prepare('UPDATE accounts SET sync_token_hash = NULL, sync_token_hint = NULL WHERE id = ?').run(accountId);
}

/** Cuenta asociada a un token, o null. Comparación en tiempo constante sobre el hash. */
export function accountForToken(db, token) {
  const m = /^gtfx_(\d{1,12})_[a-f0-9]{48}$/.exec(String(token || ''));
  if (!m) return null;
  const account = db.prepare('SELECT * FROM accounts WHERE id = ?').get(Number(m[1]));
  if (!account || !account.sync_token_hash) return null;
  const a = Buffer.from(account.sync_token_hash, 'hex');
  const b = Buffer.from(sha256(token), 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? account : null;
}

/**
 * MT5 da las horas en "hora del servidor" codificada como si fuera UTC. Casi todos los brókers de forex y prop firms
 * usan Nueva York + 7 h (UTC+2 en invierno, UTC+3 en verano) para que el día cierre a las 17:00 de NY: en ese caso se
 * convierte con el calendario real de Nueva York, que acierta también en operaciones antiguas de otro horario.
 * Con cualquier otro desfase se aplica el desfase actual tal cual.
 */
export function serverTimeToUtcIso(serverEpochSec, offsetNowSec) {
  const t = Number(serverEpochSec);
  if (!Number.isFinite(t) || t <= 0) return null;
  const off = Math.round(Number(offsetNowSec) / 1800) * 1800;
  if (off === 7200 || off === 10800) {
    const ny = new Date((t - 7 * 3600) * 1000); // reloj de pared de Nueva York
    const utc = zonedTimeToUtc({ year: ny.getUTCFullYear(), month: ny.getUTCMonth() + 1, day: ny.getUTCDate(), hour: ny.getUTCHours(), minute: ny.getUTCMinutes(), second: ny.getUTCSeconds() }, 'America/New_York');
    return new Date(utc).toISOString();
  }
  return new Date((t - (Number.isFinite(off) ? off : 0)) * 1000).toISOString();
}

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const round2 = (n) => Math.round(n * 100) / 100;

/** Valida y normaliza una posición cerrada enviada por MT5. Devuelve { data } o { error }. */
export function normalizePosition(p, offsetNowSec) {
  if (!p || typeof p !== 'object') return { error: 'posición vacía' };
  const id = String(p.id ?? '').trim();
  if (!/^\d{1,20}$/.test(id)) return { error: 'id de posición inválido' };
  const symbol = String(p.symbol ?? '').trim().toUpperCase().slice(0, 20);
  if (!SYMBOL_RE.test(symbol)) return { error: `símbolo inválido (${id})` };
  const side = p.type === 'buy' ? 'long' : p.type === 'sell' ? 'short' : null;
  if (!side) return { error: `tipo inválido (${id})` };
  const qty = num(p.volume);
  if (qty === null || qty <= 0 || qty > 1e6) return { error: `volumen inválido (${id})` };
  const entry = serverTimeToUtcIso(p.open_time, offsetNowSec);
  const exit = serverTimeToUtcIso(p.close_time, offsetNowSec);
  if (!entry || !exit || exit < entry) return { error: `horas inválidas (${id})` };
  const profit = num(p.profit);
  if (profit === null || Math.abs(profit) > 1e9) return { error: `beneficio inválido (${id})` };
  const commission = Math.abs(num(p.commission) ?? 0) + Math.abs(num(p.fee) ?? 0);
  const swap = num(p.swap) ?? 0;
  return {
    data: {
      symbol, side, qty,
      entry_price: num(p.open_price), exit_price: num(p.close_price),
      entry_time: entry, exit_time: exit,
      // Igual que la importación por CSV de MT5: neto = beneficio + swap − comisiones.
      pnl: round2(profit + swap - commission), fees: round2(commission),
      external_id: `mt5:pos:${id}`,
    },
  };
}

/** Error de sincronización con código HTTP (p. ej. el terminal está conectado a otra cuenta de MT5). */
export class SyncError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Aplica una sincronización: inserta lo nuevo (sin duplicar lo ya importado por CSV), guarda el estado y evalúa el riesgo. */
export function applySync(db, account, body) {
  const info = body && typeof body.account === 'object' && body.account ? body.account : {};
  // El token queda ligado a la primera cuenta de MT5 que sincroniza: si el terminal cambia a otra cuenta (otra prop
  // firm, una demo…), sus operaciones no deben mezclarse con las de esta.
  const login = String(info.login ?? '').trim().slice(0, 32);
  if (!/^\d{1,20}$/.test(login)) throw new SyncError(400, 'Falta el número de cuenta de MT5.', 'bad_login');
  if (account.sync_login && account.sync_login !== login) {
    throw new SyncError(409, `Este token pertenece a la cuenta de MT5 ${account.sync_login}, pero el terminal está conectado a la ${login}. No se ha guardado nada.`, 'login_mismatch');
  }
  // Primer envío de este token: una misma cuenta de MT5 no puede alimentar dos cuentas del journal del mismo usuario
  // (pasa si alguien con varias cuentas de fondeo añade el servicio con el token equivocado).
  if (!account.sync_login) {
    const server = String(info.server ?? '').slice(0, 64);
    const other = db.prepare("SELECT name FROM accounts WHERE user_id = ? AND id != ? AND sync_token_hash IS NOT NULL AND sync_login = ? AND COALESCE(sync_server, '') = ?").get(account.user_id, account.id, login, server);
    if (other) throw new SyncError(409, `La cuenta de MT5 ${login} ya está sincronizada con «${other.name}». Este token es de otra cuenta del journal: conéctate en MetaTrader con la cuenta que le corresponde.`, 'login_in_use');
  }
  const offsetNow = num(info.server_time) !== null && num(info.gmt_time) !== null ? num(info.server_time) - num(info.gmt_time) : 0;
  const list = Array.isArray(body?.positions) ? body.positions.slice(0, MAX_POSITIONS_PER_SYNC) : [];

  const insert = db.prepare(
    `INSERT INTO trades (user_id, account_id, symbol, side, qty, entry_price, exit_price, entry_time, exit_time,
       trading_day, pnl, fees, notes, violated_lock, source, external_id, bias_diff, bias_alignment)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', 0, 'sync:mt5', ?, ?, ?)`,
  );
  const exists = db.prepare('SELECT 1 AS x FROM trades WHERE account_id = ? AND external_id = ?');
  let imported = 0;
  let duplicates = 0;
  const errors = [];

  db.exec('BEGIN');
  try {
    for (const raw of list) {
      const n = normalizePosition(raw, offsetNow);
      if (n.error) {
        if (errors.length < 10) errors.push(n.error);
        continue;
      }
      const d = n.data;
      if (exists.get(account.id, d.external_id)) {
        duplicates += 1;
        continue;
      }
      let bias = { bias_diff: null, bias_alignment: null };
      try {
        bias = alignmentFor(d.symbol, d.side);
      } catch {
        // sin radar disponible: la operación se guarda igual
      }
      try {
        insert.run(account.user_id, account.id, d.symbol, d.side, d.qty, d.entry_price, d.exit_price, d.entry_time, d.exit_time, tradingDayFor(d.exit_time, account), d.pnl, d.fees, d.external_id, bias.bias_diff, bias.bias_alignment);
        imported += 1;
      } catch (e) {
        if (/UNIQUE constraint failed/i.test(e.message)) duplicates += 1;
        else throw e;
      }
    }
    db.prepare(
      `UPDATE accounts SET sync_last_at = datetime('now'), sync_login = ?, sync_server = ?, sync_balance = ?, sync_equity = ?, sync_floating = ?,
         sync_open_positions = ?, sync_trades_total = COALESCE(sync_trades_total, 0) + ? WHERE id = ?`,
    ).run(login, String(info.server ?? '').slice(0, 64) || null, num(info.balance), num(info.equity), num(info.floating), num(info.open_positions), imported, account.id);
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }

  const status = evaluateAccountRisk(db, account.id);
  return { ok: true, imported, duplicates, errors, locked: !!status.locked, lock_reason: status.lock_reason || null, lock_until: status.lock_until || null };
}
