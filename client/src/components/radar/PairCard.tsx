// Tarjeta completa de un activo (par FX, índice o metal): sesgo, precio, fluidez, momentum, vela de ayer,
// niveles, plan, razones y eventos. Con estrella para marcarlo como favorito.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChevronDown, ChevronUp, Star } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/Badge';
import { fmtNum } from '../../lib/format';
import {
  STRENGTH_HELP, assetIcon, assetLabel, biasLabel, biasSentence, biasVariant, confidenceVariant, convictionOf, dataWord, favorsClass, favorsText,
  flagOf, fluidityVariant, fmtCountdown, fmtLocalTime, fmtPips, fmtPrice, fmtScore, secondsUntil, strengthWord, toPips, trendLabel, trendVariant,
  unitOf, warningLabel, warningVariant, type RadarPair,
} from '../../lib/radar';
import { ImpactDots, useNow } from './common';
import { CalibrationLine } from './BacktestCard';

function Level({ label, value, price, digits, pip, accent }: { label: string; value: number; price: number; digits: number; pip?: number; accent?: boolean }) {
  const dist = toPips(value - price, digits, pip);
  return (
    <div className={cn('flex items-center justify-between rounded-md border px-2 py-1 text-xs', accent ? 'border-accent/40 bg-accent/5' : 'border-border bg-bg/50')}>
      <span className="text-gray-400">{label}</span>
      <span className="tnum text-gray-100">{fmtPrice(value, digits)}</span>
      <span className={cn('tnum w-16 text-right', dist > 0 ? 'text-profit' : dist < 0 ? 'text-loss' : 'text-gray-500')}>{fmtPips(dist, { sign: true, unit: false })}</span>
    </div>
  );
}

export interface PairCardProps {
  pair: RadarPair;
  compact?: boolean;
  className?: string;
  favorite?: boolean;
  onToggleFavorite?: (symbol: string) => void;
}

