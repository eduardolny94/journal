// Página «Operaciones»: totales del filtro, filtros (persistidos en la URL: ?from&to&symbol&tag_id&side&page),
// tabla en escritorio / tarjetas en móvil y paginación.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Hash, ListOrdered, Percent, Plus, RotateCcw, Sigma, TrendingUp } from 'lucide-react';
import { api, qs } from '../lib/api';
import { cn } from '../lib/cn';
import { fmtMoney, fmtNum, pnlClass } from '../lib/format';
import { useSession } from '../store/session';
import { Button } from '../components/ui/Button';
import { Card, StatCard } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import TradeRow, { TradeCard, type Trade, type TradeListResponse, type TradeListSummary } from '../components/TradeRow';
import { KIND_LABELS, TAG_KINDS, useTags } from '../components/TagPicker';

const PAGE_SIZE = 50;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const SIDES = new Set(['long', 'short']);

const PRESETS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'mes', label: 'Este mes' },
  { key: '30d', label: '30 días' },
  { key: 'todo', label: 'Todo' },
] as const;
type Preset = (typeof PRESETS)[number]['key'];

function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date();
  const f = (d: Date) => format(d, 'yyyy-MM-dd');
  switch (p) {
    case 'hoy':
      return { from: f(now), to: f(now) };
    case 'semana':
      return { from: f(startOfWeek(now, { weekStartsOn: 1 })), to: f(endOfWeek(now, { weekStartsOn: 1 })) };
    case 'mes':
      return { from: f(startOfMonth(now)), to: f(endOfMonth(now)) };
    case '30d':
      return { from: f(subDays(now, 29)), to: f(now) };
    default:
      return { from: '', to: '' };
  }
}

interface Filters {
  from: string;
  to: string;
  symbol: string;
  tag_id: string;
  side: string;
}

/** Lee y sanea los filtros de la URL (valores inválidos se ignoran). */
function readFilters(params: URLSearchParams): Filters {
  const ymd = (v: string | null) => (v && YMD_RE.test(v) ? v : '');
  const side = (params.get('side') ?? '').toLowerCase();
  const tag = params.get('tag_id') ?? '';
  return {
    from: ymd(params.get('from')),
    to: ymd(params.get('to')),
    symbol: (params.get('symbol') ?? '').trim().toUpperCase().slice(0, 20),
    tag_id: /^\d+$/.test(tag) ? tag : '',
    side: SIDES.has(side) ? side : '',
  };
}

/** Totales calculados en cliente si el backend no envía `summary`. */
function summarize(items: Trade[], total: number): TradeListSummary {
  const wins = items.filter((t) => t.pnl > 0).length;
  const losses = items.filter((t) => t.pnl < 0).length;
  const decided = wins + losses;
  return {
    trades: total,
    pnl: items.reduce((s, t) => s + (Number(t.pnl) || 0), 0),
    fees: items.reduce((s, t) => s + (Number(t.fees) || 0), 0),
    wins,
    losses,
    breakeven: Math.max(0, items.length - decided),
    win_rate: decided ? Math.round((wins / decided) * 1000) / 10 : 0,
  };
}

