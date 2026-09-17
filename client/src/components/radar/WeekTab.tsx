// Pestaña Semana: expectativas de tipos (lo descontado), plan de la semana y reporte del domingo.
import { useEffect, useRef, useState } from 'react';
import { Check, ExternalLink, Save } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import {
  CB_WATCH_LINKS, CENTRAL_BANKS, fetchNotes, flagOf, fmtLocalTime, fmtYmd, pricedLabel, pricedVariant, riskLabel, riskVariant, saveExpectation,
  saveNotes, tradingWeek, type Expectation, type WeekPlan,
} from '../../lib/radar';
import { ImpactDots } from './common';

// ---------- Expectativas ----------

function ExpectationRow({ e, onSaved }: { e: Expectation; onSaved: () => void }) {
  const [hike, setHike] = useState(e.prob_hike ?? 0);
  const [cut, setCut] = useState(e.prob_cut ?? 0);
  const [hold, setHold] = useState(e.prob_hold ?? 100);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setHike(e.prob_hike ?? 0);
    setCut(e.prob_cut ?? 0);
    setHold(e.prob_hold ?? 100);
  }, [e.prob_hike, e.prob_cut, e.prob_hold]);
  const sum = hike + cut + hold;
  const dirty = hike !== (e.prob_hike ?? 0) || cut !== (e.prob_cut ?? 0) || hold !== (e.prob_hold ?? 100);
  const link = CB_WATCH_LINKS[e.currency];
  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveExpectation(e.currency, { prob_hike: hike, prob_cut: cut, prob_hold: hold, meeting_date: e.meeting_date, source: link?.label ?? 'manual' });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2000);
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }
  const num = (v: string) => Math.max(0, Math.min(100, Number(v) || 0));
  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2">
        <p className="text-sm font-semibold text-gray-100">{flagOf(e.currency)} {e.currency} <span className="text-xs font-normal text-gray-500">{CENTRAL_BANKS[e.currency]}</span></p>
        {link && (
          <a href={link.url} target="_blank" rel="noreferrer" className="text-[11px] text-accent hover:underline">
            {link.label} <ExternalLink className="inline h-3 w-3" />
          </a>
        )}
      </td>
      <td className="px-3 py-2 text-xs text-gray-300 tnum">
        {e.meeting_date ? fmtYmd(e.meeting_date, 'EEE d MMM') : '—'}
        {e.days_to !== null && <span className="block text-gray-500">{e.days_to <= 0 ? 'hoy' : `en ${e.days_to} d`}</span>}
      </td>
      {[
        ['Subida', hike, setHike],
        ['Bajada', cut, setCut],
        ['Mantener', hold, setHold],
      ].map(([label, val, set]) => (
        <td key={label as string} className="px-2 py-2">
          <label className="block text-[10px] uppercase tracking-wider text-gray-500 sm:hidden">{label as string}</label>
          <input
            type="number"
            min={0}
            max={100}
            value={val as number}
            onChange={(ev) => (set as (n: number) => void)(num(ev.target.value))}
            className="w-16 rounded-md border border-border bg-bg px-2 py-1 text-sm tnum text-gray-100 focus:border-accent focus:outline-none"
          />
        </td>
      ))}
      <td className="px-3 py-2">
        <Badge variant={pricedVariant(e.priced)}>{pricedLabel(e.priced)}{e.priced_pct !== null ? ` ${Math.round(e.priced_pct)} %` : ''}</Badge>
        <p className="mt-1 max-w-xs text-[11px] text-gray-400">{e.reading}</p>
        {error && <p className="text-[11px] text-loss">{error}</p>}
        {Math.abs(sum - 100) > 1 && <p className="text-[11px] text-warn">Las tres deben sumar 100 (suman {sum}).</p>}
      </td>
      <td className="px-3 py-2 text-right">
        <Button size="sm" variant={dirty ? 'primary' : 'secondary'} disabled={!dirty || Math.abs(sum - 100) > 1} loading={saving} onClick={() => void save()} leftIcon={saved ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}>
          {saved ? 'Guardado' : 'Guardar'}
        </Button>
      </td>
    </tr>
  );
}

