// Estadísticas del journal (feature C): resumen, calendario de P&L, series diarias/semanales/mensuales
// y desgloses por etiqueta, símbolo, día de la semana y hora.
//
// Todas las rutas aceptan:
//   ?account_id  (opcional) cuenta del usuario; sin él = todas las cuentas NO archivadas del usuario.
//                Si no es numérico → 400; si no pertenece al usuario → 404.
//   ?from&to     (opcional) rango de trading_day 'YYYY-MM-DD' (inclusive).
// Seguridad: TODAS las consultas filtran por req.user.id y van parametrizadas (sin SQL dinámico con
// texto del usuario). Los agregados se hacen en SQL (GROUP BY) y lo derivado se calcula en JS.
// Convenciones: dinero con 2 decimales; win_rate en porcentaje 0-100 con 2 decimales.
import { Router } from 'express';
import { getDb } from '../db.js';
import { addDays, currentTradingDay, localParts, weekOf, weekdayOf } from '../services/tradingDay.js';
import { requireRadarAccess } from '../radar/access.js';

const router = Router();

/** Cuenta "virtual" usada cuando no hay account_id: New York con reset a las 17:00. */
const DEFAULT_TZ_ACCOUNT = { timezone: 'America/New_York', day_reset_hour: 17 };

const WEEKDAY_LABELS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
/** Orden de presentación lunes → domingo (0 = domingo va al final). */
const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function round2(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function isRealDate(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Valida un parámetro de fecha 'YYYY-MM-DD'. Vacío → null. */
function parseDateParam(raw, label) {
  if (raw === undefined || raw === null || raw === '') return null;
  const s = String(raw).trim();
  if (!DATE_RE.test(s) || !isRealDate(s)) {
    throw new HttpError(400, `El parámetro «${label}» debe ser una fecha válida con formato YYYY-MM-DD.`);
  }
  return s;
}

/** Valida un parámetro de mes 'YYYY-MM'. Vacío → null. */
function parseMonthParam(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const s = String(raw).trim();
  if (!MONTH_RE.test(s)) throw new HttpError(400, 'El parámetro «month» debe tener formato YYYY-MM.');
  const m = Number(s.slice(5, 7));
  if (m < 1 || m > 12) throw new HttpError(400, 'El parámetro «month» debe tener un mes entre 01 y 12.');
  return s;
}

/** Primer y último día ('YYYY-MM-DD') de un mes 'YYYY-MM'. */
function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${pad(lastDay)}` };
}

/**
 * Resuelve el ámbito común de la consulta: usuario, cuenta (opcional, validada y propia) y rango.
 * @returns {{ userId:number, account:object|null, from:string|null, to:string|null }}
 */
function parseScope(db, req) {
  const userId = req.user.id;
  let account = null;
  const rawAccount = req.query.account_id;
  if (rawAccount !== undefined && rawAccount !== '') {
    const id = Number(rawAccount);
    if (!Number.isInteger(id) || id <= 0) {
      throw new HttpError(400, 'El parámetro «account_id» debe ser un número entero positivo.');
    }
    account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?').get(id, userId);
    if (!account) throw new HttpError(404, 'Cuenta no encontrada.');
  }
  const from = parseDateParam(req.query.from, 'from');
  const to = parseDateParam(req.query.to, 'to');
  if (from && to && from > to) throw new HttpError(400, 'El parámetro «from» no puede ser posterior a «to».');
  return { userId, account, from, to };
}

/**
 * Cláusula WHERE parametrizada sobre la tabla trades (alias t).
 * @param {object} scope resultado de parseScope
 * @param {{from?:string|null,to?:string|null}} [range] rango a aplicar (por defecto el del scope)
 */
function whereClause(scope, range = { from: scope.from, to: scope.to }) {
  const parts = ['t.user_id = ?'];
  const params = [scope.userId];
  if (scope.account) {
    parts.push('t.account_id = ?');
    params.push(scope.account.id);
  } else {
    parts.push('t.account_id IN (SELECT id FROM accounts WHERE user_id = ? AND is_archived = 0)');
    params.push(scope.userId);
  }
  if (range.from) {
    parts.push('t.trading_day >= ?');
    params.push(range.from);
  }
  if (range.to) {
    parts.push('t.trading_day <= ?');
    params.push(range.to);
  }
  return { sql: parts.join(' AND '), params };
}

const DAY_AGG_SELECT = `
  SELECT t.trading_day AS date,
         COALESCE(SUM(t.pnl), 0) AS pnl,
         COUNT(*) AS trades,
         SUM(CASE WHEN t.pnl > 0 THEN 1 ELSE 0 END) AS wins,
         SUM(CASE WHEN t.pnl < 0 THEN 1 ELSE 0 END) AS losses,
         SUM(CASE WHEN t.pnl = 0 THEN 1 ELSE 0 END) AS breakeven,
         COALESCE(SUM(CASE WHEN t.pnl > 0 THEN t.pnl ELSE 0 END), 0) AS gross_profit,
         COALESCE(SUM(CASE WHEN t.pnl < 0 THEN t.pnl ELSE 0 END), 0) AS gross_loss,
         COALESCE(SUM(t.fees), 0) AS fees,
         COALESCE(SUM(CASE WHEN t.risk_amount > 0 THEN t.pnl / t.risk_amount ELSE 0 END), 0) AS r_sum,
         SUM(CASE WHEN t.risk_amount > 0 THEN 1 ELSE 0 END) AS r_n
  FROM trades t`;

/** Agregado por trading_day (ordenado ascendente) dentro del ámbito y rango dados. */
function dailyRows(db, scope, range) {
  const where = whereClause(scope, range);
  const rows = db
    .prepare(`${DAY_AGG_SELECT} WHERE ${where.sql} GROUP BY t.trading_day ORDER BY t.trading_day ASC`)
    .all(...where.params);
  return rows.map((r) => ({
    date: r.date,
    pnl: Number(r.pnl) || 0,
    trades: Number(r.trades) || 0,
    wins: Number(r.wins) || 0,
    losses: Number(r.losses) || 0,
    breakeven: Number(r.breakeven) || 0,
    gross_profit: Number(r.gross_profit) || 0,
    gross_loss: Number(r.gross_loss) || 0,
    fees: Number(r.fees) || 0,
    r_sum: Number(r.r_sum) || 0,
    r_n: Number(r.r_n) || 0,
  }));
}

/** Suma pnl/trades/wins/losses de una lista de filas agregadas. */
function sumBucket(rows) {
  const b = { pnl: 0, trades: 0, wins: 0, losses: 0 };
  for (const r of rows) {
    b.pnl += r.pnl;
    b.trades += r.trades;
    b.wins += r.wins;
    b.losses += r.losses;
  }
  b.pnl = round2(b.pnl);
  return b;
}

/** Totales {pnl,trades,wins,losses} de un rango concreto (ignora el from/to del scope). */
function bucketFor(db, scope, from, to) {
  const where = whereClause(scope, { from, to });
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(t.pnl), 0) AS pnl, COUNT(*) AS trades,
              SUM(CASE WHEN t.pnl > 0 THEN 1 ELSE 0 END) AS wins,
              SUM(CASE WHEN t.pnl < 0 THEN 1 ELSE 0 END) AS losses
       FROM trades t WHERE ${where.sql}`,
    )
    .get(...where.params);
  return {
    pnl: round2(r.pnl),
    trades: Number(r.trades) || 0,
    wins: Number(r.wins) || 0,
    losses: Number(r.losses) || 0,
  };
}

