// Datos de ejemplo (seed): usuario demo, 2 cuentas de prop firm, ~120 operaciones realistas en los
// últimos 75 días laborables, etiquetas asignadas de forma coherente y ~30 notas de diario con estado
// de ánimo. Es DETERMINISTA (PRNG con semilla fija) e IDEMPOTENTE: si el usuario demo ya existe,
// avisa y no duplica nada.
//
// Uso:  npm run seed            (desde la raíz o desde server/)
//       JOURNAL_DB=/ruta/otra.db node scripts/seed.js
import bcrypt from 'bcryptjs';
import { closeDb, getDb, getDbPath } from '../src/db.js';
import {
  addDays,
  currentTradingDay,
  localParts,
  tradingDayFor,
  weekOf,
  weekdayOf,
  zonedTimeToUtc,
} from '../src/services/tradingDay.js';
import { evaluateAccountRisk } from '../src/services/risk.js';

const DEMO_USER = { email: 'demo@journal.com', password: 'demo1234', name: 'Trader Demo' };
const TZ = 'America/New_York';
const BUSINESS_DAYS = 75;
const DIARY_NOTES_TARGET = 30;
const SEED = 20250917;

// ---------- PRNG determinista (mulberry32) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);
const rnd = (min, max) => min + rand() * (max - min);
const rint = (min, max) => Math.floor(rnd(min, max + 1));
const chance = (p) => rand() < p;
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
/** Elige según pesos: [[item, peso], ...]. */
function weighted(entries) {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [item, w] of entries) {
    r -= w;
    if (r < 0) return item;
  }
  return entries[entries.length - 1][0];
}

const round2 = (n) => Math.round(n * 100) / 100;
const roundTo = (n, step) => Number((Math.round(n / step) * step).toFixed(4));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

// ---------- Datos base ----------
const ACCOUNTS = [
  {
    name: 'Lucid Trading 50K',
    firm: 'Lucid Trading',
    platform: 'tradovate',
    account_type: 'evaluacion',
    size: 50000,
    currency: 'USD',
    timezone: TZ,
    day_reset_hour: 17,
    daily_max_loss: 1000,
    weekly_max_loss: 2500,
    max_trades_per_day: 6,
    weight: 60,
  },
  {
    name: 'Topstep 100K',
    firm: 'Topstep',
    platform: 'projectx',
    account_type: 'evaluacion',
    size: 100000,
    currency: 'USD',
    timezone: TZ,
    day_reset_hour: 17,
    daily_max_loss: 2000,
    weekly_max_loss: null,
    max_trades_per_day: null,
    weight: 40,
  },
];

// pointValue = $ por punto y contrato; tick = tamaño mínimo de precio; fee = comisión ida y vuelta por contrato.
const INSTRUMENTS = {
  MNQ: { pointValue: 2, tick: 0.25, fee: 1.34, base: 20800, qty: [2, 6], scale: 0.7, weight: 32 },
  NQ: { pointValue: 20, tick: 0.25, fee: 4.5, base: 20800, qty: [1, 2], scale: 1.25, weight: 18 },
  ES: { pointValue: 50, tick: 0.25, fee: 4.5, base: 5900, qty: [1, 2], scale: 1.2, weight: 16 },
  MES: { pointValue: 5, tick: 0.25, fee: 1.34, base: 5900, qty: [2, 6], scale: 0.65, weight: 14 },
  GC: { pointValue: 100, tick: 0.1, fee: 5, base: 2950, qty: [1, 1], scale: 1.1, weight: 10 },
  CL: { pointValue: 1000, tick: 0.01, fee: 5, base: 72, qty: [1, 2], scale: 1, weight: 10 },
};
const SYMBOL_WEIGHTS = Object.entries(INSTRUMENTS).map(([s, i]) => [s, i.weight]);