export default function PairCard({ pair, compact = false, className, favorite, onToggleFavorite }: PairCardProps) {
  const [showReasons, setShowReasons] = useState(!compact);
  const now = useNow(1000);
  const S = pair.structure;
  const digits = pair.price.digits;
  const pip = pair.price.pip;
  const price = pair.price.bid;
  const unit = unitOf(pair);
  const posPct = S ? Math.round(Math.max(0, Math.min(1.2, S.pos_pd)) * 100) : null;
  const dirUp = pair.bias === 'alcista';
  const n = convictionOf(pair.diff);
  return (
    <div className={cn('rounded-lg border border-border bg-panel', className)}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          {onToggleFavorite && (
            <button
              onClick={() => onToggleFavorite(pair.symbol)}
              className={cn('rounded-md p-1 transition-colors', favorite ? 'text-warn hover:text-warn/80' : 'text-gray-600 hover:text-gray-300')}
              title={favorite ? 'Quitar de favoritos' : 'Marcar como favorito (aparece cada día en tu panel)'}
              aria-label={favorite ? 'Quitar de favoritos' : 'Marcar como favorito'}
            >
              <Star className="h-4 w-4" fill={favorite ? 'currentColor' : 'none'} />
            </button>
          )}
          <Link to={`/radar/${pair.symbol}`} className="flex items-center gap-2 text-base font-semibold text-white hover:text-accent-soft">
            <span>{assetIcon(pair)}</span>
            {assetLabel(pair)}
            {!pair.base && <span className="text-[10px] font-normal uppercase tracking-wider text-gray-500">{pair.symbol}</span>}
            {pair.main && <span className="text-[10px] font-normal uppercase tracking-wider text-gray-500">principal</span>}
          </Link>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={biasVariant(pair)} size="md">{biasLabel(pair)}</Badge>
          <span className="text-xs text-gray-400" title={STRENGTH_HELP}>
            fuerza <span className={cn('tnum font-semibold', pair.diff > 0 ? 'text-profit' : pair.diff < 0 ? 'text-loss' : 'text-gray-300')}>{n}/5</span> · {strengthWord(n).toLowerCase()}
          </span>
          <Badge variant={confidenceVariant(pair.confidence)}>{dataWord(pair.confidence)}</Badge>
          {pair.bias_change && pair.bias_change.label !== 'estable' && (
            <span title={pair.bias_change.stat ?? `Hace 5 días el sesgo era ${pair.bias_change.prev_diff >= 0 ? '+' : ''}${pair.bias_change.prev_diff}`}>
              <Badge variant={pair.bias_change.label === 'nuevo' || pair.bias_change.label === 'creciente' ? 'profit' : 'default'}>
                sesgo {pair.bias_change.label === 'nuevo' ? 'nuevo' : pair.bias_change.label === 'creciente' ? 'creciendo' : pair.bias_change.label === 'menguante' ? 'menguando' : 'girando'}
              </Badge>
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-4 p-4 lg:grid-cols-[1.1fr_1fr]">
        <div className="space-y-3">
          <p className="text-sm text-gray-200">{biasSentence(pair)}</p>
          {pair.base && <CalibrationLine level={n} />}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400">
            <span>
              Precio <span className="tnum text-base font-semibold text-white">{fmtPrice(price, digits)}</span>
            </span>
            {pair.base && <span>Spread {pair.price.spread_pips === null ? '—' : fmtPips(pair.price.spread_pips)}</span>}
            <span className="flex items-center gap-1">
              Fluidez <Badge variant={fluidityVariant(pair.fluidity.label)}>{pair.fluidity.score} · {pair.fluidity.label}</Badge>
            </span>
            <span title="Eficiencia de tendencia 20 días · rango medio diario">ER {fmtNum(pair.fluidity.er20, 2)} · ADR {fmtPips(pair.fluidity.adr20_pips, { label: unit })}</span>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {(['h1', 'h4', 'd1'] as const).map((k) => (
              <span key={k} className="rounded-md border border-border bg-bg/50 px-2 py-1">
                <span className="text-gray-500">{k.toUpperCase()} </span>
                <span className={cn('tnum font-semibold', pair.momentum[k] > 0.2 ? 'text-profit' : pair.momentum[k] < -0.2 ? 'text-loss' : 'text-gray-300')}>{fmtScore(pair.momentum[k], 2)}</span>
              </span>
            ))}
            {S && (
              <>
                <span className="rounded-md border border-border bg-bg/50 px-2 py-1 text-gray-400">W1 <Badge variant={trendVariant(S.trend.w1)} size="sm">{trendLabel(S.trend.w1)}</Badge></span>
                <span className="rounded-md border border-border bg-bg/50 px-2 py-1 text-gray-400">D1 <Badge variant={trendVariant(S.trend.d1)} size="sm">{trendLabel(S.trend.d1)}</Badge></span>
                <span className="rounded-md border border-border bg-bg/50 px-2 py-1 text-gray-400">H4 <Badge variant={trendVariant(S.trend.h4)} size="sm">{trendLabel(S.trend.h4)}</Badge></span>
              </>
            )}
          </div>
          {S?.yesterday && (
            <p className="text-xs text-gray-300">
              <span className="text-gray-500">Ayer:</span> vela {S.yesterday.dir}
              {S.yesterday.strong ? <span className="text-accent-soft"> con fuerza</span> : ''} (rango {Math.round(S.yesterday.range_vs_adr * 100)} % del ADR, cierre en el {Math.round(S.yesterday.close_pos * 100)} %
              {S.yesterday.volume_vs_avg !== null ? `, volumen ${fmtScore((S.yesterday.volume_vs_avg - 1) * 100, 0)} %` : ''}).
            </p>
          )}
          <div className={cn('rounded-md border p-3 text-sm', pair.strength === 'sin sesgo' ? 'border-border bg-bg/40 text-gray-300' : dirUp ? 'border-profit/30 bg-profit/5 text-gray-100' : 'border-loss/30 bg-loss/5 text-gray-100')}>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Plan</p>
            {pair.plan}
          </div>
          {pair.warnings.length > 0 && (
            <ul className="space-y-1">
              {pair.warnings.map((w) => (
                <li key={w.kind + w.text} className={cn('flex items-start gap-2 rounded-md border px-2 py-1.5 text-xs', warningVariant(w.kind) === 'loss' ? 'border-loss/40 bg-loss/10 text-loss' : 'border-warn/40 bg-warn/10 text-warn')}>
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <span><span className="font-semibold">{warningLabel(w.kind)}:</span> {w.text}</span>
                </li>
              ))}
            </ul>
          )}
          {pair.reasons.length > 0 && (
            <div>
              <button onClick={() => setShowReasons((v) => !v)} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-200">
                {showReasons ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />} Por qué
              </button>
              {showReasons && (
                <ul className="mt-1.5 space-y-1 text-xs text-gray-300">
                  {pair.reasons.map((r, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-accent">•</span>
                      <span>{r}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <div className="space-y-3">
          {S?.levels && (
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">
                <span>Niveles</span>
                <span>distancia en {unit}</span>
              </div>
              <div className="space-y-1">
                <Level label="Máx. ayer" value={S.levels.pd_high} price={price} digits={digits} pip={pip} />
                <Level label="50 % ayer" value={S.levels.pd_mid} price={price} digits={digits} pip={pip} accent />
                <Level label="Mín. ayer" value={S.levels.pd_low} price={price} digits={digits} pip={pip} />
                <Level label="Máx. sem. ant." value={S.levels.pw_high} price={price} digits={digits} pip={pip} />
                <Level label="50 % sem. ant." value={S.levels.pw_mid} price={price} digits={digits} pip={pip} />
                <Level label="Mín. sem. ant." value={S.levels.pw_low} price={price} digits={digits} pip={pip} />
                {S.levels.today_open !== null && <Level label="Apertura hoy" value={S.levels.today_open} price={price} digits={digits} pip={pip} />}
              </div>
              {posPct !== null && (
                <div className="mt-2">
                  <div className="flex justify-between text-[10px] uppercase tracking-wider text-gray-500">
                    <span>Descuento</span>
                    <span>Rango de ayer · {posPct} %</span>
                    <span>Premium</span>
                  </div>
                  <div className="relative mt-1 h-2 rounded-full bg-gradient-to-r from-profit/40 via-gray-700 to-loss/40">
                    <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-panel" style={{ left: `${Math.min(100, Math.max(0, posPct))}%` }} />
                  </div>
                </div>
              )}
              {S.expected && (
                <p className="mt-2 text-xs text-gray-400">
                  {S.levels.today_open === null ? "Sesión de hoy sin velas todavía (mercado cerrado). " : ""}Hoy lleva <span className="tnum text-gray-200">{S.expected.today_range_pct} %</span> del ADR20 ({fmtPips(S.expected.adr20_pips, { label: unit })}); recorrido restante estimado{' '}
                  <span className="tnum text-gray-200">{fmtPips(S.expected.remaining_pips, { label: unit })}</span>.
                </p>
              )}
            </div>
          )}
          {(pair.next_events.length > 0 || pair.last_events.length > 0) && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">{pair.base ? 'Noticias del par' : 'Noticias de EE. UU. que lo mueven'}</p>
              <ul className="space-y-1 text-xs">
                {pair.last_events.slice(0, 2).map((e) => (
                  <li key={`l|${e.currency}|${e.title}|${e.at_utc}`} className="flex flex-wrap items-center gap-x-2 rounded-md bg-bg/40 px-2 py-1 text-gray-400">
                    <span className="tnum">{fmtLocalTime(e.at_utc)}</span>
                    <span>{flagOf(e.currency)} {e.title}</span>
                    <span className="tnum text-gray-200">act {e.actual ?? '—'} / prev {e.forecast ?? '—'}</span>
                    {e.favors && <span className={favorsClass(e.favors)}>{favorsText(e.favors)}</span>}
                    {e.reaction_pips !== undefined && e.reaction_pips !== null && (
                      <span className={cn('tnum', e.reaction_vs_bias === 'a favor' ? 'text-profit' : e.reaction_vs_bias === 'en contra' ? 'text-loss' : 'text-gray-500')}>
                        reacción 1 h {fmtPips(e.reaction_pips, { sign: true, unit: false })} pips{e.reaction_vs_bias ? ` (${e.reaction_vs_bias} del sesgo)` : ''}
                      </span>
                    )}
                  </li>
                ))}
                {pair.next_events.map((e) => {
                  const secs = secondsUntil(e.at_utc, now);
                  return (
                    <li key={`n|${e.currency}|${e.title}|${e.at_utc}`} className="flex flex-wrap items-center gap-x-2 px-2 py-1 text-gray-300">
                      <ImpactDots impact={e.impact} />
                      <span>{flagOf(e.currency)} {e.title}</span>
                      <span className={cn('tnum', secs !== null && secs > 0 && secs < 7200 ? 'font-semibold text-accent' : 'text-gray-500')}>{fmtCountdown(secs)}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
