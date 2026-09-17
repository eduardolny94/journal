// Tipos del contrato GET /api/stats/* y utilidades del Dashboard (rangos, query strings, formatos cortos).
import { qs } from '../../lib/api';
import { fmtNum, todayYmd } from '../../lib/format';

// ---------- Respuestas de la API ----------

export interface StatsBucket {
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
}

export interface DayRef {
  date: string;
  pnl: number;
}

export interface PeriodStats extends StatsBucket {
  breakeven: number;
  /** Porcentaje 0-100 */
  win_rate: number;
  profit_factor: number | null;
  avg_win: number | null;
  /** Negativo */
  avg_loss: number | null;
  expectancy: number | null;
  avg_r: number | null;
  best_day: DayRef | null;
  worst_day: DayRef | null;
  max_drawdown: number;
  current_streak: { kind: 'win' | 'loss' | null; n: number };
  gross_profit: number;
  gross_loss: number;
  total_fees: number;
}

export interface StatsSummary {
  trading_day: string;
  today: StatsBucket;
  week: StatsBucket;
  month: StatsBucket;
  period: PeriodStats;
}

export interface DailyPoint extends StatsBucket {
  date: string;
  cum_pnl: number;
}

export interface CalendarDay extends StatsBucket {
  date: string;
}

export interface CalendarWeek extends StatsBucket {
  week_key: string;
  start: string;
  end: string;
}

export interface CalendarData {
  month_key: string;
  start: string;
  end: string;
  days: CalendarDay[];
  weeks: CalendarWeek[];
  month: StatsBucket;
}

export interface BreakdownBase extends StatsBucket {
  /** Porcentaje 0-100 */
  win_rate: number;
  avg_pnl: number;
}

export interface TagStat extends BreakdownBase {
  tag_id: number;
  name: string;
  kind: string | null;
  color: string | null;
}

export interface SymbolStat extends BreakdownBase {
  symbol: string;
}

export interface WeekdayStat extends BreakdownBase {
  weekday: number;
  label: string;
}

export interface HourStat extends BreakdownBase {
  hour: number;
  label: string;
}

// ---------- Rango de fechas del Dashboard ----------

export type RangeKey = 'month' | '30d' | '90d' | 'year' | 'all';

export const DEFAULT_RANGE: RangeKey = 'month';

export const RANGE_OPTIONS: ReadonlyArray<{ value: RangeKey; label: string }> = [
  { value: 'month', label: 'Este mes' },
  { value: '30d', label: '30 días' },
  { value: '90d', label: '90 días' },
  { value: 'year', label: 'Este año' },
  { value: 'all', label: 'Todo' },
];

const RANGE_KEYS = new Set<string>(RANGE_OPTIONS.map((o) => o.value));

export function isRangeKey(v: string | null | undefined): v is RangeKey {
  return typeof v === 'string' && RANGE_KEYS.has(v);
}

/** Etiqueta larga del rango para títulos ("Últimos 30 días"). */
export function periodLabel(range: RangeKey): string {
  switch (range) {
    case 'month':
      return 'Este mes';
    case '30d':
      return 'Últimos 30 días';
    case '90d':
      return 'Últimos 90 días';
    case 'year':
      return 'Este año';
    case 'all':
      return 'Todo el historial';
  }
}

/** Suma días a 'YYYY-MM-DD' (aritmética UTC, sin desfases de zona). */
export function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export interface DateBounds {
  from: string | null;
  to: string | null;
}

/**
 * Límites del rango. `to` se deja abierto para incluir el día de trading actual aunque,
 * por la hora de reset de la cuenta, vaya un día por delante de la fecha local.
 */
export function rangeBounds(range: RangeKey, today: string = todayYmd()): DateBounds {
  switch (range) {
    case 'month':
      return { from: `${today.slice(0, 7)}-01`, to: null };
    case '30d':
      return { from: addDaysYmd(today, -29), to: null };
    case '90d':
      return { from: addDaysYmd(today, -89), to: null };
    case 'year':
      return { from: `${today.slice(0, 4)}-01-01`, to: null };
    case 'all':
      return { from: null, to: null };
  }
}

/** Query string común de /api/stats/* (cuenta global + rango). */
export function statsQuery(accountId: number | null, bounds: DateBounds): string {
  return qs({ account_id: accountId, from: bounds.from, to: bounds.to });
}

// ---------- Cálculos y formatos cortos ----------

/** Win rate en porcentaje 0-100 de un bucket (0 si no hay operaciones). */
export function winRateOf(b: StatsBucket | null | undefined): number {
  if (!b || b.trades <= 0) return 0;
  return (b.wins / b.trades) * 100;
}

/** Número con signo y 2 decimales, sin símbolo de moneda ("+1.234,50"). */
export function fmtSigned(n: number | null | undefined, decimals = 2): string {
  const v = Number(n ?? 0);
  const sign = v > 0 ? '+' : v < 0 ? '-' : '';
  return `${sign}${fmtNum(Math.abs(v), decimals)}`;
}

/** Valor compacto para ejes ("1,2k", "-350"). */
export function fmtAxisMoney(n: number): string {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1_000_000) return `${fmtNum(v / 1_000_000, 1)}M`;
  if (Math.abs(v) >= 1000) return `${fmtNum(v / 1000, 1)}k`;
  return fmtNum(v, 0);
}

/** Plural sencillo: "1 operación" / "12 operaciones". */
export function fmtTrades(n: number): string {
  return `${fmtNum(n, 0)} ${n === 1 ? 'operación' : 'operaciones'}`;
}

/** Primera letra en mayúscula ("miércoles, 2 de septiembre" → "Miércoles, 2 de septiembre"). */
export function capitalizeFirst(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/** Mes 'YYYY-MM' de la fecha local actual. */
export function currentMonthKey(): string {
  return todayYmd().slice(0, 7);
}

/** Desplaza un mes 'YYYY-MM' en `delta` meses. */
export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}`;
}

/** Colores de los gráficos (coinciden con tailwind.config.js). */
export const CHART_COLORS = {
  profit: '#22c55e',
  loss: '#ef4444',
  accent: '#16f57a',
  bg: '#0b0f17',
  panel: '#121826',
  border: '#1f2937',
  grid: '#1f2937',
  zero: '#4b5563',
  tick: '#9ca3af',
  muted: '#6b7280',
} as const;

/** rgba() a partir de un hex #rrggbb. */
export function rgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}
