// Calendario mensual de P&L (estilo TradeZella): un cuadro por día con P&L y nº de operaciones,
// totales por semana a la derecha y total del mes en la cabecera. Clic en un día → /operaciones?from&to.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { api, qs } from '../lib/api';
import { cn } from '../lib/cn';
import { fmtDate, fmtMoney, fmtNum, fmtPct, pnlClass, todayYmd } from '../lib/format';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { Spinner } from './ui/Spinner';
import { Skeleton } from './stats/Skeleton';
import {
  CHART_COLORS,
  addDaysYmd,
  currentMonthKey,
  fmtSigned,
  fmtTrades,
  pad2,
  rgba,
  shiftMonth,
  winRateOf,
  type CalendarData,
  type CalendarDay,
  type StatsBucket,
} from './stats/types';

const WEEKDAY_HEAD = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const CELL = 'h-[4.25rem]';

export interface CalendarPnlProps {
  accountId: number | null;
  currency: string;
  /** Cambiar este valor fuerza una recarga (p. ej. tras registrar una operación). */
  reloadKey?: number;
  className?: string;
}

interface WeekRow {
  start: string;
  days: string[];
}

/** Lunes de la semana de una fecha 'YYYY-MM-DD'. */
function mondayOf(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
  return addDaysYmd(ymd, -((wd + 6) % 7));
}

/** Semanas (lunes → domingo) que tocan el mes. */
function buildWeeks(month: string): WeekRow[] {
  const [y, m] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const end = `${month}-${pad2(lastDay)}`;
  const weeks: WeekRow[] = [];
  for (let ws = mondayOf(`${month}-01`); ws <= end; ws = addDaysYmd(ws, 7)) {
    weeks.push({ start: ws, days: Array.from({ length: 7 }, (_, i) => addDaysYmd(ws, i)) });
  }
  return weeks;
}

function sumDays(days: CalendarDay[]): StatsBucket {
  const b: StatsBucket = { pnl: 0, trades: 0, wins: 0, losses: 0 };
  for (const d of days) {
    b.pnl += d.pnl;
    b.trades += d.trades;
    b.wins += d.wins;
    b.losses += d.losses;
  }
  return b;
}

/** Importe corto para las celdas: 2 decimales salvo cifras muy grandes. */
function cellAmount(n: number): string {
  return fmtSigned(n, Math.abs(n) >= 100_000 ? 0 : 2);
}

