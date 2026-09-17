// Página «Dashboard»: tarjetas de P&L, gráfico acumulado/diario, métricas del periodo,
// calendario mensual y desglose por etiquetas/símbolos/día/hora. El rango vive en la URL (?range=)
// y todo respeta la cuenta seleccionada globalmente.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import BreakdownTable from '../components/BreakdownTable';
import CalendarPnl from '../components/CalendarPnl';
import PnlChart from '../components/PnlChart';
import StatCards from '../components/StatCards';
import RealMoneyCard from '../components/finanzas/RealMoneyCard';
import { RadarDashboardCards } from '../components/radar/DashboardCards';
import MetricsPanel from '../components/stats/MetricsPanel';
import RangeSelect from '../components/stats/RangeSelect';
import {
  DEFAULT_RANGE,
  isRangeKey,
  periodLabel,
  rangeBounds,
  statsQuery,
  type DailyPoint,
  type RangeKey,
  type StatsSummary,
} from '../components/stats/types';
import { Button } from '../components/ui/Button';
import { api } from '../lib/api';
import { fmtDate } from '../lib/format';
import { useSelectedAccount, useSession } from '../store/session';

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawRange = searchParams.get('range');
  const range: RangeKey = isRangeKey(rawRange) ? rawRange : DEFAULT_RANGE;

  const accountId = useSession((s) => s.accountId);
  const accounts = useSession((s) => s.accounts);
  const account = useSelectedAccount();
  const currency = account?.currency || accounts[0]?.currency || 'USD';

  const bounds = useMemo(() => rangeBounds(range), [range]);
  const query = statsQuery(accountId, bounds);

  const [summary, setSummary] = useState<StatsSummary | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const setRange = useCallback(
    (next: RangeKey) => {
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === DEFAULT_RANGE) p.delete('range');
          else p.set('range', next);
          return p;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  // Resumen + serie diaria (se recargan al cambiar de cuenta, de rango o al pulsar «Actualizar»).
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    Promise.all([
      api<StatsSummary>(`/stats/summary${query}`, { signal: ctrl.signal }),
      api<DailyPoint[]>(`/stats/daily${query}`, { signal: ctrl.signal }),
    ])
      .then(([s, d]) => {
        if (ctrl.signal.aborted) return;
        setSummary(s);
        setDaily(Array.isArray(d) ? d : []);
      })
      .catch((err: Error) => {
        if (ctrl.signal.aborted || err.name === 'AbortError') return;
        setError(err.message || 'No se pudieron cargar las estadísticas.');
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoading(false);
      });
    return () => ctrl.abort();
  }, [query, reloadKey]);

  // Si otra parte de la app cambia el estado de una cuenta (bloqueos, nuevas operaciones), refrescar.
  useEffect(() => {
    window.addEventListener('tj:account-status-changed', reload);
    return () => window.removeEventListener('tj:account-status-changed', reload);
  }, [reload]);

  const label = periodLabel(range);
  const scopeLabel = account ? `${account.name}${account.firm ? ` · ${account.firm}` : ''}` : 'Todas las cuentas';
  const rangeText = bounds.from ? `desde el ${fmtDate(bounds.from)}` : 'todo el historial';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-gray-100">Dashboard</h2>
          <p className="truncate text-xs text-gray-400">
            {scopeLabel} · {label} ({rangeText})
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <RangeSelect value={range} onChange={setRange} />
          <Button variant="secondary" size="sm" onClick={reload} loading={loading && summary !== null} leftIcon={<RefreshCw className="h-3.5 w-3.5" />} title="Actualizar">
            <span className="hidden sm:inline">Actualizar</span>
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">
          <span className="flex-1">{error}</span>
          <Button variant="secondary" size="sm" onClick={reload} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            Reintentar
          </Button>
        </div>
      )}

      <StatCards summary={summary} loading={loading} currency={currency} periodLabel={label} />

      <RealMoneyCard currency={currency} />

      <RadarDashboardCards accountId={accountId} currency={currency} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <PnlChart data={daily} loading={loading} error={error} currency={currency} onRetry={reload} className="xl:col-span-2" />
        <MetricsPanel period={summary?.period ?? null} loading={loading} currency={currency} subtitle={`${label} · ${scopeLabel}`} />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <CalendarPnl accountId={accountId} currency={currency} reloadKey={reloadKey} className="xl:col-span-2" />
        <BreakdownTable accountId={accountId} bounds={bounds} currency={currency} reloadKey={reloadKey} />
      </div>
    </div>
  );
}
