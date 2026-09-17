// Tarjetas de P&L: hoy / esta semana / este mes / periodo seleccionado.
import type { ReactNode } from 'react';
import { CalendarCheck, CalendarDays, CalendarRange, SlidersHorizontal } from 'lucide-react';
import { cn } from '../lib/cn';
import { fmtDate, fmtMoney, fmtPct, pnlClass } from '../lib/format';
import { StatCard } from './ui/Card';
import { Skeleton } from './stats/Skeleton';
import { fmtTrades, winRateOf, type StatsBucket, type StatsSummary } from './stats/types';

export interface StatCardsProps {
  summary: StatsSummary | null;
  loading: boolean;
  currency: string;
  /** Etiqueta de la tarjeta del periodo seleccionado ("Últimos 30 días"). */
  periodLabel: string;
  className?: string;
}

interface CardDef {
  key: string;
  label: ReactNode;
  bucket: StatsBucket | null;
  icon: ReactNode;
}

export function StatCards({ summary, loading, currency, periodLabel, className }: StatCardsProps) {
  const cards: CardDef[] = [
    {
      key: 'today',
      label: (
        <>
          Hoy
          {summary?.trading_day && <span className="ml-1.5 normal-case tracking-normal text-gray-500">· {fmtDate(summary.trading_day, 'd MMM')}</span>}
        </>
      ),
      bucket: summary?.today ?? null,
      icon: <CalendarCheck className="h-4 w-4" aria-hidden />,
    },
    { key: 'week', label: 'Esta semana', bucket: summary?.week ?? null, icon: <CalendarRange className="h-4 w-4" aria-hidden /> },
    { key: 'month', label: 'Este mes', bucket: summary?.month ?? null, icon: <CalendarDays className="h-4 w-4" aria-hidden /> },
    {
      key: 'period',
      label: (
        <>
          Periodo<span className="ml-1.5 normal-case tracking-normal text-gray-500">· {periodLabel}</span>
        </>
      ),
      bucket: summary?.period ?? null,
      icon: <SlidersHorizontal className="h-4 w-4" aria-hidden />,
    },
  ];

  return (
    <div className={cn('grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4', loading && summary && 'opacity-60 transition-opacity', className)}>
      {cards.map((c) => (
        <BucketCard key={c.key} def={c} loading={loading && !summary} currency={currency} />
      ))}
    </div>
  );
}

function BucketCard({ def, loading, currency }: { def: CardDef; loading: boolean; currency: string }) {
  const b = def.bucket;
  if (loading || !b) {
    return (
      <StatCard
        label={def.label}
        value={<Skeleton className="h-7 w-32" />}
        hint={<Skeleton className="h-3 w-24" />}
        icon={def.icon}
        className={loading ? '' : 'opacity-60'}
      />
    );
  }
  const hasTrades = b.trades > 0;
  const wr = winRateOf(b);
  return (
    <StatCard
      label={def.label}
      value={fmtMoney(b.pnl, currency)}
      valueClassName={cn(pnlClass(b.pnl), !hasTrades && 'text-gray-500')}
      hint={
        hasTrades ? (
          <span className="flex flex-wrap items-center gap-x-2 tnum">
            <span className="text-gray-300">{fmtTrades(b.trades)}</span>
            <span aria-hidden>·</span>
            <span className={cn(wr >= 50 ? 'text-profit' : 'text-gray-400')}>{fmtPct(wr)} acierto</span>
            <span className="text-gray-600">
              {b.wins}G / {b.losses}P
            </span>
          </span>
        ) : (
          'Sin operaciones'
        )
      }
      icon={
        <span
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-md border',
            b.pnl > 0 ? 'border-profit/30 bg-profit/10 text-profit' : b.pnl < 0 ? 'border-loss/30 bg-loss/10 text-loss' : 'border-border bg-bg/60 text-gray-500',
          )}
        >
          {def.icon}
        </span>
      }
    />
  );
}

export default StatCards;
