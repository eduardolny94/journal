// Finanzas: tipos y llamadas a la API de movimientos de dinero real y resumen económico.
import { api, qs } from './api';

export type TxKind = 'evaluacion' | 'reset' | 'activacion' | 'datos' | 'plataforma' | 'otro_gasto' | 'retiro' | 'reembolso' | 'otro_ingreso';
export type Outcome = 'activa' | 'superada' | 'quemada' | 'cerrada';

export const EXPENSE_KINDS: TxKind[] = ['evaluacion', 'reset', 'activacion', 'datos', 'plataforma', 'otro_gasto'];
export const INCOME_KINDS: TxKind[] = ['retiro', 'reembolso', 'otro_ingreso'];
export const KIND_LABELS: Record<TxKind, string> = {
  evaluacion: 'Compra de evaluación',
  reset: 'Reset',
  activacion: 'Activación de cuenta financiada',
  datos: 'Datos de mercado',
  plataforma: 'Plataforma / suscripción',
  otro_gasto: 'Otro gasto',
  retiro: 'Retiro (payout)',
  reembolso: 'Reembolso de la evaluación',
  otro_ingreso: 'Otro ingreso',
};
export const OUTCOME_LABELS: Record<Outcome, string> = { activa: 'Activa', superada: 'Superada', quemada: 'Quemada', cerrada: 'Cerrada' };
export const OUTCOME_OPTIONS = (Object.keys(OUTCOME_LABELS) as Outcome[]).map((value) => ({ value, label: OUTCOME_LABELS[value] }));

export function isExpense(kind: TxKind): boolean {
  return EXPENSE_KINDS.includes(kind);
}

export interface Transaction {
  id: number;
  user_id: number;
  account_id: number | null;
  kind: TxKind;
  amount: number;
  gross_amount: number | null;
  fee_amount: number | null;
  currency: string;
  occurred_at: string;
  recurring: number;
  note: string;
  created_at: string;
  account_name?: string | null;
  account_firm?: string | null;
}

export interface TransactionInput {
  kind: TxKind;
  account_id: number | null;
  amount: number;
  gross_amount?: number | null;
  fee_amount?: number | null;
  currency?: string;
  occurred_at: string;
  recurring?: boolean;
  note?: string;
}

export interface FinanzasTotals {
  gastado: number;
  ingresos: number;
  retirado: number;
  reembolsos: number;
  otros_ingresos: number;
  neto: number;
  roi_pct: number | null;
  recuperado_pct: number | null;
  falta_para_recuperar: number;
  evaluaciones_compradas: number;
  gasto_evaluaciones: number;
  resets: number;
  gasto_resets: number;
  cuentas: number;
  cuentas_financiadas: number;
  cuentas_quemadas: number;
  cuentas_activas: number;
  tasa_aprobacion_pct: number | null;
  coste_por_cuenta_financiada: number | null;
  n_retiros: number;
  retiro_medio: number | null;
  dias_hasta_financiada_media: number | null;
  gasto_fijo_mensual: number;
  gasto_30d: number;
  ingresos_30d: number;
  pnl_trading_total: number;
  ev_por_evaluacion: number | null;
}
export interface MonthRow { month: string; gastos: number; ingresos: number; neto: number; acumulado: number }
export interface FirmRow { firm: string; gastado: number; ingresos: number; retirado: number; neto: number; roi_pct: number | null; cuentas: number; financiadas: number; quemadas: number; activas: number; tasa_aprobacion_pct: number | null }
export interface AccountRow {
  account_id: number;
  name: string;
  firm: string;
  account_type: string;
  outcome: Outcome;
  is_archived: boolean;
  purchased_at: string | null;
  funded_at: string | null;
  ended_at: string | null;
  profit_split: number | null;
  dias_hasta_financiada: number | null;
  gastado: number;
  ingresos: number;
  retirado: number;
  neto: number;
  movimientos: number;
  pnl_trading: number;
  operaciones: number;
}
export interface FinanzasSummary {
  currency: string;
  from: string | null;
  to: string | null;
  totals: FinanzasTotals;
  por_mes: MonthRow[];
  por_firma: FirmRow[];
  por_cuenta: AccountRow[];
  por_tipo: Array<{ kind: TxKind; label: string; total: number; n: number }>;
  fijos: Array<{ id: number; kind: TxKind; label: string; amount: number; account_name: string | null; note: string; occurred_at: string }>;
  insights: Array<{ kind: 'ok' | 'warn' | 'info'; text: string }>;
  movimientos: number;
}

