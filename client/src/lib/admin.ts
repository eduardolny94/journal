// Panel de administración: tipos y llamadas a la API de suscripciones, pagos, emails y ajustes.
import { api, qs } from './api';
import type { BadgeVariant } from '../components/ui/Badge';

export type PlanKey = 'prueba' | 'mensual' | 'trimestral' | 'semestral' | 'anual' | 'cortesia';
export type SubStatus = 'prueba' | 'activa' | 'vencida' | 'cancelada' | 'pausada';
export type EffectiveStatus = SubStatus | 'sin_suscripcion';

export const PLAN_LABELS: Record<PlanKey, string> = { prueba: 'Prueba', mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral', anual: 'Anual', cortesia: 'Cortesía' };
export const STATUS_LABELS: Record<EffectiveStatus, string> = { prueba: 'En prueba', activa: 'Activa', vencida: 'Vencida', cancelada: 'Cancelada', pausada: 'Pausada', sin_suscripcion: 'Sin suscripción' };
export const STATUS_VARIANTS: Record<EffectiveStatus, BadgeVariant> = { prueba: 'accent', activa: 'profit', vencida: 'loss', cancelada: 'outline', pausada: 'warn', sin_suscripcion: 'default' };
export const PAYMENT_METHOD_LABELS: Record<string, string> = { manual: 'Manual', transferencia: 'Transferencia', paypal: 'PayPal', zelle: 'Zelle', binance: 'Binance', tarjeta: 'Tarjeta', efectivo: 'Efectivo', otro: 'Otro' };
export const EVENT_LABELS: Record<string, string> = {
  creada: 'Suscripción creada', editada: 'Suscripción editada', pago: 'Pago registrado', pago_eliminado: 'Pago eliminado', cancelada: 'Cancelada', reactivada: 'Reactivada',
  extendida: 'Periodo extendido', vencida: 'Venció', email: 'Email', rol: 'Cambio de rol', acceso_desactivado: 'Acceso desactivado', acceso_activado: 'Acceso activado',
};

export interface Subscription {
  id: number;
  user_id: number;
  plan: PlanKey;
  status: SubStatus;
  price: number;
  currency: string;
  started_at: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  auto_renew: number;
  provider: string;
  notes: string;
  canceled_at: string | null;
}
export interface AdminUserRow {
  id: number;
  email: string;
  name: string;
  created_at: string;
  role: string;
  is_disabled: boolean;
  is_admin: boolean;
  admin_level: AdminLevel;
  last_login_at: string | null;
  trades: number;
  accounts: number;
  paid_total: number;
  subscription: Subscription | null;
  effective_status: EffectiveStatus;
  days_left: number | null;
}
export interface Payment {
  id: number;
  user_id: number;
  amount: number;
  currency: string;
  paid_at: string;
  method: string;
  reference: string;
  plan: string | null;
  period_start: string | null;
  period_end: string | null;
  note: string;
  user_name?: string;
  user_email?: string;
}
export interface SubEvent { id: number; kind: string; detail: string; created_at: string; actor_name?: string | null; user_name?: string; user_email?: string }
export interface EmailLogRow { id: number; user_id?: number | null; to_email: string; template_key: string; subject: string; status: 'enviado' | 'simulado' | 'error'; error: string | null; created_at: string; user_name?: string | null }
export interface UserDetail {
  user: { id: number; email: string; name: string; created_at: string; role: string; is_disabled: boolean; is_admin: boolean; admin_level: AdminLevel; last_login_at: string | null };
  subscription: Subscription | null;
  effective_status: EffectiveStatus;
  days_left: number | null;
  payments: Payment[];
  events: SubEvent[];
  emails: EmailLogRow[];
}
export interface MailerInfo { driver: 'resend' | 'simulado'; configured: boolean; from: string | null }
export interface AdminSettings {
  reminders_enabled: boolean;
  trial_days: number;
  grace_days: number;
  enforce: boolean;
  sender_name: string;
  support_email: string;
  payment_link: string;
  currency: string;
  prices: Record<'mensual' | 'trimestral' | 'semestral' | 'anual', number>;
}
export interface JobResult { at?: string; checked: number; expired: number; reminders: number; skipped: number; details: string[] }
/** Nivel dentro del personal: dueño (todos los permisos), administrador (limitado) o ninguno. */
export type AdminLevel = 'owner' | 'admin' | null;
export const LEVEL_LABELS: Record<'owner' | 'admin', string> = { owner: 'Dueño', admin: 'Admin' };

export interface Overview {
  today: string;
  currency: string;
  totals: {
    users: number; new_30d: number; activas: number; prueba: number; vencidas: number; canceladas: number; pausadas: number; sin_suscripcion: number; por_vencer_7d: number;
    mrr: number; arpu: number; ingresos_mes: number; ingresos_mes_anterior: number; ingresos_total: number; bajas_30d: number; emails_30d: Record<string, number>;
  };
  expiring: Array<{ id: number; name: string; email: string; plan: PlanKey; status: EffectiveStatus; current_period_end: string; days_left: number }>;
  series: Array<{ month: string; altas: number; ingresos: number }>;
  recent: SubEvent[];
  mailer: MailerInfo;
  last_job: JobResult | null;
  /** Nivel de quien mira el panel y lo que puede hacer. */
  level: 'owner' | 'admin';
  permissions: string[];
  /** El dueño está fijado por configuración del servidor: no se pueden nombrar más dueños. */
  owner_locked: boolean;
  settings: AdminSettings;
}
export interface EmailTemplate { key: string; name: string; subject: string; body: string; days_before: number | null; enabled: boolean; updated_at: string | null }
export interface SendResult { id: number; status: 'enviado' | 'simulado' | 'error'; error: string | null; subject: string; body: string }

export const fetchOverview = (signal?: AbortSignal) => api<Overview>('/admin/overview', { signal });
export const fetchUsers = (p: { search?: string; status?: string; plan?: string } = {}, signal?: AbortSignal) => api<AdminUserRow[]>(`/admin/users${qs({ search: p.search || null, status: p.status || null, plan: p.plan || null })}`, { signal });
export const fetchUserDetail = (id: number, signal?: AbortSignal) => api<UserDetail>(`/admin/users/${id}`, { signal });
export const saveSubscription = (id: number, body: Record<string, unknown>) => api<UserDetail>(`/admin/users/${id}/subscription`, { method: 'PUT', body });
export const addPayment = (id: number, body: Record<string, unknown>) => api<UserDetail & { email: SendResult | null }>(`/admin/users/${id}/payments`, { method: 'POST', body });
export const deletePayment = (paymentId: number) => api<{ ok: boolean }>(`/admin/payments/${paymentId}`, { method: 'DELETE' });
export const subscriptionAction = (id: number, action: 'cancel' | 'reactivate' | 'extend', body: Record<string, unknown> = {}) => api<UserDetail>(`/admin/users/${id}/subscription/${action}`, { method: 'POST', body });
export const setAccess = (id: number, body: { role?: 'user' | 'admin' | 'owner'; is_disabled?: boolean }) => api<UserDetail>(`/admin/users/${id}/access`, { method: 'PUT', body });
export const sendEmail = (id: number, body: { template_key?: string; subject?: string; body?: string }) => api<SendResult>(`/admin/users/${id}/email`, { method: 'POST', body });
export const fetchPayments = (signal?: AbortSignal) => api<Payment[]>('/admin/payments', { signal });
export const fetchTemplates = (signal?: AbortSignal) => api<{ templates: EmailTemplate[]; mailer: MailerInfo; variables: string[] }>('/admin/email-templates', { signal });
export const saveTemplate = (key: string, body: Partial<EmailTemplate>) => api<EmailTemplate>(`/admin/email-templates/${key}`, { method: 'PUT', body });
export const previewTemplate = (key: string, body: { subject?: string; body?: string }) => api<{ subject: string; body: string }>(`/admin/email-templates/${key}/preview`, { method: 'POST', body });
export const testTemplate = (key: string) => api<SendResult>(`/admin/email-templates/${key}/test`, { method: 'POST', body: {} });
export const fetchEmails = (status = '', signal?: AbortSignal) => api<EmailLogRow[]>(`/admin/emails${qs({ status: status || null })}`, { signal });
export const fetchSettings = (signal?: AbortSignal) => api<{ settings: AdminSettings; mailer: MailerInfo }>('/admin/settings', { signal });
export const saveSettings = (body: Partial<AdminSettings>) => api<{ settings: AdminSettings; mailer: MailerInfo }>('/admin/settings', { method: 'PUT', body });
export const runJobs = () => api<JobResult>('/admin/jobs/run', { method: 'POST', body: {} });

// ---------- Mi suscripción (cualquier usuario) ----------
export interface MySubscription {
  subscription: { plan: PlanKey; plan_label: string; status: SubStatus; price: number; currency: string; current_period_start: string | null; current_period_end: string | null; auto_renew: boolean } | null;
  effective_status: EffectiveStatus;
  days_left: number | null;
  enforce: boolean;
  grace_days: number;
  payment_link: string | null;
  support_email: string | null;
  prices: AdminSettings['prices'];
  currency: string;
  is_admin: boolean;
  payments: Array<{ amount: number; currency: string; paid_at: string; plan: string | null; period_end: string | null }>;
}
export const fetchMySubscription = (signal?: AbortSignal) => api<MySubscription>('/subscription/me', { signal });

/** "vence en 5 días", "vence hoy", "venció hace 3 días". */
export function daysLeftText(days: number | null): string {
  if (days === null) return '—';
  if (days > 1) return `vence en ${days} días`;
  if (days === 1) return 'vence mañana';
  if (days === 0) return 'vence hoy';
  return days === -1 ? 'venció ayer' : `venció hace ${Math.abs(days)} días`;
}
export function daysLeftClass(days: number | null): string {
  if (days === null) return 'text-gray-500';
  if (days < 0) return 'text-loss';
  if (days <= 3) return 'text-loss';
  if (days <= 7) return 'text-warn';
  return 'text-gray-400';
}
