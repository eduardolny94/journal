// Pestaña Diagnóstico del panel de administración: ¿está todo corriendo y los datos se recogen bien?
import { useCallback, useEffect, useState } from 'react';
import { Activity, Database, RefreshCw, Repeat, Server, Users } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { PageSpinner } from '../ui/Spinner';
import { api } from '../../lib/api';
import { cn } from '../../lib/cn';
import { fmtDateTime, fmtMoney } from '../../lib/format';

type Status = 'ok' | 'aviso' | 'error';
interface TierA { n: number; hit_rate: number | null; avg_r: number | null }
interface CycleCut { cut: string; label: string; ref: TierA | null; trial: TierA | null; gain: number | null; ok: boolean }
interface CycleItem { name: string; pass: boolean; gain: number | null; pending: number; cuts: CycleCut[] }
interface CycleChange { at: string; tipo: 'adoptar' | 'retirar'; feature: string; gain: number | null }
interface Cycle {
  last_run: string | null; active: string[]; base_count: number; adopted: string[];
  candidates: CycleItem[]; retirements: CycleItem[]; reference: Array<{ cut: string; label: string; A: TierA | null }>;
  history: CycleChange[]; status: Status;
}
const FEATURE_LABEL: Record<string, string> = {
  fuerza: 'Fuerza del sesgo', extremo: 'Divergencia extrema', crecimiento: 'Sesgo creciendo', tendencia20: 'Tendencia 20 d', vela_ayer: 'Vela de ayer',
  extension_ema: 'Extensión sobre EMA 20', eficiencia: 'Eficiencia (Kaufman)', vix_tension: 'VIX en tensión', cot_extremo: 'COT en extremo', noticia_24h: 'Dato fuerte en 24 h',
  ultima_sorpresa: 'Última sorpresa', valor: 'Valor (PPP)', tendencia_larga: 'Tendencia larga', sorpresas: 'Sorpresas (CESI)', par_usd: 'Par con dólar', par_jpy: 'Par con yen',
  taylor: 'Regla de Taylor', descontado: 'Descontado vs debido', real: 'Tipo real', tot: 'Materias primas',
};
const featureLabel = (n: string) => FEATURE_LABEL[n] ?? n;
const tierText = (a: TierA | null) => (a && a.n ? `${a.hit_rate ?? '—'} % (n=${a.n})` : '—');