export function ExpectationsTable({ expectations, onSaved }: { expectations: Expectation[]; onSaved: () => void }) {
  return (
    <Card title="Lo que está descontado" subtitle="Probabilidad que da el mercado a la próxima decisión de cada banco central. Anótala una vez por semana desde las herramientas de CME (20 segundos)." flush>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left">
          <thead className="text-[10px] uppercase tracking-wider text-gray-500">
            <tr>
              <th className="px-3 py-2">Banco</th>
              <th className="px-3 py-2">Reunión</th>
              <th className="px-2 py-2">Subida %</th>
              <th className="px-2 py-2">Bajada %</th>
              <th className="px-2 py-2">Mantener %</th>
              <th className="px-3 py-2">Lectura</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {expectations.map((e) => (
              <ExpectationRow key={e.currency} e={e} onSaved={onSaved} />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Plan de la semana ----------

export function WeekPlanView({ week }: { week: WeekPlan | null }) {
  if (!week) return null;
  return (
    <Card title={`Plan de la semana · ${fmtYmd(week.start, 'd MMM')} – ${fmtYmd(week.end, 'd MMM')}`} subtitle="Lectura generada a partir del calendario, las expectativas de tipos, el COT y el riesgo global.">
      <div className="grid gap-2 sm:grid-cols-5">
        {week.days.map((d) => (
          <div key={d.date} className={cn('rounded-md border p-2', d.risk === 'alto' ? 'border-loss/40 bg-loss/5' : d.risk === 'medio' ? 'border-warn/40 bg-warn/5' : 'border-border bg-bg/40')}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase text-gray-200">{d.weekday_es.slice(0, 3)} {fmtYmd(d.date, 'd')}</span>
              <Badge variant={riskVariant(d.risk)} size="sm">{riskLabel(d.risk).replace('Riesgo ', '')}</Badge>
            </div>
            <ul className="mt-1.5 space-y-1 text-[11px] text-gray-400">
              {d.key_events.length === 0 && <li className="text-gray-600">Sin alto impacto</li>}
              {d.key_events.slice(0, 4).map((e) => (
                <li key={e.title + e.at_utc} className="flex items-center gap-1">
                  <ImpactDots impact={e.impact} />
                  <span className="tnum text-gray-500">{fmtLocalTime(e.at_utc)}</span>
                  <span className="truncate">{flagOf(e.country)} {e.title}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          {week.pivot && (
            <div className="rounded-md border border-accent/40 bg-accent/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent">Evento pivote</p>
              <p className="mt-1 text-sm font-semibold text-white">{flagOf(week.pivot.country)} {week.pivot.title} · {fmtYmd(week.pivot.at_utc.slice(0, 10), 'EEEE d')} {fmtLocalTime(week.pivot.at_utc)}</p>
              <p className="mt-1 text-xs text-gray-300">{week.pivot.why}</p>
            </div>
          )}
          <div className="rounded-md border border-border bg-bg/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Postura</p>
            <p className="mt-1 text-sm text-gray-100">{week.stance}</p>
            {week.quiet_days.length > 0 && <p className="mt-1 text-xs text-gray-400">Días tranquilos: {week.quiet_days.join(', ')}.</p>}
          </div>
        </div>
        <div className="space-y-3">
          {week.cautions.length > 0 && (
            <div className="rounded-md border border-warn/40 bg-warn/5 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-warn">Cautelas</p>
              <ul className="mt-1 space-y-1 text-xs text-gray-200">
                {week.cautions.map((c, i) => (
                  <li key={i} className="flex gap-2"><span className="text-warn">•</span>{c}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="rounded-md border border-border bg-bg/40 p-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Resumen</p>
            <p className="mt-1 text-sm leading-relaxed text-gray-200">{week.plan_text}</p>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ---------- Reporte del domingo ----------

export function SundayNotes() {
  const week = tradingWeek();
  const [content, setContent] = useState('');
  const [state, setState] = useState<'cargando' | 'listo' | 'guardando' | 'guardado' | 'error'>('cargando');
  const timer = useRef<number | null>(null);
  const loaded = useRef(false);
  useEffect(() => {
    let cancelled = false;
    fetchNotes(week.key)
      .then((n) => {
        if (cancelled) return;
        setContent(n.content);
        loaded.current = true;
        setState('listo');
      })
      .catch(() => !cancelled && setState('error'));
    return () => {
      cancelled = true;
    };
  }, [week.key]);
  function onChange(v: string) {
    setContent(v);
    if (!loaded.current) return;
    setState('guardando');
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      saveNotes(week.key, v)
        .then(() => setState('guardado'))
        .catch(() => setState('error'));
    }, 800);
  }
  return (
    <Card
      title={`Mi reporte del domingo · semana ${week.key}`}
      subtitle="Escribe tu lectura con tus palabras: lo descontado, el pivote, qué esperas y qué no vas a hacer."
      actions={<span className={cn('text-[11px]', state === 'guardado' ? 'text-profit' : state === 'error' ? 'text-loss' : 'text-gray-500')}>{state === 'guardando' ? 'Guardando…' : state === 'guardado' ? 'Guardado' : state === 'error' ? 'No se pudo guardar' : ''}</span>}
    >
      <textarea
        value={content}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        placeholder="Ej.: Fed con subida al 87 %: no opero hasta después del miércoles. Espero USD fuerte frente a JPY y CAD; EURUSD sin sesgo. Cuidado con el BoJ el jueves…"
        className="w-full rounded-md border border-border bg-bg p-3 text-sm text-gray-100 placeholder:text-gray-600 focus:border-accent focus:outline-none"
      />
    </Card>
  );
}
