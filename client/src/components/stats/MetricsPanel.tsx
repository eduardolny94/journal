// Panel «Métricas» del periodo: win rate, profit factor, expectancy, medias, mejor/peor día, racha, drawdown, comisiones.
import type { ReactNode } from 'react';
import { Gauge } from 'lucide-react';
import { cn } from '../../lib/cn';
import { fmtDate, fmtMoney, fmtNum, fmtPct, fmtR, pnlClass } from '../../lib/format';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from './Skeleton';
import { fmtTrades, type PeriodStats } from './types';

export interface MetricsPanelProps {
  period: PeriodStats | null;
  loading: boolean;
  currency: string;
  subtitle?: ReactNode;
  className?: string;
}

interface Metric {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  valueClass?: string;
}

function buildMetrics(p: PeriodStats, currency: string): Metric[] {
  const pf = p.profit_factor;
  const pfText = pf === null ? (p.gross_profit > 0 ? '∞' : '—') : fmtNum(pf, 2);
  const pfClass = pf === null ? (p.gross_profit > 0 ? 'text-profit' : 'text-gray-400') : pf >= 1 ? 'text-profit' : 'text-loss';
  const streak = p.current_streak;
  const streakText =
    !streak.kind || streak.n === 0
      ? '—'
      : `${streak.n} ${streak.kind === 'win' ? (streak.n === 1 ? 'ganadora' : 'ganadoras') : streak.n === 1 ? 'perdedora' : 'perdedoras'}`;

  return [
    {
      label: 'Win rate',
      value: fmtPct(p.win_rate),
      valueClass: p.win_rate >= 50 ? 'text-profit' : 'text-gray-100',
      hint: `${p.wins}G · ${p.losses}P${p.breakeven ? ` · ${p.breakeven}BE` : ''}`,
    },
    { label: 'Profit factor', value: pfText, valueClass: pfClass, hint: 'ganado bruto ÷ perdido bruto' },
    {
      label: 'Expectancy',
      value: p.expectancy === null ? '—' : fmtMoney(p.expectancy, currency),
      valueClass: p.expectancy === null ? 'text-gray-400' : pnlClass(p.expectancy),
      hint: 'esperanza por operación',
    },
    { label: 'R medio', value: fmtR(p.avg_r), valueClass: p.avg_r === null ? 'text-gray-400' : pnlClass(p.avg_r), hint: 'op. con riesgo definido' },
    {
      label: 'Ganancia media',
      value: p.avg_win === null ? '—' : fmtMoney(p.avg_win, currency),
      valueClass: p.avg_win === null ? 'text-gray-400' : 'text-profit',
      hint: `bruto ${fmtMoney(p.gross_profit, currency)}`,
    },
    {
      label: 'Pérdida media',
      value: p.avg_loss === null ? '—' : fmtMoney(p.avg_loss, currency),
      valueClass: p.avg_loss === null ? 'text-gray-400' : 'text-loss',
      hint: `bruto ${fmtMoney(p.gross_loss, currency)}`,
    },
    {
      label: 'Mejor día',
      value: p.best_day ? fmtMoney(p.best_day.pnl, currency) : '—',
      valueClass: p.best_day ? pnlClass(p.best_day.pnl) : 'text-gray-400',
      hint: p.best_day ? fmtDate(p.best_day.date, 'EEE d MMM yyyy') : undefined,
    },
    {
      label: 'Peor día',
      value: p.worst_day ? fmtMoney(p.worst_day.pnl, currency) : '—',
      valueClass: p.worst_day ? pnlClass(p.worst_day.pnl) : 'text-gray-400',
      hint: p.worst_day ? fmtDate(p.worst_day.date, 'EEE d MMM yyyy') : undefined,
    },
    {
      label: 'Racha actual',
      value: streakText,
      valueClass: !streak.kind || streak.n === 0 ? 'text-gray-400' : streak.kind === 'win' ? 'text-profit' : 'text-loss',
      hint: 'op. seguidas del mismo signo',
    },
    {
      label: 'Drawdown máx.',
      value: fmtMoney(p.max_drawdown, currency, { sign: false }),
      valueClass: p.max_drawdown > 0 ? 'text-loss' : 'text-gray-400',
      hint: 'caída máx. desde el pico',
    },
    {
      label: 'Comisiones',
      value: fmtMoney(p.total_fees, currency, { sign: false }),
      valueClass: 'text-gray-100',
      hint: `en ${fmtTrades(p.trades)}`,
    },
    {
      label: 'P&L neto',
      value: fmtMoney(p.pnl, currency),
      valueClass: pnlClass(p.pnl),
      hint: 'resultado del periodo',
    },
  ];
}

export function MetricsPanel({ period, loading, currency, subtitle, className }: MetricsPanelProps) {
  const showSkeleton = loading && !period;
  const metrics = period ? buildMetrics(period, currency) : [];

  return (
    <Card title="Métricas" subtitle={subtitle} className={cn('min-w-0', className)}>
      {showSkeleton ? (
        <dl className="grid grid-cols-2 gap-x-4 gap-y-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-2.5 w-20" />
            </div>
          ))}
        </dl>
      ) : !period || period.trades === 0 ? (
        <EmptyState
          icon={<Gauge className="h-6 w-6" aria-hidden />}
          title="Sin operaciones en el periodo"
          description="Las métricas aparecerán cuando registres operaciones dentro del rango seleccionado."
          className="py-8"
        />
      ) : (
        <dl className={cn('grid grid-cols-2 gap-x-4 gap-y-4', loading && 'opacity-60 transition-opacity')}>
          {metrics.map((m) => (
            <div key={m.label} className="min-w-0">
              <dt className="text-[11px] uppercase tracking-wide text-gray-500">{m.label}</dt>
              <dd className={cn('mt-0.5 truncate text-base font-semibold tnum', m.valueClass ?? 'text-gray-100')}>{m.value}</dd>
              {m.hint && <dd className="mt-0.5 truncate text-[11px] text-gray-500 tnum">{m.hint}</dd>}
            </div>
          ))}
        </dl>
      )}
    </Card>
  );
}

export default MetricsPanel;
