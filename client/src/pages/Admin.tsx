// Panel de administración de la plataforma: resumen del negocio, suscriptores, pagos, emails y ajustes.
import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BarChart3, CreditCard, Mail, RefreshCw, Settings2, ShieldCheck, Users } from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import UserDetailModal from '../components/admin/UserDetailModal';
import { EmailsTab, MailerBanner, PaymentsTab, SettingsTab, SubscribersTab } from '../components/admin/AdminPanels';
import { TabBar } from '../components/radar/common';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, StatCard } from '../components/ui/Card';
import { PageSpinner } from '../components/ui/Spinner';
import { cn } from '../lib/cn';
import { fmtDate, fmtDateTime, fmtMoney } from '../lib/format';
import { EVENT_LABELS, LEVEL_LABELS, PLAN_LABELS, STATUS_LABELS, STATUS_VARIANTS, daysLeftClass, daysLeftText, fetchOverview, fetchTemplates, type EmailTemplate, type Overview } from '../lib/admin';

const TABS = [
  { key: 'resumen', label: 'Resumen', icon: <BarChart3 className="h-3.5 w-3.5" /> },
  { key: 'suscriptores', label: 'Suscriptores', icon: <Users className="h-3.5 w-3.5" /> },
  { key: 'pagos', label: 'Pagos', icon: <CreditCard className="h-3.5 w-3.5" /> },
  { key: 'emails', label: 'Emails', icon: <Mail className="h-3.5 w-3.5" /> },
  { key: 'ajustes', label: 'Ajustes', icon: <Settings2 className="h-3.5 w-3.5" /> },
];
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
type ModalTab = 'suscripcion' | 'pago' | 'email' | 'historial';

