// Apartado "Swing": la operativa C4L del usuario (EMA 8 / MA 18 / EMA 200 en H4) guiada por el radar. Muestra los
// pares seleccionados (sesgo con fuerza ≥ 2 y semana 8/18 alineada), el estado de cada marco, los stops medidos y el
// tamaño para la cuenta configurada. Lo medido está en docs/ESTRATEGIA-SWING-H4.md. Informa: la entrada es del trader.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Info, TrendingUp } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Card } from '../ui/Card';
import { cn } from '../../lib/cn';
import { flagOf, type SwingFrame, type SwingPair, type SwingPlan } from '../../lib/radar';
import { TierBadge } from './QueOperarCard';

const ESTADO: Record<SwingPair['estado'], { label: string; variant: 'profit' | 'warn' | 'accent' | 'outline' | 'loss'; help: string }> = {
  entrada: { label: 'Cruce reciente', variant: 'profit', help: 'La EMA 8 acaba de cruzar la media 18 en H4 a favor del radar: la entrada de tu regla.' },
  en_curso: { label: 'A favor en H4', variant: 'accent', help: 'Las medias de H4 ya van a favor; el cruce fue hace más de 6 velas. Esperar un retroceso o el siguiente cruce.' },
  esperando_cruce: { label: 'Esperando cruce H4', variant: 'warn', help: 'Semana y radar a favor, pero la EMA 8 sigue bajo (o sobre) la media 18 en H4: esperar el cruce.' },
  semanal_en_contra: { label: 'Semanal en contra', variant: 'outline', help: 'El radar tiene sesgo, pero las medias semanales van al revés: no se busca.' },
  sin_sesgo: { label: 'Sin sesgo', variant: 'outline', help: 'El radar no tiene fuerza ≥ 2/5 en este par.' },
};
function FrameChip({ name, f, dir }: { name: string; f: SwingFrame; dir: number }) {
  const txt = f.dir === 0 ? '—' : f.dir > 0 ? 'azul › roja' : 'roja › azul';
  const ok = dir !== 0 && f.dir === dir;
  return <span className={cn('rounded border px-1.5 py-0.5 text-[11px]', ok ? 'border-profit/40 text-profit' : f.dir === 0 ? 'border-border text-gray-500' : 'border-loss/40 text-loss')} title={f.since !== null ? `${f.since} velas desde el cruce` : ''}>{name}: {txt}{f.since !== null && f.dir !== 0 ? ` (${f.since})` : ''}</span>;
}
function fmtPx(v: number | null, digits: number) { return v === null ? '—' : v.toFixed(digits); }
/** Las tres señales de entrada temprana medidas (10-10-2026): con 2 de 3, 55 % a 2R y 60 % a 1,5R. */
function QualityChips({ q }: { q: SwingPair['calidad'] }) {
  const chip = (ok: boolean | null, label: string, title: string) => (
    <span key={label} title={title} className={cn('rounded border px-1.5 py-0.5 text-[11px]', ok === true ? 'border-profit/40 text-profit' : ok === false ? 'border-border text-gray-500 line-through decoration-gray-600' : 'border-border text-gray-600')}>{label}</span>
  );
  return (
    <>
      {chip(q.adx_ok, `ADX diario ${q.adx_d === null ? '—' : q.adx_d}`, 'Tendencia diaria aún no "hecha" (ADX 14 < 20): el cruce coge el arranque, no la persecución.')}
      {chip(q.cruce_suave, `cruce ${q.cruce_atr === null ? 'sin medir' : q.cruce_atr < 0.5 ? 'suave' : 'fuerte'}${q.cruce_atr === null ? '' : ` (${q.cruce_atr} ATR)`}`, 'El cierre del cruce queda a menos de 0,5 ATR de la media 18: entrada barata. Un cruce con vela enorme ya gastó recorrido.')}
      {chip(q.diario_joven, `diario ${q.diario_dias === null ? 'en contra' : `${q.diario_dias} d`}`, 'El diario 8/18 está a favor desde hace 10 días o menos: tendencia diaria joven.')}
    </>
  );
}

