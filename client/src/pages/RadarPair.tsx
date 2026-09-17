// Detalle de un activo del radar (par FX, índice o metal): gráfico de TradingView, tarjeta completa,
// pilares de sus divisas (pares) e historial de puntuación.
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageSpinner } from '../components/ui/Spinner';
import PairCard from '../components/radar/PairCard';
import { BiasHistoryChart, TradingViewChart } from '../components/radar/Charts';
import { CurrencyStrength } from '../components/radar/PanelWidgets';
import { PrivateBadge } from '../components/radar/common';
import { cn } from '../lib/cn';
import { INSTRUMENT_PILLAR_LABELS, assetLabel, fetchFavorites, fetchRadarPair, fmtScore, normalizeAnySymbol, saveFavorites, tvSymbolOf, type CurrencyCode, type RadarPairDetail } from '../lib/radar';

export default function RadarPair() {
  const { symbol } = useParams();
  const key = normalizeAnySymbol(symbol);
  const [detail, setDetail] = useState<RadarPairDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CurrencyCode | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const run = () => fetchRadarPair(key).then((d) => !cancelled && setDetail(d)).catch((e) => !cancelled && setError((e as Error).message));
    run();
    fetchFavorites().then((f) => !cancelled && setFavorites(f)).catch(() => {});
    const id = window.setInterval(run, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [key]);
  async function toggleFavorite(sym: string) {
    const next = favorites.includes(sym) ? favorites.filter((s) => s !== sym) : [...favorites, sym];
    setFavorites(next);
    try {
      setFavorites(await saveFavorites(next));
    } catch {
      setFavorites(favorites);
    }
  }
  if (!key) return <EmptyState title="Activo no válido" action={<Link to="/radar"><Button>Volver al radar</Button></Link>} />;
  if (!detail && !error) return <PageSpinner label={`Cargando ${key}…`} />;
  if (!detail) return <EmptyState title="No se pudo cargar el activo" description={error ?? ''} action={<Link to="/radar"><Button>Volver al radar</Button></Link>} />;
  const { pair, currencies } = detail;
  const isInstrument = !pair.base;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link to="/radar" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200"><ArrowLeft className="h-3.5 w-3.5" /> Radar</Link>
          <h1 className="flex items-center gap-2 text-2xl font-semibold text-white">{assetLabel(pair)} {isInstrument && <span className="text-base font-normal text-gray-500">{pair.symbol}</span>} <PrivateBadge /></h1>
        </div>
      </div>
      <TradingViewChart symbol={tvSymbolOf(pair)} title={assetLabel(pair)} />
      <PairCard pair={pair} favorite={favorites.includes(pair.symbol)} onToggleFavorite={toggleFavorite} />
      <div className="grid gap-4 xl:grid-cols-2">
        {isInstrument ? (
          <Card title="Qué empuja el sesgo" subtitle="Pilares del activo: valor normalizado (−2 débil … +2 fuerte) y su lectura.">
            <ul className="space-y-2">
              {Object.entries(pair.pillars ?? {}).map(([k, v]) => (
                <li key={k} className="flex items-start gap-3 text-xs">
                  <span className="w-40 shrink-0 text-gray-400">{INSTRUMENT_PILLAR_LABELS[k] ?? k}</span>
                  <span className="relative mt-1 h-1.5 w-24 shrink-0 rounded-full bg-gray-800">
                    <span className={cn('absolute top-0 h-full rounded-full', v.value >= 0 ? 'bg-profit' : 'bg-loss')} style={v.value >= 0 ? { left: '50%', width: `${Math.min(50, Math.abs(v.value) * 25)}%` } : { right: '50%', width: `${Math.min(50, Math.abs(v.value) * 25)}%` }} />
                  </span>
                  <span className={cn('w-12 shrink-0 tnum', v.missing ? 'text-gray-600' : v.value >= 0 ? 'text-profit' : 'text-loss')}>{v.missing ? '—' : fmtScore(v.value, 1)}</span>
                  <span className="text-gray-300">{v.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <CurrencyStrength currencies={currencies} selected={selected} onSelect={setSelected} />
        )}
        {isInstrument ? <BiasHistoryChart symbol={pair.symbol} label={assetLabel(pair)} /> : <BiasHistoryChart base={pair.base as CurrencyCode} quote={pair.quote as CurrencyCode} />}
      </div>
    </div>
  );
}
