// Pestaña "Hoy" (solo dueño): lo mínimo para operar con un vistazo. Tres bloques con un check por par y una línea:
//   1. Intradía · rotura de Asia (AUDCAD, AUDCHF, CADCHF): ¿cumple el radar? ¿qué lado tiene que barrer la vela de las 08:00?
//   2. Swing H4: pares con la semana alineada y el radar a favor, con el nivel verde-rojo-rojo.
//   3. Qué operar hoy (los 3 más probables a 5 días).
import { Check, Clock, X } from 'lucide-react';
import { Card } from '../ui/Card';
import { cn } from '../../lib/cn';
import type { Intradia, IntradiaPair, QueOperar, SwingPair, SwingPlan } from '../../lib/radar';

const px = (v: number | null | undefined, digits: number) => (v === null || v === undefined ? '—' : v.toFixed(digits));
const digitsOf = (sym: string) => (sym.includes('JPY') ? 3 : 5);

function Tick({ ok, pending }: { ok: boolean; pending?: boolean }) {
  if (pending) return <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-warn/50 text-warn"><Clock className="h-4 w-4" /></span>;
  return ok
    ? <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-profit/20 text-profit"><Check className="h-4 w-4" /></span>
    : <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-gray-500"><X className="h-4 w-4" /></span>;
}
function Dir({ bias }: { bias: string }) {
  const up = bias === 'alcista';
  return <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', up ? 'bg-profit/15 text-profit' : bias === 'bajista' ? 'bg-loss/15 text-loss' : 'bg-white/5 text-gray-400')}>{up ? '▲ alcista' : bias === 'bajista' ? '▼ bajista' : 'neutro'}</span>;
}

function IntradiaRow({ p }: { p: IntradiaPair }) {
  const d = digitsOf(p.symbol);
  const signal = !!p.signal;
  return (
    <li className={cn('flex items-start gap-3 px-4 py-3', signal && 'bg-profit/5')}>
      <Tick ok={p.ok} pending={p.ok && !signal && p.phase !== 'cerrada'} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-white">{p.symbol}</span>
          <Dir bias={p.bias} />
          <span className="text-[11px] text-gray-500">radar {p.level}/5</span>
          {p.ok && p.sweep_side && <span className="text-xs text-gray-300">espera barrida del <b className="text-white">{p.sweep_side}</b> → {p.trade}</span>}
        </div>
        <p className={cn('text-xs', signal ? 'font-medium text-profit' : 'text-gray-400')}>{p.status}</p>
        {p.asia && <p className="text-[11px] text-gray-500">Asia {px(p.asia.low, d)} – {px(p.asia.high, d)} ({p.asia.pips} pips{p.asia.complete ? '' : ', en curso'})</p>}
        {p.signal && (
          <p className="text-xs text-gray-200">
            {p.signal.dir === 'venta' ? 'Venta' : 'Compra'} <span className="font-mono">{px(p.signal.entry, d)}</span> · stop <span className="font-mono">{px(p.signal.stop, d)}</span> ({p.signal.risk_pips} pips) · 2R <span className="font-mono">{px(p.signal.tp2, d)}</span>
          </p>
        )}
      </div>
    </li>
  );
}

function SwingRow({ p }: { p: SwingPair }) {
  const ok = p.estado === 'entrada' || p.estado === 'en_curso';
  const label = p.estado === 'entrada' ? 'cruce H4 reciente: entrada' : p.estado === 'en_curso' ? 'en curso' : p.estado === 'esperando_cruce' ? 'esperando el cruce H4' : p.estado === 'semanal_en_contra' ? 'semana en contra' : 'sin sesgo';
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <Tick ok={ok} pending={p.estado === 'esperando_cruce'} />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-white">{p.symbol}</span>
          <Dir bias={p.bias} />
          <span className="text-[11px] text-gray-500">radar {p.level}/5{p.tier ? ` · nivel ${p.tier}` : ''}</span>
          <span className="text-xs text-gray-300">{label}</span>
        </div>
        {p.vrr && !p.vrr.tocado && (
          <p className="text-xs text-gray-400">Verde-rojo-rojo: límite de {p.bias === 'alcista' ? 'compra' : 'venta'} en <span className="font-mono text-gray-200">{px(p.vrr.entrada, p.digits)}</span> · stop <span className="font-mono">{px(p.vrr.stop, p.digits)}</span> ({p.vrr.risk_pips} pips) · 2R <span className="font-mono">{px(p.vrr.r2, p.digits)}</span></p>
        )}
      </div>
    </li>
  );
}

export default function HoyCard({ intradia, swing, queOperar }: { intradia: Intradia | null; swing: SwingPlan | null; queOperar: QueOperar | null }) {
  const swingRows = (swing?.pairs ?? []).filter((p) => ['entrada', 'en_curso', 'esperando_cruce'].includes(p.estado)).slice(0, 4);
  const best = queOperar?.best ?? [];
  const phaseText = intradia ? ({ asia: 'Asia en curso', barrida: 'ventana de barrida (08:00–09:59 España)', cierre: 'esperando el cierre dentro (hasta las 12:00)', cerrada: 'ventana cerrada por hoy' } as Record<string, string>)[intradia.phase] : null;
  return (
    <div className="space-y-4">
      <Card flush title="Intradía · rotura de Asia" subtitle={phaseText ? `Vela de las 08:00 (España) · ${phaseText}` : 'Sin datos'}>
        <ul className="divide-y divide-border">
          {intradia?.pairs.map((p) => <IntradiaRow key={p.symbol} p={p} />)}
          {!intradia && <li className="px-4 py-4 text-sm text-gray-500">El radar todavía no ha calculado el bloque intradía.</li>}
        </ul>
        <p className="border-t border-border px-4 py-2 text-[11px] text-gray-500">Entrada en contra de la barrida al cierre de la vela que vuelve dentro · stop tras la mecha · objetivo 2R. Pon la alerta en TradingView (indicador GTFX · Velas de Asia) solo en los pares con check.</p>
      </Card>
      <Card flush title="Swing H4" subtitle="Semana alineada y radar a favor. El check verde es el cruce 8/18 reciente; el reloj, que aún no ha cruzado.">
        <ul className="divide-y divide-border">
          {swingRows.map((p) => <SwingRow key={p.symbol} p={p} />)}
          {swingRows.length === 0 && <li className="px-4 py-4 text-sm text-gray-500">Hoy ningún par junta sesgo del radar con la semana alineada.</li>}
        </ul>
      </Card>
      <Card flush title="Qué operar hoy" subtitle="Los más probables a 5 días (nivel A o B)">
        <ul className="divide-y divide-border">
          {best.map((b) => (
            <li key={b.symbol} className="flex items-center gap-3 px-4 py-2.5">
              <Tick ok={b.tier === 'A' || b.tier === 'B'} />
              <span className="font-semibold text-white">{b.symbol}</span>
              <Dir bias={b.bias} />
              <span className="text-[11px] text-gray-500">nivel {b.tier} · {b.p5} % a 5 d · fuerza {b.strength}</span>
            </li>
          ))}
          {best.length === 0 && <li className="px-4 py-4 text-sm text-gray-500">Ningún par con nivel A o B hoy. Sin operación también es una respuesta.</li>}
        </ul>
      </Card>
    </div>
  );
}