const TAGS = [
  { name: 'Ruptura', kind: 'patron', color: '#3b82f6' },
  { name: 'Reversión 10am', kind: 'patron', color: '#8b5cf6' },
  { name: 'Barrido de liquidez', kind: 'patron', color: '#06b6d4' },
  { name: 'Pullback', kind: 'patron', color: '#14b8a6' },
  { name: 'FOMO', kind: 'error', color: '#ef4444' },
  { name: 'Sobreoperar', kind: 'error', color: '#f97316' },
  { name: 'Mover el stop', kind: 'error', color: '#dc2626' },
  { name: 'Apertura NY', kind: 'setup', color: '#f59e0b' },
  { name: 'Calmado', kind: 'emocion', color: '#22c55e' },
  { name: 'Ansioso', kind: 'emocion', color: '#eab308' },
];

const NOTES_WIN = [
  'Esperé la confirmación y ejecuté el plan sin dudar.',
  'Entrada limpia en el retroceso; gestión según plan.',
  'Buen ratio riesgo/beneficio, salida parcial en el primer objetivo.',
  'Operación de manual: paciencia en la apertura y dejar correr.',
  'Respeté el stop y el objetivo. Nada que corregir.',
  'Volumen alto en la ruptura, el precio no miró atrás.',
];
const NOTES_LOSS = [
  'Entré antes de la confirmación. El stop era correcto, la idea también.',
  'Mercado lateral, no debí operar en este rango.',
  'Noticia inesperada, salí por stop. Aceptado.',
  'La estructura era buena pero el timing no. Pérdida controlada.',
];
const NOTES_BY_ERROR = {
  FOMO: 'Entré por FOMO tras un movimiento fuerte. Sin setup real.',
  Sobreoperar: 'Operación de más tras dos pérdidas seguidas: sobreoperé y lo sabía.',
  'Mover el stop': 'Moví el stop dos veces. Error de disciplina claro.',
};

const DIARY = {
  excelente: [
    'Día redondo. Solo operé mis setups y respeté el plan de principio a fin.',
    'Gran sesión: paciencia en la apertura y ejecución limpia. Así es como quiero operar siempre.',
  ],
  bien: [
    'Día positivo. Alguna entrada precipitada, pero la gestión compensó.',
    'Buen día en general. Objetivo: reducir el tamaño en la segunda operación.',
    'Cerré en verde sin forzar nada. Mañana, misma rutina.',
  ],
  neutral: [
    'Día plano. Poca volatilidad, mejor no insistir.',
    'Sin apenas oportunidades claras. Cerré temprano y repasé gráficos.',
  ],
  mal: [
    'Día en rojo. Entré tarde en la primera y perseguí el precio en la segunda.',
    'Perdí por no esperar la confirmación. Revisar la checklist antes de cada entrada.',
    'Mercado errático y yo también. Bajar el tamaño la próxima sesión.',
  ],
  terrible: [
    'Día muy malo. Rompí mis reglas: moví el stop y sobreoperé. Mañana no opero antes de las 10.',
    'Racha de pérdidas y tilt. Paro y hago revisión completa del plan.',
  ],
};

// ---------- Generadores ----------

/** Últimos `n` días laborables (lunes-viernes) por fecha de calendario en Nueva York, ascendente. */
function businessDays(n) {
  const now = localParts(new Date(), TZ);
  let cursor = ymd(now.year, now.month, now.day);
  const days = [];
  while (days.length < n) {
    const wd = weekdayOf(cursor);
    if (wd >= 1 && wd <= 5) days.unshift(cursor);
    cursor = addDays(cursor, -1);
  }
  return days;
}

/** Minuto del día (ET) de la primera entrada: sesgo hacia la apertura. */
function firstEntryMinute(count) {
  const r = rand();
  if (count >= 3 || r < 0.5) return rint(570, 660); // 9:30-11:00
  if (r < 0.8) return rint(660, 780); // 11:00-13:00
  return rint(780, 880); // 13:00-14:40
}

/** Duración en minutos (2-90) con sesgo a operaciones cortas. */
function genDuration() {
  const r = rand();
  if (r < 0.3) return rint(2, 10);
  if (r < 0.7) return rint(10, 30);
  return rint(30, 90);
}

/**
 * P&L bruto/neto de una operación. ~52 % ganadoras; ganadoras 30-900 con cola larga,
 * perdedoras -30..-450. Redondeado a múltiplos del valor del tick. `forceWin` obliga a ganar.
 */
