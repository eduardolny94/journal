// Calendario económico estilo terminal: filtros, riesgo por día y columnas HORA · PAÍS · EVENTO · IMPACTO ·
// ACTUAL · SORPRESA · PREVISIÓN · ANTERIOR, con cuenta atrás en vivo.
import { useEffect, useMemo, useState } from 'react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { Spinner } from '../ui/Spinner';
import {
  CALENDAR_CATEGORIES, CURRENCIES, categoryLabel, fetchCalendar, favorsClass, favorsText, flagOf, fmtCountdown, fmtLocalTime, fmtNyTime,
  fmtYmd, riskLabel, riskVariant, secondsUntil, ymdOf, type CalendarDay, type CurrencyCode,
} from '../../lib/radar';
import { ImpactDots, useNow } from './common';

type Range = 'semana' | 'proximos7' | 'ultimos30';

function rangeDates(r: Range): { from: string; to: string } {
  const now = new Date();
  const d = (n: number) => ymdOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
  if (r === 'proximos7') return { from: d(0), to: d(7) };
  if (r === 'ultimos30') return { from: d(-30), to: d(0) };
  const dow = now.getDay();
  const monday = dow === 0 ? 1 : dow === 6 ? 2 : 1 - dow;
  return { from: d(monday), to: d(monday + 6) };
}

function Toggle({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button onClick={onClick} className={cn('rounded-md border px-2 py-1 text-[11px] transition-colors', active ? 'border-accent/50 bg-accent/15 text-accent-soft' : 'border-border bg-bg text-gray-400 hover:text-gray-200', className)}>
      {children}
    </button>
  );
}

