// Integraciones del radar fuera de su página: tarjetas del Dashboard y aviso en el formulario de operación.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Radar as RadarIcon } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { fmtMoney, fmtNum } from '../../lib/format';
import { useRadarEnabled } from '../../store/session';
import {
  alignmentLabel, alignmentOf, assetIcon, assetLabel, biasLabel, biasPhrase, biasVariant, convictionOf, fetchBiasStats, fetchFavorites, findAsset, getRadarSnapshot, strengthWord,
  planSummary, sortByAbsDiff, type BiasStat, type RadarSnapshot,
} from '../../lib/radar';

export function RadarDashboardCards({ accountId, currency }: { accountId: number | null; currency: string }) {
  const enabled = useRadarEnabled();
  const [snap, setSnap] = useState<RadarSnapshot | null>(null);
  const [stats, setStats] = useState<BiasStat[] | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return;
    getRadarSnapshot().then(setSnap).catch(() => setSnap(null));
    fetchFavorites().then(setFavorites).catch(() => setFavorites([]));
  }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    fetchBiasStats(accountId).then(setStats).catch(() => setStats(null));
  }, [enabled, accountId]);
  if (!enabled) return null;
  const all = snap ? [...snap.pairs, ...snap.instruments] : [];
  const favs = all.filter((p) => favorites.includes(p.symbol));
  const top = snap ? (favs.length ? sortByAbsDiff(favs).slice(0, 4) : sortByAbsDiff(snap.pairs).slice(0, 3)) : [];
  const total = stats ? stats.reduce((s, r) => s + r.trades, 0) : 0;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={<span className="flex items-center gap-2"><RadarIcon className="h-4 w-4 text-accent" /> Sesgo de hoy</span>} subtitle={favorites.length ? 'Tus favoritos, ordenados por claridad del sesgo' : 'Los tres pares con el sesgo más claro del Radar (marca ★ en el Radar para elegir los tuyos)'} actions={<Link to="/radar" className="text-xs text-accent hover:underline">Abrir Radar</Link>}>
        {!snap && <p className="text-sm text-gray-500">Cargando el radar…</p>}
        {snap && (
          <ul className="divide-y divide-border">
            {top.map((p) => {
              const n = convictionOf(p.diff);
              return (
                <li key={p.symbol} className="flex items-start gap-3 py-2 first:pt-0 last:pb-0">
                  <Link to={`/radar/${p.symbol}`} className="w-28 shrink-0 text-sm font-semibold text-gray-100 hover:text-accent-soft">{assetIcon(p)} {assetLabel(p)}</Link>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={biasVariant(p)}>{biasLabel(p)}</Badge>
                      <span className={cn('text-xs tnum', p.diff > 0 ? 'text-profit' : p.diff < 0 ? 'text-loss' : 'text-gray-400')}>fuerza {n}/5 · {strengthWord(n).toLowerCase()}</span>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-gray-400" title={p.plan}>{planSummary(p.plan)}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title="A favor del radar" subtitle="Resultado de tus operaciones según iban a favor o en contra del sesgo">
        {stats && total > 0 ? (
          <div className="grid grid-cols-3 gap-2">
            {stats.map((s) => (
              <div key={s.alignment} className="rounded-md border border-border bg-bg/50 p-3">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">{alignmentLabel(s.alignment)}</p>
                <p className={cn('mt-1 text-lg font-semibold tnum', s.pnl > 0 ? 'text-profit' : s.pnl < 0 ? 'text-loss' : 'text-gray-300')}>{fmtMoney(s.pnl, currency)}</p>
                <p className="text-[11px] text-gray-400 tnum">{s.trades} op. · {fmtNum(s.win_rate, 0)} % acierto{s.avg_r !== null ? ` · ${fmtNum(s.avg_r, 2)} R` : ''}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500">Registra operaciones para medirlo: cada operación guarda si iba a favor o en contra del sesgo del radar en ese momento.</p>
        )}
      </Card>
    </div>
  );
}

export function RadarSymbolHint({ symbol, side }: { symbol: string; side: 'long' | 'short' }) {
  const enabled = useRadarEnabled();
  const [snap, setSnap] = useState<RadarSnapshot | null>(null);
  useEffect(() => {
    if (!enabled) return;
    getRadarSnapshot().then(setSnap).catch(() => setSnap(null));
  }, [enabled]);
  if (!enabled || !snap) return null;
  const pair = findAsset(snap, symbol);
  if (!pair) return null;
  const a = alignmentOf(side, pair);
  return (
    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
      <RadarIcon className="h-3.5 w-3.5 text-accent" />
      Radar: <span className="text-gray-200">{assetLabel(pair)} {biasPhrase(pair)}</span> ·
      <span className={a === 'a_favor' ? 'text-profit' : a === 'en_contra' ? 'text-loss' : 'text-gray-400'}>tu operación va {a === 'a_favor' ? 'a favor' : a === 'en_contra' ? 'en contra' : 'sin sesgo'}</span>
    </p>
  );
}