function genPnl(inst, qty, winProb, forceWin) {
  const win = forceWin || chance(winProb);
  let gross = win ? 30 + 870 * rand() ** 2.6 : -(30 + 420 * rand() ** 1.8);
  gross *= inst.scale * rnd(0.85, 1.15);
  const tickValue = inst.pointValue * inst.tick * qty;
  gross = roundTo(gross, tickValue);
  if (gross === 0) gross = win ? tickValue : -tickValue;
  const fees = round2(inst.fee * qty);
  let net = round2(gross - fees);
  if (net > 900) {
    gross = roundTo(900 - rnd(0, 80) + fees, tickValue);
    net = round2(gross - fees);
  }
  if (net < -450) {
    gross = roundTo(-450 + rnd(0, 80) + fees, tickValue);
    net = round2(gross - fees);
  }
  return { gross, fees, net };
}

/** Etiquetas coherentes con el resultado: patrón, setup, error (sobre todo en pérdidas grandes) y emoción. */
function chooseTags(tagIdByName, { net, entryMin, index }) {
  const names = [];
  if (chance(0.85)) {
    const isTenAm = entryMin >= 590 && entryMin <= 625;
    names.push(
      isTenAm && chance(0.6)
        ? 'Reversión 10am'
        : weighted([
            ['Ruptura', 35],
            ['Pullback', 30],
            ['Barrido de liquidez', 25],
            ['Reversión 10am', 10],
          ]),
    );
  }
  if (entryMin < 630 && chance(0.75)) names.push('Apertura NY');

  let error = null;
  if (net < -200) {
    if (chance(0.75)) error = index >= 2 && chance(0.5) ? 'Sobreoperar' : pick(['FOMO', 'Mover el stop']);
  } else if (net < 0) {
    if (chance(0.2)) error = pick(['FOMO', 'Sobreoperar', 'Mover el stop']);
  } else if (chance(0.05)) {
    error = 'FOMO';
  }
  if (error) names.push(error);

  if (net > 0 && chance(0.4)) names.push('Calmado');
  else if (net < 0 && chance(error ? 0.6 : 0.3)) names.push('Ansioso');

  return { ids: names.map((n) => tagIdByName.get(n)), error };
}

function genRating(net, error) {
  if (net > 0) return weighted([[3, 25], [4, 45], [5, 30]]);
  if (error) return weighted([[1, 50], [2, 40], [3, 10]]);
  return weighted([[2, 30], [3, 45], [4, 25]]);
}

function genNote(net, error) {
  if (!chance(0.35)) return '';
  if (net > 0) return pick(NOTES_WIN);
  if (error && NOTES_BY_ERROR[error]) return NOTES_BY_ERROR[error];
  return pick(NOTES_LOSS);
}

function moodFor(pnl) {
  if (pnl > 400) return chance(0.8) ? 'excelente' : 'bien';
  if (pnl > 0) return chance(0.75) ? 'bien' : 'neutral';
  if (pnl === 0) return 'neutral';
  if (pnl > -300) return chance(0.7) ? 'mal' : 'neutral';
  return chance(0.7) ? 'terrible' : 'mal';
}