export default function Admin() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.key === params.get('tab')) ? (params.get('tab') as string) : 'resumen';
  const [ov, setOv] = useState<Overview | null>(null);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [managing, setManaging] = useState<{ id: number; tab: ModalTab } | null>(null);
  const reload = useCallback(() => setReloadKey((n) => n + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchOverview(ctrl.signal).then((o) => { setOv(o); setError(null); }).catch((e: Error) => e.name !== 'AbortError' && setError(e.message));
    return () => ctrl.abort();
  }, [reloadKey]);
  useEffect(() => {
    fetchTemplates().then((r) => setTemplates(r.templates)).catch(() => {});
  }, []);

  const onManage = useCallback((id: number, t: ModalTab = 'suscripcion') => setManaging({ id, tab: t }), []);

  if (!ov && !error) return <PageSpinner label="Cargando administración…" />;
  const t = ov?.totals;
  const cur = ov?.currency ?? 'USD';
  const isOwner = ov?.level === 'owner';
  const series = (ov?.series ?? []).map((m) => ({ ...m, label: `${MONTHS[Number(m.month.slice(5)) - 1]} ${m.month.slice(2, 4)}` }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-100"><ShieldCheck className="h-5 w-5 text-accent" /> Administración {ov && <Badge variant={isOwner ? 'warn' : 'accent'}>{LEVEL_LABELS[ov.level]}</Badge>}</h2>
          <p className="text-xs text-gray-400">Quién está suscrito, cuándo vence cada plan, pagos, avisos por email y reglas de acceso.{ov && !isOwner ? ' Tu nivel: ver todo, registrar pagos, gestionar suscripciones y enviar emails.' : ''}</p>
        </div>
        <Button className="ml-auto" variant="secondary" size="sm" onClick={reload} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>Actualizar</Button>
      </div>
      {error && <div className="rounded-md border border-loss/40 bg-loss/10 px-3 py-2 text-sm text-loss" role="alert">{error}</div>}
      <TabBar tabs={TABS} value={tab} onChange={(k) => setParams(k === 'resumen' ? {} : { tab: k })} />

      {tab === 'resumen' && ov && t && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <StatCard label="Usuarios" value={t.users} hint={`${t.new_30d} nuevos en 30 días`} />
            <StatCard label="Suscripciones activas" value={t.activas} valueClassName="text-profit" hint={`${t.prueba} en prueba · ${t.pausadas} en pausa`} />
            <StatCard label="Vencen en 7 días" value={t.por_vencer_7d} valueClassName={t.por_vencer_7d ? 'text-warn' : undefined} hint={`${t.vencidas} vencidas · ${t.canceladas} canceladas`} />
            <StatCard label="Ingreso mensual recurrente" value={fmtMoney(t.mrr, cur, { sign: false })} hint={`medio por suscriptor ${fmtMoney(t.arpu, cur, { sign: false })}`} />
            <StatCard label="Cobrado este mes" value={fmtMoney(t.ingresos_mes, cur, { sign: false })} hint={`mes anterior ${fmtMoney(t.ingresos_mes_anterior, cur, { sign: false })}`} />
            <StatCard label="Cobrado en total" value={fmtMoney(t.ingresos_total, cur, { sign: false })} hint="pagos registrados" />
            <StatCard label="Bajas en 30 días" value={t.bajas_30d} valueClassName={t.bajas_30d ? 'text-loss' : undefined} hint="vencidas o canceladas" />
            <StatCard label="Emails en 30 días" value={(t.emails_30d.enviado ?? 0) + (t.emails_30d.simulado ?? 0)} hint={`${t.emails_30d.enviado ?? 0} enviados · ${t.emails_30d.simulado ?? 0} simulados · ${t.emails_30d.error ?? 0} con error`} />
          </div>
          <MailerBanner mailer={ov.mailer} />
          {!ov.settings.enforce && <p className="rounded-md border border-border bg-panel px-3 py-2 text-xs text-gray-400">El acceso no se bloquea al vencer (modo control y avisos). {isOwner ? 'Puedes activarlo en Ajustes → "Exigir suscripción activa".' : 'Lo decide el dueño en Ajustes.'}</p>}
          <div className="grid gap-4 xl:grid-cols-3">
            <Card title="Altas e ingresos" subtitle="Últimos 12 meses" className="xl:col-span-2">
              <div className="h-60">
                <ResponsiveContainer>
                  <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <CartesianGrid stroke="#1d2a23" vertical={false} />
                    <XAxis dataKey="label" stroke="#3b434a" tick={{ fill: '#8aa398', fontSize: 11 }} minTickGap={12} />
                    <YAxis yAxisId="l" stroke="#3b434a" tick={{ fill: '#8aa398', fontSize: 11 }} width={44} />
                    <YAxis yAxisId="r" orientation="right" allowDecimals={false} stroke="#3b434a" tick={{ fill: '#8aa398', fontSize: 11 }} width={28} />
                    <Tooltip contentStyle={{ background: '#0e1512', border: '1px solid #1d2a23', borderRadius: 8, fontSize: 12 }} formatter={(v, name) => (name === 'ingresos' ? [fmtMoney(Number(v), cur, { sign: false }), 'Ingresos'] : [String(v), 'Altas'])} />
                    <Bar yAxisId="l" dataKey="ingresos" fill="#22d36f" radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false} />
                    <Line yAxisId="r" type="monotone" dataKey="altas" stroke="#f5b400" strokeWidth={2} dot={false} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[11px] text-gray-500"><span className="text-profit">■</span> ingresos · <span className="text-warn">━</span> altas de usuarios</p>
            </Card>
            <Card title="Vencen pronto" subtitle="Próximos 7 días" flush>
              <ul className="divide-y divide-border">
                {ov.expiring.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 px-4 py-2 text-sm">
                    <button onClick={() => onManage(u.id)} className="min-w-0 text-left">
                      <span className="block truncate font-semibold text-gray-100 hover:text-accent-soft">{u.name}</span>
                      <span className={cn('block text-xs', daysLeftClass(u.days_left))}>{PLAN_LABELS[u.plan]} · {fmtDate(u.current_period_end)} · {daysLeftText(u.days_left)}</span>
                    </button>
                    <span className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" title="Enviar recordatorio" onClick={() => onManage(u.id, 'email')}><Mail className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="secondary" onClick={() => onManage(u.id, 'pago')}>Pago</Button>
                    </span>
                  </li>
                ))}
                {ov.expiring.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-500">Nadie vence en los próximos 7 días.</li>}
              </ul>
            </Card>
          </div>
          <Card title="Actividad reciente" subtitle="Altas, pagos, vencimientos y emails" flush>
            <ul className="divide-y divide-border">
              {ov.recent.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                  <Badge variant={e.kind === 'pago' ? 'profit' : e.kind === 'vencida' || e.kind === 'cancelada' ? 'loss' : 'default'}>{EVENT_LABELS[e.kind] ?? e.kind}</Badge>
                  <span className="text-gray-200">{e.user_name}</span>
                  <span className="text-gray-400">{e.detail}</span>
                  <span className="ml-auto text-xs text-gray-500">{fmtDateTime(e.created_at)}{e.actor_name ? ` · ${e.actor_name}` : ''}</span>
                </li>
              ))}
              {ov.recent.length === 0 && <li className="px-4 py-6 text-center text-sm text-gray-500">Sin actividad todavía.</li>}
            </ul>
          </Card>
          <p className="text-[11px] text-gray-600">Estados: {Object.entries(STATUS_LABELS).map(([k, v]) => <Badge key={k} variant={STATUS_VARIANTS[k as keyof typeof STATUS_VARIANTS]} className="mr-1">{v}</Badge>)}</p>
        </div>
      )}

      {tab === 'suscriptores' && <SubscribersTab onManage={onManage} reloadKey={reloadKey} />}
      {tab === 'pagos' && <PaymentsTab reloadKey={reloadKey} onManage={onManage} />}
      {tab === 'emails' && <EmailsTab reloadKey={reloadKey} onTemplates={setTemplates} canEdit={isOwner} />}
      {tab === 'ajustes' && ov && <SettingsTab initial={ov.settings} mailer={ov.mailer} lastJob={ov.last_job} onSaved={reload} canEdit={isOwner} />}

      <UserDetailModal userId={managing?.id ?? null} initialTab={managing?.tab} onClose={() => setManaging(null)} onChanged={reload} settings={ov?.settings ?? null} templates={templates} isOwner={isOwner} ownerLocked={ov?.owner_locked ?? false} />
    </div>
  );
}