export default function Trades() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const accountId = useSession((s) => s.accountId);
  const accounts = useSession((s) => s.accounts);
  const { tags } = useTags();

  const filters = useMemo(() => readFilters(params), [params]);
  const page = Math.max(1, Math.floor(Number(params.get('page')) || 1));

  const [items, setItems] = useState<Trade[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<TradeListSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<string[]>([]);

  const updateParams = useCallback(
    (patch: Partial<Record<keyof Filters | 'page', string | number | null>>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
            if (v === null || v === undefined || v === '') next.delete(k);
            else next.set(k, String(v));
          }
          if (resetPage) next.delete('page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Cambiar de cuenta vuelve a la página 1 (solo si había paginación en la URL).
  const prevAccount = useRef(accountId);
  useEffect(() => {
    if (prevAccount.current === accountId) return;
    prevAccount.current = accountId;
    if (params.has('page')) updateParams({});
  }, [accountId, params, updateParams]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const res = await api<TradeListResponse>(
          `/trades${qs({
            account_id: accountId,
            from: filters.from,
            to: filters.to,
            symbol: filters.symbol,
            tag_id: filters.tag_id,
            side: filters.side,
            page,
            limit: PAGE_SIZE,
          })}`,
          { signal },
        );
        const list = Array.isArray(res.items) ? res.items : [];
        const count = Number(res.total) || 0;
        setItems(list);
        setTotal(count);
        setSummary(res.summary ?? summarize(list, count));
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        setError((err as Error).message || 'No se pudieron cargar las operaciones.');
      } finally {
        setLoading(false);
      }
    },
    [accountId, filters, page],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    api<string[]>('/trades/symbols')
      .then((list) => {
        if (!cancelled) setSymbols(Array.isArray(list) ? list : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [total]);

  const activePreset = useMemo<Preset | null>(() => {
    for (const p of PRESETS) {
      const r = presetRange(p.key);
      if (r.from === filters.from && r.to === filters.to) return p.key;
    }
    return null;
  }, [filters.from, filters.to]);

  const selectedAccount = accountId !== null ? accounts.find((a) => a.id === accountId) : undefined;
  const currency = useMemo(() => {
    if (selectedAccount) return selectedAccount.currency || 'USD';
    if (accounts.length && accounts.every((a) => a.currency === accounts[0].currency)) return accounts[0].currency || 'USD';
    return 'USD';
  }, [selectedAccount, accounts]);
  const currencyFor = (t: Trade) => accounts.find((a) => a.id === t.account_id)?.currency || currency;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstIdx = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const lastIdx = Math.min(total, page * PAGE_SIZE);
  const hasFilters = Object.values(filters).some((v) => v !== '');
  const symbolOptions = filters.symbol && !symbols.includes(filters.symbol) ? [filters.symbol, ...symbols] : symbols;
  const avgPerTrade = summary && summary.trades > 0 ? summary.pnl / summary.trades : 0;
  const goToPage = (p: number) => updateParams({ page: p > 1 ? p : null }, false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold text-gray-100">Operaciones</h2>
          <p className="text-xs text-gray-400">{selectedAccount ? `${selectedAccount.name}${selectedAccount.firm ? ` · ${selectedAccount.firm}` : ''}` : 'Todas las cuentas'}</p>
        </div>
        <div className="ml-auto">
          <Button onClick={() => navigate('/operaciones/nueva')} leftIcon={<Plus className="h-4 w-4" />}>
            Nueva operación
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card flush className="p-3">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-md border border-border overflow-hidden" role="group" aria-label="Rango de fechas">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => updateParams(presetRange(p.key))}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium transition-colors border-r border-border last:border-r-0',
                    activePreset === p.key ? 'bg-accent/20 text-accent-soft' : 'bg-panel text-gray-400 hover:text-gray-100 hover:bg-gray-800',
                  )}
                  aria-pressed={activePreset === p.key}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {hasFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => updateParams({ from: null, to: null, symbol: null, tag_id: null, side: null })}
                leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
              >
                Limpiar filtros
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            <Input label="Desde" type="date" value={filters.from} max={filters.to || undefined} onChange={(e) => updateParams({ from: e.target.value })} inputClassName="py-1.5 text-xs" />
            <Input label="Hasta" type="date" value={filters.to} min={filters.from || undefined} onChange={(e) => updateParams({ to: e.target.value })} inputClassName="py-1.5 text-xs" />
            <Select label="Símbolo" value={filters.symbol} onChange={(e) => updateParams({ symbol: e.target.value })} selectClassName="py-1.5 text-xs">
              <option value="">Todos</option>
              {symbolOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Select label="Etiqueta" value={filters.tag_id} onChange={(e) => updateParams({ tag_id: e.target.value })} selectClassName="py-1.5 text-xs">
              <option value="">Todas</option>
              {TAG_KINDS.map((kind) => {
                const group = tags.filter((t) => t.kind === kind);
                if (!group.length) return null;
                return (
                  <optgroup key={kind} label={KIND_LABELS[kind]}>
                    {group.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </Select>
            <Select label="Lado" value={filters.side} onChange={(e) => updateParams({ side: e.target.value })} selectClassName="py-1.5 text-xs">
              <option value="">Ambos</option>
              <option value="long">Long</option>
              <option value="short">Short</option>
            </Select>
          </div>
        </div>
      </Card>

      {/* Totales del filtro */}
      {!error && (
        <div className={cn('grid grid-cols-2 lg:grid-cols-4 gap-3', loading && 'opacity-70')} aria-live="polite">
          <StatCard
            label="P&L neto"
            value={summary ? fmtMoney(summary.pnl, currency) : '—'}
            valueClassName={summary ? pnlClass(summary.pnl) : undefined}
            hint={summary ? `Comisiones: ${fmtMoney(summary.fees, currency, { sign: false })}` : undefined}
            icon={<Sigma className="h-5 w-5" aria-hidden />}
          />
          <StatCard
            label="Operaciones"
            value={summary ? fmtNum(summary.trades, 0) : '—'}
            hint={summary ? `${summary.wins} ganadas · ${summary.losses} perdidas${summary.breakeven ? ` · ${summary.breakeven} en tablas` : ''}` : undefined}
            icon={<Hash className="h-5 w-5" aria-hidden />}
          />
          <StatCard
            label="Win rate"
            value={summary ? `${fmtNum(summary.win_rate, 1)} %` : '—'}
            valueClassName={summary && summary.wins + summary.losses > 0 ? (summary.win_rate >= 50 ? 'text-profit' : 'text-loss') : undefined}
            hint="Sobre operaciones con resultado"
            icon={<Percent className="h-5 w-5" aria-hidden />}
          />
          <StatCard
            label="Media por operación"
            value={summary && summary.trades > 0 ? fmtMoney(avgPerTrade, currency) : '—'}
            valueClassName={summary && summary.trades > 0 ? pnlClass(avgPerTrade) : undefined}
            icon={<TrendingUp className="h-5 w-5" aria-hidden />}
          />
        </div>
      )}

      {/* Listado */}
      <Card
        flush
        title={
          <span className="tnum">
            {total} operación{total === 1 ? '' : 'es'}
            {hasFilters ? ' con estos filtros' : ''}
          </span>
        }
        actions={loading && items.length > 0 ? <Spinner size="sm" /> : undefined}
        footer={
          total > PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="tnum">
                Mostrando {firstIdx}–{lastIdx} de {total}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" disabled={page <= 1 || loading} onClick={() => goToPage(page - 1)} leftIcon={<ChevronLeft className="h-4 w-4" />}>
                  Anterior
                </Button>
                <span className="px-2 tnum">
                  {page} / {totalPages}
                </span>
                <Button variant="ghost" size="sm" disabled={page >= totalPages || loading} onClick={() => goToPage(page + 1)} rightIcon={<ChevronRight className="h-4 w-4" />}>
                  Siguiente
                </Button>
              </div>
            </div>
          ) : undefined
        }
      >
        {error ? (
          <div className="p-6">
            <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">
              {error}
            </p>
            <Button variant="secondary" size="sm" className="mt-3" onClick={() => void load()}>
              Reintentar
            </Button>
          </div>
        ) : loading && items.length === 0 ? (
          <Spinner className="py-16" label="Cargando operaciones…" />
        ) : items.length === 0 ? (
          <EmptyState
            className="border-0 bg-transparent"
            icon={<ListOrdered className="h-6 w-6" aria-hidden />}
            title={hasFilters || accountId !== null ? 'Sin operaciones con estos filtros' : 'Todavía no has registrado operaciones'}
            description={
              page > 1
                ? 'Esta página está vacía; vuelve a la primera.'
                : hasFilters
                  ? 'Prueba a ampliar el rango de fechas o quitar filtros.'
                  : 'Registra tu primera operación o importa un CSV de tu plataforma.'
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {page > 1 && (
                  <Button variant="secondary" onClick={() => goToPage(1)}>
                    Ir a la primera página
                  </Button>
                )}
                {hasFilters && page <= 1 && (
                  <Button variant="secondary" onClick={() => updateParams({ from: null, to: null, symbol: null, tag_id: null, side: null })}>
                    Quitar filtros
                  </Button>
                )}
                <Button onClick={() => navigate('/operaciones/nueva')} leftIcon={<Plus className="h-4 w-4" />}>
                  Nueva operación
                </Button>
              </div>
            }
          />
        ) : (
          <>
            {/* Escritorio: tabla */}
            <div className={cn('hidden md:block overflow-x-auto', loading && 'opacity-60')}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="px-3 py-2 text-left font-medium">Fecha / hora</th>
                    <th className="px-3 py-2 text-left font-medium">Símbolo</th>
                    <th className="px-3 py-2 text-left font-medium">Lado</th>
                    <th className="px-3 py-2 text-right font-medium">Cant.</th>
                    <th className="px-3 py-2 text-right font-medium">Entrada</th>
                    <th className="px-3 py-2 text-right font-medium">Salida</th>
                    <th className="px-3 py-2 text-right font-medium">P&L</th>
                    <th className="px-3 py-2 text-right font-medium">R</th>
                    <th className="px-3 py-2 text-left font-medium">Etiquetas</th>
                    <th className="px-3 py-2 text-left font-medium">Rating</th>
                    <th className="px-3 py-2 text-left font-medium">Fotos</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((t) => (
                    <TradeRow key={t.id} trade={t} currency={currencyFor(t)} onClick={(tr) => navigate(`/operaciones/${tr.id}`)} />
                  ))}
                </tbody>
              </table>
            </div>
            {/* Móvil: tarjetas en una columna */}
            <div className={cn('md:hidden p-3 space-y-2', loading && 'opacity-60')}>
              {items.map((t) => (
                <TradeCard key={t.id} trade={t} currency={currencyFor(t)} onClick={(tr) => navigate(`/operaciones/${tr.id}`)} />
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