// ---------- Main ----------
async function main() {
  const db = getDb();
  console.log(`[seed] Base de datos: ${getDbPath()}`);

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_USER.email);
  if (existing) {
    console.log(`[seed] AVISO: el usuario demo ${DEMO_USER.email} ya existe (id ${existing.id}). No se crea nada para no duplicar.`);
    console.log('[seed] Para regenerar los datos de ejemplo, borra el archivo de la base de datos y vuelve a ejecutar el seed.');
    closeDb();
    return;
  }

  const passwordHash = await bcrypt.hash(DEMO_USER.password, 10);

  const insertUser = db.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)');
  const insertAccount = db.prepare(
    `INSERT INTO accounts (user_id, name, firm, platform, account_type, size, currency, timezone, day_reset_hour,
       daily_max_loss, weekly_max_loss, max_trades_per_day)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const insertTag = db.prepare('INSERT INTO tags (user_id, name, kind, color) VALUES (?, ?, ?, ?)');
  const insertTrade = db.prepare(
    `INSERT INTO trades (user_id, account_id, symbol, side, qty, entry_price, exit_price, entry_time, exit_time,
       trading_day, pnl, fees, risk_amount, rating, notes, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')`,
  );
  const insertTradeTag = db.prepare('INSERT OR IGNORE INTO trade_tags (trade_id, tag_id) VALUES (?, ?)');
  const insertNote = db.prepare('INSERT INTO daily_notes (user_id, date, content, mood) VALUES (?, ?, ?, ?)');

  const stats = { trades: 0, wins: 0, pnl: 0, fees: 0, tagLinks: 0, notes: 0, perAccount: new Map(), first: null, last: null };
  let userId;
  let accounts;

  db.exec('BEGIN');
  try {
    userId = Number(insertUser.run(DEMO_USER.email, passwordHash, DEMO_USER.name).lastInsertRowid);

    accounts = ACCOUNTS.map((a) => {
      const id = Number(
        insertAccount.run(
          userId,
          a.name,
          a.firm,
          a.platform,
          a.account_type,
          a.size,
          a.currency,
          a.timezone,
          a.day_reset_hour,
          a.daily_max_loss,
          a.weekly_max_loss,
          a.max_trades_per_day,
        ).lastInsertRowid,
      );
      stats.perAccount.set(id, { name: a.name, trades: 0, pnl: 0 });
      return { ...a, id };
    });
    const accountWeights = accounts.map((a) => [a, a.weight]);

    const tagIdByName = new Map();
    for (const t of TAGS) {
      tagIdByName.set(t.name, Number(insertTag.run(userId, t.name, t.kind, t.color).lastInsertRowid));
    }

    // Guardas para que el seed NO deje las cuentas bloqueadas (día/semana de trading actuales).
    const currentDay = currentTradingDay({ timezone: TZ, day_reset_hour: 17 });
    const currentWeek = weekOf(currentDay);
    const nowNY = localParts(new Date(), TZ);
    const todayCalendar = ymd(nowNY.year, nowNY.month, nowNY.day);
    const dayPnl = new Map(); // `${accountId}|${tradingDay}` -> pnl
    const weekPnl = new Map(); // accountId -> pnl de la semana actual
    const dayTotals = new Map(); // tradingDay -> pnl total (para el diario)

    const needsForcedWin = (account, tradingDay) => {
      const key = `${account.id}|${tradingDay}`;
      const dp = dayPnl.get(key) || 0;
      const wp = weekPnl.get(account.id) || 0;
      const inCurrentWeek = tradingDay >= currentWeek.start && tradingDay <= currentWeek.end;
      if (account.daily_max_loss && tradingDay === currentDay && dp <= -account.daily_max_loss * 0.6) return true;
      if (account.weekly_max_loss && inCurrentWeek && wp <= -account.weekly_max_loss * 0.7) return true;
      return false;
    };

    for (const day of businessDays(BUSINESS_DAYS)) {
      const isToday = day === todayCalendar;
      if (!isToday && chance(0.25)) continue; // día sin operar
      const count = isToday
        ? rint(1, 2)
        : weighted([
            [1, 30],
            [2, 35],
            [3, 25],
            [4, 10],
          ]);
      const [year, month, dom] = day.split('-').map(Number);
      const dayBias = rnd(-0.12, 0.12); // "humor" del día: crea rachas creíbles
      let minute = firstEntryMinute(count);

      for (let i = 0; i < count; i++) {
        const account = weighted(accountWeights);
        const symbol = weighted(SYMBOL_WEIGHTS);
        const inst = INSTRUMENTS[symbol];
        const qty = rint(inst.qty[0], inst.qty[1]);
        const side = chance(0.55) ? 'long' : 'short';

        const entryMin = Math.min(minute, 900); // nunca después de las 15:00
        const exitMin = Math.min(entryMin + genDuration(), 958);
        const entry = zonedTimeToUtc({ year, month, day: dom, hour: Math.floor(entryMin / 60), minute: entryMin % 60, second: rint(0, 59) }, TZ);
        const exit = zonedTimeToUtc({ year, month, day: dom, hour: Math.floor(exitMin / 60), minute: exitMin % 60, second: rint(0, 59) }, TZ);
        minute = exitMin + rint(3, 45);

        const tradingDay = tradingDayFor(exit, account);
        const { gross, fees, net } = genPnl(inst, qty, 0.52 + dayBias, needsForcedWin(account, tradingDay));

        const entryPrice = roundTo(inst.base * rnd(0.97, 1.03), inst.tick);
        const points = gross / (inst.pointValue * qty);
        const exitPrice = roundTo(side === 'long' ? entryPrice + points : entryPrice - points, inst.tick);

        const riskAmount = roundTo(rnd(100, 400), 25);
        const { ids: tagIds, error } = chooseTags(tagIdByName, { net, entryMin, index: i });
        const rating = genRating(net, error);
        const note = genNote(net, error);

        const tradeId = Number(
          insertTrade.run(
            userId,
            account.id,
            symbol,
            side,
            qty,
            entryPrice,
            exitPrice,
            entry.toISOString(),
            exit.toISOString(),
            tradingDay,
            net,
            fees,
            riskAmount,
            rating,
            note,
          ).lastInsertRowid,
        );
        for (const tagId of tagIds) {
          insertTradeTag.run(tradeId, tagId);
          stats.tagLinks += 1;
        }

        // Estadísticas y guardas
        const key = `${account.id}|${tradingDay}`;
        dayPnl.set(key, (dayPnl.get(key) || 0) + net);
        if (tradingDay >= currentWeek.start && tradingDay <= currentWeek.end) {
          weekPnl.set(account.id, (weekPnl.get(account.id) || 0) + net);
        }
        dayTotals.set(tradingDay, (dayTotals.get(tradingDay) || 0) + net);
        stats.trades += 1;
        if (net > 0) stats.wins += 1;
        stats.pnl += net;
        stats.fees += fees;
        const pa = stats.perAccount.get(account.id);
        pa.trades += 1;
        pa.pnl += net;
        if (!stats.first || tradingDay < stats.first) stats.first = tradingDay;
        if (!stats.last || tradingDay > stats.last) stats.last = tradingDay;
      }
    }

    // Notas de diario (~30 días con operaciones), con estado de ánimo coherente con el P&L del día.
    for (const [date, pnl] of [...dayTotals.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
      if (stats.notes >= DIARY_NOTES_TARGET) break;
      if (!chance(0.6)) continue;
      const mood = moodFor(round2(pnl));
      insertNote.run(userId, date, pick(DIARY[mood]), mood);
      stats.notes += 1;
    }

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // Evaluar el riesgo de cada cuenta (aplica bloqueos automáticos si procede y calcula el estado).
  const statuses = accounts.map((a) => ({ account: a, status: evaluateAccountRisk(db, a.id) }));

  // ---------- Resumen ----------
  const winRate = stats.trades ? (stats.wins / stats.trades) * 100 : 0;
  console.log('');
  console.log('[seed] Datos de ejemplo creados correctamente.');
  console.log(`  Usuario:    ${DEMO_USER.name} <${DEMO_USER.email}> (id ${userId}) · contraseña: ${DEMO_USER.password}`);
  console.log('  Cuentas:');
  for (const { account, status } of statuses) {
    const pa = stats.perAccount.get(account.id);
    const lock = status?.locked ? ` · BLOQUEADA (${status.lock_reason})` : ' · sin bloqueo';
    console.log(
      `    - #${account.id} ${account.name} (${account.firm}, ${account.platform}) · ${pa.trades} operaciones · P&L ${round2(pa.pnl).toFixed(2)} USD` +
        ` · hoy ${status?.today_pnl?.toFixed(2) ?? '0.00'} (${status?.today_trades ?? 0} op.)${lock}`,
    );
  }
  console.log(`  Operaciones: ${stats.trades} (${stats.wins} ganadoras · win rate ${winRate.toFixed(1)} %)`);
  console.log(`  P&L neto:    ${round2(stats.pnl).toFixed(2)} USD · comisiones ${round2(stats.fees).toFixed(2)} USD`);
  console.log(`  Rango:       ${stats.first} → ${stats.last} (últimos ${BUSINESS_DAYS} días laborables)`);
  console.log(`  Etiquetas:   ${TAGS.length} (${stats.tagLinks} asignaciones) · Notas de diario: ${stats.notes}`);
  console.log('');

  closeDb();
}

main().catch((err) => {
  console.error('[seed] Error:', err);
  closeDb();
  process.exit(1);
});
