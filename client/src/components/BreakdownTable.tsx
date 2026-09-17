// Desglose del rendimiento por Etiquetas / Símbolos / Día de la semana / Hora, con barra divergente
// proporcional al P&L, P&L coloreado, nº de operaciones y win rate.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BarChart3, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import { fmtMoney, fmtNum, fmtPct, pnlClass } from '../lib/format';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { SegmentedTabs } from './stats/SegmentedTabs';
import { Skeleton } from './stats/Skeleton';
import { CHART_COLORS, statsQuery, type DateBounds, type HourStat, type SymbolStat, type TagStat, type WeekdayStat } from './stats/types';

type Tab = 'tags' | 'symbols' | 'weekday' | 'hour';

const TABS: ReadonlyArray<{ value: Tab; label: string }> = [
  { value: 'tags', label: 'Etiquetas' },
  { value: 'symbols', label: 'Símbolos' },
  { value: 'weekday', label: 'Día de la semana' },
  { value: 'hour', label: 'Hora' },
];

const TAB_META: Record<Tab, { path: string; column: string; subtitle: string; empty: string }> = {
  tags: {
    path: '/stats/by-tag',
    column: 'Etiqueta',
    subtitle: 'Rendimiento por etiqueta (setups, errores, contexto…)',
    empty: 'Asigna etiquetas a tus operaciones para ver qué setups funcionan y qué errores te cuestan dinero.',
  },
  symbols: { path: '/stats/by-symbol', column: 'Símbolo', subtitle: 'Rendimiento por instrumento', empty: 'No hay operaciones en el rango seleccionado.' },
  weekday: { path: '/stats/by-weekday', column: 'Día', subtitle: 'Rendimiento por día de la semana', empty: 'No hay operaciones en el rango seleccionado.' },
  hour: {
    path: '/stats/by-hour',
    column: 'Hora',
    subtitle: 'Rendimiento por hora de entrada (hora local de la cuenta)',
    empty: 'No hay operaciones en el rango seleccionado.',
  },
};

interface Row {
  key: string;
  label: string;
  color: string | null;
  note: string | null;
  pnl: number;
  trades: number;
  wins: number;
  losses: number;
  /** 0-100 */
  win_rate: number;
  avg_pnl: number;
}

const TAG_KIND_LABEL: Record<string, string> = {
  setup: 'setup',
  patron: 'patrón',
  error: 'error',
  emocion: 'emoción',
};

function normalize(tab: Tab, raw: unknown): Row[] {
  if (!Array.isArray(raw)) return [];
  switch (tab) {
    case 'tags':
      return (raw as TagStat[]).map((r) => ({
        key: `tag-${r.tag_id}`,
        label: r.name,
        color: r.color || null,
        note: r.kind ? (TAG_KIND_LABEL[r.kind] ?? r.kind) : null,
        pnl: r.pnl,
        trades: r.trades,
        wins: r.wins,
        losses: r.losses,
        win_rate: r.win_rate,
        avg_pnl: r.avg_pnl,
      }));
    case 'symbols':
      return (raw as SymbolStat[]).map((r) => ({
        key: `sym-${r.symbol}`,
        label: r.symbol,
        color: null,
        note: null,
        pnl: r.pnl,
        trades: r.trades,
        wins: r.wins,
        losses: r.losses,
        win_rate: r.win_rate,
        avg_pnl: r.avg_pnl,
      }));
    case 'weekday':
      return (raw as WeekdayStat[]).map((r) => ({
        key: `wd-${r.weekday}`,
        label: r.label,
        color: null,
        note: null,
        pnl: r.pnl,
        trades: r.trades,
        wins: r.wins,
        losses: r.losses,
        win_rate: r.win_rate,
        avg_pnl: r.avg_pnl,
      }));
    case 'hour':
      return (raw as HourStat[]).map((r) => ({
        key: `h-${r.hour}`,
        label: r.label,
        color: null,
        note: `hasta ${String(r.hour).padStart(2, '0')}:59`,
        pnl: r.pnl,
        trades: r.trades,
        wins: r.wins,
        losses: r.losses,
        win_rate: r.win_rate,
        avg_pnl: r.avg_pnl,
      }));
  }
}

export interface BreakdownTableProps {
  accountId: number | null;
  bounds: DateBounds;
  currency: string;
  reloadKey?: number;
  className?: string;
}