function CycleCard({ c }: { c: Cycle }) {
  const cutHeads = c.reference.length ? c.reference : c.candidates[0]?.cuts.map((x) => ({ cut: x.cut, label: x.label, A: x.ref })) ?? [];
  return (
    <Card title={<span className="flex items-center gap-2"><Repeat className="h-4 w-4 text-gray-500" /> Ciclo de mejora del radar</span>} subtitle="Cada semana mide las condiciones candidatas de la convicción y adopta o retira por reglas fijas: nivel A a 5 días con n ≥ 30, +2 puntos y R no peor en los tres cortes temporales, dos semanas seguidas">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
        <div><dt className="text-gray-500">Última ejecución</dt><dd className="text-gray-100 tnum">{when(c.last_run)}</dd></div>
        <div><dt className="text-gray-500">Condiciones activas</dt><dd className="text-gray-100 tnum">{c.active.length} ({c.base_count} base{c.adopted.length ? ` + ${c.adopted.length} adoptadas` : ''})</dd></div>
        <div><dt className="text-gray-500">Adoptadas por el ciclo</dt><dd className="text-gray-100">{c.adopted.length ? c.adopted.map(featureLabel).join(', ') : 'ninguna todavía'}</dd></div>
        <div><dt className="text-gray-500">Estado</dt><dd><StatusBadge s={c.status} /></dd></div>
      </dl>
      {c.candidates.length > 0 && (
        <table className="mt-3 w-full text-left text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-gray-500">
              <th className="py-1">Candidata</th>
              {cutHeads.map((h) => <th key={h.cut} className="py-1">{h.label.replace('prueba: ', '')}</th>)}
              <th className="py-1 text-right">Veredicto</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-border/60 text-gray-400">
              <td className="py-1.5">Modelo activo (referencia)</td>
              {cutHeads.map((h) => <td key={h.cut} className="py-1.5 tnum">{tierText(h.A)}</td>)}
              <td className="py-1.5 text-right">—</td>
            </tr>
            {c.candidates.map((it) => (
              <tr key={it.name} className="border-t border-border/60">
                <td className="py-1.5 text-gray-200">{featureLabel(it.name)}</td>
                {it.cuts.map((x) => (
                  <td key={x.cut} className={cn('py-1.5 tnum', x.ok ? 'text-profit' : 'text-gray-400')}>{tierText(x.trial)}{x.gain !== null ? <span className="text-gray-500"> ({x.gain >= 0 ? '+' : ''}{x.gain})</span> : null}</td>
                ))}
                <td className="py-1.5 text-right">{it.pass ? <Badge variant="profit">cumple · {it.pending}/2 confirmaciones</Badge> : <span className="text-gray-500">no mejora en todos los cortes</span>}</td>
              </tr>
            ))}
            {c.retirements.map((it) => (
              <tr key={`r-${it.name}`} className="border-t border-border/60">
                <td className="py-1.5 text-gray-200">{featureLabel(it.name)} <span className="text-gray-500">(adoptada, ¿sigue aportando?)</span></td>
                {it.cuts.map((x) => <td key={x.cut} className={cn('py-1.5 tnum', x.ok ? 'text-warn' : 'text-profit')}>{tierText(x.trial)}</td>)}
                <td className="py-1.5 text-right">{it.pass ? <Badge variant="warn">sin aportar · {it.pending}/2 para retirar</Badge> : <span className="text-profit">sigue aportando</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {c.history.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs">
          {c.history.map((h, i) => (
            <li key={`${h.at}-${i}`} className="flex flex-wrap gap-2">
              <span className="tnum text-gray-500">{when(h.at)}</span>
              <Badge variant={h.tipo === 'adoptar' ? 'profit' : 'warn'}>{h.tipo === 'adoptar' ? 'adoptada' : 'retirada'}</Badge>
              <span className="text-gray-200">{featureLabel(h.feature)}</span>
              {h.gain !== null && <span className="tnum text-gray-500">{h.gain >= 0 ? '+' : ''}{h.gain} pts en nivel A</span>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-gray-500">Sin cambios registrados: ninguna candidata ha superado la regla todavía. Las 16 condiciones base siguen siendo el modelo.</p>
      )}
    </Card>
  );
}
interface Row { key: string; label: string; status: Status; last: string | null; age_h?: number | null; detail?: string; value?: string; ok?: boolean; running?: boolean }
interface Diag {
  generated_at: string;
  overall: Status;
  servidor: { now: string; uptime_h: number | null; node: string; env: string; memory_mb: { rss: number; heap: number }; mailer: { driver: string; configured: boolean; from: string | null }; fred_key: boolean; snapshot_computed_at: string | null; regime: { key: string; weights_name: string } | null; subscription_job: { at: string; reminders: number; expired: number } | null; memory_status: Status };
  fuentes: Row[];
  datos: Row[];
  ciclo: Cycle;
  usuarios: { users: number; disabled: number; last_login: string | null; accounts: number; accounts_mt5: number; accounts_with_sync: number; last_sync: string | null; trades: number; trades_by_sync: number; trades_by_import: number; sync_accounts: Array<{ id: number; name: string; firm: string; sync_login: string | null; sync_last_at: string | null; sync_trades_total: number; sync_balance: number | null }> };
}

const STATUS_LABEL: Record<Status, string> = { ok: 'OK', aviso: 'Aviso', error: 'Error' };
const STATUS_VARIANT: Record<Status, 'profit' | 'warn' | 'loss'> = { ok: 'profit', aviso: 'warn', error: 'loss' };
const when = (iso: string | null | undefined) => (iso ? fmtDateTime(iso) : 'nunca');
const age = (h: number | null | undefined) => (h === null || h === undefined ? '' : h < 1 ? `hace ${Math.round(h * 60)} min` : h < 48 ? `hace ${h.toFixed(1)} h` : `hace ${(h / 24).toFixed(1)} días`);

function StatusBadge({ s }: { s: Status }) {
  return <Badge variant={STATUS_VARIANT[s]}>{STATUS_LABEL[s]}</Badge>;
}

function RowsTable({ rows, showDetail }: { rows: Row[]; showDetail: boolean }) {
  return (
    <table className="w-full text-left text-xs">
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-border/60">
            <td className="py-2 pr-2 text-gray-200">{r.label}{r.running && <span className="ml-1 text-accent-soft">(calculando…)</span>}</td>
            <td className="py-2 pr-2 text-gray-400">{showDetail ? r.detail : r.value}</td>
            <td className="py-2 pr-2 text-right tnum text-gray-500">{r.last ? `${when(r.last)}${r.age_h !== undefined ? ` · ${age(r.age_h)}` : ''}` : '—'}</td>
            <td className="py-2 text-right"><StatusBadge s={r.status} /></td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function DiagnosticsTab() {
  const [d, setD] = useState<Diag | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(() => {
    setLoading(true);
    api<Diag>('/admin/diagnostico').then((x) => { setD(x); setError(null); }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!d && !error) return <PageSpinner label="Revisando el sistema…" />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {d && <StatusBadge s={d.overall} />}
        <span className="text-sm text-gray-300">{d ? (d.overall === 'ok' ? 'Todo funciona y los datos se recogen con normalidad.' : d.overall === 'aviso' ? 'Funciona, con algún dato atrasado o pendiente (ver avisos).' : 'Hay algo parado: revisa las filas en rojo.') : ''}</span>
        <Button className="ml-auto" size="sm" variant="secondary" onClick={load} loading={loading} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>Revisar ahora</Button>
      </div>
      {error && <p className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss">{error}</p>}
      {d && (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card title={<span className="flex items-center gap-2"><Server className="h-4 w-4 text-gray-500" /> Servidor</span>} subtitle={`Revisado ${when(d.generated_at)}`}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                <div><dt className="text-gray-500">Encendido desde hace</dt><dd className="text-gray-100 tnum">{d.servidor.uptime_h === null ? '—' : d.servidor.uptime_h < 48 ? `${d.servidor.uptime_h} h` : `${(d.servidor.uptime_h / 24).toFixed(1)} días`}</dd></div>
                <div><dt className="text-gray-500">Memoria</dt><dd className={cn('tnum', d.servidor.memory_status === 'ok' ? 'text-gray-100' : d.servidor.memory_status === 'aviso' ? 'text-warn' : 'text-loss')}>{d.servidor.memory_mb.rss} MB (límite 512)</dd></div>
                <div><dt className="text-gray-500">Entorno</dt><dd className="text-gray-100">{d.servidor.env} · Node {d.servidor.node}</dd></div>
                <div><dt className="text-gray-500">Radar calculado</dt><dd className="text-gray-100 tnum">{when(d.servidor.snapshot_computed_at)}</dd></div>
                <div><dt className="text-gray-500">Régimen / pesos</dt><dd className="text-gray-100">{d.servidor.regime ? `${d.servidor.regime.key} · ${d.servidor.regime.weights_name}` : '—'}</dd></div>
                <div><dt className="text-gray-500">Clave FRED</dt><dd className={d.servidor.fred_key ? 'text-profit' : 'text-loss'}>{d.servidor.fred_key ? 'configurada' : 'falta'}</dd></div>
                <div><dt className="text-gray-500">Correo</dt><dd className={d.servidor.mailer.configured ? 'text-profit' : 'text-warn'}>{d.servidor.mailer.configured ? `real (${d.servidor.mailer.driver})` : 'simulado'}</dd></div>
                <div><dt className="text-gray-500">Tarea de suscripciones</dt><dd className="text-gray-100 tnum">{d.servidor.subscription_job ? `${when(d.servidor.subscription_job.at)} · ${d.servidor.subscription_job.reminders} avisos` : 'aún no'}</dd></div>
              </dl>
            </Card>
            <Card title={<span className="flex items-center gap-2"><Users className="h-4 w-4 text-gray-500" /> Usuarios y sincronización</span>}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-3">
                <div><dt className="text-gray-500">Usuarios</dt><dd className="text-gray-100 tnum">{d.usuarios.users}{d.usuarios.disabled ? ` (${d.usuarios.disabled} desactivados)` : ''}</dd></div>
                <div><dt className="text-gray-500">Último acceso</dt><dd className="text-gray-100 tnum">{when(d.usuarios.last_login)}</dd></div>
                <div><dt className="text-gray-500">Cuentas</dt><dd className="text-gray-100 tnum">{d.usuarios.accounts} · {d.usuarios.accounts_mt5} MT5 · {d.usuarios.accounts_with_sync} con sync</dd></div>
                <div><dt className="text-gray-500">Operaciones</dt><dd className="text-gray-100 tnum">{d.usuarios.trades} · {d.usuarios.trades_by_sync} por sync · {d.usuarios.trades_by_import} por CSV</dd></div>
                <div><dt className="text-gray-500">Última sincronización</dt><dd className="text-gray-100 tnum">{when(d.usuarios.last_sync)}</dd></div>
              </dl>
              {d.usuarios.sync_accounts.length > 0 && (
                <table className="mt-3 w-full text-left text-xs">
                  <thead><tr className="text-[10px] uppercase tracking-wider text-gray-500"><th className="py-1">Cuenta</th><th className="py-1">MT5</th><th className="py-1">Última</th><th className="py-1 text-right">Ops</th><th className="py-1 text-right">Balance</th></tr></thead>
                  <tbody>
                    {d.usuarios.sync_accounts.map((a) => (
                      <tr key={a.id} className="border-t border-border/60">
                        <td className="py-1.5 text-gray-200">{a.name}<span className="text-gray-500"> · {a.firm}</span></td>
                        <td className="py-1.5 text-gray-400">{a.sync_login ?? 'sin asociar'}</td>
                        <td className="py-1.5 tnum text-gray-400">{when(a.sync_last_at)}</td>
                        <td className="py-1.5 text-right tnum text-gray-200">{a.sync_trades_total}</td>
                        <td className="py-1.5 text-right tnum text-gray-200">{a.sync_balance === null ? '—' : fmtMoney(a.sync_balance, 'USD', { sign: false })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
          {d.ciclo && <CycleCard c={d.ciclo} />}
          <Card title={<span className="flex items-center gap-2"><Activity className="h-4 w-4 text-gray-500" /> Fuentes del radar</span>} subtitle="Estado de cada descarga: la última vez que funcionó y el error si lo hay">
            <RowsTable rows={d.fuentes} showDetail />
          </Card>
          <Card title={<span className="flex items-center gap-2"><Database className="h-4 w-4 text-gray-500" /> Datos recogidos</span>} subtitle="Lo que hay en la base de datos del servidor y cuándo se actualizó">
            <RowsTable rows={d.datos} showDetail={false} />
          </Card>
        </>
      )}
    </div>
  );
}
