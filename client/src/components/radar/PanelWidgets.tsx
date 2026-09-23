// Widgets del Panel: pares con más convicción, eventos de mercado, calendario macro, volatilidad, sentimiento
// y fuerza de divisas.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { fmtNum } from '../../lib/format';
import {
  CURRENCY_NAMES, PILLARS, STRENGTH_HELP, biasSentence, confidenceVariant, convictionOf, currencyBias, dataWord, favorsClass, favorsText, strengthWord, topDrivers,
  flagOf, fmtCountdown, fmtLocalTime, fmtScore, fmtSignedInt0, fmtSignedPct, fmtSince, parseNewsTag, secondsUntil,
  sentimentLabelText, sentimentVariant, sortByAbsDiff, vixLabelText, vixVariant,
  type CurrencyCode, type MarketContext, type NewsItem, type NextEvent, type LastEvent, type RadarCurrency, type RadarPair, type Sentiment,
} from '../../lib/radar';
import { ConvictionBar, ImpactDots, ScoreValue, SectionHeader, useNow } from './common';

// ---------- Pares con más convicción ----------

export function ConvictionCards({ pairs, currencies }: { pairs: RadarPair[]; currencies: RadarCurrency[] }) {
  const navigate = useNavigate();
  const sorted = sortByAbsDiff(pairs);
  const top = sorted.slice(0, 3);
  const rest = sorted.slice(3);
  return (
    <div>
      <SectionHeader
        eyebrow="Terminal de activos"
        title="Pares con el sesgo más claro esta semana"
        right={<span className="max-w-md text-[11px] text-gray-500" title={STRENGTH_HELP}>Fuerza del sesgo = cuánto más fuerte está una divisa que la otra en lo macro (0 a 5). No es probabilidad de acierto.</span>}
      />
      <div className="grid gap-3 md:grid-cols-3">
        {top.map((p, i) => {
          const n = convictionOf(p.diff);
          const dir = n === 0 ? 'neutral' : p.diff > 0 ? 'alcista' : 'bajista';
          return (
            <button
              key={p.symbol}
              onClick={() => navigate(`/radar/${p.symbol}`)}
              className="rounded-lg border border-border bg-panel p-4 text-left transition-colors hover:border-accent/40"
            >
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm font-semibold text-white">
                  <span className="text-base">{flagOf(p.base)}{flagOf(p.quote)}</span>
                  {p.symbol}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">#{i + 1} · fuerza del sesgo</span>
              </div>
              <div className="mt-3 flex items-baseline gap-2">
                <span className={cn('text-3xl font-bold tnum', dir === 'alcista' ? 'text-profit' : dir === 'bajista' ? 'text-loss' : 'text-gray-400')}>
                  {dir === 'alcista' ? '▲' : dir === 'bajista' ? '▼' : ''} {fmtSignedInt0(dir === 'bajista' ? -n : n)}
                </span>
                <span className="text-sm text-gray-500">/ 5</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-xs">
                <span className="font-medium text-gray-200">{dir === 'alcista' ? 'Sesgo alcista' : dir === 'bajista' ? 'Sesgo bajista' : 'Sin sesgo'} · {strengthWord(n).toLowerCase()}</span>
                <Badge variant={confidenceVariant(p.confidence)} size="sm">{dataWord(p.confidence)}</Badge>
              </div>
              <ConvictionBar n={n} dir={dir} className="mt-3" />
              <p className="mt-3 text-xs text-gray-300">{biasSentence(p)}</p>
              {topDrivers(p, currencies).length > 0 && <p className="mt-1 text-[11px] text-gray-500">Lo que empuja: {topDrivers(p, currencies).join(', ')}.</p>}
            </button>
          );
        })}
      </div>
      {rest.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="font-semibold uppercase tracking-[0.2em] text-gray-500">Resto</span>
          {rest.map((p) => {
            const n = convictionOf(p.diff);
            const signed = p.diff > 0 ? n : -n;
            return (
              <button key={p.symbol} onClick={() => navigate(`/radar/${p.symbol}`)} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-panel px-2.5 py-1 hover:border-accent/40">
                <span className={cn('h-1.5 w-1.5 rounded-full', signed > 0 ? 'bg-profit' : signed < 0 ? 'bg-loss' : 'bg-gray-500')} />
                <span className="text-gray-200">{p.symbol}</span>
                <span className={cn('tnum', signed > 0 ? 'text-profit' : signed < 0 ? 'text-loss' : 'text-gray-400')}>{fmtSignedInt0(signed)}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------- Eventos de mercado (noticias) ----------

function NewsTag({ tag }: { tag: string }) {
  const { label, dir } = parseNewsTag(tag);
  return (
    <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-medium', dir === 'up' ? 'border-profit/40 bg-profit/10 text-profit' : dir === 'down' ? 'border-loss/40 bg-loss/10 text-loss' : 'border-border bg-bg text-gray-300')}>
      {label}
      {dir === 'up' ? ' ↑' : dir === 'down' ? ' ↓' : ''}
    </span>
  );
}

export function MarketEvents({ news, className, collapsedCount = 2 }: { news: NewsItem[]; className?: string; collapsedCount?: number }) {
  const now = useNow(30_000);
  const [filter, setFilter] = useState<'urgent' | 'all'>('urgent');
  // Plegado: solo los 2 titulares más relevantes. Los titulares son contexto y aviso de riesgo, no señal de entrada.
  const [expanded, setExpanded] = useState(false);
  const urgent = news.filter((n) => n.urgency >= 7);
  const full = filter === 'urgent' ? urgent : news;
  const list = expanded ? full : (urgent.length ? urgent : news).slice(0, collapsedCount);
  return (
    <Card
      className={className}
      title={<span className="flex items-center gap-2">Eventos de mercado <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-profit"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-profit" />En vivo</span></span>}
      actions={
        <div className="flex gap-1 text-[11px]">
          {expanded && (['urgent', 'all'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={cn('rounded-md px-2 py-1', filter === f ? 'bg-accent/15 text-accent-soft' : 'text-gray-400 hover:text-gray-200')}>
              {f === 'urgent' ? 'Urgentes' : 'Todos'}
            </button>
          ))}
          <button onClick={() => setExpanded((v) => !v)} className="rounded-md px-2 py-1 text-accent hover:underline">
            {expanded ? 'Ver menos' : `Ver todos (${news.length})`}
          </button>
        </div>
      }
      flush
    >
      <ul className={cn('divide-y divide-border', expanded && 'max-h-[420px] overflow-y-auto')}>
        {list.length === 0 && <li className="p-4 text-sm text-gray-500">Sin titulares {expanded && filter === 'all' ? '' : 'urgentes '}en las últimas horas.</li>}
        {list.map((n) => (
          <li key={n.id} className={cn('p-3', n.urgency >= 8 && 'bg-loss/5')}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] text-gray-500">{fmtSince(n.published_at, now)} · {n.source}</span>
              {n.urgency >= 7 && (
                <span className="rounded border border-loss/40 bg-loss/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-loss">Urgente {n.urgency}/10</span>
              )}
            </div>
            <a href={n.link} target="_blank" rel="noreferrer" className="mt-1 block text-sm text-gray-100 hover:text-accent-soft">
              {n.title} <ExternalLink className="ml-0.5 inline h-3 w-3 text-gray-500" />
            </a>
            {n.tags.length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {n.tags.map((t) => (
                  <NewsTag key={t} tag={t} />
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ---------- Calendario macro (mini) ----------

const MACRO_MINI_ROWS = 4;

/** Filas que pinta el calendario del panel: solo impacto alto, 1 publicada como mucho y el resto próximas. */
export function macroMiniRows(upcoming: NextEvent[], published: LastEvent[]): { published: LastEvent[]; upcoming: NextEvent[]; total: number } {
  const pub = published.filter((e) => e.impact === 'High').slice(0, 1);
  const next = upcoming.filter((e) => e.impact === 'High').slice(0, MACRO_MINI_ROWS - pub.length);
  return { published: pub, upcoming: next, total: pub.length + next.length };
}

export function MacroCalendarMini({ upcoming, published, className }: { upcoming: NextEvent[]; published: LastEvent[]; className?: string }) {
  const now = useNow(1000);
  // Solo impacto alto: es lo que mueve el precio y por lo que conviene no entrar justo antes.
  const rows = macroMiniRows(upcoming, published);
  const items = rows.upcoming;
  const publishedHigh = rows.published;
  return (
    <Card
      className={className}
      title={<span className="flex items-center gap-2">Noticias fuertes <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-profit"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-profit" />En vivo</span></span>}
      flush
    >
      <ul className="divide-y divide-border">
        {publishedHigh.map((e) => (
          <li key={`${e.currency}|${e.title}|${e.at_utc}`} className="bg-bg/40 p-3">
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <span>{fmtLocalTime(e.at_utc)}</span>
              <span>{flagOf(e.currency)} {e.currency}</span>
              <ImpactDots impact={e.impact} />
            </div>
            <p className="mt-0.5 text-sm text-gray-200">{e.title}</p>
            <p className="mt-0.5 text-[11px] tnum text-gray-400">
              Act <span className="text-gray-100">{e.actual ?? '—'}</span> · Prev {e.forecast ?? '—'} · Ant {e.previous ?? '—'}
              {e.favors && <span className={cn('ml-2', favorsClass(e.favors))}>{favorsText(e.favors)}</span>}
            </p>
          </li>
        ))}
        {items.map((e, i) => {
          const secs = secondsUntil(e.at_utc, now);
          const soon = secs !== null && secs > 0 && secs < 2 * 3600;
          return (
            <li key={`${e.currency}|${e.title}|${e.at_utc}`} className={cn('p-3', i === 0 && 'border-l-2 border-l-accent')}>
              <div className="flex items-center justify-between gap-2 text-[11px] text-gray-500">
                <span className="flex items-center gap-2">
                  <span>{fmtLocalTime(e.at_utc)}</span>
                  <span>{flagOf(e.currency)} {e.currency}</span>
                  <ImpactDots impact={e.impact} />
                </span>
                <span className={cn('tnum', soon ? 'font-semibold text-accent' : '')}>{fmtCountdown(secs)}</span>
              </div>
              <p className="mt-0.5 text-sm text-gray-200">{e.title}</p>
              {(e.forecast || e.previous) && <p className="mt-0.5 text-[11px] tnum text-gray-500">Prev {e.forecast ?? '—'} · Ant {e.previous ?? '—'}</p>}
            </li>
          );
        })}
        {items.length === 0 && <li className="p-4 text-sm text-gray-500">Sin noticias de impacto alto en los próximos 7 días.</li>}
      </ul>
    </Card>
  );
}

// ---------- Volatilidad y sentimiento ----------

export function VolatilityCard({ market }: { market: MarketContext | null }) {
  if (!market) return null;
  const v = market.vix;
  return (
    <Card title={<span className="flex items-center gap-2">Volatilidad <span className="text-[10px] font-semibold uppercase tracking-wider text-profit">● En vivo</span></span>} actions={<Badge variant={vixVariant(v.label)}>{vixLabelText(v.label)}</Badge>}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="shrink-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">VIX spot</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className="text-3xl font-bold tnum text-white">{fmtNum(v.value, 2)}</span>
        <span className={cn('text-sm tnum', (v.change_pct ?? 0) > 0 ? 'text-loss' : 'text-profit')}>{fmtSignedPct(v.change_pct)}</span>
      </p>
      <p className="mt-1 text-xs text-gray-400">{v.label === 'calma' ? 'Volatilidad baja. Mercado estable.' : v.label === 'tension' ? 'Volatilidad alta. Modo refugio.' : 'Volatilidad normal.'}</p>
      </div>
      <div className="grid flex-1 grid-cols-3 gap-2 text-xs sm:max-w-sm">
        {[
          ['S&P 500', market.sp500],
          ['WTI', market.oil],
          ['DXY', market.dxy],
        ].map(([label, q]) => {
          const quote = q as MarketContext['sp500'];
          return (
            <div key={label as string} className="rounded-md border border-border bg-bg/60 p-2">
              <p className="text-[10px] uppercase tracking-wider text-gray-500">{label as string}</p>
              <p className="tnum text-gray-100">{fmtNum(quote.value, 2)}</p>
              <p className={cn('tnum text-[11px]', (quote.change_pct ?? 0) >= 0 ? 'text-profit' : 'text-loss')}>{fmtSignedPct(quote.change_pct)}</p>
            </div>
          );
        })}
      </div>
      </div>
    </Card>
  );
}

export function SentimentCard({ sentiment }: { sentiment: Sentiment | null }) {
  if (!sentiment) return null;
  return (
    <Card title={<span className="flex items-center gap-2">Sentimiento <span className="text-[10px] font-semibold uppercase tracking-wider text-profit">● En vivo</span></span>} actions={<Badge variant={sentimentVariant(sentiment.label)}>{sentimentLabelText(sentiment.label)}</Badge>}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="shrink-0">
      <div className="flex items-center gap-2">
        {sentiment.signals.map((s) => (
          <span key={s.name} title={`${s.name}: ${s.text}`} className={cn('h-2.5 w-2.5 rounded-full', s.on ? 'bg-profit' : 'bg-gray-700')} />
        ))}
        <span className="text-xs text-gray-400">{sentiment.risk_on_signals}/5 señales activas</span>
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Posicionamiento</p>
      <p className="text-2xl font-bold uppercase tracking-wide text-white">{sentiment.positioning_label}</p>
      </div>
      <ul className="grid flex-1 grid-cols-1 gap-x-4 gap-y-1.5 text-xs text-gray-400 sm:max-w-sm sm:grid-cols-2">
        {sentiment.signals.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <span className={cn('h-1.5 w-1.5 rounded-full', s.on ? 'bg-profit' : 'bg-gray-700')} />
            {s.text}
          </li>
        ))}
      </ul>
      </div>
    </Card>
  );
}

// ---------- Fuerza de divisas ----------

export function CurrencyStrength({ currencies, selected, onSelect }: { currencies: RadarCurrency[]; selected?: CurrencyCode | null; onSelect?: (c: CurrencyCode | null) => void }) {
  const sorted = [...currencies].sort((a, b) => a.rank - b.rank);
  return (
    <Card title="Fuerza de divisas" subtitle="Puntuación −10..+10 (tasas 20 %, expectativas de tipos 15 %, sorpresas 15 %, momentum 15 %, inflación 10 %, COT 10 %, riesgo 10 %, tono 5 %). Abre una divisa para ver sus pilares." flush>
      <ul className="divide-y divide-border">
        {sorted.map((c) => {
          const open = selected === c.code;
          const bias = currencyBias(c.score);
          const pct = Math.min(100, (Math.abs(c.score) / 10) * 100);
          return (
            <li key={c.code}>
              <button onClick={() => onSelect?.(open ? null : c.code)} className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-800/40">
                <span className="w-5 text-xs tnum text-gray-500">{c.rank}</span>
                <span className="text-base">{flagOf(c.code)}</span>
                <span className="w-24 text-sm font-semibold text-gray-100">
                  {c.code} <span className="ml-1 hidden text-[11px] font-normal text-gray-500 lg:inline">{CURRENCY_NAMES[c.code].split(' ')[0]}</span>
                </span>
                <span className="relative h-2 flex-1 rounded-full bg-gray-800">
                  <span className="absolute left-1/2 top-0 h-full w-px bg-gray-600" />
                  <span
                    className={cn('absolute top-0 h-full rounded-full', bias === 'alcista' ? 'bg-profit' : bias === 'bajista' ? 'bg-loss' : 'bg-gray-500')}
                    style={c.score >= 0 ? { left: '50%', width: `${pct / 2}%` } : { right: '50%', width: `${pct / 2}%` }}
                  />
                </span>
                <ScoreValue value={c.score} className="w-16 text-right text-sm" />
                {open ? <ChevronUp className="h-4 w-4 text-gray-500" /> : <ChevronDown className="h-4 w-4 text-gray-500" />}
              </button>
              {open && (
                <div className="grid gap-1.5 bg-bg/50 px-4 pb-3 pt-1 sm:grid-cols-2">
                  {PILLARS.map((p) => {
                    const v = c.pillars[p.key];
                    return (
                      <div key={p.key} className="flex items-center gap-2 text-xs" title={p.hint}>
                        <span className="w-28 text-gray-400">{p.label} <span className="text-gray-600">{p.weight}%</span></span>
                        <span className="relative h-1.5 w-20 rounded-full bg-gray-800">
                          <span className={cn('absolute top-0 h-full rounded-full', v.value >= 0 ? 'bg-profit' : 'bg-loss')} style={v.value >= 0 ? { left: '50%', width: `${Math.min(50, Math.abs(v.value) * 25)}%` } : { right: '50%', width: `${Math.min(50, Math.abs(v.value) * 25)}%` }} />
                        </span>
                        <span className={cn('w-12 tnum', v.missing ? 'text-gray-600' : v.value >= 0 ? 'text-profit' : 'text-loss')}>{v.missing ? 'sin dato' : fmtScore(v.value, 1)}</span>
                        <span className="truncate text-gray-500">{v.text}</span>
                      </div>
                    );
                  })}
                  <p className="text-[11px] text-gray-500 sm:col-span-2">
                    Tasa de política: <span className="text-gray-300 tnum">{c.policy_rate.rate !== null ? `${fmtNum(c.policy_rate.rate, 2)} %` : '—'}</span> ({c.policy_rate.source})
                  </p>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