function winRate(wins, trades) {
  return trades > 0 ? round2((wins / trades) * 100) : 0;
}

/**
 * Métricas del periodo a partir del agregado diario y de los P&L de las últimas operaciones
 * (ordenadas de más reciente a más antigua, para la racha actual).
 */
function computePeriod(days, recent) {
  let pnl = 0;
  let trades = 0;
  let wins = 0;
  let losses = 0;
  let breakeven = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  let fees = 0;
  let rSum = 0;
  let rN = 0;
  let best = null;
  let worst = null;
  // Drawdown máximo sobre la curva acumulada diaria (el pico inicial es 0 = capital de partida).
  let cum = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const d of days) {
    pnl += d.pnl;
    trades += d.trades;
    wins += d.wins;
    losses += d.losses;
    breakeven += d.breakeven;
    grossProfit += d.gross_profit;
    grossLoss += d.gross_loss;
    fees += d.fees;
    rSum += d.r_sum;
    rN += d.r_n;
    if (!best || d.pnl > best.pnl) best = { date: d.date, pnl: round2(d.pnl) };
    if (!worst || d.pnl < worst.pnl) worst = { date: d.date, pnl: round2(d.pnl) };
    cum += d.pnl;
    if (cum > peak) peak = cum;
    const dd = peak - cum;
    if (dd > maxDrawdown) maxDrawdown = dd;
  }

  const wr = trades > 0 ? wins / trades : 0;
  const avgWin = wins > 0 ? grossProfit / wins : null;
  const avgLoss = losses > 0 ? grossLoss / losses : null; // negativo
  const profitFactor = grossLoss < 0 ? grossProfit / Math.abs(grossLoss) : null;
  const expectancy = trades > 0 ? wr * (avgWin ?? 0) - (1 - wr) * Math.abs(avgLoss ?? 0) : null;
  const avgR = rN > 0 ? rSum / rN : null;

  // Racha actual: operaciones consecutivas del mismo signo desde la más reciente.
  let kind = null;
  let n = 0;
  for (const p of recent) {
    const k = p > 0 ? 'win' : p < 0 ? 'loss' : null;
    if (!k) break; // un breakeven corta la racha
    if (!kind) kind = k;
    if (k !== kind) break;
    n += 1;
  }

  return {
    pnl: round2(pnl),
    trades,
    wins,
    losses,
    breakeven,
    win_rate: round2(wr * 100),
    profit_factor: profitFactor === null ? null : round2(profitFactor),
    avg_win: avgWin === null ? null : round2(avgWin),
    avg_loss: avgLoss === null ? null : round2(avgLoss),
    expectancy: expectancy === null ? null : round2(expectancy),
    avg_r: avgR === null ? null : round2(avgR),
    best_day: best,
    worst_day: worst,
    max_drawdown: round2(maxDrawdown),
    current_streak: { kind, n },
    gross_profit: round2(grossProfit),
    gross_loss: round2(grossLoss),
    total_fees: round2(fees),
  };
}

