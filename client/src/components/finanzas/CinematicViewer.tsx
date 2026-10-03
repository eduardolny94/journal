// Visor cinematográfico a pantalla completa para certificados y comprobantes, compuesto como una portada espacial:
// un clip real de un planeta, del color dominante del documento (Apex azul, Lucid gris…), llena la escena; a la
// izquierda la etiqueta, el nombre o importe en grande, una línea verde, los datos y los botones; a la derecha el
// documento flota en perspectiva sobre el planeta y se abre a pantalla completa al pulsarlo.
// Los PDF no se incrustan (la CSP lo impide): tarjeta de cristal con el botón «Abrir».
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Award, Banknote, Calendar, ChevronLeft, ChevronRight, ExternalLink, FileText, Landmark, Maximize2, Trash2, Wallet, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { fmtDate, fmtMoney } from '../../lib/format';
import { isPdf, type AccountDocument } from '../../lib/finanzas';
import PlanetBackdrop, { type RGB } from './PlanetBackdrop';

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
  /** Etiqueta pequeña sobre el título (p. ej. la firma). */
  eyebrow?: string;
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
  const [full, setFull] = useState(false);
  const [color, setColor] = useState<RGB>([22, 245, 122]);
  const onColor = useCallback((c: RGB) => setColor(c), []);

  useEffect(() => {
    setFull(false);
  }, [index]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (full) setFull(false);
        else onClose();
      }
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
  }, [open, hasPrev, hasNext, index, onClose, onNavigate, full]);

  if (!open || !item) return null;
  const pdf = isPdf(item.doc);
  const KindIcon = item.kind === 'payout' ? Banknote : item.kind === 'fondeo' ? Award : FileText;
  const tint = `rgba(${color.join(',')},`;

  return createPortal(
    <div key={item.doc.id} role="dialog" aria-modal="true" aria-label={item.title} className="font-inter fixed inset-0 z-[60] overflow-hidden bg-black text-white">
      {/* Escena: planeta real del color del documento sobre cielo estrellado */}
      <div className="absolute inset-0 z-0" aria-hidden>
        <PlanetBackdrop imageSrc={pdf ? null : item.doc.path} onColor={onColor} />
        {/* Sombra suave abajo y a la izquierda para que el texto se lea sobre el planeta */}
        <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        <div className="absolute inset-y-0 left-0 hidden w-[50%] bg-gradient-to-r from-black/65 via-black/20 to-transparent md:block" />
      </div>

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

      {/* Composición: texto a la izquierda, documento flotando a la derecha */}
      <div className="absolute inset-x-0 top-[72px] bottom-0 z-10 grid grid-rows-[1fr_auto] gap-4 px-4 pb-20 sm:px-6 md:top-[88px] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:grid-rows-1 md:items-center md:gap-8 md:px-12 md:pb-12">
        {/* Documento: tarjeta en perspectiva sobre el planeta */}
        <div className="order-1 flex min-h-0 items-center justify-center md:order-2 md:justify-end" style={{ perspective: '1400px' }}>
          {pdf ? (
            <a href={item.doc.path} target="_blank" rel="noopener" className="liquid-glass animate-blur-fade-up flex flex-col items-center gap-3 rounded-3xl px-12 py-10 text-center" style={rise(250)}>
              <FileText size={64} className="text-accent drop-shadow-[0_0_24px_rgba(22,245,122,0.6)]" aria-hidden />
              <span className="text-sm text-white/80">Documento PDF · pulsa para abrirlo</span>
            </a>
          ) : (
            <button
              type="button"
              onClick={() => setFull(true)}
              className="group/doc animate-blur-fade-up relative block max-h-full max-w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              style={rise(250)}
              aria-label="Ver el documento a pantalla completa"
            >
              <span className="block transition-transform duration-700 ease-out [transform:rotateY(-14deg)_rotateX(4deg)] group-hover/doc:[transform:rotateY(-4deg)_rotateX(1deg)_scale(1.02)]" style={{ transformStyle: 'preserve-3d' }}>
                <img
                  src={item.doc.path}
                  alt={item.title}
                  className="max-h-[36vh] w-auto max-w-full rounded-2xl border border-white/15 object-contain md:max-h-[56vh]"
                  style={{ boxShadow: `0 40px 90px -20px rgba(0,0,0,0.9), 0 0 60px -10px ${tint}0.55), inset 0 1px 0 rgba(255,255,255,0.2)` }}
                />
                {/* Reflejo sobre el planeta */}
                <img src={item.doc.path} alt="" aria-hidden className="pointer-events-none absolute left-0 top-full mt-2 hidden w-full scale-y-[-1] rounded-2xl opacity-25 [mask-image:linear-gradient(to_top,rgba(0,0,0,0.6),transparent_60%)] md:block" />
                <span className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-tr from-white/0 via-white/10 to-white/0 opacity-0 transition-opacity duration-700 group-hover/doc:opacity-100" />
              </span>
              <span className="liquid-glass absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-white opacity-0 transition-opacity group-hover/doc:opacity-100">
                <Maximize2 size={14} aria-hidden /> Ampliar
              </span>
            </button>
          )}
        </div>

        {/* Texto */}
        <div className="order-2 min-w-0 self-end md:order-1 md:self-center">
          <p className="animate-blur-fade-up mb-3 text-[11px] font-semibold uppercase tracking-[0.35em] text-white/80 sm:text-xs" style={rise(300)}>
            {item.eyebrow || (item.kind === 'payout' ? 'Payout cobrado' : item.kind === 'fondeo' ? 'Cuenta fondeada' : 'Documento')}
          </p>
          <h1
            className={cn(
              'animate-blur-fade-up font-normal tracking-[-0.04em] drop-shadow-[0_2px_18px_rgba(0,0,0,0.85)]',
              item.kind === 'payout' ? 'text-4xl text-profit sm:text-6xl md:text-7xl' : 'text-3xl sm:text-5xl md:text-6xl',
            )}
            style={rise(400)}
          >
            {item.title}
          </h1>
          <span className="animate-blur-fade-up mt-4 block h-1 w-20 rounded-full bg-accent shadow-[0_0_18px_rgba(22,245,122,0.8)]" style={rise(520)} aria-hidden />
          <div className="animate-blur-fade-up mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.9)] sm:text-sm" style={rise(600)}>
            {item.meta.map((m, i) => {
              const Icon = ICONS[m.icon];
              return (
                <span key={i} className="inline-flex items-center gap-1.5">
                  <Icon size={15} className="shrink-0 text-white/60" aria-hidden /> {m.text}
                </span>
              );
            })}
          </div>
          {item.subtitle && (
            <p className="animate-blur-fade-up mt-3 max-w-xl text-sm text-gray-300 sm:text-base" style={rise(700)}>{item.subtitle}</p>
          )}
          <div className="mt-6 flex flex-wrap items-center gap-3 sm:gap-4">
            <button type="button" onClick={() => (pdf ? window.open(item.doc.path, '_blank', 'noopener') : setFull(true))} className="animate-blur-fade-up inline-flex items-center gap-2 rounded-full bg-white px-6 py-2.5 text-sm font-semibold text-black shadow-[0_10px_30px_-10px_rgba(255,255,255,0.6)] transition-colors hover:bg-gray-200 sm:px-8 sm:py-3" style={rise(800)}>
              <Maximize2 size={18} aria-hidden /> {pdf ? 'Abrir el PDF' : 'Ver a tamaño completo'}
            </button>
            {onDelete && (
              <button type="button" onClick={() => onDelete(item.doc)} className="liquid-glass animate-blur-fade-up inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white hover:bg-loss/25 sm:px-6 sm:py-3" style={rise(900)}>
                <Trash2 size={18} aria-hidden /> Eliminar
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Anterior / siguiente */}
      {items.length > 1 && (
        <div className="absolute bottom-4 right-4 z-20 flex gap-2 sm:bottom-6 sm:right-6 md:bottom-12 md:right-12 md:gap-3">
          <button type="button" onClick={() => hasPrev && onNavigate((index as number) - 1)} disabled={!hasPrev} className="liquid-glass animate-blur-fade-up inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm text-white hover:bg-white/10 disabled:opacity-40 sm:px-6 sm:py-3" style={rise(1000)}>
            <ChevronLeft size={18} aria-hidden /> Anterior
          </button>
          <button type="button" onClick={() => hasNext && onNavigate((index as number) + 1)} disabled={!hasNext} className="liquid-glass animate-blur-fade-up inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm text-white hover:bg-white/10 disabled:opacity-40 sm:px-6 sm:py-3" style={rise(1100)}>
            Siguiente <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      )}
      <p className="pointer-events-none absolute bottom-2 left-1/2 z-10 hidden -translate-x-1/2 text-[10px] text-white/30 md:block">{(index as number) + 1} / {items.length} · ← → para moverte · Esc para cerrar</p>

      {/* Documento a pantalla completa */}
      {full && !pdf && (
        <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/90 p-4 backdrop-blur-sm" onClick={() => setFull(false)} role="presentation">
          <img src={item.doc.path} alt={item.title} className="max-h-full max-w-full rounded-lg object-contain shadow-[0_0_80px_-10px_rgba(255,255,255,0.25)]" />
          <button type="button" onClick={() => setFull(false)} className="liquid-glass absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full text-white hover:bg-white/10" aria-label="Volver">
            <X size={18} aria-hidden />
          </button>
        </div>
      )}
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
  const eyebrow = ctx.account?.firm ? `${ctx.account.firm} · ${kind === 'payout' ? 'payout' : kind === 'fondeo' ? 'cuenta fondeada' : 'documento'}` : undefined;
  if (kind === 'payout' && ctx.payout) {
    meta.push({ icon: 'date', text: fmtDate(ctx.payout.occurred_at) });
    if (ctx.account) meta.push({ icon: 'account', text: ctx.account.name });
    if (ctx.account?.size) meta.push({ icon: 'size', text: fmtMoney(ctx.account.size, currency, { sign: false }) });
    return { doc, kind, eyebrow, title: `+${fmtMoney(ctx.payout.amount, currency, { sign: false })}`, subtitle: ctx.payout.note || doc.title || undefined, meta, date: ctx.payout.occurred_at };
  }
  if (kind === 'fondeo') {
    if (ctx.funded_at) meta.push({ icon: 'date', text: `Fondeada el ${fmtDate(ctx.funded_at)}` });
    if (ctx.account?.size) meta.push({ icon: 'size', text: fmtMoney(ctx.account.size, currency, { sign: false }) });
    const subtitle = ctx.origen ? `Viene de la evaluación «${ctx.origen.name}»${ctx.origen.purchased_at ? `, comprada el ${fmtDate(ctx.origen.purchased_at)}` : ''}.` : doc.title || undefined;
    return { doc, kind, eyebrow, title: ctx.account?.name || doc.title || 'Cuenta fondeada', subtitle, meta, date: ctx.funded_at || doc.created_at };
  }
  meta.push({ icon: 'date', text: fmtDate(doc.created_at) });
  if (ctx.account) meta.push({ icon: 'account', text: ctx.account.name });
  return { doc, kind, eyebrow, title: doc.title || doc.original_name || 'Documento', meta, date: doc.created_at };
}