export default function CalendarTerminal() {
  const now = useNow(1000);
  const [range, setRange] = useState<Range>('semana');
  const [countries, setCountries] = useState<CurrencyCode[]>([]);
  const [impacts, setImpacts] = useState<string[]>(['High']);
  const [categories, setCategories] = useState<string[]>([]);
  const [days, setDays] = useState<CalendarDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    const { from, to } = rangeDates(range);
    fetchCalendar({ from, to, country: countries, impact: impacts, category: categories }, ctrl.signal)
      .then((r) => setDays(r.days))
      .catch((e) => {
        if ((e as Error).name !== 'AbortError') setError((e as Error).message);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [range, countries, impacts, categories]);

  const toggle = <T,>(list: T[], v: T, set: (l: T[]) => void) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const todayKey = ymdOf(new Date());
  const nextEvent = useMemo(() => {
    for (const d of days) for (const e of d.events) if (new Date(e.at_utc).getTime() > now) return e.id;
    return null;
  }, [days, now]);

  return (
    <div className="space-y-4">
      <Card flush>
        <div className="flex flex-wrap items-center gap-2 p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Rango</span>
          <Toggle active={range === 'semana'} onClick={() => setRange('semana')}>Esta semana</Toggle>
          <Toggle active={range === 'proximos7'} onClick={() => setRange('proximos7')}>Próximos 7 días</Toggle>
          <Toggle active={range === 'ultimos30'} onClick={() => setRange('ultimos30')}>Últimos 30 días</Toggle>
          <span className="mx-2 h-4 w-px bg-border" />
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Impacto</span>
          {['High', 'Medium', 'Low'].map((i) => (
            <Toggle key={i} active={impacts.includes(i)} onClick={() => toggle(impacts, i, setImpacts)}>
              <ImpactDots impact={i} className="mr-1" />{i === 'High' ? 'Alto' : i === 'Medium' ? 'Medio' : 'Bajo'}
            </Toggle>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">País</span>
          <Toggle active={countries.length === 0} onClick={() => setCountries([])}>Todos</Toggle>
          {CURRENCIES.map((c) => (
            <Toggle key={c} active={countries.includes(c)} onClick={() => toggle(countries, c, setCountries)}>{flagOf(c)} {c}</Toggle>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border p-3">
          <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Categoría</span>
          <Toggle active={categories.length === 0} onClick={() => setCategories([])}>Todas</Toggle>
          {CALENDAR_CATEGORIES.map((c) => (
            <Toggle key={c.key} active={categories.includes(c.key)} onClick={() => toggle(categories, c.key, setCategories)}>{c.label}</Toggle>
          ))}
        </div>
      </Card>

      {days.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {days.map((d) => (
            <span key={d.date} className={cn('rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-wider', d.risk === 'alto' ? 'border-loss/40 bg-loss/10 text-loss' : d.risk === 'medio' ? 'border-warn/40 bg-warn/10 text-warn' : 'border-profit/30 bg-profit/10 text-profit')}>
              {fmtYmd(d.date, 'EEE d MMM')} · {riskLabel(d.risk).replace('Riesgo ', 'riesgo ')}
            </span>
          ))}
        </div>
      )}

      <Card flush>
        {loading && <div className="p-8"><Spinner label="Cargando calendario…" /></div>}
        {!loading && error && <p className="p-4 text-sm text-loss">{error}</p>}
        {!loading && !error && days.length === 0 && <p className="p-6 text-sm text-gray-500">No hay eventos con estos filtros.</p>}
        {!loading && !error && days.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-xs">
              <thead className="bg-bg/60 text-[10px] uppercase tracking-[0.18em] text-gray-500">
                <tr>
                  <th className="px-3 py-2">Hora</th>
                  <th className="px-3 py-2">País</th>
                  <th className="px-3 py-2">Evento</th>
                  <th className="px-3 py-2">Impacto</th>
                  <th className="px-3 py-2 text-right">Actual</th>
                  <th className="px-3 py-2 text-right">Sorpresa</th>
                  <th className="px-3 py-2 text-right">Previsión</th>
                  <th className="px-3 py-2 text-right">Anterior</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <DayRows key={d.date} day={d} now={now} nextId={nextEvent} isToday={d.date === todayKey} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function DayRows({ day, now, nextId, isToday }: { day: CalendarDay; now: number; nextId: string | null; isToday: boolean }) {
  return (
    <>
      <tr className="border-t border-border bg-panel">
        <td colSpan={8} className="px-3 py-2">
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-gray-200">{isToday ? 'Hoy · ' : ''}{fmtYmd(day.date, 'EEEE d MMM')}</span>
            <span className="text-[11px] text-gray-500">{day.events.length} eventos</span>
            <Badge variant={riskVariant(day.risk)} size="sm" className="ml-auto uppercase tracking-wider">{riskLabel(day.risk)}</Badge>
          </div>
        </td>
      </tr>
      {day.events.map((e) => {
        const secs = secondsUntil(e.at_utc, now);
        const published = !!e.actual;
        const past = secs !== null && secs <= 0;
        const isNext = e.id === nextId;
        return (
          <tr key={e.id} className={cn('border-t border-border/60', published || past ? 'bg-bg/30 text-gray-400' : 'text-gray-200', isNext && 'border-l-2 border-l-accent bg-accent/5')}>
            <td className="px-3 py-2 tnum" title={fmtNyTime(e.at_utc)}>
              {fmtLocalTime(e.at_utc)}
              {isNext && secs !== null && secs > 0 && secs < 2 * 3600 && <span className="block text-[10px] font-semibold uppercase tracking-wider text-accent">Próximo {fmtCountdown(secs)}</span>}
            </td>
            <td className="px-3 py-2 whitespace-nowrap">{flagOf(e.country)} {e.country}</td>
            <td className="px-3 py-2">
              <span className="text-gray-100">{e.title}</span>
              <span className="ml-2 rounded border border-border px-1 py-0.5 text-[10px] text-gray-500">{categoryLabel(e.category)}</span>
            </td>
            <td className="px-3 py-2"><ImpactDots impact={e.impact} /></td>
            <td className="px-3 py-2 text-right tnum text-gray-100">{e.actual ?? '—'}</td>
            <td className={cn('px-3 py-2 text-right tnum', favorsClass(e.favors))}>
              {e.surprise === null ? '—' : `${e.surprise > 0 ? '▲' : e.surprise < 0 ? '▼' : ''} ${favorsText(e.favors) || '='}`}
            </td>
            <td className="px-3 py-2 text-right tnum">{e.forecast ?? '—'}</td>
            <td className="px-3 py-2 text-right tnum">{e.previous ?? '—'}</td>
          </tr>
        );
      })}
    </>
  );
}
