// Piezas compartidas del Radar: reloj, chips de estado, puntos de impacto, barra de pestañas, convicción.
import { useEffect, useState, type ReactNode } from 'react';
import { Lock } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/Badge';
import { fmtAge, fmtScore, fmtSince, impactDots, scoreClass, type Impact, type RadarStatus, type RadarRegime } from '../../lib/radar';
import { fmtNum } from '../../lib/format';

/** Reloj que se actualiza cada `intervalMs` (para cuentas atrás y "hace X s"). */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function SourceChip({ label, ok, detail, warn }: { label: string; ok: boolean; detail?: string; warn?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]',
        ok && !warn ? 'border-profit/30 bg-profit/10 text-profit' : warn ? 'border-warn/40 bg-warn/10 text-warn' : 'border-loss/40 bg-loss/10 text-loss',
      )}
      title={detail}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', ok && !warn ? 'bg-profit' : warn ? 'bg-warn' : 'bg-loss')} />
      {label}
      {detail && <span className="text-gray-400">· {detail}</span>}
    </span>
  );
}

export function StatusChips({ status, computedAt, regime }: { status: RadarStatus; computedAt: string; regime?: RadarRegime | null }) {
  const now = useNow(5000);
  const p = status.prices;
  const provider = p?.provider === 'yahoo' ? 'Yahoo' : p?.provider === 'mt5' ? 'MT5' : 'Muestra';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SourceChip label={`Precios ${provider}`} ok={!!p?.ok} warn={p?.provider === 'sample' || !!p?.stale} detail={p ? fmtAge(p.age_seconds) : undefined} />
      <SourceChip label="Calendario" ok={status.calendar.ok} detail={status.calendar.ok ? `${status.calendar.events_week ?? 0} eventos` : status.calendar.error ?? 'sin datos'} />
      <SourceChip label="FRED" ok={status.fred.ok} detail={status.fred.ok ? fmtSince(status.fred.last_fetch, now) : status.fred.error ?? 'sin datos'} />
      {status.yields && <SourceChip label="Bonos 2 años" ok={!!status.yields.ok || !!status.yields.live?.ok} warn={!!status.yields.error} detail={status.yields.live?.ok ? fmtSince(status.yields.live.last_fetch, now) : status.yields.error ?? 'sin datos'} />}
      <SourceChip label="COT" ok={status.cot.ok} detail={status.cot.report_date ?? undefined} />
      <SourceChip label="Noticias" ok={status.news.ok} detail={status.news.ok ? fmtSince(status.news.last_fetch, now) : undefined} />
      {regime && (
        <SourceChip
          label={`Régimen · ${regime.key === 'tension' ? 'tensión' : 'calma'}`}
          ok={regime.key === 'calma'}
          warn={regime.key === 'tension'}
          detail={`VIX ${regime.vix === null ? '—' : fmtNum(regime.vix, 1)} · pesos ${regime.weights_name === 'vigente' ? 'vigentes' : regime.weights_name.replace('_', ' ')}`}
        />
      )}
      <span className="text-[11px] text-gray-500">Calculado {fmtSince(computedAt, now)}</span>
    </div>
  );
}

export function PrivateBadge() {
  return (
    <Badge variant="outline" className="gap-1">
      <Lock className="h-3 w-3" /> Privado
    </Badge>
  );
}

export function ImpactDots({ impact, className }: { impact: Impact | string; className?: string }) {
  const n = impactDots(impact);
  const color = impact === 'High' ? 'bg-loss' : impact === 'Medium' ? 'bg-warn' : 'bg-gray-500';
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} title={impact === 'High' ? 'Impacto alto' : impact === 'Medium' ? 'Impacto medio' : 'Impacto bajo'}>
      {[0, 1, 2].map((i) => (
        <span key={i} className={cn('h-1.5 w-1.5 rounded-full', i < n ? color : 'bg-gray-800')} />
      ))}
    </span>
  );
}

export interface TabDef {
  key: string;
  label: string;
  icon?: ReactNode;
}

export function TabBar({ tabs, value, onChange }: { tabs: TabDef[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-panel p-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            value === t.key ? 'bg-accent/15 text-accent-soft' : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100',
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function SectionHeader({ eyebrow, title, live, right }: { eyebrow?: string; title: string; live?: boolean; right?: ReactNode }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">{eyebrow}</p>}
        <h2 className="flex items-center gap-2 text-base font-semibold text-white">
          {title}
          {live && (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-profit">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-profit" /> En vivo
            </span>
          )}
        </h2>
      </div>
      {right}
    </div>
  );
}

/** Valor con signo y color: "+4,77" en verde, "−1,04" en rojo. */
export function ScoreValue({ value, decimals = 2, className }: { value: number | null | undefined; decimals?: number; className?: string }) {
  return <span className={cn('tnum font-semibold', scoreClass(value), className)}>{fmtScore(value, decimals)}</span>;
}

/** Barra de convicción de 5 segmentos con dirección. */
export function ConvictionBar({ n, dir, className }: { n: number; dir: 'alcista' | 'bajista' | 'neutral'; className?: string }) {
  const color = dir === 'alcista' ? 'bg-profit' : dir === 'bajista' ? 'bg-loss' : 'bg-gray-500';
  return (
    <div className={cn('flex gap-1', className)} aria-label={`Convicción ${n} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={cn('h-1.5 flex-1 rounded-full', i <= n ? color : 'bg-gray-800')} />
      ))}
    </div>
  );
}
