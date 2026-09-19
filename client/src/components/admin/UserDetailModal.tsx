// Gestión de un suscriptor: suscripción, pago manual, email, acceso e historial (pagos, eventos, emails).
import { useCallback, useEffect, useState } from 'react';
import { Ban, CalendarPlus, CheckCircle2, Mail, RotateCcw, Save, Trash2, UserCheck, UserX, Wallet } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Input, Textarea } from '../ui/Input';
import { Modal } from '../ui/Modal';
import { Select } from '../ui/Select';
import { cn } from '../../lib/cn';
import { fmtDate, fmtDateTime, fmtMoney } from '../../lib/format';
import {
  EVENT_LABELS, PAYMENT_METHOD_LABELS, PLAN_LABELS, STATUS_LABELS, STATUS_VARIANTS, addPayment, daysLeftClass, daysLeftText, deletePayment, fetchUserDetail, saveSubscription,
  sendEmail, setAccess, subscriptionAction, LEVEL_LABELS, type AdminSettings, type EmailTemplate, type PlanKey, type SubStatus, type UserDetail,
} from '../../lib/admin';

const PLAN_OPTIONS = (Object.keys(PLAN_LABELS) as PlanKey[]).map((k) => ({ value: k, label: PLAN_LABELS[k] }));
const PAID_PLAN_OPTIONS = PLAN_OPTIONS.filter((p) => p.value !== 'prueba');
const STATUS_OPTIONS = (['prueba', 'activa', 'vencida', 'cancelada', 'pausada'] as SubStatus[]).map((k) => ({ value: k, label: STATUS_LABELS[k] }));
const METHOD_OPTIONS = Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => ({ value, label }));
const today = () => new Date().toISOString().slice(0, 10);
type Tab = 'suscripcion' | 'pago' | 'email' | 'historial';

export interface UserDetailModalProps {
  userId: number | null;
  onClose: () => void;
  onChanged: () => void;
  settings: AdminSettings | null;
  templates: EmailTemplate[];
  initialTab?: Tab;
  /** Quien mira es el dueño: puede cambiar roles, accesos y borrar pagos. */
  isOwner: boolean;
}

