// Utilidades de formato (dinero, fechas, porcentajes) en español.
import { format, parseISO, isValid } from 'date-fns';
import { es } from 'date-fns/locale/es';

/** Formatea dinero con signo: +1.234,50 US$ / -250,00 US$. */
export function fmtMoney(n: number | null | undefined, currency = 'USD', opts: { sign?: boolean } = {}): string {
  const value = Number(n ?? 0);
  const sign = opts.sign === false ? '' : value > 0 ? '+' : value < 0 ? '-' : '';
  const abs = Math.abs(value);
  let formatted: string;
  try {
    formatted = new Intl.NumberFormat('es-ES', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(abs);
  } catch {
    formatted = `${abs.toFixed(2)} ${currency}`;
  }
  return `${sign}${formatted}`;
}

/** Número con 2 decimales (o los indicados), formato español. */
export function fmtNum(n: number | null | undefined, decimals = 2): string {
  const value = Number(n ?? 0);
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

/** Porcentaje: 0.5423 -> "54,23 %" (si ya viene en 0-100 pásalo con ratio=false). */
export function fmtPct(n: number | null | undefined, ratio = false, decimals = 1): string {
  const v = Number(n ?? 0) * (ratio ? 100 : 1);
  return `${fmtNum(v, decimals)} %`;
}

/** R múltiple: 1.5 -> "+1,50R". */
export function fmtR(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—';
  const v = Number(n);
  return `${v > 0 ? '+' : ''}${fmtNum(v, 2)}R`;
}

/** Clase Tailwind según el signo del P&L. */
export function pnlClass(n: number | null | undefined): 'text-profit' | 'text-loss' | 'text-gray-400' {
  const v = Number(n ?? 0);
  if (v > 0) return 'text-profit';
  if (v < 0) return 'text-loss';
  return 'text-gray-400';
}

function toDate(d: string | Date | null | undefined): Date | null {
  if (!d) return null;
  if (d instanceof Date) return isValid(d) ? d : null;
  // 'YYYY-MM-DD' se interpreta como fecha local (sin desfase de zona)
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day);
  }
  const parsed = parseISO(d);
  return isValid(parsed) ? parsed : null;
}

/** Fecha corta en español: "15 mar 2026". */
export function fmtDate(d: string | Date | null | undefined, pattern = 'd MMM yyyy'): string {
  const date = toDate(d);
  return date ? format(date, pattern, { locale: es }) : '—';
}

/** Fecha y hora en español: "15 mar 2026, 09:31". */
export function fmtDateTime(d: string | Date | null | undefined, pattern = 'd MMM yyyy, HH:mm'): string {
  const date = toDate(d);
  return date ? format(date, pattern, { locale: es }) : '—';
}

/** Solo hora "09:31". */
export function fmtTime(d: string | Date | null | undefined): string {
  const date = toDate(d);
  return date ? format(date, 'HH:mm', { locale: es }) : '—';
}

/** Convierte un Date/ISO a valor para <input type="datetime-local"> (hora local). */
export function toDatetimeLocal(d: string | Date | null | undefined): string {
  const date = toDate(d);
  if (!date) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Convierte el valor de un <input type="datetime-local"> a ISO UTC. */
export function fromDatetimeLocal(value: string): string {
  if (!value) return '';
  const d = new Date(value);
  return isValid(d) ? d.toISOString() : '';
}

/** Fecha de hoy 'YYYY-MM-DD' (local). */
export function todayYmd(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
