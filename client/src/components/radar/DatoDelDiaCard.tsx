// "Lectura del dato": protocolo de la guía DCM FX (14-10-2026) con nuestras mediciones. Antes del dato: consenso,
// anterior y lo descontado. Después: sorpresa por componente, lectura combinada, reacción de la primera hora y
// FedWatch antes → después. Para todos los usuarios. Lo medido está en docs/CPI-LONDRES.md y docs/LECTURA-IPC.md.
import { useState } from 'react';
import { ChevronDown, ChevronUp, Newspaper } from 'lucide-react';
import { cn } from '../../lib/cn';
import { fmtNum } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { flagOf, fmtLocalDateTime, type DatoDelDia, type DatoPublicado, type FedwatchSnap } from '../../lib/radar';

const READING_VARIANT: Record<string, 'profit' | 'loss' | 'warn' | 'outline' | 'accent'> = { caliente: 'loss', fría: 'profit', fuerte: 'profit', débil: 'loss', 'más dura': 'loss', 'más blanda': 'profit', 'a favor': 'profit', 'en contra': 'loss', mixta: 'warn', 'en consenso': 'outline' };
const sgn = (v: number | null | undefined, k = 2) => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${fmtNum(v, k)}`);
const fw = (s: FedwatchSnap | null) => (s ? `subida ${fmtNum(s.prob_hike, 0)} % · mantener ${fmtNum(s.prob_hold, 0)} % · recorte ${fmtNum(s.prob_cut, 0)} % (${s.meeting_date})` : '—');

function Published({ p }: { p: DatoPublicado }) {
  const v = READING_VARIANT[p.reading] ?? 'outline';
  return (
    <div className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-100">{flagOf(p.currency)} {p.currency} · {fmtLocalDateTime(p.at_utc)} <span className="text-gray-500">· hace {p.minutes_ago < 90 ? `${p.minutes_ago} min` : `${Math.round(p.minutes_ago / 60)} h`}</span></span>
        <Badge variant={v} size="sm" title="Lectura combinada de los componentes publicados a la vez: mismo signo → esa dirección; signos opuestos → mixta.">Lectura: {p.reading}</Badge>
        {p.reaction && <Badge variant={p.reaction.verdict === 'con la sorpresa' ? 'profit' : p.reaction.verdict === 'contra la sorpresa' ? 'loss' : 'outline'} size="sm" title="Media, en ATR diarios, del movimiento de la primera hora en los pares de la divisa (a favor de la divisa = positivo).">1.ª hora: {p.reaction.verdict} ({sgn(p.reaction.mean_atr)} ATR)</Badge>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-gray-500"><tr><th className="px-2 py-1">Componente</th><th className="px-2 py-1 text-right">Real</th><th className="px-2 py-1 text-right">Previsión</th><th className="px-2 py-1 text-right">Anterior</th><th className="px-2 py-1 text-right">Sorpresa (σ)</th><th className="px-2 py-1">Para la divisa</th></tr></thead>
          <tbody>
            {p.components.map((c) => (
              <tr key={c.title} className="border-t border-border/60 text-gray-200">
                <td className="px-2 py-1">{c.title}</td>
                <td className="px-2 py-1 text-right tnum font-semibold">{c.actual ?? '—'}</td>
                <td className="px-2 py-1 text-right tnum">{c.forecast ?? '—'}</td>
                <td className="px-2 py-1 text-right tnum text-gray-400">{c.previous ?? '—'}</td>
                <td className={cn('px-2 py-1 text-right tnum', c.dir > 0 ? 'text-profit' : c.dir < 0 ? 'text-loss' : 'text-gray-500')}>{c.z === null ? (c.dir === 0 ? 'en línea' : sgn(c.surprise, 2)) : sgn(c.z, 1)}</td>
                <td className={cn('px-2 py-1', c.dir > 0 ? 'text-profit' : c.dir < 0 ? 'text-loss' : 'text-gray-500')}>{c.dir > 0 ? 'a favor' : c.dir < 0 ? 'en contra' : 'neutra'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {p.reaction && p.reaction.pairs.length > 0 && (
        <p className="text-[11px] text-gray-400">Primera hora por par: {p.reaction.pairs.map((x) => `${x.symbol} ${x.pips >= 0 ? '+' : ''}${fmtNum(x.pips, 0)} pips`).join(' · ')}.</p>
      )}
      {p.fedwatch && (
        <p className="text-[11px] text-gray-300">FedWatch antes: <span className="text-gray-400">{fw(p.fedwatch.before)}</span> → después: <span className="text-gray-100">{fw(p.fedwatch.after)}</span>{!p.fedwatch.after && <span className="text-gray-500"> (se vuelve a leer unos 20 minutos tras el dato)</span>}</p>
      )}
      <p className="text-[11px] text-gray-500">{p.measured}</p>
    </div>
  );
}

export default function DatoDelDiaCard({ data }: { data: DatoDelDia }) {
  const [showProtocol, setShowProtocol] = useState(false);
  const next = data.next && data.next.minutes <= 36 * 60 ? data.next : null;
  if (!data.published.length && !next) return null;
  return (
    <Card
      title={<span className="flex items-center gap-2"><Newspaper className="h-4 w-4 text-accent" /> Lectura del dato</span>}
      subtitle="Lo que mueve no es el nivel del dato sino la sorpresa frente al consenso. Si los componentes discrepan (general frente a subyacente), la lectura es mixta. La primera hora va con la sorpresa 3 de cada 4 veces; el resto del día no la continúa."
      actions={<button onClick={() => setShowProtocol((v) => !v)} className="flex items-center gap-1 text-[11px] text-accent hover:underline">{showProtocol ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />} protocolo</button>}
      flush
    >
      {showProtocol && (
        <ol className="list-decimal space-y-0.5 border-b border-border px-8 py-2 text-[11px] text-gray-400">{data.protocol.map((s) => <li key={s}>{s}</li>)}</ol>
      )}
      {next && (
        <div className="border-b border-border px-4 py-3">
          <p className="text-sm font-semibold text-gray-100">{flagOf(next.currency)} Próximo: {next.title} · {fmtLocalDateTime(next.at_utc)} <span className="text-gray-500">· en {next.minutes < 90 ? `${next.minutes} min` : `${Math.round(next.minutes / 60)} h`}</span></p>
          <p className="mt-1 text-xs text-gray-300">Previsión <span className="tnum font-semibold">{next.forecast ?? '—'}</span> · anterior <span className="tnum">{next.previous ?? '—'}</span>{next.siblings.map((s) => <span key={s.title}> · {s.title}: previsión <span className="tnum font-semibold">{s.forecast ?? '—'}</span>, anterior <span className="tnum">{s.previous ?? '—'}</span></span>)}</p>
          {next.fedwatch_before && next.currency === 'USD' && <p className="mt-1 text-[11px] text-gray-400">Descontado ahora (FedWatch): {fw(next.fedwatch_before)}.</p>}
          {next.scenarios && next.scenarios.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-[11px]">
              {next.scenarios.map((s) => <li key={s.caso} className="flex gap-2"><span className="shrink-0 text-gray-200">{s.caso}:</span><span className="text-gray-400">{s.lectura}</span></li>)}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-gray-500">{next.measured} Regla: nada nuevo 2 h antes. Tras el dato esta tarjeta se rellena sola con la sorpresa, la lectura y la reacción (calendario cada 5 min, FedWatch a los 20 min).</p>
        </div>
      )}
      <div className="divide-y divide-border">{data.published.map((p) => <Published key={`${p.currency}|${p.at_utc}`} p={p} />)}</div>
    </Card>
  );
}
