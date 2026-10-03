// Visor cinematográfico a pantalla completa para certificados y comprobantes: el propio documento, desenfocado y
// ampliado, sirve de telón de fondo; encima flotan capas de humo que se mueven despacio; el documento nítido va en el
// centro y los datos (importe, cuenta, fechas) abajo, con entrada escalonada y botones de cristal.
// Los PDF no se incrustan (la CSP lo impide): se muestran con un panel de cristal y el botón «Abrir».
import { useEffect, useMemo, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Award, Banknote, Calendar, ChevronLeft, ChevronRight, ExternalLink, FileText, Landmark, Trash2, Wallet, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { fmtDate, fmtMoney } from '../../lib/format';
import { isPdf, type AccountDocument } from '../../lib/finanzas';
import SmokeCanvas from './SmokeCanvas';

export type ViewerKind = 'fondeo' | 'payout' | 'otro';

export interface ViewerItem {
  doc: AccountDocument;
  kind: ViewerKind;
  /** Línea grande: «+1.080,00 US$» en un payout, el nombre de la cuenta en un fondeo. */
  title: string;
  /** Línea pequeña bajo el título. */
  subtitle?: string;
  /** Chips de la fila de metadatos (fecha, cuenta, tamaño…). */
  meta: Array<{ icon: 'date' | 'account' | 'size' | 'kind' | 'firm'; text: string }>;
  date: string;
}

export interface CinematicViewerProps {
  items: ViewerItem[];
  /** Índice del documento abierto; null = cerrado. */
  index: number | null;
  onClose: () => void;
  onNavigate: (index: number) => void;
  onDelete?: (doc: AccountDocument) => void;
}

const ICONS = { date: Calendar, account: Wallet, size: Landmark, kind: Award, firm: Landmark };

function rise(ms: number): CSSProperties {
  return { animationDelay: `${ms}ms` };
}

export default function CinematicViewer({ items, index, onClose, onNavigate, onDelete }: CinematicViewerProps) {
  const open = index !== null && index >= 0 && index < items.length;
  const item = open ? items[index as number] : null;
  const hasPrev = open && (index as number) > 0;
  const hasNext = open && (index as number) < items.length - 1;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && hasPrev) onNavigate((index as number) - 1);
      if (e.key === 'ArrowRight' && hasNext) onNavigate((index as number) + 1);
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, hasPrev, hasNext, index, onClose, onNavigate]);

  const tint = useMemo(() => (item?.kind === 'payout' ? 'rgba(34,211,111,0.35)' : item?.kind === 'fondeo' ? 'rgba(22,245,122,0.32)' : 'rgba(245,180,0,0.25)'), [item?.kind]);
  const smokeTint = useMemo<[number, number, number]>(() => (item?.kind === 'otro' ? [255, 215, 140] : [140, 255, 190]), [item?.kind]);

  if (!open || !item) return null;
  const pdf = isPdf(item.doc);
  const KindIcon = item.kind === 'payout' ? Banknote : item.kind === 'fondeo' ? Award : FileText;

  return createPortal(
    <div key={item.doc.id} role="dialog" aria-modal="true" aria-label={item.title} className="font-inter fixed inset-0 z-[60] overflow-hidden bg-black text-white">
      {/* Telón: el documento ampliado y desenfocado (color) + capas de humo en movimiento */}
      <div className="absolute inset-0 z-0" aria-hidden>
        {pdf ? (
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(22,245,122,0.28),#050806_65%)]" />
        ) : (
          <img src={item.doc.path} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-40 blur-3xl saturate-150" />
        )}
        <div className="absolute inset-0 bg-black/45" />
        {/* Humo real: partículas en canvas, mezcladas en modo pantalla sobre el telón. */}
        <SmokeCanvas tint={smokeTint} className="mix-blend-screen opacity-90" />
        {/* Sombra suave abajo para que el importe y los datos se lean sobre el humo. */}
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
      </div>
      {/* Desenfoque solo en la parte baja (máscara), sin oscurecer con degradados */}
      <div className="viewer-blur-mask pointer-events-none absolute inset-0 z-[1]" aria-hidden />

      {/* Barra superior */}
      <header className="relative z-50 flex items-center justify-between px-4 py-4 sm:px-6 md:px-12 md:py-6">
        <div className="animate-blur-fade-up flex items-center gap-2" style={rise(0)}>
          <KindIcon className="h-5 w-5 text-accent" aria-hidden />
          <span className="text-sm font-semibold uppercase tracking-[0.18em] text-white/90">{item.kind === 'payout' ? 'Payout' : item.kind === 'fondeo' ? 'Cuenta fondeada' : 'Documento'}</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <a href={item.doc.path} target="_blank" rel="noopener" className="liquid-glass animate-blur-fade-up hidden items-center gap-2 rounded-full px-4 py-2 text-sm text-white hover:bg-white/10 sm:inline-flex md:px-6" style={rise(350)}>
            <ExternalLink size={18} aria-hidden /> Abrir
          </a>
          {onDelete && (
            <button type="button" onClick={() => onDelete(item.doc)} className="liquid-glass animate-blur-fade-up hidden h-10 w-10 items-center justify-center rounded-full text-white hover:bg-loss/30 sm:inline-flex" style={rise(400)} title="Eliminar documento" aria-label="Eliminar documento">
              <Trash2 size={18} aria-hidden />
            </button>
          )}
          <button type="button" onClick={onClose} className="liquid-glass animate-blur-fade-up inline-flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10" style={rise(450)} aria-label="Cerrar">
            <X size={18} aria-hidden />
          </button>
        </div>
      </header>

      {/* Documento en el centro */}
      <div className="absolute inset-x-0 top-[72px] bottom-[220px] z-10 flex items-center justify-center px-4 sm:bottom-[240px] md:top-[88px] md:bottom-[250px]">
        {pdf ? (
          <a href={item.doc.path} target="_blank" rel="noopener" className="liquid-glass animate-blur-fade-up flex flex-col items-center gap-3 rounded-3xl px-12 py-10 text-center" style={rise(200)}>
            <FileText size={64} className="text-accent drop-shadow-[0_0_24px_rgba(22,245,122,0.6)]" aria-hidden />
            <span className="text-sm text-white/80">Documento PDF · pulsa para abrirlo</span>
          </a>
        ) : (
          <img
            src={item.doc.path}
            alt={item.title}
            className="animate-blur-fade-up max-h-full max-w-full rounded-2xl object-contain shadow-[0_30px_90px_-20px_rgba(0,0,0,0.9),0_0_80px_-20px_var(--glow,rgba(22,245,122,0.5))]"
            style={{ ...rise(200), ['--glow' as string]: tint }}
          />
        )}
      </div>

      {/* Datos abajo */}
      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-6 px-4 pb-8 sm:px-6 md:flex-row md:items-end md:px-12 md:pb-14">
        <div className="min-w-0 flex-1">
          <div className="animate-blur-fade-up mb-4 flex flex-wrap items-center gap-3 text-xs text-white/90 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)] sm:gap-6 sm:text-sm md:mb-6" style={rise(300)}>
            {item.meta.map((m, i) => {
              const Icon = ICONS[m.icon];
              return (
                <span key={i} className="inline-flex items-center gap-1.5">
                  <Icon size={16} className={cn('shrink-0', m.icon === 'kind' && 'fill-white')} aria-hidden /> <span className={cn(i === 0 && 'font-medium')}>{m.text}</span>
                </span>
              );
            })}
          </div>
          <h1 className={cn('animate-blur-fade-up mb-2 text-3xl font-normal tracking-[-0.04em] drop-shadow-[0_2px_18px_rgba(0,0,0,0.85)] sm:text-5xl md:mb-4 md:text-6xl', item.kind === 'payout' && 'text-profit')} style={rise(400)}>
            {item.title}
          </h1>
          {item.subtitle && (
            <p className="animate-blur-fade-up max-w-2xl text-base text-gray-300 sm:text-lg md:text-xl" style={rise(500)}>{item.subtitle}</p>
          )}
          <div className="mt-5 flex flex-wrap gap-3 sm:mt-8 sm:gap-4">
            <a href={item.doc.path} target="_blank" rel="noopener" className="animate-blur-fade-up inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-medium text-black transition-colors hover:bg-gray-200 sm:px-8 sm:py-3" style={rise(600)}>
              <ExternalLink size={18} aria-hidden /> Ver a tamaño completo
            </a>
            {onDelete && (
              <button type="button" onClick={() => onDelete(item.doc)} className="liquid-glass animate-blur-fade-up inline-flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium text-white hover:bg-loss/25 sm:px-8 sm:py-3" style={rise(700)}>
                <Trash2 size={18} aria-hidden /> Eliminar
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-3 md:w-auto md:justify-end">
          <button type="button" onClick={() => hasPrev && onNavigate((index as number) - 1)} disabled={!hasPrev} className="liquid-glass animate-blur-fade-up inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm text-white hover:bg-white/10 disabled:opacity-40 sm:px-6 sm:py-3" style={rise(800)}>
            <ChevronLeft size={18} aria-hidden /> Anterior
          </button>
          <button type="button" onClick={() => hasNext && onNavigate((index as number) + 1)} disabled={!hasNext} className="liquid-glass animate-blur-fade-up inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm text-white hover:bg-white/10 disabled:opacity-40 sm:px-6 sm:py-3" style={rise(900)}>
            Siguiente <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </div>
      <p className="pointer-events-none absolute bottom-2 right-4 z-10 hidden text-[10px] text-white/30 md:block">{(index as number) + 1} / {items.length} · ← → para moverte · Esc para cerrar</p>
    </div>,
    document.body,
  );
}

/** Convierte un documento + contexto en un elemento del visor. */
export function viewerItemFor(
  doc: AccountDocument,
  kind: ViewerKind,
  ctx: { account?: { name: string; firm?: string | null; size?: number | null; currency?: string | null } | null; payout?: { amount: number; gross_amount?: number | null; fee_amount?: number | null; currency?: string | null; occurred_at: string; note?: string | null } | null; origen?: { name: string; purchased_at?: string | null } | null; funded_at?: string | null },
): ViewerItem {
  const currency = ctx.payout?.currency || ctx.account?.currency || doc.account_currency || 'USD';
  const meta: ViewerItem['meta'] = [];
  if (kind === 'payout' && ctx.payout) {
    meta.push({ icon: 'kind', text: 'Payout cobrado' });
    meta.push({ icon: 'date', text: fmtDate(ctx.payout.occurred_at) });
    if (ctx.account) meta.push({ icon: 'account', text: `${ctx.account.name}${ctx.account.firm ? ` · ${ctx.account.firm}` : ''}` });
    if (ctx.account?.size) meta.push({ icon: 'size', text: fmtMoney(ctx.account.size, currency, { sign: false }) });
    const parts: string[] = [];
    if (ctx.payout.gross_amount) parts.push(`bruto ${fmtMoney(ctx.payout.gross_amount, currency, { sign: false })}`);
    if (ctx.payout.fee_amount) parts.push(`comisión ${fmtMoney(ctx.payout.fee_amount, currency, { sign: false })}`);
    if (ctx.payout.note) parts.push(ctx.payout.note);
    return { doc, kind, title: `+${fmtMoney(ctx.payout.amount, currency, { sign: false })}`, subtitle: parts.join(' · ') || doc.title || undefined, meta, date: ctx.payout.occurred_at };
  }
  if (kind === 'fondeo') {
    meta.push({ icon: 'kind', text: 'Cuenta fondeada' });
    if (ctx.funded_at) meta.push({ icon: 'date', text: fmtDate(ctx.funded_at) });
    if (ctx.account?.firm) meta.push({ icon: 'firm', text: ctx.account.firm });
    if (ctx.account?.size) meta.push({ icon: 'size', text: fmtMoney(ctx.account.size, currency, { sign: false }) });
    const subtitle = ctx.origen ? `Viene de la evaluación «${ctx.origen.name}»${ctx.origen.purchased_at ? `, comprada el ${fmtDate(ctx.origen.purchased_at)}` : ''}.` : doc.title || undefined;
    return { doc, kind, title: ctx.account?.name || doc.title || 'Cuenta fondeada', subtitle, meta, date: ctx.funded_at || doc.created_at };
  }
  meta.push({ icon: 'date', text: fmtDate(doc.created_at) });
  if (ctx.account) meta.push({ icon: 'account', text: ctx.account.name });
  return { doc, kind, title: doc.title || doc.original_name || 'Documento', meta, date: doc.created_at };
}
