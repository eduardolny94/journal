// Fila de la tabla de operaciones, tarjeta compacta para móvil, tipos compartidos del trade
// y el componente de estrellas de valoración.
import { Clock, Image as ImageIcon, Lock, Star } from 'lucide-react';
import { cn } from '../lib/cn';
import { fmtDateTime, fmtMoney, fmtNum, fmtR, pnlClass } from '../lib/format';
import { Badge, SideBadge } from './ui/Badge';
import type { Tag } from './TagPicker';

export type TradeSide = 'long' | 'short';

export interface TradeImage {
  id: number;
  path: string;
  caption: string;
}

export interface Trade {
  id: number;
  user_id: number;
  account_id: number;
  symbol: string;
  side: TradeSide;
  qty: number;
  entry_price: number | null;
  exit_price: number | null;
  entry_time: string;
  exit_time: string;
  trading_day: string;
  pnl: number;
  fees: number;
  risk_amount: number | null;
  rating: number | null;
  notes: string;
  violated_lock: number;
  source: string;
  external_id: string | null;
  created_at: string;
  updated_at: string;
  tags: Tag[];
  images: TradeImage[];
  r_multiple: number | null;
}

/** Totales del filtro completo que devuelve GET /trades. */
export interface TradeListSummary {
  trades: number;
  pnl: number;
  fees: number;
  wins: number;
  losses: number;
  breakeven: number;
  /** 0-100 */
  win_rate: number;
}

export interface TradeListResponse {
  items: Trade[];
  total: number;
  page?: number;
  limit?: number;
  summary?: TradeListSummary;
}

/** Cantidad sin decimales innecesarios (2 → "2", 1.5 → "1,50"). */
export function fmtQty(n: number): string {
  return Number.isInteger(n) ? String(n) : fmtNum(n, 2);
}

/** Precio con hasta 2 decimales (o "—"). */
export function fmtPrice(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return fmtNum(n, Number.isInteger(n) ? 0 : 2);
}