export function fetchFinanzasSummary(params: { from?: string | null; to?: string | null } = {}, signal?: AbortSignal): Promise<FinanzasSummary> {
  return api<FinanzasSummary>(`/finanzas/resumen${qs({ from: params.from ?? null, to: params.to ?? null })}`, { signal });
}
export function listTransactions(params: { from?: string | null; to?: string | null; account_id?: number | null; kind?: TxKind | null } = {}, signal?: AbortSignal): Promise<Transaction[]> {
  return api<Transaction[]>(`/finanzas/movimientos${qs({ from: params.from ?? null, to: params.to ?? null, account_id: params.account_id ?? null, kind: params.kind ?? null })}`, { signal });
}
export function createTransaction(input: TransactionInput): Promise<Transaction> {
  return api<Transaction>('/finanzas/movimientos', { method: 'POST', body: input });
}
export function updateTransaction(id: number, input: Partial<TransactionInput>): Promise<Transaction> {
  return api<Transaction>(`/finanzas/movimientos/${id}`, { method: 'PUT', body: input });
}
export function deleteTransaction(id: number): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/finanzas/movimientos/${id}`, { method: 'DELETE' });
}

// ----- Documentos: certificados de cuenta fondeada y comprobantes de payout -----

export type DocKind = 'certificado_fondeo' | 'comprobante_payout' | 'otro';
export const DOC_KIND_LABELS: Record<DocKind, string> = {
  certificado_fondeo: 'Certificado de cuenta fondeada',
  comprobante_payout: 'Comprobante de payout',
  otro: 'Otro documento',
};
export const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10 MB
export const DOC_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';
export const DOC_ALLOWED_TYPES = new Set(DOC_ACCEPT.split(','));

export interface AccountDocument {
  id: number;
  user_id: number;
  account_id: number | null;
  transaction_id: number | null;
  kind: DocKind;
  path: string;
  original_name: string;
  mime: string;
  size: number;
  title: string;
  created_at: string;
  account_name?: string | null;
  account_firm?: string | null;
  account_currency?: string | null;
  transaction_kind?: TxKind | null;
  transaction_amount?: number | null;
  transaction_gross?: number | null;
  transaction_at?: string | null;
  transaction_currency?: string | null;
}

export function isPdf(doc: Pick<AccountDocument, 'mime' | 'path'>): boolean {
  return doc.mime === 'application/pdf' || /\.pdf$/i.test(doc.path);
}

export interface PayoutItem extends Transaction {
  account_name: string | null;
  account_firm: string | null;
  account_size: number | null;
  account_currency: string | null;
  comprobantes: AccountDocument[];
}
export interface FondeoOrigen {
  account_id: number;
  name: string;
  firm: string;
  size: number;
  purchased_at: string | null;
  funded_at: string | null;
  ended_at: string | null;
  outcome: Outcome;
}
export interface FondeoItem {
  account_id: number;
  name: string;
  firm: string;
  size: number;
  currency: string;
  account_type: string;
  outcome: Outcome;
  is_archived: boolean;
  purchased_at: string | null;
  funded_at: string | null;
  ended_at: string | null;
  profit_split: number | null;
  certificados: AccountDocument[];
  otros: AccountDocument[];
  /** Evaluación de la que viene (null si la firma mantuvo la misma cuenta). */
  origen: FondeoOrigen | null;
  dias_hasta_fondeo: number | null;
  n_payouts: number;
  total_payouts: number;
  ultimo_payout_at: string | null;
}
export interface FondeosResumen {
  currency: string;
  totals: {
    cuentas_fondeadas: number;
    cuentas_con_payouts: number;
    n_payouts: number;
    total_payouts: number;
    payout_medio: number | null;
    mayor_payout: number | null;
    ultimo_payout_at: string | null;
    certificados: number;
    comprobantes: number;
    payouts_sin_comprobante: number;
    fondeadas_sin_certificado: number;
  };
  fondeos: FondeoItem[];
  payouts: PayoutItem[];
}

export function fetchFondeos(signal?: AbortSignal): Promise<FondeosResumen> {
  return api<FondeosResumen>('/finanzas/fondeos', { signal });
}
export function listDocuments(params: { account_id?: number | null; transaction_id?: number | null; kind?: DocKind | null } = {}, signal?: AbortSignal): Promise<AccountDocument[]> {
  return api<AccountDocument[]>(`/finanzas/documentos${qs({ account_id: params.account_id ?? null, transaction_id: params.transaction_id ?? null, kind: params.kind ?? null })}`, { signal });
}
export function uploadDocument(file: File, target: { kind: DocKind; account_id?: number | null; transaction_id?: number | null; title?: string }): Promise<AccountDocument> {
  const fd = new FormData();
  fd.append('file', file, file.name || 'documento');
  fd.append('kind', target.kind);
  if (target.account_id) fd.append('account_id', String(target.account_id));
  if (target.transaction_id) fd.append('transaction_id', String(target.transaction_id));
  if (target.title) fd.append('title', target.title.slice(0, 120));
  return api<AccountDocument>('/finanzas/documentos', { method: 'POST', formData: fd });
}
export function updateDocument(id: number, input: { title: string }): Promise<AccountDocument> {
  return api<AccountDocument>(`/finanzas/documentos/${id}`, { method: 'PUT', body: input });
}
export function deleteDocument(id: number): Promise<{ ok: boolean }> {
  return api<{ ok: boolean }>(`/finanzas/documentos/${id}`, { method: 'DELETE' });
}

/** Rango rápido para la página de Finanzas. */
export type FinRange = 'todo' | 'anio' | '12m' | '90d';
export const FIN_RANGES: Array<{ value: FinRange; label: string }> = [
  { value: 'todo', label: 'Todo el historial' },
  { value: 'anio', label: 'Este año' },
  { value: '12m', label: 'Últimos 12 meses' },
  { value: '90d', label: 'Últimos 90 días' },
];
export function finRangeFrom(r: FinRange, now = new Date()): string | null {
  if (r === 'todo') return null;
  const d = new Date(now);
  if (r === 'anio') return `${d.getFullYear()}-01-01`;
  if (r === '12m') d.setMonth(d.getMonth() - 12);
  if (r === '90d') d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}