export function BreakdownTable({ accountId, bounds, currency, reloadKey = 0, className }: BreakdownTableProps) {
  const [tab, setTab] = useState<Tab>('tags');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);

  const query = statsQuery(accountId, bounds);
  // Caché por (query, reloadKey) para no repetir peticiones al cambiar de pestaña.
  const cacheKey = `${query}|${reloadKey}|${retry}`;
  const cache = useRef<{ key: string; data: Partial<Record<Tab, Row[]>> }>({ key: cacheKey, data: {} });

  useEffect(() => {
    if (cache.current.key !== cacheKey) cache.current = { key: cacheKey, data: {} };
    const cached = cache.current.data[tab];
    if (cached) {
      setRows(cached);
      setLoading(false);
      setError(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    api<unknown>(`${TAB_META[tab].path}${query}`, { signal: ctrl.signal })
      .then((raw) => {
        if (ctrl.signal.aborted) return;
        const list = normalize(tab, raw);
        cache.current.data[tab] = list;
        setRows(list);
      })
      .catch((err: Error) => {
        if (ctrl.signal.aborted || err.name === 'AbortError') return;
        setError(err.message || 'No se pudo cargar el desglose.');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [tab, query, cacheKey]);

  const meta = TAB_META[tab];
  const visible = rows ?? [];
  const maxAbs = visible.reduce((m, r) => Math.max(m, Math.abs(r.pnl)), 0);
  const hasData = visible.some((r) => r.trades > 0);

  let body: ReactNode;
  if (loading && rows === null) {
    body = (
      <div className="space-y-2 p-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="grid grid-cols-[6rem_1fr_5rem_2.5rem_3rem] items-center gap-3">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-8" />
            <Skeleton className="h-3.5 w-10" />
          </div>
        ))}
      </div>
    );
  } else if (error) {
    body = (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
        <p className="text-sm text-loss">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => setRetry((n) => n + 1)} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
          Reintentar
        </Button>
      </div>
    );
  } else if (!hasData) {
    body = <EmptyState icon={<BarChart3 className="h-6 w-6" aria-hidden />} title="Sin datos" description={meta.empty} className="m-4 py-8" />;
  } else {
    body = (
      <div className={cn('overflow-x-auto', loading && 'opacity-60 transition-opacity')}>
        <table className="w-full min-w-[440px] text-xs">
          <thead>
            <tr className="border-b border-border text-[11px] uppercase tracking-wide text-gray-500">
              <th scope="col" className="px-3 py-2 text-left font-medium sm:px-4">
                {meta.column}
              </th>
              <th scope="col" className="w-[30%] min-w-[110px] px-2 py-2 text-left font-medium">
                Distribución
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                P&L
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                Op.
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium sm:px-4">
                Acierto
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/70">
            {visible.map((r) => {
              const inactive = r.trades === 0;
              const ratio = maxAbs > 0 ? Math.abs(r.pnl) / maxAbs : 0;
              const barColor = r.pnl >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss;
              return (
                <tr key={r.key} className={cn('transition-colors hover:bg-gray-800/40', inactive && 'opacity-50')}>
                  <td className="max-w-[10rem] px-3 py-2 sm:px-4">
                    <div className="flex min-w-0 items-center gap-2">
                      {r.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />}
                      <span className="truncate font-medium text-gray-100 tnum">{r.label}</span>
                      {r.note && <span className="hidden shrink-0 text-[10px] text-gray-500 sm:inline">{r.note}</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <div className="relative h-2 w-full rounded-full bg-gray-800" aria-hidden>
                      <span className="absolute inset-y-0 left-1/2 w-px bg-gray-600" />
                      {!inactive && r.pnl !== 0 && (
                        <span
                          className="absolute inset-y-0 rounded-full"
                          style={
                            r.pnl > 0
                              ? { left: '50%', width: `${Math.max(1.5, ratio * 50)}%`, backgroundColor: barColor }
                              : { right: '50%', width: `${Math.max(1.5, ratio * 50)}%`, backgroundColor: barColor }
                          }
                        />
                      )}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tnum">
                    <span className={cn('font-semibold', inactive ? 'text-gray-500' : pnlClass(r.pnl))}>{inactive ? '—' : fmtMoney(r.pnl, currency)}</span>
                    {!inactive && <span className="block text-[10px] text-gray-500">{fmtMoney(r.avg_pnl, currency)} / op.</span>}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right text-gray-300 tnum">{fmtNum(r.trades, 0)}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tnum sm:px-4">
                    {inactive ? (
                      <span className="text-gray-500">—</span>
                    ) : (
                      <>
                        <span className={cn('font-medium', r.win_rate >= 50 ? 'text-profit' : 'text-gray-200')}>{fmtPct(r.win_rate)}</span>
                        <span className="block text-[10px] text-gray-500">
                          {r.wins}G / {r.losses}P
                        </span>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Card flush title="Desglose" subtitle={meta.subtitle} className={cn('min-w-0', className)}>
      <div className="border-b border-border px-3 py-2 sm:px-4">
        <SegmentedTabs value={tab} onChange={setTab} options={TABS} ariaLabel="Tipo de desglose" />
      </div>
      {body}
    </Card>
  );
}

export default BreakdownTable;