/** Duración legible entre entrada y salida: "45 s", "12 min", "2 h 5 min", "1 d 3 h". */
export function fmtDuration(entry: string, exit: string): string {
  const ms = new Date(exit).getTime() - new Date(entry).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const totalMin = Math.round(ms / 60_000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} d`);
  if (h) parts.push(`${h} h`);
  if (m || parts.length === 0) parts.push(`${m} min`);
  return parts.slice(0, 2).join(' ');
}

export interface StarsProps {
  value: number | null | undefined;
  onChange?: (value: number | null) => void;
  size?: 'sm' | 'md';
  className?: string;
}

/** Valoración 1-5 con estrellas (solo lectura si no hay onChange). */
export function Stars({ value, onChange, size = 'sm', className }: StarsProps) {
  const v = value ?? 0;
  const dim = size === 'sm' ? 'h-3.5 w-3.5' : 'h-5 w-5';
  const interactive = typeof onChange === 'function';
  if (!interactive && v === 0) return <span className="text-gray-600 text-xs">—</span>;
  return (
    <span
      className={cn('inline-flex items-center gap-0.5', className)}
      role={interactive ? 'radiogroup' : 'img'}
      aria-label={v ? `Valoración ${v} de 5` : 'Sin valoración'}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const filled = n <= v;
        const star = <Star className={cn(dim, filled ? 'fill-warn text-warn' : 'text-gray-600')} aria-hidden />;
        if (!interactive) return <span key={n}>{star}</span>;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === v}
            aria-label={`${n} estrella${n > 1 ? 's' : ''}`}
            title={n === v ? 'Quitar valoración' : `${n} de 5`}
            onClick={() => onChange(n === v ? null : n)}
            className="rounded hover:scale-110 transition-transform focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          >
            {star}
          </button>
        );
      })}
    </span>
  );
}

function Thumb({ trade, size = 'h-8 w-8' }: { trade: Trade; size?: string }) {
  const thumb = trade.images[0];
  if (!thumb) {
    return (
      <span className={cn('inline-flex items-center justify-center text-gray-700', size)} aria-hidden>
        <ImageIcon className="h-4 w-4" />
      </span>
    );
  }
  return (
    <span className={cn('relative inline-block overflow-hidden rounded border border-border bg-bg shrink-0', size)} title={`${trade.images.length} foto(s)`}>
      <img src={thumb.path} alt="" className="h-full w-full object-cover" loading="lazy" />
      {trade.images.length > 1 && (
        <span className="absolute bottom-0 right-0 rounded-tl bg-black/70 px-1 text-[9px] text-gray-200 tnum">{trade.images.length}</span>
      )}
    </span>
  );
}

function LockedBadge() {
  return (
    <Badge variant="loss" title="Registrada con la cuenta bloqueada (regla de riesgo rota)">
      <Lock className="h-3 w-3" aria-hidden /> En bloqueo
    </Badge>
  );
}

export interface TradeRowProps {
  trade: Trade;
  currency?: string;
  onClick?: (trade: Trade) => void;
}

const MAX_TAGS = 3;

/** Fila para la tabla (pantallas medianas y grandes). */
export default function TradeRow({ trade, currency = 'USD', onClick }: TradeRowProps) {
  const extraTags = trade.tags.length - MAX_TAGS;
  return (
    <tr
      className={cn(
        'border-b border-border/70 last:border-0 transition-colors',
        onClick && 'cursor-pointer hover:bg-gray-800/40 focus:outline-none focus-visible:bg-gray-800/60',
        trade.violated_lock ? 'bg-loss/5' : '',
      )}
      onClick={() => onClick?.(trade)}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(trade);
        }
      }}
    >
      <td className="px-3 py-2 whitespace-nowrap">
        <div className="text-sm text-gray-200 tnum">{fmtDateTime(trade.exit_time)}</div>
        <div className="text-[11px] text-gray-500 tnum">Día {trade.trading_day}</div>
      </td>
      <td className="px-3 py-2 font-semibold text-gray-100 whitespace-nowrap">{trade.symbol}</td>
      <td className="px-3 py-2">
        <SideBadge side={trade.side} />
      </td>
      <td className="px-3 py-2 text-right tnum text-gray-300">{fmtQty(trade.qty)}</td>
      <td className="px-3 py-2 text-right tnum text-gray-300">{fmtPrice(trade.entry_price)}</td>
      <td className="px-3 py-2 text-right tnum text-gray-300">{fmtPrice(trade.exit_price)}</td>
      <td className={cn('px-3 py-2 text-right tnum font-semibold whitespace-nowrap', pnlClass(trade.pnl))}>{fmtMoney(trade.pnl, currency)}</td>
      <td className={cn('px-3 py-2 text-right tnum whitespace-nowrap', trade.r_multiple === null ? 'text-gray-600' : pnlClass(trade.r_multiple))}>
        {fmtR(trade.r_multiple)}
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap gap-1 max-w-[260px]">
          {trade.tags.slice(0, MAX_TAGS).map((t) => (
            <Badge key={t.id} color={t.color}>
              {t.name}
            </Badge>
          ))}
          {extraTags > 0 && <Badge variant="outline">+{extraTags}</Badge>}
        </div>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <Stars value={trade.rating} />
      </td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-2">
          <Thumb trade={trade} />
          {trade.violated_lock ? <LockedBadge /> : null}
        </div>
      </td>
    </tr>
  );
}

/** Tarjeta compacta para móvil (una columna). */
export function TradeCard({ trade, currency = 'USD', onClick }: TradeRowProps) {
  return (
    <article
      className={cn(
        'rounded-lg border border-border bg-panel p-3 space-y-2 transition-colors',
        onClick && 'cursor-pointer hover:border-gray-600 active:bg-gray-800/40',
        trade.violated_lock && 'border-loss/40',
      )}
      onClick={() => onClick?.(trade)}
      tabIndex={onClick ? 0 : undefined}
      role={onClick ? 'button' : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick(trade);
        }
      }}
    >
      <div className="flex items-center gap-2">
        <Thumb trade={trade} size="h-10 w-10" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-gray-100">{trade.symbol}</span>
            <SideBadge side={trade.side} />
          </div>
          <p className="text-[11px] text-gray-500 tnum truncate">
            {fmtDateTime(trade.exit_time)} · {fmtQty(trade.qty)} ud. · {fmtPrice(trade.entry_price)} → {fmtPrice(trade.exit_price)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className={cn('font-semibold tnum', pnlClass(trade.pnl))}>{fmtMoney(trade.pnl, currency)}</p>
          <p className={cn('text-[11px] tnum', trade.r_multiple === null ? 'text-gray-600' : pnlClass(trade.r_multiple))}>{fmtR(trade.r_multiple)}</p>
        </div>
      </div>
      {(trade.tags.length > 0 || trade.rating || trade.violated_lock) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {trade.tags.slice(0, 4).map((t) => (
            <Badge key={t.id} color={t.color}>
              {t.name}
            </Badge>
          ))}
          {trade.tags.length > 4 && <Badge variant="outline">+{trade.tags.length - 4}</Badge>}
          {trade.violated_lock ? <LockedBadge /> : null}
          {trade.rating ? <Stars value={trade.rating} className="ml-auto" /> : null}
        </div>
      )}
      <p className="text-[11px] text-gray-500 inline-flex items-center gap-1 tnum">
        <Clock className="h-3 w-3" aria-hidden /> {fmtDuration(trade.entry_time, trade.exit_time)} · día {trade.trading_day}
      </p>
    </article>
  );
}