export function CalendarPnl({ accountId, currency, reloadKey = 0, className }: CalendarPnlProps) {
  const navigate = useNavigate();
  const [month, setMonth] = useState<string>(currentMonthKey);
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    api<CalendarData>(`/stats/calendar${qs({ month, account_id: accountId })}`, { signal: ctrl.signal })
      .then((res) => {
        if (!ctrl.signal.aborted) setData(res);
      })
      .catch((err: Error) => {
        if (ctrl.signal.aborted || err.name === 'AbortError') return;
        setError(err.message || 'No se pudo cargar el calendario.');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [month, accountId, reloadKey, retry]);

  // Solo se usa la respuesta si corresponde al mes mostrado (evita pintar datos de otro mes).
  const current = data && data.month_key === month ? data : null;
  const weeks = useMemo(() => buildWeeks(month), [month]);
  const dayMap = useMemo(() => new Map((current?.days ?? []).map((d) => [d.date, d])), [current]);
  const weekMap = useMemo(() => new Map((current?.weeks ?? []).map((w) => [w.start, w])), [current]);
  const maxAbs = useMemo(() => (current ? current.days.reduce((m, d) => Math.max(m, Math.abs(d.pnl)), 0) : 0), [current]);
  const total = current?.month ?? null;
  const today = todayYmd();
  const thisMonth = currentMonthKey();

  const openDay = useCallback(
    (date: string) => {
      navigate(`/operaciones${qs({ from: date, to: date })}`);
    },
    [navigate],
  );

  return (
    <Card flush className={cn('min-w-0', className)}>
      {/* Cabecera: navegación + total del mes */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-3 sm:px-4">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Mes anterior" title="Mes anterior">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h3 className="min-w-[9.5rem] text-center text-sm font-semibold capitalize text-gray-100">{fmtDate(`${month}-01`, 'MMMM yyyy')}</h3>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label="Mes siguiente" title="Mes siguiente">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="secondary" size="sm" className="ml-1" onClick={() => setMonth(thisMonth)} disabled={month === thisMonth}>
            Hoy
          </Button>
        </div>
        <div className="ml-auto flex items-center gap-3 tnum">
          {loading && current && <Spinner size="sm" />}
          {total ? (
            <div className="text-right">
              <p className={cn('text-base font-semibold leading-tight', total.trades ? pnlClass(total.pnl) : 'text-gray-500')}>
                {fmtMoney(total.pnl, currency)}
              </p>
              <p className="text-[11px] text-gray-500">
                {total.trades > 0 ? `${fmtTrades(total.trades)} · ${fmtPct(winRateOf(total))} acierto` : 'Sin operaciones este mes'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-2.5 w-36" />
            </div>
          )}
        </div>
      </div>

      {/* Cuadrícula */}
      {error && !current ? (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
          <p className="text-sm text-loss">{error}</p>
          <Button variant="secondary" size="sm" onClick={() => setRetry((n) => n + 1)} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            Reintentar
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto p-3">
          <div className={cn('min-w-[600px] space-y-1', loading && current && 'opacity-60 transition-opacity')}>
            <div className="grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(5.5rem,0.9fr)] gap-1 px-0.5 text-center text-[11px] font-medium uppercase tracking-wide text-gray-500">
              {WEEKDAY_HEAD.map((d, i) => (
                <div key={i} className="py-1">
                  {d}
                </div>
              ))}
              <div className="py-1">Semana</div>
            </div>

            {weeks.map((week) => {
              const inMonthDays = week.days.filter((d) => d.startsWith(month));
              const apiWeek = weekMap.get(week.start);
              const wTotal: StatsBucket = apiWeek ?? sumDays(inMonthDays.map((d) => dayMap.get(d)).filter((d): d is CalendarDay => !!d));
              const weekLabel = apiWeek?.week_key ? `S${apiWeek.week_key.split('-W')[1] ?? ''}` : '';
              return (
                <div key={week.start} className="grid grid-cols-[repeat(7,minmax(0,1fr))_minmax(5.5rem,0.9fr)] gap-1">
                  {week.days.map((date) => {
                    const inMonth = date.startsWith(month);
                    if (!inMonth) return <div key={date} className={cn(CELL, 'rounded-md')} aria-hidden />;
                    if (!current) return <Skeleton key={date} className={CELL} />;
                    return (
                      <DayCell
                        key={date}
                        date={date}
                        day={dayMap.get(date) ?? null}
                        maxAbs={maxAbs}
                        currency={currency}
                        isToday={date === today}
                        isFuture={date > today}
                        onOpen={openDay}
                      />
                    );
                  })}
                  {current ? (
                    <div className={cn(CELL, 'flex flex-col rounded-md border border-border bg-bg/50 px-2 py-1.5 tnum')}>
                      <span className="text-[10px] uppercase tracking-wide text-gray-500">{weekLabel}</span>
                      <span className={cn('mt-auto truncate text-xs font-semibold', wTotal.trades ? pnlClass(wTotal.pnl) : 'text-gray-600')}>
                        {wTotal.trades ? cellAmount(wTotal.pnl) : '—'}
                      </span>
                      <span className="text-[10px] text-gray-500">{wTotal.trades ? `${fmtNum(wTotal.trades, 0)} op.` : 'sin op.'}</span>
                    </div>
                  ) : (
                    <Skeleton className={CELL} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-[11px] text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          Haz clic en un día para ver sus operaciones.
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: rgba(CHART_COLORS.profit, 0.6) }} aria-hidden /> Ganancia
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: rgba(CHART_COLORS.loss, 0.6) }} aria-hidden /> Pérdida
          </span>
          <span className="inline-flex items-center gap-1">
            <i className="inline-block h-2.5 w-2.5 rounded-sm bg-gray-700" aria-hidden /> Sin operaciones
          </span>
        </span>
      </div>
    </Card>
  );
}

interface DayCellProps {
  date: string;
  day: CalendarDay | null;
  maxAbs: number;
  currency: string;
  isToday: boolean;
  isFuture: boolean;
  onOpen: (date: string) => void;
}

function DayCell({ date, day, maxAbs, currency, isToday, isFuture, onOpen }: DayCellProps) {
  const dayNum = Number(date.slice(8, 10));
  const ring = isToday ? 'ring-1 ring-accent ring-offset-1 ring-offset-panel' : '';

  if (!day || day.trades === 0) {
    return (
      <div
        className={cn(CELL, 'rounded-md border border-border/60 bg-bg/40 px-1.5 py-1', ring, isFuture && 'opacity-50')}
        title={fmtDate(date, "EEEE d 'de' MMMM")}
      >
        <span className={cn('text-[11px]', isToday ? 'font-semibold text-accent-soft' : 'text-gray-500')}>{dayNum}</span>
      </div>
    );
  }

  const color = day.pnl > 0 ? CHART_COLORS.profit : day.pnl < 0 ? CHART_COLORS.loss : null;
  const ratio = maxAbs > 0 ? Math.min(1, Math.abs(day.pnl) / maxAbs) : 0;
  const style = color ? { backgroundColor: rgba(color, 0.14 + 0.5 * ratio), borderColor: rgba(color, 0.45) } : undefined;
  const title = `${fmtDate(date, "EEEE d 'de' MMMM")}: ${fmtMoney(day.pnl, currency)} · ${fmtTrades(day.trades)} (${day.wins}G / ${day.losses}P)`;

  return (
    <button
      type="button"
      onClick={() => onOpen(date)}
      title={title}
      aria-label={`Ver operaciones del ${fmtDate(date, "d 'de' MMMM")}: ${fmtMoney(day.pnl, currency)}`}
      style={style}
      className={cn(
        CELL,
        'group flex w-full flex-col items-start rounded-md border px-1.5 py-1 text-left transition',
        'hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        !color && 'border-gray-600/60 bg-gray-700/40',
        ring,
      )}
    >
      <span className={cn('text-[11px]', isToday ? 'font-semibold text-accent-soft' : 'text-gray-300/90')}>{dayNum}</span>
      <span className="mt-auto w-full truncate text-xs font-semibold text-gray-50 tnum">{cellAmount(day.pnl)}</span>
      <span className="text-[10px] text-gray-200/70 tnum">
        {fmtNum(day.trades, 0)} op.
      </span>
    </button>
  );
}

export default CalendarPnl;
