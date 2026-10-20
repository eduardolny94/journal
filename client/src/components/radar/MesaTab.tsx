// Pestaña "Mesa" del radar (solo dueño): las fichas diarias de la mesa de agentes (mesa-agentes/README.md).
// Arriba, el estado del motor y el botón para pasar la mesa; después la nota del jefe y el evento del día; una tarjeta
// por par con el número del radar y la lectura de cada analista; al final el historial de pasadas con su coste.
// El marcador de acierto por agente llega en la fase 3.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bot, Check, ChevronDown, ChevronUp, Play, RefreshCw, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { fmtNum } from '../../lib/format';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { EmptyState } from '../ui/EmptyState';
import { Spinner } from '../ui/Spinner';
import { flagOf, fmtLocalDateTime, fmtSince, fmtYmd } from '../../lib/radar';
import { useNow } from './common';
import {
  AGENTE_LABEL, getMesaDia, getMesaEstado, getMesaPasadas, runMesa, sesgoDireccion, sesgoTexto, tonoTexto,
  type MesaAgente, type MesaDia, type MesaEstado, type MesaEvento, type MesaFicha, type MesaPar, type MesaPasada, type MesaRadarPar,
} from '../../lib/mesa';

const ANALISTAS: MesaAgente[] = ['analista_macro', 'analista_flujos', 'jefe_de_mesa'];

function DirBadge({ dir, text }: { dir: 'alcista' | 'bajista' | 'neutral'; text: string }) {
  return (
    <span className={cn('rounded px-1.5 py-0.5 text-[11px] font-medium', dir === 'alcista' ? 'bg-profit/15 text-profit' : dir === 'bajista' ? 'bg-loss/15 text-loss' : 'bg-white/5 text-gray-400')}>
      {dir === 'alcista' ? '▲ ' : dir === 'bajista' ? '▼ ' : ''}{text}
    </span>
  );
}

function Confianza({ v }: { v: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-gray-300" title="Confianza calibrada: 70 significa que el agente debería acertar 7 de cada 10 veces. Se mide en la fase 3.">
      <span className="h-1.5 w-14 overflow-hidden rounded-full bg-gray-800"><span className={cn('block h-full rounded-full', v >= 70 ? 'bg-profit' : v >= 55 ? 'bg-warn' : 'bg-gray-500')} style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></span>
      <span className="tnum">{v} %</span>
    </span>
  );
}

function LecturaAgente({ agente, par }: { agente: MesaAgente; par: MesaPar | null }) {
  if (!par) return <div className="px-4 py-2 text-[11px] text-gray-500">{AGENTE_LABEL[agente]}: sin ficha para este par.</div>;
  return (
    <div className="space-y-1 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="w-28 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-gray-500">{AGENTE_LABEL[agente]}</span>
        <DirBadge dir={sesgoDireccion(par.sesgo)} text={sesgoTexto(par.symbol, par.sesgo)} />
        <Confianza v={par.confianza} />
        <span className={cn('inline-flex items-center gap-1 text-[11px]', par.coincide_radar ? 'text-profit' : 'text-warn')} title={par.coincide_radar ? 'Coincide con el sesgo del radar' : 'Discrepa del radar'}>
          {par.coincide_radar ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />} {par.coincide_radar ? 'con el radar' : 'contra el radar'}
        </span>
        {par.horizonte_dias && par.horizonte_dias !== 5 && <span className="text-[11px] text-gray-500">a {par.horizonte_dias} d</span>}
      </div>
      <ul className="ml-28 list-disc space-y-0.5 pl-4 text-xs text-gray-200">
        {par.motivos.map((m, i) => <li key={i}>{m}</li>)}
      </ul>
      <p className="ml-28 text-[11px] text-gray-400">Lo invalida: <span className="text-gray-300">{par.invalidacion || '—'}</span>{par.evento_clave ? <> · Próximo: <span className="text-gray-300">{par.evento_clave}</span></> : null}</p>
      {!par.coincide_radar && par.discrepancia && <p className="ml-28 rounded border border-warn/30 bg-warn/5 px-2 py-1 text-[11px] text-warn">{par.discrepancia}</p>}
    </div>
  );
}

