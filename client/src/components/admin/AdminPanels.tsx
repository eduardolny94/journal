// Pestañas del panel de administración: suscriptores, pagos, emails (plantillas y registro) y ajustes.
import { useCallback, useEffect, useState } from 'react';
import { CreditCard, Eye, Mail, Play, RefreshCw, Save, Search, Send, Settings2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Input, Textarea } from '../ui/Input';
import { Select } from '../ui/Select';
import { cn } from '../../lib/cn';
import { fmtDate, fmtDateTime, fmtMoney } from '../../lib/format';
import {
  PAYMENT_METHOD_LABELS, PLAN_LABELS, STATUS_LABELS, STATUS_VARIANTS, daysLeftClass, daysLeftText, fetchEmails, fetchPayments, fetchTemplates, fetchUsers, previewTemplate,
  LEVEL_LABELS, runJobs, saveSettings, saveTemplate, testTemplate, type AdminSettings, type AdminUserRow, type EmailLogRow, type EmailTemplate, type JobResult, type MailerInfo, type Payment, type PlanKey,
} from '../../lib/admin';

const th = 'px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500';

export function MailerBanner({ mailer }: { mailer: MailerInfo | null }) {
  if (!mailer) return null;
  return mailer.configured ? (
    <p className="rounded-md border border-profit/30 bg-profit/5 px-3 py-2 text-xs text-gray-300">Correo real activo (Resend) · remitente <span className="text-gray-100">{mailer.from}</span>.</p>
  ) : (
    <p className="rounded-md border border-warn/40 bg-warn/10 px-3 py-2 text-xs text-warn">
      Correo en modo simulación: los emails se generan y quedan en el registro, pero no salen. Para enviarlos de verdad, añade en el servidor las variables <code>RESEND_API_KEY</code> y <code>MAIL_FROM</code> (por ejemplo "Global Traders FX &lt;avisos@cesarzorrilla.com&gt;").
    </p>
  );
}

// ---------- Suscriptores ----------

