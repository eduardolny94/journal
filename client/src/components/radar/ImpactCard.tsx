// Impacto esperado de los próximos datos de alto impacto: cuánto suele moverse cada par por cada sorpresa de 1σ
// (β calibrada con 3 años de sorpresas y velas H1), qué descuentan los futuros para la Fed y las pistas previas
// (nowcast de inflación de la Fed de Cleveland, ADP antes de las nóminas). Informa: la entrada es del trader.
import { useEffect, useMemo, useState } from 'react';
import { Activity, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { cn } from '../../lib/cn';
import { useNow } from './common';
import { fetchImpact, flagOf, fmtCountdown, fmtLocalTime, secondsUntil, type ImpactEvent, type ImpactReport, type ImpactScenarioPair } from '../../lib/radar';

const pipsClass = (p: number | null) => (p === null ? 'text-gray-500' : p > 0 ? 'text-profit' : p < 0 ? 'text-loss' : 'text-gray-400');
const fmtPips = (p: number | null) => (p === null ? '—' : `${p > 0 ? '+' : ''}${p}`);
const pct = (x: number | undefined) => (x === undefined ? '—' : `${Math.round(x * 100)} %`);

function pickPairs(pairs: ImpactScenarioPair[], favorites: string[], max: number): ImpactScenarioPair[] {
  const fav = pairs.filter((p) => favorites.includes(p.symbol));
  const rest = pairs.filter((p) => !favorites.includes(p.symbol));
  return [...fav, ...rest].slice(0, max);
}

function HitBadge({ hit, n }: { hit: number | null; n: number }) {
  if (hit === null) return <Badge variant="outline">{n} datos</Badge>;
  return <Badge variant={hit >= 70 ? 'profit' : hit >= 55 ? 'warn' : 'outline'} title="Veces que la primera hora fue en la dirección de la sorpresa (|z| ≥ 0,5), en nuestro historial">{hit} % acierto · {n} datos</Badge>;
}

function EventRow({ ev, favorites, compact, now }: { ev: ImpactEvent; favorites: string[]; compact: boolean; now: number }) {
  const [open, setOpen] = useState(!compact);
  const secs = secondsUntil(ev.at_utc, now);
  const soon = secs !== null && secs > 0 && secs < 3 * 3600;
  const best = ev.scenarios[0];
  const worst = ev.scenarios[1];
  const maxPairs = compact ? 3 : 5;
  const top = best ? pickPairs(best.pairs, favorites, maxPairs) : [];
  const worstBy = new Map((worst?.pairs ?? []).map((p) => [p.symbol, p]));
  const curFit = ev.currency?.h1 ?? null;
  const tiltDir = ev.tilt && ev.tilt.z !== null && Math.abs(ev.tilt.z) >= 0.5 ? (ev.tilt.z > 0 ? 'up' : 'down') : null;

  return (
    <li className={cn('p-3', soon && 'bg-accent/5')}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-start justify-between gap-2 text-left">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
            <span className="tnum">{fmtLocalTime(ev.at_utc)}</span>
            <span>{flagOf(ev.country)} {ev.country}</span>
            <span className={cn('tnum', soon ? 'font-semibold text-accent' : '')}>{fmtCountdown(secs)}</span>
            {ev.calibrated && curFit && <HitBadge hit={curFit.hit} n={ev.n} />}
            {ev.weak_fit && <Badge variant="outline" title="En nuestro historial la sorpresa de este dato no explica el movimiento de la primera hora">sorpresa poco predictiva</Badge>}
            {!ev.calibrated && !ev.weak_fit && !ev.fed && <Badge variant="outline">sin historial suficiente</Badge>}
            {tiltDir && <Badge variant={tiltDir === 'up' ? 'profit' : 'loss'}>{ev.tilt?.weak ? 'pista débil' : 'pista'}: {ev.country} {tiltDir === 'up' ? '↑' : '↓'}</Badge>}
          </div>
          <p className="mt-0.5 text-sm text-gray-100">{ev.title}</p>
          <p className="mt-0.5 text-[11px] tnum text-gray-400">
            Consenso <span className="text-gray-200">{ev.forecast ?? '—'}</span> · Anterior {ev.previous ?? '—'}
            {ev.sigma_label && <span> · 1σ de sorpresa ≈ <span className="text-gray-200">{ev.sigma_label}</span></span>}
            {ev.calibrated && curFit && curFit.beta !== null && <span> · <span className="text-gray-200">{Math.abs(curFit.beta)} pips</span> por σ en 1 h ({ev.country})</span>}
          </p>
        </div>
        <span className="shrink-0 text-gray-500">{open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {ev.tilt && <p className={cn('rounded-md border px-3 py-2 text-xs', tiltDir === 'up' ? 'border-profit/30 bg-profit/5 text-gray-200' : tiltDir === 'down' ? 'border-loss/30 bg-loss/5 text-gray-200' : 'border-border bg-bg/40 text-gray-400')}>{ev.tilt.text}</p>}

          {ev.fed && (
            <div className="rounded-md border border-border bg-bg/40 p-3 text-xs">
              <p className="text-gray-200">{ev.fed.text}</p>
              <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                <div className="rounded border border-loss/30 bg-loss/5 p-2"><p className="text-[10px] uppercase tracking-wider text-gray-500">Bajada 25</p><p className="text-base font-semibold tnum text-gray-100">{pct(ev.fed.meeting.p_cut_25)}</p><p className="text-[10px] text-gray-500">sorpresa {fmtPips(ev.fed.surprise_if.cut_25)} pb</p></div>
                <div className="rounded border border-border bg-panel p-2"><p className="text-[10px] uppercase tracking-wider text-gray-500">Mantener</p><p className="text-base font-semibold tnum text-gray-100">{pct(ev.fed.meeting.p_hold)}</p><p className="text-[10px] text-gray-500">sorpresa {fmtPips(ev.fed.surprise_if.hold)} pb</p></div>
                <div className="rounded border border-profit/30 bg-profit/5 p-2"><p className="text-[10px] uppercase tracking-wider text-gray-500">Subida 25</p><p className="text-base font-semibold tnum text-gray-100">{pct(ev.fed.meeting.p_hike_25)}</p><p className="text-[10px] text-gray-500">sorpresa {fmtPips(ev.fed.surprise_if.hike_25)} pb</p></div>
              </div>
              <p className="mt-2 text-[11px] text-gray-500">Calculado por nosotros con los futuros de fondos federales a 30 días (método de CME FedWatch) y el tipo efectivo {ev.fed.effr}% del {ev.fed.effr_date}. Regla: sorpresa = decisión − lo descontado; una sorpresa de +25 pb fortalece al USD.</p>
            </div>
          )}

          {best && worst && top.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-gray-500">
                    <th className="py-1 pr-2">Par</th>
                    <th className="py-1 pr-2 text-profit">{best.label} · {ev.country} ↑</th>
                    <th className="py-1 pr-2 text-loss">{worst.label} · {ev.country} ↓</th>
                    {!compact && <th className="py-1 text-right">24 h</th>}
                  </tr>
                </thead>
                <tbody>
                  {top.map((p) => {
                    const w = worstBy.get(p.symbol);
                    return (
                      <tr key={p.symbol} className="border-t border-border/60">
                        <td className="py-1.5 pr-2 font-semibold text-gray-100">{p.symbol}{favorites.includes(p.symbol) && <span className="ml-1 text-warn">★</span>}</td>
                        <td className={cn('py-1.5 pr-2 tnum', pipsClass(p.pips_1h))}>{fmtPips(p.pips_1h)} pips en 1 h</td>
                        <td className={cn('py-1.5 pr-2 tnum', pipsClass(w?.pips_1h ?? null))}>{fmtPips(w?.pips_1h ?? null)} pips en 1 h</td>
                        {!compact && <td className="py-1.5 text-right text-[11px] text-gray-500 tnum">{fmtPips(p.pips_24h)} / {fmtPips(w?.pips_24h ?? null)}{p.hit_24h !== null ? ` · ${p.hit_24h} %` : ''}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!best && ev.typical.length > 0 && (
            <p className="text-xs text-gray-400">
              Movimiento típico el día de este dato (sin importar la sorpresa): {pickPairs(ev.typical.map((t) => ({ symbol: t.symbol, pips_1h: t.h1, pips_4h: null, pips_24h: t.h24, hit_1h: null, hit_24h: null, n: 0 })), favorites, 4).map((t) => `${t.symbol} ±${t.pips_1h} pips en 1 h`).join(' · ')}.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

export default function ImpactCard({ favorites, compact = false }: { favorites: string[]; compact?: boolean }) {
  const [report, setReport] = useState<ImpactReport | null>(null);
  const [loaded, setLoaded] = useState(false);
  const now = useNow(30_000);
  useEffect(() => {
    const ctrl = new AbortController();
    const run = () => fetchImpact(ctrl.signal).then((r) => { setReport(r); setLoaded(true); }).catch(() => setLoaded(true));
    run();
    const id = window.setInterval(run, 10 * 60_000);
    return () => { ctrl.abort(); window.clearInterval(id); };
  }, []);
  const events = useMemo(() => (report?.events ?? []).filter((e) => e.calibrated || e.fed || e.tilt).slice(0, compact ? 6 : 12), [report, compact]);
  const nc = report?.nowcast?.current ?? null;

  if (!loaded) return null;
  if (!report) return null;
  return (
    <Card
      title={<span className="flex items-center gap-2"><Activity className="h-4 w-4 text-accent" /> Impacto esperado de los próximos datos</span>}
      subtitle={`Cuánto y hacia dónde suele moverse cada par por cada sorpresa de 1σ (medido con ${report.calibration.indicators} indicadores, 3 años de sorpresas y velas H1). Primera hora: es lo que se sostiene; a 24 h el acierto baja.`}
      flush
      actions={nc && (nc.cpi || nc.core_cpi) ? <Badge variant="outline" title={`Nowcast diario de la Fed de Cleveland para el mes en curso (variación mensual, al ${nc.cpi?.asof ?? nc.core_cpi?.asof ?? ''})`}>Nowcast CPI {nc.cpi ? nc.cpi.value.toFixed(2) : '—'} % · subyacente {nc.core_cpi ? nc.core_cpi.value.toFixed(2) : '—'} %</Badge> : undefined}
    >
      <ul className="divide-y divide-border">
        {events.map((ev) => <EventRow key={`${ev.country}|${ev.title}|${ev.at_utc}`} ev={ev} favorites={favorites} compact={compact} now={now} />)}
        {events.length === 0 && <li className="p-4 text-sm text-gray-500">Sin datos de alto impacto con historial suficiente en los próximos {report.days_ahead} días.</li>}
      </ul>
      <p className="flex items-start gap-1.5 border-t border-border px-3 py-2 text-[11px] text-gray-500"><Info className="mt-0.5 h-3 w-3 shrink-0" /> Fórmula: movimiento = β × z, con z = (dato − consenso) / desviación típica de las últimas 36 sorpresas del indicador (estudio de eventos de Andersen, Bollerslev, Diebold y Vega). β y acierto salen de nuestro propio historial; no es una garantía. Los datos que mueven mucho suelen revertir en horas: úsalo para no entrar en contra y para el tamaño, no como señal.</p>
    </Card>
  );
}