function RadarNumero({ r }: { r: MesaRadarPar | null }) {
  if (!r) return <span className="text-[11px] text-gray-500">radar: sin dato</span>;
  const n = r.nivel;
  return (
    <span className="flex flex-wrap items-center gap-2 text-[11px] text-gray-400">
      <DirBadge dir={r.sesgo} text={`radar ${r.sesgo}`} />
      <span className="tnum">{r.diff === null ? '—' : `${r.diff >= 0 ? '+' : ''}${fmtNum(r.diff, 2)}`}</span>
      <span>{r.fuerza}</span>
      {n && <Badge variant={n === 'A' ? 'profit' : n === 'B' ? 'warn' : 'outline'} size="sm" title={r.p5 !== null ? `Probabilidad a 5 días: ${fmtNum(r.p5, 0)} %` : undefined}>nivel {n}{r.p5 !== null ? ` · ${fmtNum(r.p5, 0)} %` : ''}</Badge>}
      {r.cruzada?.texto && <span className="text-gray-500" title="Confirmación cruzada (bonos, dólar, riesgo)">{r.cruzada.texto}</span>}
      {r.cambio_sesgo && r.cambio_sesgo !== 'estable' && <span className="text-gray-500">sesgo {r.cambio_sesgo}</span>}
    </span>
  );
}

function ParCard({ symbol, radar, fichas }: { symbol: string; radar: MesaRadarPar | null; fichas: Partial<Record<MesaAgente, MesaFicha>> }) {
  const lecturas = ANALISTAS.map((a) => ({ agente: a, par: fichas[a]?.pares.find((p) => p.symbol === symbol) ?? null }));
  const conSesgo = lecturas.filter((l) => l.par && l.par.sesgo !== 0);
  const dirs = new Set(conSesgo.map((l) => sesgoDireccion(l.par!.sesgo)));
  const radarDir = radar ? radar.sesgo : null;
  const todos = dirs.size === 1 && conSesgo.length === lecturas.filter((l) => l.par).length && radarDir && dirs.has(radarDir);
  const discrepan = dirs.size > 1 || (radarDir && dirs.size === 1 && !dirs.has(radarDir));
  return (
    <Card
      flush
      className={cn(todos && 'border-profit/40', discrepan && 'border-warn/40')}
      title={<span className="flex items-center gap-2">{flagOf(symbol.slice(0, 3))}{flagOf(symbol.slice(3, 6))} {symbol}{todos && <Badge variant="profit" size="sm">los tres con el radar</Badge>}{discrepan && <Badge variant="warn" size="sm">discrepancia</Badge>}</span>}
      subtitle={<RadarNumero r={radar} />}
    >
      <div className="divide-y divide-border/60">
        {lecturas.map((l) => <LecturaAgente key={l.agente} agente={l.agente} par={l.par} />)}
      </div>
    </Card>
  );
}

function EventoRow({ e }: { e: MesaEvento }) {
  const v = e.tono > 0 ? 'loss' : e.tono < 0 ? 'profit' : 'outline';
  return (
    <li className="space-y-1 px-4 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-gray-100">{flagOf(e.divisa)} {e.titulo}</span>
        <Badge variant={v} size="sm" title="Tono frente a lo descontado: hawkish favorece a la divisa, dovish la perjudica.">{tonoTexto(e.tono)}</Badge>
        <Badge variant={e.cambia_expectativas ? 'accent' : 'outline'} size="sm">{e.cambia_expectativas ? 'cambia expectativas' : 'no cambia expectativas'}</Badge>
      </div>
      <p className="text-xs text-gray-300">{e.lectura}</p>
      {e.confirmacion && (e.confirmacion.bono_2a || e.confirmacion.dxy || e.confirmacion.oro_nasdaq) && (
        <p className="text-[11px] text-gray-500">Confirmación · bono 2 años: {e.confirmacion.bono_2a || '—'} · DXY: {e.confirmacion.dxy || '—'} · oro/Nasdaq: {e.confirmacion.oro_nasdaq || '—'}</p>
      )}
    </li>
  );
}

