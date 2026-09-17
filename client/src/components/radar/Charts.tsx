// Gráficos del radar: historial de puntuación (Recharts) y gráfico de TradingView embebido (widget oficial).
import { useEffect, useId, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { cn } from '../../lib/cn';
import { Card } from '../ui/Card';
import { fetchRadarHistory, fmtScore, type CurrencyCode, type HistoryRow } from '../../lib/radar';

type HistoryProps = { days?: number } & ({ base: CurrencyCode; quote: CurrencyCode; symbol?: undefined; label?: undefined } | { symbol: string; label: string; base?: undefined; quote?: undefined });

export function BiasHistoryChart(props: HistoryProps) {
  const days = props.days ?? 30;
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetchRadarHistory(days).then(setRows).catch((e) => setError((e as Error).message));
  }, [days]);
  const isPair = props.base !== undefined;
  const data = isPair
    ? rows.map((r) => ({ at: r.at, a: r.scores[props.base] ?? null, b: r.scores[props.quote] ?? null, diff: (r.scores[props.base] ?? 0) - (r.scores[props.quote] ?? 0) }))
    : rows.map((r) => ({ at: r.at, diff: r.pairs?.find((p) => p.symbol === props.symbol)?.diff ?? null })).filter((d) => d.diff !== null);
  const title = isPair ? `Historial de fuerza · ${props.base} y ${props.quote}` : `Historial de sesgo · ${props.label}`;
  return (
    <Card title={title} subtitle={`Puntuación en los últimos ${days} días (una muestra por hora).`}>
      {error && <p className="text-sm text-loss">{error}</p>}
      {!error && data.length < 2 && <p className="text-sm text-gray-500">Todavía hay pocas muestras: el historial se va guardando cada hora desde que el radar está en marcha.</p>}
      {data.length >= 2 && (
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
              <CartesianGrid stroke="#1d2a23" vertical={false} />
              <XAxis dataKey="at" tickFormatter={(v: string) => new Date(v).toLocaleDateString('es', { day: '2-digit', month: 'short' })} stroke="#3b434a" tick={{ fill: '#8aa398', fontSize: 11 }} minTickGap={40} />
              <YAxis domain={[-10, 10]} stroke="#3b434a" tick={{ fill: '#8aa398', fontSize: 11 }} />
              <ReferenceLine y={0} stroke="#3b434a" />
              <Tooltip
                contentStyle={{ background: '#0e1512', border: '1px solid #1d2a23', borderRadius: 8, fontSize: 12 }}
                labelFormatter={(v) => new Date(String(v)).toLocaleString('es', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                formatter={(v) => fmtScore(Number(v))}
              />
              {isPair && <Line type="monotone" dataKey="a" name={props.base} stroke="#16f57a" dot={false} strokeWidth={2} isAnimationActive={false} />}
              {isPair && <Line type="monotone" dataKey="b" name={props.quote} stroke="#8aa398" dot={false} strokeWidth={2} isAnimationActive={false} />}
              <Line type="monotone" dataKey="diff" name={isPair ? 'diferencia' : 'sesgo'} stroke="#f5b400" dot={false} strokeWidth={isPair ? 1 : 2} strokeDasharray={isPair ? '4 3' : undefined} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
          <p className="mt-1 text-[11px] text-gray-500">
            {isPair ? (
              <>
                <span className="text-accent">━</span> {props.base} · <span className="text-gray-400">━</span> {props.quote} · <span className="text-warn">╌</span> diferencia
              </>
            ) : (
              <>
                <span className="text-warn">━</span> puntuación del sesgo (−10 bajista … +10 alcista)
              </>
            )}
          </p>
        </div>
      )}
    </Card>
  );
}

// ---------- TradingView ----------

declare global {
  interface Window {
    TradingView?: { widget: new (opts: Record<string, unknown>) => unknown };
  }
}

let tvPromise: Promise<void> | null = null;
export function loadTradingView(): Promise<void> {
  if (window.TradingView) return Promise.resolve();
  if (tvPromise) return tvPromise;
  tvPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://s3.tradingview.com/tv.js';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      tvPromise = null;
      reject(new Error('No se pudo cargar TradingView.'));
    };
    document.head.appendChild(s);
  });
  return tvPromise;
}

const INTERVALS: Array<{ key: string; label: string }> = [
  { key: '60', label: '1H' },
  { key: '240', label: '4H' },
  { key: 'D', label: 'D' },
];

export function TradingViewChart({ symbol, title, className }: { symbol: string; title?: string; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, '');
  const containerId = `tv_${id}`;
  const [interval, setInterval_] = useState('60');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    loadTradingView()
      .then(() => {
        if (cancelled || !window.TradingView) return;
        const el = document.getElementById(containerId);
        if (el) el.innerHTML = '';
        new window.TradingView.widget({
          container_id: containerId,
          symbol,
          interval,
          theme: 'dark',
          style: '1',
          locale: 'es',
          timezone: 'Etc/UTC',
          autosize: true,
          hide_side_toolbar: false,
          allow_symbol_change: false,
          withdateranges: true,
          toolbar_bg: '#0e1512',
        });
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [symbol, interval, containerId]);
  return (
    <div className={cn('overflow-hidden rounded-lg border border-border bg-panel', className)}>
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-sm font-semibold text-gray-100">Gráfico · {title ?? symbol}</span>
        <div className="flex gap-1">
          {INTERVALS.map((i) => (
            <button key={i.key} onClick={() => setInterval_(i.key)} className={cn('rounded-md px-2 py-1 text-xs', interval === i.key ? 'bg-accent/15 text-accent-soft' : 'text-gray-400 hover:text-gray-200')}>
              {i.label}
            </button>
          ))}
        </div>
      </div>
      {error ? <p className="p-4 text-sm text-warn">{error} El resto del radar sigue funcionando.</p> : <div id={containerId} className="h-[480px] w-full" />}
    </div>
  );
}
