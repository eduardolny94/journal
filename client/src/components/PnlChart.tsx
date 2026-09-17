// Gráfico de P&L del periodo: pestaña «Acumulado» (área con gradiente) y «Diario» (barras verde/rojo).
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { LineChart as LineChartIcon, RefreshCw } from 'lucide-react';
import { cn } from '../lib/cn';
import { fmtDate, fmtMoney, pnlClass } from '../lib/format';
import { Button } from './ui/Button';
import { Card } from './ui/Card';
import { EmptyState } from './ui/EmptyState';
import { SegmentedTabs } from './stats/SegmentedTabs';
import { Skeleton } from './stats/Skeleton';
import { CHART_COLORS, capitalizeFirst, fmtAxisMoney, fmtTrades, type DailyPoint } from './stats/types';

type Mode = 'cum' | 'daily';

const MODES: ReadonlyArray<{ value: Mode; label: string }> = [
  { value: 'cum', label: 'Acumulado' },
  { value: 'daily', label: 'Diario' },
];

const CHART_HEIGHT = 280;

export interface PnlChartProps {
  data: DailyPoint[];
  loading: boolean;
  error?: string | null;
  currency: string;
  onRetry?: () => void;
  className?: string;
}

export function PnlChart({ data, loading, error, currency, onRetry, className }: PnlChartProps) {
  const [mode, setMode] = useState<Mode>('cum');
  const gradientId = useId();

  const stats = useMemo(() => {
    const last = data.length ? data[data.length - 1].cum_pnl : 0;
    const trades = data.reduce((s, d) => s + d.trades, 0);
    const spansYears = data.length > 1 && data[0].date.slice(0, 4) !== data[data.length - 1].date.slice(0, 4);
    return { last, trades, days: data.length, spansYears };
  }, [data]);

  const positive = stats.last >= 0;
  const lineColor = positive ? CHART_COLORS.profit : CHART_COLORS.loss;
  const tickDate = (d: string) => fmtDate(d, stats.spansYears ? 'MMM yy' : 'd MMM');

  const axisProps = {
    tick: { fill: CHART_COLORS.tick, fontSize: 11 },
    tickLine: false,
    axisLine: { stroke: CHART_COLORS.border },
  } as const;

  let body: ReactNode;
  if (loading && data.length === 0) {
    body = <Skeleton className="w-full" style={{ height: CHART_HEIGHT }} />;
  } else if (error) {
    body = (
      <div className="flex flex-col items-center justify-center gap-3 text-center" style={{ minHeight: CHART_HEIGHT }}>
        <p className="text-sm text-loss">{error}</p>
        {onRetry && (
          <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            Reintentar
          </Button>
        )}
      </div>
    );
  } else if (data.length === 0) {
    body = (
      <EmptyState
        icon={<LineChartIcon className="h-6 w-6" aria-hidden />}
        title="Sin operaciones en este periodo"
        description="Registra o importa operaciones para ver la evolución de tu P&L."
        className="py-10"
      />
    );
  } else {
    body = (
      <div className={cn('w-full min-w-0', loading && 'opacity-60 transition-opacity')} style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          {mode === 'cum' ? (
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={lineColor} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={28} {...axisProps} />
              <YAxis tickFormatter={fmtAxisMoney} width={52} {...axisProps} axisLine={false} />
              <ReferenceLine y={0} stroke={CHART_COLORS.zero} strokeDasharray="4 4" />
              <Tooltip
                content={<ChartTooltip currency={currency} mode="cum" />}
                cursor={{ stroke: CHART_COLORS.zero, strokeWidth: 1 }}
                isAnimationActive={false}
                wrapperStyle={{ outline: 'none' }}
              />
              <Area
                type="monotone"
                dataKey="cum_pnl"
                name="Acumulado"
                stroke={lineColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                baseValue={0}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 2, stroke: CHART_COLORS.panel, fill: lineColor }}
                isAnimationActive={false}
              />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
              <CartesianGrid stroke={CHART_COLORS.grid} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tickFormatter={tickDate} minTickGap={28} {...axisProps} />
              <YAxis tickFormatter={fmtAxisMoney} width={52} {...axisProps} axisLine={false} />
              <ReferenceLine y={0} stroke={CHART_COLORS.zero} />
              <Tooltip
                content={<ChartTooltip currency={currency} mode="daily" />}
                cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }}
                isAnimationActive={false}
                wrapperStyle={{ outline: 'none' }}
              />
              <Bar dataKey="pnl" name="P&L del día" shape={RoundedBar} maxBarSize={22} isAnimationActive={false}>
                {data.map((d) => (
                  <Cell key={d.date} fill={d.pnl >= 0 ? CHART_COLORS.profit : CHART_COLORS.loss} />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    );
  }

  return (
    <Card
      title="Evolución del P&L"
      subtitle={mode === 'cum' ? 'Curva de resultado acumulado por día de trading' : 'Resultado neto de cada día de trading'}
      actions={<SegmentedTabs value={mode} onChange={setMode} options={MODES} ariaLabel="Tipo de gráfico" />}
      className={cn('min-w-0', className)}
    >
      {data.length > 0 && !error && (
        <div className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs text-gray-400 tnum">
          <span className={cn('text-lg font-semibold', pnlClass(stats.last))}>{fmtMoney(stats.last, currency)}</span>
          <span>
            {stats.days} {stats.days === 1 ? 'día operado' : 'días operados'} · {fmtTrades(stats.trades)}
          </span>
        </div>
      )}
      {body}
    </Card>
  );
}

// ---------- Tooltip ----------

interface ChartTooltipProps {
  currency: string;
  mode: Mode;
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: DailyPoint }>;
}

function ChartTooltip({ active, payload, currency, mode }: ChartTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <div className="rounded-md border border-border bg-panel/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="mb-1 font-medium text-gray-200">{capitalizeFirst(fmtDate(point.date, "EEEE, d 'de' MMMM yyyy"))}</p>
      {mode === 'cum' && (
        <p className="flex justify-between gap-4 tnum">
          <span className="text-gray-400">Acumulado</span>
          <span className={cn('font-semibold', pnlClass(point.cum_pnl))}>{fmtMoney(point.cum_pnl, currency)}</span>
        </p>
      )}
      <p className="flex justify-between gap-4 tnum">
        <span className="text-gray-400">Día</span>
        <span className={cn('font-semibold', pnlClass(point.pnl))}>{fmtMoney(point.pnl, currency)}</span>
      </p>
      <p className="mt-1 text-gray-500 tnum">
        {fmtTrades(point.trades)} · {point.wins}G / {point.losses}P
      </p>
    </div>
  );
}

// ---------- Barra con el extremo (lado del dato) redondeado ----------

interface RoundedBarProps {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
  value?: number | [number, number];
}

function RoundedBar({ x = 0, y = 0, width = 0, height = 0, fill, value }: RoundedBarProps) {
  if (!width || !height || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  let top = y;
  let h = height;
  if (h < 0) {
    top = y + h;
    h = -h;
  }
  const v = Array.isArray(value) ? value[1] - value[0] : Number(value ?? 0);
  const positive = v >= 0;
  const r = Math.min(4, width / 2, h);
  const right = x + width;
  const bottom = top + h;
  const d = positive
    ? `M${x},${top + r} a${r},${r} 0 0 1 ${r},-${r} h${width - 2 * r} a${r},${r} 0 0 1 ${r},${r} V${bottom} H${x} Z`
    : `M${x},${top} H${right} V${bottom - r} a${r},${r} 0 0 1 -${r},${r} H${x + r} a${r},${r} 0 0 1 -${r},-${r} Z`;
  return <path d={d} fill={fill} />;
}

export default PnlChart;