function PasadasTable({ rows }: { rows: MesaPasada[] }) {
  if (!rows.length) return <p className="px-4 py-3 text-xs text-gray-500">Todavía no se ha pasado la mesa.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wider text-gray-500"><tr><th className="px-4 py-2">Fecha</th><th className="px-2 py-2">Inicio</th><th className="px-2 py-2">Origen</th><th className="px-2 py-2">Estado</th><th className="px-2 py-2">Modelo</th><th className="px-2 py-2 text-right">Tokens (entrada / caché / salida)</th><th className="px-4 py-2 text-right">Coste</th></tr></thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id} className="border-t border-border/60 text-gray-200">
              <td className="px-4 py-1.5">{fmtYmd(p.fecha)}</td>
              <td className="px-2 py-1.5 text-gray-400">{fmtLocalDateTime(p.started_at)}</td>
              <td className="px-2 py-1.5 text-gray-400">{p.trigger === 'auto' ? 'automática' : p.trigger === 'cli' ? 'terminal' : p.trigger}</td>
              <td className="px-2 py-1.5">{p.status === 'ok' ? <Badge variant="profit" size="sm">ok</Badge> : p.status === 'error' ? <Badge variant="loss" size="sm" title={p.error ?? undefined}>error</Badge> : <Badge variant="warn" size="sm">en curso</Badge>}{p.status === 'error' && p.error && <span className="ml-2 text-[11px] text-gray-500">{p.error.slice(0, 80)}</span>}</td>
              <td className="px-2 py-1.5 text-gray-400">{p.model ?? '—'}</td>
              <td className="px-2 py-1.5 text-right tnum text-gray-400">{fmtNum(p.input_tokens, 0)} / {fmtNum(p.cache_read_tokens, 0)} / {fmtNum(p.output_tokens, 0)}</td>
              <td className="px-4 py-1.5 text-right tnum">{fmtNum(p.cost_usd, 3)} $</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MesaTab() {
  const [estado, setEstado] = useState<MesaEstado | null>(null);
  const [dia, setDia] = useState<MesaDia | null>(null);
  const [fecha, setFecha] = useState<string | null>(null);
  const [pasadas, setPasadas] = useState<MesaPasada[] | null>(null);
  const [showPasadas, setShowPasadas] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const now = useNow(5000);

  const loadEstado = useCallback(async () => {
    try {
      const e = await getMesaEstado();
      setEstado(e);
      setError(null);
      return e;
    } catch (err) {
      setError((err as Error).message);
      return null;
    }
  }, []);

  const loadDia = useCallback(async (f: string | null) => {
    try {
      const d = await getMesaDia(f ?? undefined);
      setDia(d);
      if (d) setFecha(d.fecha);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadEstado();
      await loadDia(null);
      setLoading(false);
    })();
  }, [loadEstado, loadDia]);

  // Mientras corre una pasada, se consulta cada 10 s y al terminar se recargan las fichas del día.
  useEffect(() => {
    if (!estado?.running) return;
    const id = window.setInterval(async () => {
      const e = await loadEstado();
      if (e && !e.running) {
        await loadDia(null);
        if (showPasadas) getMesaPasadas().then(setPasadas).catch(() => {});
      }
    }, 10_000);
    return () => window.clearInterval(id);
  }, [estado?.running, loadEstado, loadDia, showPasadas]);

  useEffect(() => {
    if (showPasadas && !pasadas) getMesaPasadas().then(setPasadas).catch(() => {});
  }, [showPasadas, pasadas]);

  async function onRun() {
    setNotice(null);
    try {
      await runMesa();
      setNotice('Mesa en marcha: los tres analistas tardan unos minutos. Las fichas aparecerán aquí al terminar.');
      await loadEstado();
    } catch (err) {
      setNotice((err as Error).message);
    }
  }

  if (loading) return <div className="flex justify-center py-10"><Spinner label="Cargando la mesa…" /></div>;

  const cfg = estado?.config ?? null;
  const ultima = estado?.ultima_pasada ?? null;
  const jefe = dia?.fichas.jefe_de_mesa ?? null;
  const eventos = (jefe?.eventos.length ? jefe.eventos : dia?.fichas.analista_macro?.eventos) ?? [];
  const radarPares = new Map((dia?.radar?.pares ?? []).map((p) => [p.symbol, p]));
  const simbolos = dia ? [...new Set([...(dia.radar?.pares ?? []).map((p) => p.symbol), ...ANALISTAS.flatMap((a) => (dia.fichas[a]?.pares ?? []).map((p) => p.symbol))])] : [];
  const regimen = dia?.radar?.regimen ?? null;

  return (
    <div className="space-y-4">
      <Card
        title={<span className="flex items-center gap-2"><Bot className="h-4 w-4 text-accent" /> Mesa de agentes</span>}
        subtitle="Tres analistas (macro, flujos y riesgo, jefe de mesa) leen cada mañana el mismo paquete del radar y dejan una ficha por par: sesgo, confianza, motivos con número e invalidación. Ellos leen; tú operas. El sesgo que manda sigue siendo el medido (nivel A/B)."
        actions={
          <Button size="sm" onClick={() => void onRun()} loading={!!estado?.running} disabled={!cfg?.api_key} leftIcon={<Play className="h-3.5 w-3.5" />} title={cfg?.api_key ? 'Arma el paquete de hoy y llama a los tres agentes' : 'Añade ANTHROPIC_API_KEY en .env'}>
            {estado?.running ? 'Pasando la mesa…' : 'Pasar la mesa ahora'}
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          {cfg && (
            <>
              <Badge variant={cfg.api_key ? 'profit' : 'loss'} size="sm">{cfg.api_key ? 'Clave de Anthropic configurada' : 'Sin ANTHROPIC_API_KEY'}</Badge>
              <Badge variant="outline" size="sm">modelo {cfg.model} · esfuerzo {cfg.effort}</Badge>
              <Badge variant={cfg.auto ? 'accent' : 'outline'} size="sm">{cfg.auto ? `automática a las ${cfg.hora} (${cfg.tz}), días laborables` : 'pasada automática apagada'}</Badge>
            </>
          )}
          {ultima && (
            <span className="text-gray-400">
              Última pasada: {fmtYmd(ultima.fecha)} · {ultima.status === 'ok' ? `${fmtNum(ultima.cost_usd, 3)} $` : ultima.status === 'error' ? `error: ${ultima.error ?? ''}` : 'en curso'} · {fmtSince(ultima.started_at, now)}
            </span>
          )}
          {estado?.running && <span className="inline-flex items-center gap-1 text-warn"><RefreshCw className="h-3 w-3 animate-spin" /> en curso desde {fmtSince(estado.started_at, now)}</span>}
        </div>
        {!cfg?.api_key && (
          <p className="mt-3 rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
            Para que los agentes lean hace falta la clave prepago de Anthropic: añade <code className="font-mono">ANTHROPIC_API_KEY=…</code> al archivo <code className="font-mono">.env</code> de la raíz y reinicia el servidor. Hasta entonces esta pestaña solo muestra fichas ya guardadas.
          </p>
        )}
        {notice && <p className="mt-3 rounded-md border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-accent-soft">{notice}</p>}
        {error && <p className="mt-3 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-xs text-loss">{error}</p>}
        {estado?.running && estado.log.length > 0 && (
          <ul className="mt-3 space-y-0.5 font-mono text-[11px] text-gray-500">{estado.log.slice(-4).map((l, i) => <li key={i}>{l}</li>)}</ul>
        )}
      </Card>

      {!dia ? (
        <EmptyState
          icon={<Bot className="h-6 w-6" />}
          title="Todavía no hay fichas"
          description={cfg?.api_key ? 'Pulsa «Pasar la mesa ahora» o espera a la pasada automática. También puedes lanzarla desde la terminal: npm run mesa -w server.' : 'Configura la clave de Anthropic y pasa la mesa por primera vez.'}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-xs text-gray-400" htmlFor="mesa-fecha">Fichas del</label>
              <select
                id="mesa-fecha"
                value={fecha ?? ''}
                onChange={(e) => void loadDia(e.target.value)}
                className="rounded-md border border-border bg-panel px-2 py-1 text-xs text-gray-100"
              >
                {(estado?.fechas ?? [dia.fecha]).map((f) => <option key={f} value={f}>{fmtYmd(f, 'EEEE d MMM yyyy')}</option>)}
              </select>
              <span className="text-[11px] text-gray-500">fichas v{dia.pasada.version_fichas ?? '?'} · {dia.pasada.model ?? ''} · {fmtNum(dia.pasada.cost_usd, 3)} $</span>
            </div>
            {regimen && (
              <span className={cn('inline-flex items-center gap-1 text-[11px]', regimen.salto?.estado === 'turbulento' || regimen.clave === 'tension' ? 'text-warn' : 'text-gray-400')}>
                {(regimen.salto?.estado === 'turbulento' || regimen.clave === 'tension') && <AlertTriangle className="h-3 w-3" />}
                Régimen ese día: {regimen.etiqueta}{regimen.vix !== null ? ` · VIX ${fmtNum(regimen.vix, 1)}` : ''}{regimen.salto ? ` · salto: ${regimen.salto.estado}` : ''}
              </span>
            )}
          </div>

          {jefe && jefe.nota_jefe && (
            <Card title={<span className="flex items-center gap-2">Nota del jefe de mesa</span>} subtitle="Coincidencias de los tres con el radar, discrepancias y advertencias del día. No repite las fichas.">
              <p className="whitespace-pre-line text-sm leading-relaxed text-gray-100">{jefe.nota_jefe}</p>
            </Card>
          )}

          {eventos.length > 0 && (
            <Card flush title="Eventos leídos" subtitle="Lo publicado en las últimas 24 h y lo que viene: tono frente a lo descontado y si cambia las expectativas de tipos. Confirmación: bono 2 años → DXY → oro/Nasdaq.">
              <ul className="divide-y divide-border/60">{eventos.map((e, i) => <EventoRow key={i} e={e} />)}</ul>
            </Card>
          )}

          <div className="grid gap-4 2xl:grid-cols-2">
            {simbolos.map((s) => <ParCard key={s} symbol={s} radar={radarPares.get(s) ?? null} fichas={dia.fichas} />)}
          </div>

          <Card title="Marcador de acierto" subtitle="Acierto a 1, 5 y 20 días por agente y par, calibración por tramos de confianza y comparación con el radar y con una moneda.">
            <p className="text-xs text-gray-500">Se rellena en la fase 3 con las fichas que se vayan guardando: hoy hay {estado?.fechas.length ?? 0} día(s) de fichas. Hasta entonces el sesgo de la mesa no entra en el modelo.</p>
          </Card>
        </>
      )}

      <Card
        flush
        title="Pasadas"
        subtitle="Cada pasada son tres llamadas a la API (macro → flujos → jefe); los documentos fijos van en caché a partir de la primera."
        actions={<Button variant="secondary" size="sm" onClick={() => setShowPasadas((v) => !v)} leftIcon={showPasadas ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}>{showPasadas ? 'Ocultar' : 'Ver historial'}</Button>}
      >
        {showPasadas ? (pasadas ? <PasadasTable rows={pasadas} /> : <p className="px-4 py-3 text-xs text-gray-500">Cargando…</p>) : null}
      </Card>
    </div>
  );
}