/** P&L de las operaciones más recientes del ámbito (para la racha actual). */
function recentPnls(db, scope, limit = 500) {
  const where = whereClause(scope);
  return db
    .prepare(`SELECT t.pnl FROM trades t WHERE ${where.sql} ORDER BY t.exit_time DESC, t.id DESC LIMIT ?`)
    .all(...where.params, limit)
    .map((r) => Number(r.pnl) || 0);
}

// ---------- Rutas ----------

// GET /api/stats/summary
router.get('/summary', (req, res, next) => {
  try {
    const db = getDb();
    const scope = parseScope(db, req);
    const tzAccount = scope.account || DEFAULT_TZ_ACCOUNT;
    const today = currentTradingDay(tzAccount);
    const week = weekOf(today);
    const month = monthRange(today.slice(0, 7));

    const days = dailyRows(db, scope);
    res.json({
      trading_day: today,
      today: bucketFor(db, scope, today, today),
      week: bucketFor(db, scope, week.start, week.end),
      month: bucketFor(db, scope, month.start, month.end),
      period: computePeriod(days, recentPnls(db, scope)),
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/calendar?month=YYYY-MM  (sin month = mes del trading_day actual)
router.get('/calendar', (req, res, next) => {
  try {
    const db = getDb();
    const scope = parseScope(db, req);
    const tzAccount = scope.account || DEFAULT_TZ_ACCOUNT;
    const month = parseMonthParam(req.query.month) ?? currentTradingDay(tzAccount).slice(0, 7);
    const { start, end } = monthRange(month);

    // El calendario se rige por el mes: ignora from/to.
    const rows = dailyRows(db, scope, { from: start, to: end });
    const days = rows.map((r) => ({ date: r.date, pnl: round2(r.pnl), trades: r.trades, wins: r.wins, losses: r.losses }));

    // Semanas ISO (lunes-domingo) que tocan el mes; los totales solo cuentan días del mes.
    const weeks = [];
    const lastStart = weekOf(end).start;
    for (let ws = weekOf(start).start; ws <= lastStart; ws = addDays(ws, 7)) {
      const w = weekOf(ws);
      const b = sumBucket(rows.filter((r) => r.date >= w.start && r.date <= w.end));
      weeks.push({ week_key: w.key, start: w.start, end: w.end, pnl: b.pnl, trades: b.trades, wins: b.wins, losses: b.losses });
    }

    res.json({ month_key: month, start, end, days, weeks, month: sumBucket(rows) });
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/daily → [{date, pnl, trades, wins, losses, cum_pnl}]
router.get('/daily', (req, res, next) => {
  try {
    const db = getDb();
    const scope = parseScope(db, req);
    let cum = 0;
    const out = dailyRows(db, scope).map((r) => {
      cum += r.pnl;
      return { date: r.date, pnl: round2(r.pnl), trades: r.trades, wins: r.wins, losses: r.losses, cum_pnl: round2(cum) };
    });
    res.json(out);
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/weekly → [{week_key, start, end, pnl, trades, wins, losses, win_rate}]
router.get('/weekly', (req, res, next) => {
  try {
    const db = getDb();
    const scope = parseScope(db, req);
    const byWeek = new Map();
    for (const r of dailyRows(db, scope)) {
      const w = weekOf(r.date);
      let acc = byWeek.get(w.key);
      if (!acc) {
        acc = { week_key: w.key, start: w.start, end: w.end, pnl: 0, trades: 0, wins: 0, losses: 0 };
        byWeek.set(w.key, acc);
      }
      acc.pnl += r.pnl;
      acc.trades += r.trades;
      acc.wins += r.wins;
      acc.losses += r.losses;
    }
    res.json([...byWeek.values()].map((w) => ({ ...w, pnl: round2(w.pnl), win_rate: winRate(w.wins, w.trades) })));
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/monthly → [{month:'YYYY-MM', pnl, trades, wins, losses, win_rate}]
router.get('/monthly', (req, res, next) => {
  try {
    const db = getDb();
    const scope = parseScope(db, req);
    const where = whereClause(scope);
    const rows = db
      .prepare(
        `SELECT substr(t.trading_day, 1, 7) AS month, COALESCE(SUM(t.pnl), 0) AS pnl, COUNT(*) AS trades,
                SUM(CASE WHEN t.pnl > 0 THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN t.pnl < 0 THEN 1 ELSE 0 END) AS losses
         FROM trades t WHERE ${where.sql} GROUP BY substr(t.trading_day, 1, 7) ORDER BY month ASC`,
      )
      .all(...where.params);
    res.json(
      rows.map((r) => {
        const trades = Number(r.trades) || 0;
        const wins = Number(r.wins) || 0;
        return { month: r.month, pnl: round2(r.pnl), trades, wins, losses: Number(r.losses) || 0, win_rate: winRate(wins, trades) };
      }),
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/by-tag → [{tag_id, name, kind, color, trades, wins, losses, pnl, win_rate, avg_pnl}]
router.get('/by-tag', (req, res, next) => {
  try {
    const db = getDb();
    const scope = parseScope(db, req);
    const where = whereClause(scope);
    const rows = db
      .prepare(
        `SELECT tg.id AS tag_id, tg.name, tg.kind, tg.color, COUNT(*) AS trades, COALESCE(SUM(t.pnl), 0) AS pnl,
                SUM(CASE WHEN t.pnl > 0 THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN t.pnl < 0 THEN 1 ELSE 0 END) AS losses
         FROM trades t
         JOIN trade_tags tt ON tt.trade_id = t.id
         JOIN tags tg ON tg.id = tt.tag_id AND tg.user_id = ?
         WHERE ${where.sql}
         GROUP BY tg.id ORDER BY pnl DESC, trades DESC, tg.name ASC`,
      )
      .all(scope.userId, ...where.params);
    res.json(
      rows.map((r) => {
        const trades = Number(r.trades) || 0;
        const wins = Number(r.wins) || 0;
        const pnl = Number(r.pnl) || 0;
        return {
          tag_id: r.tag_id,
          name: r.name,
          kind: r.kind,
          color: r.color,
          trades,
          wins,
          losses: Number(r.losses) || 0,
          pnl: round2(pnl),
          win_rate: winRate(wins, trades),
          avg_pnl: trades > 0 ? round2(pnl / trades) : 0,
        };
      }),
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/by-symbol → [{symbol, trades, wins, losses, pnl, win_rate, avg_pnl}]
router.get('/by-symbol', (req, res, next) => {
  try {
    const db = getDb();
    const scope = parseScope(db, req);
    const where = whereClause(scope);
    const rows = db
      .prepare(
        `SELECT t.symbol, COUNT(*) AS trades, COALESCE(SUM(t.pnl), 0) AS pnl,
                SUM(CASE WHEN t.pnl > 0 THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN t.pnl < 0 THEN 1 ELSE 0 END) AS losses
         FROM trades t WHERE ${where.sql}
         GROUP BY t.symbol ORDER BY pnl DESC, trades DESC, t.symbol ASC`,
      )
      .all(...where.params);
    res.json(
      rows.map((r) => {
        const trades = Number(r.trades) || 0;
        const wins = Number(r.wins) || 0;
        const pnl = Number(r.pnl) || 0;
        return {
          symbol: r.symbol,
          trades,
          wins,
          losses: Number(r.losses) || 0,
          pnl: round2(pnl),
          win_rate: winRate(wins, trades),
          avg_pnl: trades > 0 ? round2(pnl / trades) : 0,
        };
      }),
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/by-weekday → 7 entradas lunes → domingo:
// [{weekday 0..6 (0=domingo), label, pnl, trades, wins, losses, win_rate, avg_pnl}]
router.get('/by-weekday', (req, res, next) => {
  try {
    const db = getDb();
    const scope = parseScope(db, req);
    const acc = new Map(
      WEEKDAY_ORDER.map((wd) => [wd, { weekday: wd, label: WEEKDAY_LABELS[wd], pnl: 0, trades: 0, wins: 0, losses: 0 }]),
    );
    for (const r of dailyRows(db, scope)) {
      const a = acc.get(weekdayOf(r.date));
      a.pnl += r.pnl;
      a.trades += r.trades;
      a.wins += r.wins;
      a.losses += r.losses;
    }
    res.json(
      WEEKDAY_ORDER.map((wd) => {
        const a = acc.get(wd);
        return { ...a, pnl: round2(a.pnl), win_rate: winRate(a.wins, a.trades), avg_pnl: a.trades > 0 ? round2(a.pnl / a.trades) : 0 };
      }),
    );
  } catch (err) {
    next(err);
  }
});

// GET /api/stats/by-hour → [{hour, label, pnl, trades, wins, losses, win_rate, avg_pnl}] (solo horas con operaciones)
// Hora local de entry_time en la zona horaria de la cuenta de cada operación (o America/New_York).
router.get('/by-hour', (req, res, next) => {
  try {
    const db = getDb();
    const scope = parseScope(db, req);
    const where = whereClause(scope);
    const rows = db
      .prepare(
        `SELECT t.entry_time, t.pnl, a.timezone
         FROM trades t JOIN accounts a ON a.id = t.account_id
         WHERE ${where.sql}`,
      )
      .all(...where.params);

    const acc = new Map();
    for (const r of rows) {
      const date = new Date(r.entry_time);
      if (Number.isNaN(date.getTime())) continue;
      let hour;
      try {
        hour = localParts(date, r.timezone || DEFAULT_TZ_ACCOUNT.timezone).hour;
      } catch {
        hour = localParts(date, DEFAULT_TZ_ACCOUNT.timezone).hour;
      }
      let a = acc.get(hour);
      if (!a) {
        a = { hour, label: `${pad(hour)}:00`, pnl: 0, trades: 0, wins: 0, losses: 0 };
        acc.set(hour, a);
      }
      const pnl = Number(r.pnl) || 0;
      a.pnl += pnl;
      a.trades += 1;
      if (pnl > 0) a.wins += 1;
      else if (pnl < 0) a.losses += 1;
    }
    res.json(
      [...acc.values()]
        .sort((x, y) => x.hour - y.hour)
        .map((a) => ({ ...a, pnl: round2(a.pnl), win_rate: winRate(a.wins, a.trades), avg_pnl: a.trades > 0 ? round2(a.pnl / a.trades) : 0 })),
    );
  } catch (err) {
    next(err);
  }
});

export default router;

// GET /api/stats/by-bias?account_id -> operaciones a favor / en contra / neutral del sesgo del Radar (privado).
router.get('/by-bias', requireRadarAccess, (req, res, next) => {
  try {
    const db = getDb();
    const scope = parseScope(db, req);
    const where = whereClause(scope);
    const rows = db
      .prepare(
        `SELECT t.bias_alignment AS alignment, COUNT(*) AS trades, SUM(t.pnl) AS pnl,
                SUM(CASE WHEN t.pnl > 0 THEN 1 ELSE 0 END) AS wins,
                AVG(CASE WHEN t.risk_amount > 0 THEN t.pnl / t.risk_amount END) AS avg_r
         FROM trades t WHERE ${where.sql} AND t.bias_alignment IS NOT NULL
         GROUP BY t.bias_alignment`,
      )
      .all(...where.params);
    const order = ['a_favor', 'en_contra', 'neutral'];
    const out = order.map((a) => {
      const r = rows.find((x) => x.alignment === a);
      return {
        alignment: a,
        trades: r ? r.trades : 0,
        pnl: r ? round2(r.pnl) : 0,
        win_rate: r && r.trades ? round2((100 * r.wins) / r.trades) : 0,
        avg_r: r && r.avg_r !== null ? round2(r.avg_r) : null,
      };
    });
    res.json(out);
  } catch (err) {
    next(err);
  }
});
