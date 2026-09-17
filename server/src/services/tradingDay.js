// Cálculo del "día de trading" de una cuenta.
// Un día de trading empieza a la hora local `day_reset_hour` en la zona `timezone`.
// Ej.: futuros (America/New_York, reset 17): domingo 18:00 ET pertenece al LUNES.
// Sin librerías externas: se usa Intl.DateTimeFormat.

const fmtCache = new Map();

function getFormatter(timezone) {
  let f = fmtCache.get(timezone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmtCache.set(timezone, f);
  }
  return f;
}

function normalize(account = {}) {
  const timezone = account.timezone || 'America/New_York';
  let hour = Number(account.day_reset_hour);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) hour = 17;
  // Validar zona horaria; si es inválida se usa New York.
  try {
    getFormatter(timezone);
    return { timezone, day_reset_hour: hour };
  } catch {
    return { timezone: 'America/New_York', day_reset_hour: hour };
  }
}

/** Partes de fecha/hora locales de un instante en una zona horaria. */
export function localParts(date, timezone) {
  const parts = getFormatter(timezone).formatToParts(date);
  const out = {};
  for (const p of parts) if (p.type !== 'literal') out[p.type] = Number(p.value);
  if (out.hour === 24) out.hour = 0;
  return { year: out.year, month: out.month, day: out.day, hour: out.hour, minute: out.minute, second: out.second };
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function ymd(y, m, d) {
  return `${y}-${pad(m)}-${pad(d)}`;
}

/** Suma días a una fecha 'YYYY-MM-DD' (aritmética en UTC, sin zonas). */
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86400000;
  const dt = new Date(t);
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Día de la semana (0=domingo..6=sábado) de 'YYYY-MM-DD'. */
export function weekdayOf(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Offset (ms) de la zona horaria respecto a UTC en un instante dado.
 * offset = hora local interpretada como UTC - instante real.
 */
function tzOffsetMs(date, timezone) {
  const p = localParts(date, timezone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Convierte una hora local (Y,M,D,h,m,s en `timezone`) al instante UTC correspondiente.
 * Itera dos veces para absorber cambios de horario de verano.
 */
export function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, timezone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = wall - tzOffsetMs(new Date(wall), timezone);
  guess = wall - tzOffsetMs(new Date(guess), timezone);
  return new Date(guess);
}

/**
 * Día de trading ('YYYY-MM-DD') al que pertenece el instante `isoUtc` para la cuenta.
 * Si la hora local >= day_reset_hour, cuenta como el día siguiente.
 */
export function tradingDayFor(isoUtc, account = {}) {
  const { timezone, day_reset_hour } = normalize(account);
  const date = isoUtc instanceof Date ? isoUtc : new Date(isoUtc);
  if (Number.isNaN(date.getTime())) throw new Error('Fecha inválida para calcular el día de trading.');
  const p = localParts(date, timezone);
  const local = ymd(p.year, p.month, p.day);
  if (day_reset_hour > 0 && p.hour >= day_reset_hour) return addDays(local, 1);
  return local;
}

/** Día de trading actual de la cuenta. */
export function currentTradingDay(account = {}) {
  return tradingDayFor(new Date(), account);
}

/**
 * Instante UTC (ISO) en que EMPIEZA el día de trading `tradingDay` para la cuenta,
 * es decir, el reset anterior: (tradingDay - 1 día) a las day_reset_hour si reset > 0,
 * o tradingDay a las 00:00 si reset == 0.
 */
export function tradingDayStartIso(tradingDay, account = {}) {
  const { timezone, day_reset_hour } = normalize(account);
  const base = day_reset_hour > 0 ? addDays(tradingDay, -1) : tradingDay;
  const [year, month, day] = base.split('-').map(Number);
  return zonedTimeToUtc({ year, month, day, hour: day_reset_hour }, timezone).toISOString();
}

/**
 * ISO UTC del próximo instante en que cambia el día de trading (fin del día actual).
 * Sirve como lock_until del bloqueo diario.
 */
export function nextResetIso(account = {}, now = new Date()) {
  const today = tradingDayFor(now, account);
  return tradingDayStartIso(addDays(today, 1), account);
}

/** Semana (lunes a domingo) del día de trading dado. */
export function weekOf(tradingDay) {
  const wd = weekdayOf(tradingDay); // 0 domingo
  const offsetToMonday = (wd + 6) % 7; // lunes=0 ... domingo=6
  const start = addDays(tradingDay, -offsetToMonday);
  const end = addDays(start, 6);
  return { start, end, key: isoWeekKey(start) };
}

/** Clave ISO 8601 'YYYY-Www' de la semana que contiene `dateStr`. */
export function isoWeekKey(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dayNum = date.getUTCDay() || 7; // lunes=1..domingo=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum); // jueves de la semana
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${pad(week)}`;
}

/** ISO UTC del primer reset del próximo lunes (inicio de la próxima semana de trading). */
export function nextWeekResetIso(account = {}, now = new Date()) {
  const today = tradingDayFor(now, account);
  const { end } = weekOf(today);
  const nextMonday = addDays(end, 1);
  return tradingDayStartIso(nextMonday, account);
}
