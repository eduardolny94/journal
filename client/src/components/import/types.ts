// Tipos y constantes compartidos por el asistente de importación de CSV.
import type { AccountStatus } from '../../store/session';

export type ImportSource = 'tradovate' | 'projectx' | 'ninjatrader' | 'mt5' | 'rithmic' | 'generic';

export const SOURCE_OPTIONS: Array<{ value: ImportSource; label: string }> = [
  { value: 'tradovate', label: 'Tradovate' },
  { value: 'projectx', label: 'TopstepX / ProjectX' },
  { value: 'ninjatrader', label: 'NinjaTrader 8' },
  { value: 'rithmic', label: 'Rithmic R|Trader Pro' },
  { value: 'mt5', label: 'MetaTrader 5' },
  { value: 'generic', label: 'Genérico (mapeo manual)' },
];

export function sourceLabel(source: string | null | undefined): string {
  return SOURCE_OPTIONS.find((o) => o.value === source)?.label ?? (source || 'Desconocida');
}

export const VARIANT_LABELS: Record<string, string> = {
  performance: 'Performance (round-trips)',
  fills: 'Orders / Fills (emparejado FIFO)',
  trades: 'Trades',
  executions: 'Executions (emparejado FIFO)',
  deals: 'Deals (emparejado FIFO)',
  positions: 'Posiciones',
  orders: 'Order History (emparejado FIFO)',
};

export type MappingField = 'symbol' | 'side' | 'qty' | 'entry_price' | 'exit_price' | 'entry_time' | 'exit_time' | 'pnl' | 'fees' | 'external_id';

export const MAPPING_FIELDS: Array<{ key: MappingField; label: string; required: boolean; hint: string }> = [
  { key: 'symbol', label: 'Símbolo', required: true, hint: 'MNQ, ES, EURUSD… Se quita el vencimiento (MNQU6 → MNQ).' },
  { key: 'side', label: 'Lado', required: false, hint: 'Long/Short, Buy/Sell, Compra/Venta. Si falta, se deduce de precios y P&L.' },
  { key: 'qty', label: 'Cantidad', required: false, hint: 'Contratos o lotes. Si falta, 1.' },
  { key: 'entry_price', label: 'Precio de entrada', required: false, hint: 'Opcional.' },
  { key: 'exit_price', label: 'Precio de salida', required: false, hint: 'Opcional.' },
  { key: 'entry_time', label: 'Fecha/hora de entrada', required: true, hint: 'ISO, 2024-05-10 09:31:05, 05/10/2024 9:31 AM…' },
  { key: 'exit_time', label: 'Fecha/hora de salida', required: true, hint: 'Se usa para calcular el día de trading.' },
  { key: 'pnl', label: 'P&L', required: true, hint: 'Resultado en dinero. Admite $1,234.50, (120.00), -12,5.' },
  { key: 'fees', label: 'Comisiones', required: false, hint: 'Opcional. Siempre en positivo.' },
  { key: 'external_id', label: 'Identificador', required: false, hint: 'Para detectar duplicados. Si falta, se calcula un hash.' },
];

export interface ImportMapping extends Partial<Record<MappingField, string>> {
  side_long_value?: string;
  side_short_value?: string;
  /** true (por defecto) = el P&L del archivo ya es neto; false = restar las comisiones */
  pnl_is_net?: boolean;
  /** Fechas a/b/aaaa como día/mes/año */
  day_first?: boolean;
  /** Mantener el contrato completo (MNQU6) en lugar de la raíz (MNQ) */
  keep_contract?: boolean;
}

export interface NormalizedTrade {
  symbol: string;
  side: 'long' | 'short';
  qty: number;
  entry_price: number | null;
  exit_price: number | null;
  entry_time: string;
  exit_time: string;
  pnl: number;
  fees: number;
  external_id: string;
}

export interface NormalizedRow {
  row: number;
  data?: NormalizedTrade;
  error?: string;
}

export interface RowError {
  row: number;
  error: string;
}

export interface PreviewResponse {
  mapping_error: string | null;
  source_detected: ImportSource;
  source_label: string;
  variant: string | null;
  source: ImportSource;
  columns: string[];
  sample: Array<Record<string, string>>;
  normalized_sample: NormalizedRow[];
  suggested_mapping: ImportMapping;
  mapping: ImportMapping;
  total_rows: number;
  max_rows: number;
  valid_rows: number;
  new_rows: number;
  error_rows: number;
  already_imported: number;
  duplicates_in_file: number;
  errors: RowError[];
  warnings: string[];
  timezone_of_file: string;
  header_line: number;
}

export interface CommitResponse {
  imported: number;
  skipped_duplicates: number;
  errors: RowError[];
  error_rows: number;
  status: AccountStatus | null;
  total_rows: number;
  source: ImportSource;
  source_label: string;
  warnings: string[];
  timezone_of_file: string;
}

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_EXTENSIONS = ['.csv', '.txt'];

/** Zonas horarias habituales para los archivos exportados. */
export const TIMEZONE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'America/New_York', label: 'America/New_York (ET, hora de Nueva York)' },
  { value: 'America/Chicago', label: 'America/Chicago (CT, hora de Chicago/CME)' },
  { value: 'America/Denver', label: 'America/Denver (MT)' },
  { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PT)' },
  { value: 'America/Caracas', label: 'America/Caracas (VET)' },
  { value: 'America/Bogota', label: 'America/Bogota (COT)' },
  { value: 'America/Lima', label: 'America/Lima (PET)' },
  { value: 'America/Mexico_City', label: 'America/Mexico_City (CST)' },
  { value: 'America/Santiago', label: 'America/Santiago (CLT)' },
  { value: 'America/Argentina/Buenos_Aires', label: 'America/Argentina/Buenos_Aires (ART)' },
  { value: 'America/Sao_Paulo', label: 'America/Sao_Paulo (BRT)' },
  { value: 'Europe/Madrid', label: 'Europe/Madrid (CET)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'Europe/Athens', label: 'Europe/Athens (EET, hora típica de servidores MT5: UTC+2/+3)' },
  { value: 'Etc/UTC', label: 'UTC' },
];

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
