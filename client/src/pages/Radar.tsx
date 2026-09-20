// Radar de divisas, índices y metales (privado): panel global tipo terminal con pestañas y favoritos.
import FavoritesPicker from '../components/radar/FavoritesPicker';
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, CalendarDays, Coins, Globe2, RefreshCw, Settings2, Star, Table2, Users } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import CalendarTerminal from '../components/radar/CalendarTerminal';
import PairCard from '../components/radar/PairCard';
import WorldMap from '../components/radar/WorldMap';
import { PrivateBadge, StatusChips, TabBar, useNow } from '../components/radar/common';
import { ConvictionCards, CurrencyStrength, MacroCalendarMini, MarketEvents, SentimentCard, VolatilityCard } from '../components/radar/PanelWidgets';
import { AccuracyCard, ComparativeTable, CotTable, SettingsTab } from '../components/radar/Tables';
import { BacktestCard, LongBiasCard, MethodCard } from '../components/radar/BacktestCard';
import { ExpectationsTable, SundayNotes, WeekPlanView } from '../components/radar/WeekTab';
import {
  collectPublishedEvents, fetchFavorites, fetchNews, fmtSince, getRadarSnapshot, refreshRadar, saveFavorites, setRadarSnapshotCache, sortByAbsDiff,
  MAX_FAVORITES, type CurrencyCode, type NewsItem, type RadarPair, type RadarSnapshot,
} from '../lib/radar';

