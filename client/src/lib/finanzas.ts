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