export function SubscribersTab({ onManage, reloadKey }: { onManage: (id: number, tab?: 'suscripcion' | 'pago' | 'email' | 'historial') => void; reloadKey: number }) {
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const t = window.setTimeout(() => {
      fetchUsers({ search, status, plan }, ctrl.signal)
        .then((r) => { setRows(r); setError(null); })
        .catch((e: Error) => e.name !== 'AbortError' && setError(e.message))
        .finally(() => !ctrl.signal.aborted && setLoading(false));
    }, 250);
    return () => { window.clearTimeout(t); ctrl.abort(); };
  }, [search, status, plan, reloadKey]);
  const statusOptions = [{ value: '', label: 'Todos los estados' }, ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))];
  const planOptions = [{ value: '', label: 'Todos los planes' }, ...Object.entries(PLAN_LABELS).map(([value, label]) => ({ value, label }))];
  return (
    <Card
      title="Suscriptores"
      subtitle={loading ? 'Cargando…' : `${rows.length} usuarios`}
      flush
      actions={
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Buscar por nombre o email" value={search} onChange={(e) => setSearch(e.target.value)} leftAddon={<Search className="h-3.5 w-3.5" />} />
          <Select value={status} onChange={(e) => setStatus(e.target.value)} options={statusOptions} />
          <Select value={plan} onChange={(e) => setPlan(e.target.value)} options={planOptions} />
        </div>
      }
    >
      {error && <p className="p-4 text-sm text-loss">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead>
            <tr>
              <th className={th}>Usuario</th>
              <th className={th}>Plan</th>
              <th className={th}>Estado</th>
              <th className={th}>Vence</th>
              <th className={cn(th, 'text-right')}>Precio</th>
              <th className={cn(th, 'text-right')}>Pagado</th>
              <th className={th}>Último acceso</th>
              <th className={cn(th, 'text-right')}>Uso</th>
              <th className={cn(th, 'text-right')}>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => {
              const s = u.subscription;
              return (
                <tr key={u.id} className={cn('border-t border-border/60', u.is_disabled && 'opacity-60')}>
                  <td className="px-3 py-2">
                    <button onClick={() => onManage(u.id)} className="text-left">
                      <span className="font-semibold text-gray-100 hover:text-accent-soft">{u.name}</span>
                      {u.admin_level && <Badge variant={u.admin_level === 'owner' ? 'warn' : 'accent'} className="ml-2">{LEVEL_LABELS[u.admin_level]}</Badge>}
                      {u.is_disabled && <Badge variant="loss" className="ml-2">Desactivado</Badge>}
                      <span className="block text-xs text-gray-500">{u.email} · alta {fmtDate(u.created_at)}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2 text-gray-300">{s ? PLAN_LABELS[s.plan] : '—'}</td>
                  <td className="px-3 py-2"><Badge variant={STATUS_VARIANTS[u.effective_status]}>{STATUS_LABELS[u.effective_status]}</Badge></td>
                  <td className="px-3 py-2">
                    {s?.current_period_end ? (
                      <>
                        <span className="tnum text-gray-200">{fmtDate(s.current_period_end)}</span>
                        <span className={cn('block text-xs', daysLeftClass(u.days_left))}>{daysLeftText(u.days_left)}</span>
                      </>
                    ) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-3 py-2 text-right tnum text-gray-300">{s ? fmtMoney(s.price, s.currency, { sign: false }) : '—'}</td>
                  <td className="px-3 py-2 text-right tnum text-gray-300">{fmtMoney(u.paid_total, s?.currency ?? 'USD', { sign: false })}</td>
                  <td className="px-3 py-2 text-xs text-gray-400">{u.last_login_at ? fmtDateTime(u.last_login_at) : 'nunca'}</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-400 tnum">{u.trades} op. · {u.accounts} ctas.</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" title="Registrar pago" onClick={() => onManage(u.id, 'pago')}><CreditCard className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" title="Enviar email" onClick={() => onManage(u.id, 'email')}><Mail className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="secondary" onClick={() => onManage(u.id)}>Gestionar</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && <tr><td colSpan={9} className="px-4 py-6 text-center text-sm text-gray-500">Nadie coincide con esos filtros.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Pagos ----------

export function PaymentsTab({ reloadKey, onManage }: { reloadKey: number; onManage: (id: number, tab?: 'historial') => void }) {
  const [rows, setRows] = useState<Payment[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const ctrl = new AbortController();
    fetchPayments(ctrl.signal).then(setRows).catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    return () => ctrl.abort();
  }, [reloadKey]);
  const total = rows.reduce((a, p) => a + Number(p.amount || 0), 0);
  const cur = rows[0]?.currency ?? 'USD';
  return (
    <Card title="Pagos registrados" subtitle={`${rows.length} pagos · ${fmtMoney(total, cur, { sign: false })} en total. Se registran a mano hasta que se conecte la pasarela.`} flush>
      {error && <p className="p-4 text-sm text-loss">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-left text-sm">
          <thead><tr><th className={th}>Fecha</th><th className={th}>Usuario</th><th className={th}>Plan</th><th className={th}>Cubre hasta</th><th className={th}>Método</th><th className={th}>Referencia</th><th className={cn(th, 'text-right')}>Importe</th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-border/60">
                <td className="px-3 py-2 tnum text-gray-300">{fmtDate(p.paid_at)}</td>
                <td className="px-3 py-2"><button onClick={() => onManage(p.user_id, 'historial')} className="text-left text-gray-100 hover:text-accent-soft">{p.user_name}<span className="block text-xs text-gray-500">{p.user_email}</span></button></td>
                <td className="px-3 py-2 text-gray-300">{p.plan ? PLAN_LABELS[p.plan as PlanKey] ?? p.plan : '—'}</td>
                <td className="px-3 py-2 tnum text-gray-400">{p.period_end ? fmtDate(p.period_end) : '—'}</td>
                <td className="px-3 py-2 text-gray-300">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</td>
                <td className="px-3 py-2 text-gray-400">{p.reference || '—'}</td>
                <td className="px-3 py-2 text-right tnum font-semibold text-profit">{fmtMoney(p.amount, p.currency, { sign: false })}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-center text-sm text-gray-500">Todavía no hay pagos. Regístralos desde la ficha de cada suscriptor.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ---------- Emails ----------

export function EmailsTab({ reloadKey, onTemplates, canEdit }: { reloadKey: number; onTemplates?: (t: EmailTemplate[]) => void; canEdit: boolean }) {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [mailer, setMailer] = useState<MailerInfo | null>(null);
  const [selected, setSelected] = useState<string>('aviso_7d');
  const [draft, setDraft] = useState<EmailTemplate | null>(null);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [log, setLog] = useState<EmailLogRow[]>([]);
  const [logStatus, setLogStatus] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetchTemplates().then((r) => { setTemplates(r.templates); setVariables(r.variables); setMailer(r.mailer); onTemplates?.(r.templates); }).catch((e: Error) => setMsg(e.message));
  }, [onTemplates]);
  useEffect(() => load(), [load, reloadKey]);
  useEffect(() => {
    fetchEmails(logStatus).then(setLog).catch(() => {});
  }, [logStatus, reloadKey]);
  useEffect(() => {
    const t = templates.find((x) => x.key === selected) ?? null;
    setDraft(t ? { ...t } : null);
    setPreview(null);
  }, [selected, templates]);

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setMsg(null);
    try { await fn(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <MailerBanner mailer={mailer} />
      {msg && <p className="rounded-md border border-border bg-panel px-3 py-2 text-xs text-gray-300">{msg}</p>}
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <Card title="Plantillas" subtitle="Los avisos con días de antelación se envían solos, una vez por periodo." flush>
          <ul className="divide-y divide-border">
            {templates.map((t) => (
              <li key={t.key}>
                <button onClick={() => setSelected(t.key)} className={cn('flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left text-sm hover:bg-gray-800/40', selected === t.key && 'bg-accent/10')}>
                  <span className="text-gray-100">{t.name}<span className="block text-xs text-gray-500">{t.days_before !== null ? `automático · ${t.days_before} ${t.days_before === 1 ? 'día' : 'días'} antes` : t.key === 'vencida' ? 'automático · al vencer' : 'manual o al registrar un pago'}</span></span>
                  <Badge variant={t.enabled ? 'profit' : 'outline'}>{t.enabled ? 'activa' : 'apagada'}</Badge>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        {draft && (
          <Card title={draft.name} subtitle={`Variables: ${variables.map((v) => `{{${v}}}`).join('  ')}`}>
            <div className="space-y-3">
              {!canEdit && <p className="text-xs text-gray-500">Solo el dueño puede modificar las plantillas. Puedes ver la vista previa y enviarte una prueba.</p>}
              <Input label="Asunto" disabled={!canEdit} value={draft.subject} maxLength={200} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
              <Textarea label="Mensaje" rows={9} disabled={!canEdit} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
              <div className="flex flex-wrap items-end gap-3">
                {draft.days_before !== null && <Input label="Días de antelación" disabled={!canEdit} type="number" min={0} max={60} value={String(draft.days_before)} onChange={(e) => setDraft({ ...draft, days_before: Number(e.target.value) })} />}
                <label className="flex items-center gap-2 pb-2 text-sm text-gray-300">
                  <input type="checkbox" disabled={!canEdit} checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} className="h-4 w-4 rounded border-border bg-bg accent-accent" /> Plantilla activa
                </label>
                <span className="ml-auto flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act(async () => setPreview(await previewTemplate(draft.key, { subject: draft.subject, body: draft.body })))} leftIcon={<Eye className="h-3.5 w-3.5" />}>Vista previa</Button>
                  <Button variant="secondary" size="sm" disabled={busy} onClick={() => void act(async () => { const r = await testTemplate(draft.key); setMsg(r.status === 'enviado' ? 'Prueba enviada a tu email.' : r.status === 'simulado' ? 'Prueba simulada (sin servicio de correo): mira el registro de abajo.' : `Error: ${r.error ?? ''}`); setLog(await fetchEmails(logStatus)); })} leftIcon={<Send className="h-3.5 w-3.5" />}>Enviarme una prueba</Button>
                  {canEdit && <Button size="sm" loading={busy} onClick={() => void act(async () => { await saveTemplate(draft.key, { subject: draft.subject, body: draft.body, days_before: draft.days_before, enabled: draft.enabled }); setMsg('Plantilla guardada.'); load(); })} leftIcon={<Save className="h-3.5 w-3.5" />}>Guardar</Button>}
                </span>
              </div>
              {preview && (
                <div className="rounded-md border border-border bg-bg/40 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-gray-500">Vista previa</p>
                  <p className="mt-1 text-sm font-semibold text-gray-100">{preview.subject}</p>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-300">{preview.body}</p>
                </div>
              )}
            </div>
          </Card>
        )}
      </div>
      <Card title="Registro de emails" subtitle={`${log.length} más recientes`} flush actions={<Select value={logStatus} onChange={(e) => setLogStatus(e.target.value)} options={[{ value: '', label: 'Todos' }, { value: 'enviado', label: 'Enviados' }, { value: 'simulado', label: 'Simulados' }, { value: 'error', label: 'Con error' }]} />}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead><tr><th className={th}>Fecha</th><th className={th}>Para</th><th className={th}>Plantilla</th><th className={th}>Asunto</th><th className={th}>Estado</th></tr></thead>
            <tbody>
              {log.map((m) => (
                <tr key={m.id} className="border-t border-border/60">
                  <td className="px-3 py-2 text-xs text-gray-400">{fmtDateTime(m.created_at)}</td>
                  <td className="px-3 py-2 text-gray-200">{m.user_name ?? '—'}<span className="block text-xs text-gray-500">{m.to_email}</span></td>
                  <td className="px-3 py-2 text-gray-400">{m.template_key}</td>
                  <td className="max-w-[320px] truncate px-3 py-2 text-gray-300" title={m.subject}>{m.subject}</td>
                  <td className="px-3 py-2"><Badge variant={m.status === 'enviado' ? 'profit' : m.status === 'error' ? 'loss' : 'default'}>{m.status}</Badge>{m.error ? <span className="ml-2 text-xs text-loss">{m.error}</span> : null}</td>
                </tr>
              ))}
              {log.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-500">Todavía no se ha enviado ningún email.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ---------- Ajustes ----------

export function SettingsTab({ initial, mailer, lastJob, onSaved, canEdit }: { initial: AdminSettings; mailer: MailerInfo | null; lastJob: JobResult | null; onSaved: () => void; canEdit: boolean }) {
  const [s, setS] = useState<AdminSettings>(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [job, setJob] = useState<JobResult | null>(lastJob);
  useEffect(() => setS(initial), [initial]);
  const set = <K extends keyof AdminSettings>(k: K, v: AdminSettings[K]) => setS((p) => ({ ...p, [k]: v }));
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      await saveSettings(s);
      setMsg('Ajustes guardados.');
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const r = await runJobs();
      setJob(r);
      setMsg(`Hecho: ${r.reminders} avisos enviados, ${r.expired} suscripciones marcadas como vencidas.`);
      onSaved();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const toggle = (label: string, checked: boolean, onChange: (v: boolean) => void, hint: string) => (
    <label className="flex items-start gap-3 rounded-md border border-border bg-bg/40 p-3">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-border bg-bg accent-accent" />
      <span><span className="text-sm text-gray-100">{label}</span><span className="block text-xs text-gray-500">{hint}</span></span>
    </label>
  );
  return (
    <div className="space-y-4">
      {msg && <p className="rounded-md border border-border bg-panel px-3 py-2 text-xs text-gray-300">{msg}</p>}
      {!canEdit && <p className="rounded-md border border-border bg-panel px-3 py-2 text-xs text-gray-400">Estás viendo los ajustes en modo lectura: solo el dueño de la plataforma puede cambiarlos.</p>}
      <fieldset disabled={!canEdit} className="grid min-w-0 gap-4 xl:grid-cols-2 disabled:opacity-70">
        <Card title="Reglas de suscripción" subtitle="Prueba gratuita, días de gracia y si se bloquea el acceso al vencer">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input label="Días de prueba gratuita" type="number" min={0} max={90} value={String(s.trial_days)} onChange={(e) => set('trial_days', Number(e.target.value))} hint="Al registrarse" />
              <Input label="Días de gracia" type="number" min={0} max={30} value={String(s.grace_days)} onChange={(e) => set('grace_days', Number(e.target.value))} hint="Tras vencer, antes de marcarla vencida" />
            </div>
            {toggle('Exigir suscripción activa para usar el journal', s.enforce, (v) => set('enforce', v), 'Apagado: todos entran aunque estén vencidos (solo control y avisos). Encendido: al vencer (más los días de gracia) el usuario ve la pantalla de renovación. Los administradores nunca se bloquean.')}
            {toggle('Enviar recordatorios automáticos', s.reminders_enabled, (v) => set('reminders_enabled', v), 'Cada hora se revisan los vencimientos y se envía el aviso que toque (7, 3 y 1 día antes, y al vencer), una sola vez por periodo.')}
          </div>
        </Card>
        <Card title="Precios y remitente" subtitle="Precios sugeridos al registrar pagos y datos que aparecen en los emails">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(['mensual', 'trimestral', 'semestral', 'anual'] as const).map((p) => (
                <Input key={p} label={PLAN_LABELS[p]} type="number" min={0} step="any" value={String(s.prices[p])} onChange={(e) => set('prices', { ...s.prices, [p]: Number(e.target.value) })} rightAddon={s.currency} />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input label="Nombre del remitente" value={s.sender_name} onChange={(e) => set('sender_name', e.target.value)} />
              <Input label="Email de soporte" type="email" value={s.support_email} onChange={(e) => set('support_email', e.target.value)} placeholder="soporte@tudominio.com" />
              <Input label="Enlace de pago" value={s.payment_link} onChange={(e) => set('payment_link', e.target.value)} placeholder="https://…" hint="Se inserta en los avisos como {{enlace_pago}}" />
              <Input label="Moneda" value={s.currency} maxLength={3} onChange={(e) => set('currency', e.target.value.toUpperCase())} />
            </div>
          </div>
        </Card>
      </fieldset>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="secondary" loading={busy} onClick={() => void run()} leftIcon={<Play className="h-4 w-4" />}>Revisar vencimientos y enviar avisos ahora</Button>
        {canEdit && <Button loading={busy} onClick={() => void save()} leftIcon={<Save className="h-4 w-4" />}>Guardar ajustes</Button>}
      </div>
      {job && (
        <Card title="Última revisión automática" subtitle={job.at ? fmtDateTime(job.at) : 'ahora'}>
          <p className="text-sm text-gray-300">{job.checked} suscripciones revisadas · {job.reminders} avisos · {job.expired} vencidas · {job.skipped} ya avisadas.</p>
          {job.details.length > 0 && <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-gray-400">{job.details.map((d, i) => <li key={i}>{d}</li>)}</ul>}
        </Card>
      )}
      <MailerBanner mailer={mailer} />
      <Card title={<span className="flex items-center gap-2"><Settings2 className="h-4 w-4 text-gray-500" /> Pasarela de pago</span>} subtitle="Pendiente de elegir. Hoy los pagos se registran a mano desde la ficha de cada suscriptor.">
        <div className="flex flex-wrap gap-2">
          {['Stripe', 'PayPal', 'Lemon Squeezy', 'Hotmart', 'Binance Pay'].map((p) => <Badge key={p} variant="outline">{p} · próximamente</Badge>)}
        </div>
        <p className="mt-3 text-xs text-gray-500">Cuando se conecte una pasarela, esta sección tendrá sus claves y webhooks, y se automatizará: cobro recurrente, renovación del periodo al cobrar, vencimiento al fallar el cobro, y el enlace de pago de cada usuario en los avisos. La base de datos ya reserva los campos (proveedor, id de cliente e id de suscripción).</p>
      </Card>
      <p className="flex items-center gap-1 text-[11px] text-gray-600"><RefreshCw className="h-3 w-3" /> Las tareas automáticas corren cada hora en el servidor.</p>
    </div>
  );
}