const TABS = [
  { key: 'panel', label: 'Panel', icon: <Globe2 className="h-3.5 w-3.5" /> },
  { key: 'activos', label: 'Índices y metales', icon: <Coins className="h-3.5 w-3.5" /> },
  { key: 'semana', label: 'Semana', icon: <CalendarDays className="h-3.5 w-3.5" /> },
  { key: 'calendario', label: 'Calendario', icon: <Table2 className="h-3.5 w-3.5" /> },
  { key: 'comparativa', label: 'Comparativa', icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { key: 'posicionamiento', label: 'Posicionamiento', icon: <Users className="h-3.5 w-3.5" /> },
  { key: 'ajustes', label: 'Ajustes', icon: <Settings2 className="h-3.5 w-3.5" /> },
];

export default function Radar() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? (params.get('tab') as string) : 'panel';
  const [snap, setSnap] = useState<RadarSnapshot | null>(null);
  const [news, setNews] = useState<NewsItem[]>([]);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<CurrencyCode | null>(null);
  const [picking, setPicking] = useState(false);
  const [favNotice, setFavNotice] = useState<string | null>(null);
  const now = useNow(10_000);

  const load = useCallback(async (force = false) => {
    try {
      const s = force ? await refreshRadar() : await getRadarSnapshot({ force: true });
      setRadarSnapshotCache(s);
      setSnap(s);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
    fetchNews({ limit: 40 }).then(setNews).catch(() => {});
    fetchFavorites().then(setFavorites).catch(() => {});
    const id = window.setInterval(() => {
      void load();
      fetchNews({ limit: 40 }).then(setNews).catch(() => {});
    }, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load(true);
    fetchNews({ limit: 40 }).then(setNews).catch(() => {});
    setRefreshing(false);
  }

  async function toggleFavorite(symbol: string) {
    if (!favorites.includes(symbol) && favorites.length >= MAX_FAVORITES) {
      setFavNotice(`Ya tienes ${MAX_FAVORITES} favoritos. Quita uno o usa «Elegir favoritos» para cambiarlos.`);
      window.setTimeout(() => setFavNotice(null), 5000);
      return;
    }
    const next = favorites.includes(symbol) ? favorites.filter((s) => s !== symbol) : [...favorites, symbol];
    setFavorites(next);
    try {
      setFavorites(await saveFavorites(next));
    } catch {
      setFavorites(favorites);
    }
  }

  if (!snap && !error) return <PageSpinner label="Calculando el radar…" />;
  if (!snap) return <EmptyState title="El radar no está disponible" description={error ?? ''} action={<Button onClick={() => void load()}>Reintentar</Button>} />;

  const allAssets: RadarPair[] = [...snap.pairs, ...snap.instruments];
  const favAssets = favorites.map((s) => allAssets.find((p) => p.symbol === s)).filter((p): p is RadarPair => !!p);
  // Sin favoritos elegidos: los 3 pares con el sesgo más claro hoy.
  const topPairs = sortByAbsDiff(snap.pairs).slice(0, MAX_FAVORITES);
  const published = collectPublishedEvents(snap.pairs);
  const cardProps = (p: RadarPair) => ({ favorite: favorites.includes(p.symbol), onToggleFavorite: toggleFavorite, pair: p, key: p.symbol });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">
            Radar <PrivateBadge />
          </h1>
          <p className="mt-1 text-sm text-gray-400">Divisas, índices y metales: quién está fuerte, quién débil, qué activo tiene sesgo y por qué. Informa, no ordena: la entrada es tuya.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => void onRefresh()} loading={refreshing} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
          Actualizar
        </Button>
      </div>
      <StatusChips status={snap.status} computedAt={snap.computed_at} regime={snap.regime} />
      {snap.status.prices?.provider === 'sample' && (
        <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">Precios de muestra: Yahoo Finance no responde ahora mismo. El resto de datos es real; los niveles y el momentum pueden estar desactualizados.</p>
      )}
      {error && <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">{error}</p>}
      <TabBar tabs={TABS} value={tab} onChange={(k) => setParams(k === 'panel' ? {} : { tab: k })} />

      {tab === 'panel' && (
        <div className="space-y-6">
          <WorldMap currencies={snap.currencies} onSelect={(c) => setSelected(c)} updatedLabel={`Actualizado ${fmtSince(snap.computed_at, now)}`} />
          <ConvictionCards pairs={snap.pairs} currencies={snap.currencies} />
          <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr_0.9fr]">
            <MarketEvents news={news.length ? news : snap.news_top} />
            <MacroCalendarMini upcoming={snap.upcoming} published={published} />
            <div className="space-y-4">
              <VolatilityCard market={snap.market} />
              <SentimentCard sentiment={snap.sentiment} />
            </div>
          </div>
          <CurrencyStrength currencies={snap.currencies} selected={selected} onSelect={setSelected} />
          <div>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <h2 className="flex items-center gap-2 text-base font-semibold text-white">
                <Star className="h-4 w-4 text-warn" fill="currentColor" /> {favAssets.length ? 'Mis favoritos' : 'Los 3 con el sesgo más claro hoy'}
              </h2>
              <span className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                {favAssets.length ? `${favAssets.length} de ${MAX_FAVORITES} elegidos.` : `Todavía no has elegido favoritos: elige hasta ${MAX_FAVORITES} activos para verlos aquí cada día.`}
                <Button size="sm" variant="secondary" onClick={() => setPicking(true)} leftIcon={<Star className="h-3.5 w-3.5" />}>{favAssets.length ? 'Cambiar favoritos' : 'Elegir favoritos'}</Button>
              </span>
            </div>
            {favNotice && <p className="mb-3 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">{favNotice}</p>}
            <div className="grid gap-4 2xl:grid-cols-2">
              {(favAssets.length ? sortByAbsDiff(favAssets) : topPairs).map((p) => (
                <PairCard {...cardProps(p)} compact />
              ))}
            </div>
          </div>
        </div>
      )}

      <FavoritesPicker
        open={picking}
        onClose={() => setPicking(false)}
        pairs={snap.pairs}
        instruments={snap.instruments}
        favorites={favorites}
        onSave={async (symbols) => setFavorites(await saveFavorites(symbols))}
      />

      {tab === 'activos' && (
        <div className="space-y-4">
          <div className="rounded-md border border-border bg-panel px-4 py-3 text-xs text-gray-400">
            Índices y metales con su propio sesgo: momentum, tipos reales (metales) o bono a 10 años (índices), dólar o crédito, VIX, sorpresas macro de EE. UU., expectativas de la Fed y COT (dinero gestionado en oro y plata; fondos apalancados en S&P, Nasdaq, Dow y Nikkei). Marca ★ para verlos cada día en el panel.
          </div>
          {snap.instruments.length === 0 && <EmptyState title="Sin datos de índices y metales todavía" description="Los precios se descargan en el primer minuto tras arrancar. Vuelve a cargar en un momento." />}
          <div className="grid gap-4 2xl:grid-cols-2">
            {sortByAbsDiff(snap.instruments).map((p) => (
              <PairCard {...cardProps(p)} compact />
            ))}
          </div>
        </div>
      )}

      {tab === 'semana' && (
        <div className="space-y-4">
          <LongBiasCard pairs={snap.pairs} />
          <ExpectationsTable expectations={snap.expectations} onSaved={() => void load()} />
          <WeekPlanView week={snap.week} />
          <SundayNotes />
        </div>
      )}

      {tab === 'calendario' && <CalendarTerminal />}
      {tab === 'comparativa' && (
        <div className="space-y-4">
          <ComparativeTable pairs={allAssets} />
          <MethodCard />
          <BacktestCard />
          <AccuracyCard />
        </div>
      )}
      {tab === 'posicionamiento' && <CotTable rows={snap.cot} reportDate={snap.status.cot.report_date} />}
      {tab === 'ajustes' && <SettingsTab currencies={snap.currencies} onChanged={() => void load()} />}
    </div>
  );
}