export default function SwingCard({ plan }: { plan: SwingPlan | null }) {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);
  if (!plan) return null;
  const list = showAll ? plan.pairs : plan.pairs.filter((p) => plan.selected.includes(p.symbol));
  return (
    <Card
      title={<span className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-accent" /> Swing · C4L en 4 horas guiado por el radar</span>}
      subtitle={`Hasta ${plan.account.max_pairs} pares con sesgo del radar (fuerza ≥ 2/5) y semana 8/18 alineada. Compras solo si la azul está sobre la roja en semanal y cruza en H4; ventas al revés. Objetivo 1,5R–2R, stop en el día anterior; las mejores entradas juntan 2 de 3 señales tempranas (ADX diario < 20, cruce suave, diario joven). Cuenta ${plan.account.usd} $ · riesgo ${plan.account.risk_pct} % por operación.`}
      actions={<label className="flex items-center gap-2 text-xs text-gray-400"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-3.5 w-3.5 accent-accent" /> ver todos los pares</label>}
      flush
    >
      <ul className="divide-y divide-border">
        {list.map((p) => {
          const dir = p.diff > 0 ? 1 : p.diff < 0 ? -1 : 0;
          const e = ESTADO[p.estado];
          const sz = p.stops ? (p.stops.diario_sizing && p.stops.estructura_sizing && p.stops.diario_sizing.risk_pips < p.stops.estructura_sizing.risk_pips ? 'diario' : 'estructura') : null;
          return (
            <li key={p.symbol} className={cn('flex flex-wrap items-start gap-x-4 gap-y-1.5 px-4 py-3', p.estado === 'entrada' && 'bg-profit/5')}>
              <button onClick={() => navigate(`/radar/${p.symbol}`)} className="min-w-[170px] text-left">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-100">{p.base && p.quote ? `${flagOf(p.base)}${flagOf(p.quote)} ` : ''}{p.symbol}</span>
                  {p.tier && <TierBadge tier={p.tier} p5={p.p5} />}
                </span>
                <span className={cn('block text-xs font-semibold uppercase tracking-wide', dir > 0 ? 'text-profit' : dir < 0 ? 'text-loss' : 'text-gray-500')}>{dir > 0 ? 'solo compras' : dir < 0 ? 'solo ventas' : 'sin dirección'} · fuerza {p.level}/5</span>
                <span className="flex flex-wrap gap-1">
                  <Badge variant={e.variant} size="sm" title={e.help}>{e.label}</Badge>
                  {p.estado === 'entrada' && p.calidad.temprana && <Badge variant="profit" size="sm" title="Junta 2 de las 3 señales tempranas medidas: 55 % de acierto a 2R (+0,65R) y 60 % a 1,5R (+0,50R), n=80, positivo los tres años.">Entrada temprana {p.calidad.puntos}/3</Badge>}
                  {p.estado === 'entrada' && !p.calidad.temprana && <Badge variant="outline" size="sm" title="Solo 0 o 1 señal temprana: en lo medido, 40 % a 2R (+0,21R). Operar con tamaño menor o dejarla pasar.">Señales tempranas {p.calidad.puntos}/3</Badge>}
                </span>
              </button>
              <div className="min-w-0 flex-1 space-y-1 text-xs">
                <div className="flex flex-wrap gap-1.5">
                  <FrameChip name="Semanal" f={p.weekly} dir={dir} />
                  <FrameChip name="Diario" f={p.daily} dir={dir} />
                  <FrameChip name="H4" f={p.h4} dir={dir} />
                  {p.h4.ema200 !== null && <span className={cn('rounded border px-1.5 py-0.5 text-[11px]', p.h4.ema200 ? 'border-profit/40 text-profit' : 'border-border text-gray-500')}>EMA 200 {p.h4.ema200 ? 'a favor' : 'en contra'}</span>}
                  {p.trend && <span className="rounded border border-border px-1.5 py-0.5 text-[11px] text-gray-400">tendencia S/D/H4: {p.trend.w1} / {p.trend.d1} / {p.trend.h4}</span>}
                </div>
                {dir !== 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] text-gray-500">Entrada temprana:</span>
                    <QualityChips q={p.calidad} />
                  </div>
                )}
                {p.stops && dir !== 0 && (p.stops.diario_objetivos || p.stops.estructura_objetivos) && (() => {
                  const o = sz === 'diario' ? p.stops.diario_objetivos : p.stops.estructura_objetivos;
                  return o ? (
                    <p className="text-gray-300">
                      Desde el precio actual con el stop {sz}: objetivo 1,5R <span className="font-mono">{fmtPx(o.r15, p.digits)}</span> · objetivo 2R <span className="font-mono">{fmtPx(o.r2, p.digits)}</span> · al tocar <span className="font-mono">{fmtPx(o.be, p.digits)}</span> (+1,1R) puedes pasar el stop a la entrada <span className="text-gray-500">(medido: resta 5–8 puntos de acierto, el R queda igual)</span>.
                    </p>
                  ) : null;
                })()}
                {p.stops && dir !== 0 && (
                  <p className="text-gray-300">
                    Stop por estructura (10 velas H4): <span className="font-mono">{fmtPx(p.stops.estructura, p.digits)}</span>{p.stops.estructura_sizing ? ` · ${p.stops.estructura_sizing.risk_pips} pips · ${p.stops.estructura_sizing.lots} lotes (${p.stops.estructura_sizing.risk_usd} $)` : ''}
                    {' · '}Stop en el día anterior: <span className="font-mono">{fmtPx(p.stops.diario, p.digits)}</span>{p.stops.diario_sizing ? ` · ${p.stops.diario_sizing.risk_pips} pips · ${p.stops.diario_sizing.lots} lotes (${p.stops.diario_sizing.risk_usd} $)` : ''}
                    {sz && <span className="text-gray-500"> · el más ajustado hoy: {sz}</span>}
                  </p>
                )}
                {p.atr_pips !== null && <p className="text-[11px] text-gray-500">ATR diario ≈ {p.atr_pips} pips. Salidas medidas: objetivo 2R (más R) o 1,5R (más acierto); el cruce contrario rinde parecido con más vaivén.</p>}
                {p.warnings.length > 0 && <p className="text-[11px] text-warn">{p.warnings.join(' · ')}</p>}
              </div>
            </li>
          );
        })}
        {list.length === 0 && <li className="px-4 py-5 text-sm text-gray-500">Hoy ningún par junta sesgo del radar con la semana alineada. Es una respuesta válida: sin cruce no hay operación.</li>}
      </ul>
      <p className="flex items-start gap-1.5 border-t border-border px-3 py-2 text-[11px] text-gray-500"><Info className="mt-0.5 h-3 w-3 shrink-0" /> Medido 2024-2026 en 14 pares: {plan.evidence.text} No es garantía: es lo que pasó. Regla de riesgo: 1 % por operación, máximo 2 posiciones abiertas, nada nuevo 2 h antes de un dato fuerte.</p>
    </Card>
  );
}