export default function UserDetailModal({ userId, onClose, onChanged, settings, templates, initialTab = 'suscripcion', isOwner }: UserDetailModalProps) {
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Formularios
  const [sub, setSub] = useState({ plan: 'mensual' as PlanKey, status: 'activa' as SubStatus, price: '', start: '', end: '', notes: '' });
  const [pay, setPay] = useState({ amount: '', plan: 'mensual' as PlanKey, periods: '1', method: 'manual', paid_at: today(), reference: '', note: '', send_email: true });
  const [mail, setMail] = useState({ template_key: '', subject: '', body: '' });

  const apply = useCallback((d: UserDetail) => {
    setDetail(d);
    const s = d.subscription;
    setSub({ plan: s?.plan ?? 'mensual', status: s?.status ?? 'activa', price: s ? String(s.price ?? '') : '', start: s?.current_period_start ?? '', end: s?.current_period_end ?? '', notes: s?.notes ?? '' });
  }, []);

  useEffect(() => {
    if (userId === null) return;
    setDetail(null);
    setError(null);
    setNotice(null);
    setTab(initialTab);
    const ctrl = new AbortController();
    fetchUserDetail(userId, ctrl.signal).then(apply).catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    return () => ctrl.abort();
  }, [userId, initialTab, apply]);

  useEffect(() => {
    const plan = pay.plan as 'mensual' | 'trimestral' | 'semestral' | 'anual';
    const base = settings?.prices?.[plan];
    if (base !== undefined) setPay((p) => ({ ...p, amount: String(base * (Number(p.periods) || 1)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pay.plan, pay.periods, settings]);

  async function run<T extends UserDetail>(fn: () => Promise<T>, ok: string) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      apply(await fn());
      setNotice(ok);
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onSendEmail() {
    if (!detail) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const r = await sendEmail(detail.user.id, mail.template_key ? { template_key: mail.template_key } : { subject: mail.subject, body: mail.body });
      setNotice(r.status === 'enviado' ? 'Email enviado.' : r.status === 'simulado' ? 'Email simulado (no hay servicio de correo configurado): quedó en el registro.' : `Error al enviar: ${r.error ?? ''}`);
      apply(await fetchUserDetail(detail.user.id));
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const u = detail?.user;
  const s = detail?.subscription ?? null;
  const cur = s?.currency || settings?.currency || 'USD';
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: 'suscripcion', label: 'Suscripción' },
    { key: 'pago', label: 'Registrar pago' },
    { key: 'email', label: 'Enviar email' },
    { key: 'historial', label: 'Historial' },
  ];

  return (
    <Modal open={userId !== null} onClose={onClose} size="xl" persistent={busy} title={u ? u.name : 'Cargando…'} description={u ? `${u.email} · alta ${fmtDate(u.created_at)}${u.last_login_at ? ` · último acceso ${fmtDateTime(u.last_login_at)}` : ' · todavía no ha entrado'}` : undefined}>
      {error && <div className="mb-3 rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">{error}</div>}
      {notice && <div className="mb-3 rounded-md border border-profit/40 bg-profit/10 px-3 py-2 text-sm text-profit">{notice}</div>}
      {!detail && !error && <p className="text-sm text-gray-500">Cargando…</p>}
      {detail && u && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg/40 px-3 py-2 text-sm">
            <Badge variant={STATUS_VARIANTS[detail.effective_status]} size="md">{STATUS_LABELS[detail.effective_status]}</Badge>
            {s && <span className="text-gray-200">{PLAN_LABELS[s.plan]} · {fmtMoney(s.price, cur, { sign: false })}</span>}
            {s?.current_period_end && <span className={cn('tnum', daysLeftClass(detail.days_left))}>{fmtDate(s.current_period_end)} · {daysLeftText(detail.days_left)}</span>}
            {u.admin_level && <Badge variant={u.admin_level === 'owner' ? 'warn' : 'accent'}>{LEVEL_LABELS[u.admin_level]}</Badge>}
            {u.is_disabled && <Badge variant="loss">Acceso desactivado</Badge>}
            <span className="ml-auto flex flex-wrap gap-1">
              <Button size="sm" variant="secondary" disabled={busy || !s} onClick={() => void run(() => subscriptionAction(u.id, 'extend', { days: 7 }), 'Periodo extendido 7 días.')} leftIcon={<CalendarPlus className="h-3.5 w-3.5" />}>+7 d</Button>
              <Button size="sm" variant="secondary" disabled={busy || !s} onClick={() => void run(() => subscriptionAction(u.id, 'extend', { days: 30 }), 'Periodo extendido 30 días.')} leftIcon={<CalendarPlus className="h-3.5 w-3.5" />}>+30 d</Button>
              {s && (detail.effective_status === 'cancelada' || detail.effective_status === 'vencida' || detail.effective_status === 'pausada') ? (
                <Button size="sm" variant="success" disabled={busy} onClick={() => void run(() => subscriptionAction(u.id, 'reactivate'), 'Suscripción reactivada.')} leftIcon={<RotateCcw className="h-3.5 w-3.5" />}>Reactivar</Button>
              ) : (
                <Button size="sm" variant="ghost" disabled={busy || !s} onClick={() => void run(() => subscriptionAction(u.id, 'cancel'), 'Suscripción cancelada.')} leftIcon={<Ban className="h-3.5 w-3.5 text-loss" />}>Cancelar</Button>
              )}
            </span>
          </div>

          <div className="flex gap-1 border-b border-border">
            {tabs.map((t) => (
              <button key={t.key} onClick={() => setTab(t.key)} className={cn('-mb-px border-b-2 px-3 py-2 text-sm', tab === t.key ? 'border-accent text-accent-soft' : 'border-transparent text-gray-400 hover:text-gray-200')}>{t.label}</button>
            ))}
          </div>

          {tab === 'suscripcion' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Select label="Plan" value={sub.plan} onChange={(e) => setSub({ ...sub, plan: e.target.value as PlanKey })} options={PLAN_OPTIONS} />
                <Select label="Estado" value={sub.status} onChange={(e) => setSub({ ...sub, status: e.target.value as SubStatus })} options={STATUS_OPTIONS} />
                <Input label="Precio del periodo" type="number" min={0} step="any" value={sub.price} onChange={(e) => setSub({ ...sub, price: e.target.value })} rightAddon={cur} />
                <Input label="Inicio del periodo" type="date" value={sub.start} onChange={(e) => setSub({ ...sub, start: e.target.value })} />
                <Input label="Vence el" type="date" value={sub.end} onChange={(e) => setSub({ ...sub, end: e.target.value })} />
                <Input label="Renovación automática" value="Disponible al conectar la pasarela" disabled hint="Hoy los pagos se registran a mano." />
              </div>
              <Textarea label="Notas internas" rows={2} maxLength={500} value={sub.notes} onChange={(e) => setSub({ ...sub, notes: e.target.value })} placeholder="p. ej. paga por Zelle a final de mes" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                {isOwner ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-gray-400">
                      Rol
                      <select
                        value={u.admin_level ?? 'user'}
                        disabled={busy}
                        onChange={(e) => {
                          const role = e.target.value as 'user' | 'admin' | 'owner';
                          if (role === 'owner' && !window.confirm(`¿Dar a ${u.name} todos los permisos de dueño? Podrá cambiar ajustes, roles y accesos.`)) return;
                          void run(() => setAccess(u.id, { role }), role === 'owner' ? 'Ahora es dueño (todos los permisos).' : role === 'admin' ? 'Ahora es administrador (permisos limitados).' : 'Ahora es un usuario normal.');
                        }}
                        className="rounded-md border border-border bg-bg px-2 py-1.5 text-sm text-gray-100"
                      >
                        <option value="user">Usuario</option>
                        <option value="admin">Administrador (limitado)</option>
                        <option value="owner">Dueño (todos los permisos)</option>
                      </select>
                    </label>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => setAccess(u.id, { is_disabled: !u.is_disabled }), u.is_disabled ? 'Acceso activado.' : 'Acceso desactivado: no podrá iniciar sesión.')} leftIcon={u.is_disabled ? <UserCheck className="h-3.5 w-3.5" /> : <UserX className="h-3.5 w-3.5 text-loss" />}>{u.is_disabled ? 'Activar acceso' : 'Desactivar acceso'}</Button>
                  </div>
                ) : (
                  <p className="text-xs text-gray-500">Los roles y el acceso los gestiona el dueño de la plataforma.</p>
                )}
                <Button loading={busy} onClick={() => void run(() => saveSubscription(u.id, { plan: sub.plan, status: sub.status, price: sub.price === '' ? undefined : Number(sub.price), current_period_start: sub.start || undefined, current_period_end: sub.end || undefined, notes: sub.notes }), 'Suscripción guardada.')} leftIcon={<Save className="h-4 w-4" />}>Guardar suscripción</Button>
              </div>
            </div>
          )}

          {tab === 'pago' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">Registra un pago recibido fuera de la plataforma (transferencia, Zelle, PayPal…). La suscripción pasa a activa y el vencimiento se alarga: si aún le quedaban días, se suman al final.</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Select label="Plan" value={pay.plan} onChange={(e) => setPay({ ...pay, plan: e.target.value as PlanKey })} options={PAID_PLAN_OPTIONS} />
                <Input label="Periodos" type="number" min={1} max={36} step={1} value={pay.periods} onChange={(e) => setPay({ ...pay, periods: e.target.value })} hint="Cuántos periodos del plan paga" />
                <Input label="Importe *" type="number" min={0} step="any" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} rightAddon={cur} />
                <Select label="Método" value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} options={METHOD_OPTIONS} />
                <Input label="Fecha del pago" type="date" value={pay.paid_at} onChange={(e) => setPay({ ...pay, paid_at: e.target.value })} />
                <Input label="Referencia" value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} placeholder="nº de operación" maxLength={120} />
              </div>
              <Input label="Nota" value={pay.note} onChange={(e) => setPay({ ...pay, note: e.target.value })} maxLength={300} />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm text-gray-300">
                  <input type="checkbox" checked={pay.send_email} onChange={(e) => setPay({ ...pay, send_email: e.target.checked })} className="h-4 w-4 rounded border-border bg-bg accent-accent" />
                  Enviar email de "pago recibido"
                </label>
                <Button loading={busy} disabled={pay.amount === ''} onClick={() => void run(() => addPayment(u.id, { amount: Number(pay.amount), plan: pay.plan, periods: Number(pay.periods) || 1, method: pay.method, paid_at: pay.paid_at, reference: pay.reference, note: pay.note, send_email: pay.send_email }), 'Pago registrado y suscripción activada.')} leftIcon={<Wallet className="h-4 w-4" />}>Registrar pago</Button>
              </div>
            </div>
          )}

          {tab === 'email' && (
            <div className="space-y-3">
              <Select label="Plantilla" value={mail.template_key} onChange={(e) => setMail({ ...mail, template_key: e.target.value })} options={[{ value: '', label: 'Mensaje libre' }, ...templates.map((t) => ({ value: t.key, label: t.name }))]} />
              {mail.template_key === '' ? (
                <>
                  <Input label="Asunto" value={mail.subject} onChange={(e) => setMail({ ...mail, subject: e.target.value })} maxLength={200} />
                  <Textarea label="Mensaje" rows={6} value={mail.body} onChange={(e) => setMail({ ...mail, body: e.target.value })} hint="Puedes usar {{nombre}}, {{plan}}, {{fecha_vencimiento}}, {{dias}}, {{enlace_pago}}." />
                </>
              ) : (
                <p className="whitespace-pre-wrap rounded-md border border-border bg-bg/40 p-3 text-xs text-gray-400">{templates.find((t) => t.key === mail.template_key)?.body}</p>
              )}
              <div className="flex justify-end">
                <Button loading={busy} disabled={mail.template_key === '' && (!mail.subject.trim() || !mail.body.trim())} onClick={() => void onSendEmail()} leftIcon={<Mail className="h-4 w-4" />}>Enviar a {u.email}</Button>
              </div>
            </div>
          )}

          {tab === 'historial' && (
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Pagos ({detail.payments.length})</p>
                <ul className="space-y-1 text-xs">
                  {detail.payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 rounded-md bg-bg/40 px-2 py-1.5">
                      <span className="text-gray-300">{fmtDate(p.paid_at)} · {p.plan ? PLAN_LABELS[p.plan as PlanKey] ?? p.plan : '—'} · {PAYMENT_METHOD_LABELS[p.method] ?? p.method}{p.reference ? ` · ${p.reference}` : ''}<span className="text-gray-500"> → hasta {p.period_end ? fmtDate(p.period_end) : '—'}</span></span>
                      <span className="flex items-center gap-1">
                        <span className="tnum font-semibold text-profit">{fmtMoney(p.amount, p.currency, { sign: false })}</span>
                        {isOwner && (
                          <button title="Eliminar pago (no cambia el periodo)" disabled={busy} onClick={() => void run(async () => { await deletePayment(p.id); return fetchUserDetail(u.id); }, 'Pago eliminado.')} className="rounded p-1 text-gray-600 hover:text-loss"><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </span>
                    </li>
                  ))}
                  {detail.payments.length === 0 && <li className="text-gray-500">Sin pagos registrados.</li>}
                </ul>
                <p className="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Emails ({detail.emails.length})</p>
                <ul className="space-y-1 text-xs">
                  {detail.emails.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2 rounded-md bg-bg/40 px-2 py-1.5">
                      <span className="truncate text-gray-300" title={m.subject}>{fmtDateTime(m.created_at)} · {m.subject}</span>
                      <Badge variant={m.status === 'enviado' ? 'profit' : m.status === 'error' ? 'loss' : 'default'}>{m.status}</Badge>
                    </li>
                  ))}
                  {detail.emails.length === 0 && <li className="text-gray-500">Sin emails.</li>}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gray-500">Eventos</p>
                <ul className="space-y-1 text-xs">
                  {detail.events.map((ev) => (
                    <li key={ev.id} className="flex items-start gap-2 rounded-md bg-bg/40 px-2 py-1.5">
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-600" />
                      <span className="text-gray-300"><span className="font-semibold">{EVENT_LABELS[ev.kind] ?? ev.kind}</span>{ev.detail ? ` · ${ev.detail}` : ''}<span className="block text-gray-500">{fmtDateTime(ev.created_at)}{ev.actor_name ? ` · por ${ev.actor_name}` : ' · automático'}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
