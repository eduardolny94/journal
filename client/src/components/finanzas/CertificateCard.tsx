// Tarjeta iluminada para un certificado de cuenta fondeada o un comprobante de payout: borde con degradado,
// halo que alumbra el fondo, brillo que recorre la imagen al pasar el ratón y entrada escalonada.
// `DocumentLightbox` abre la imagen a tamaño completo (los PDF se abren en una pestaña nueva).
import type { CSSProperties } from 'react';
import { Award, Banknote, ExternalLink, FileText, Trash2 } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { cn } from '../../lib/cn';
import { fmtDate, fmtMoney } from '../../lib/format';
import { isPdf, type AccountDocument } from '../../lib/finanzas';

export type CertificateVariant = 'fondeo' | 'payout' | 'otro';

export interface CertificateCardProps {
  doc: AccountDocument;
  variant: CertificateVariant;
  /** Posición en la galería: fija el retraso de la animación de entrada. */
  index?: number;
  account?: { name: string; firm?: string | null; size?: number | null; currency?: string | null } | null;
  payout?: { amount: number; gross_amount?: number | null; currency?: string | null; occurred_at: string } | null;
  onOpen?: (doc: AccountDocument) => void;
  onDelete?: (doc: AccountDocument) => void;
  className?: string;
}

const FRAME: Record<CertificateVariant, string> = {
  fondeo: 'from-accent/60 via-accent/10 to-transparent glow-accent',
  payout: 'from-profit/60 via-profit/10 to-transparent glow-profit',
  otro: 'from-warn/50 via-warn/10 to-transparent glow-warn',
};
const LIGHT: Record<CertificateVariant, string> = {
  fondeo: 'bg-[radial-gradient(ellipse_at_top,rgba(22,245,122,0.22),transparent_60%)]',
  payout: 'bg-[radial-gradient(ellipse_at_top,rgba(34,211,111,0.22),transparent_60%)]',
  otro: 'bg-[radial-gradient(ellipse_at_top,rgba(245,180,0,0.18),transparent_60%)]',
};

export function CertificateCard({ doc, variant, index = 0, account, payout, onOpen, onDelete, className }: CertificateCardProps) {
  const pdf = isPdf(doc);
  const currency = payout?.currency || account?.currency || doc.account_currency || 'USD';
  const title = doc.title || (variant === 'fondeo' ? 'Certificado de cuenta fondeada' : variant === 'payout' ? 'Comprobante de payout' : doc.original_name || 'Documento');
  const style = { '--rise-delay': `${Math.min(index, 12) * 90}ms` } as CSSProperties;

  return (
    <article
      className={cn('animate-rise group relative rounded-2xl bg-gradient-to-b p-px transition-shadow duration-500', FRAME[variant], className)}
      style={style}
    >
      <div className="relative overflow-hidden rounded-[15px] bg-[#070d0a]">
        <div className={cn('pointer-events-none absolute inset-0', LIGHT[variant])} aria-hidden />

        <button
          type="button"
          onClick={() => onOpen?.(doc)}
          className="relative block aspect-[4/3] w-full overflow-hidden bg-black focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          aria-label={`Ver ${title}`}
        >
          {pdf ? (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-accent-soft">
              <FileText className="h-12 w-12 drop-shadow-[0_0_18px_rgba(22,245,122,0.45)]" aria-hidden />
              <span className="text-[11px] uppercase tracking-[0.2em] text-white/60">Documento PDF</span>
            </div>
          ) : (
            <img src={doc.path} alt={title} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]" />
          )}
          <span className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/15 to-transparent opacity-0 group-hover:opacity-100 group-hover:shine-sweep" aria-hidden />
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#070d0a] via-[#070d0a]/70 to-transparent" aria-hidden />
        </button>

        <div className="relative -mt-8 px-4 pb-4">
          {variant === 'fondeo' ? (
            <Badge variant="accent" className="backdrop-blur"><Award className="h-3 w-3" aria-hidden /> Cuenta fondeada</Badge>
          ) : variant === 'payout' ? (
            <Badge variant="profit" className="backdrop-blur"><Banknote className="h-3 w-3" aria-hidden /> Payout</Badge>
          ) : (
            <Badge variant="warn" className="backdrop-blur">Documento</Badge>
          )}

          <p className="mt-2 truncate text-sm font-semibold tracking-tight text-white" title={account?.name || title}>{account?.name || title}</p>
          <p className="truncate text-xs text-white/50">
            {account?.firm ? `${account.firm}` : ''}
            {account?.firm && account?.size ? ' · ' : ''}
            {account?.size ? fmtMoney(account.size, currency, { sign: false }) : ''}
            {!account?.firm && !account?.size ? doc.original_name : ''}
          </p>

          {variant === 'payout' && payout ? (
            <div className="mt-2">
              <p className="text-2xl font-semibold tracking-tight text-profit text-glow-profit tnum">+{fmtMoney(payout.amount, currency, { sign: false })}</p>
              {payout.gross_amount ? <p className="text-[11px] text-white/40 tnum">bruto {fmtMoney(payout.gross_amount, currency, { sign: false })}</p> : null}
            </div>
          ) : variant === 'fondeo' && account?.size ? (
            <p className="mt-2 text-lg font-medium tracking-tight text-accent-soft text-glow-accent tnum">{fmtMoney(account.size, currency, { sign: false })}</p>
          ) : null}

          <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-white/40">
            <span className="tnum">{fmtDate(payout?.occurred_at || doc.created_at)}</span>
            <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <a href={doc.path} target="_blank" rel="noopener" className="rounded p-1 hover:bg-white/10 hover:text-white" title="Abrir en una pestaña" aria-label="Abrir en una pestaña">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              {onDelete && (
                <button type="button" onClick={() => onDelete(doc)} className="rounded p-1 hover:bg-loss/20 hover:text-loss" title="Eliminar" aria-label="Eliminar documento">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

export interface DocumentLightboxProps {
  doc: AccountDocument | null;
  onClose: () => void;
}

/** Visor a pantalla casi completa. Los PDF no se incrustan (la CSP lo impide): se abren en una pestaña nueva. */
export function DocumentLightbox({ doc, onClose }: DocumentLightboxProps) {
  if (!doc) return null;
  const pdf = isPdf(doc);
  return (
    <Modal
      open={!!doc}
      onClose={onClose}
      size="xl"
      title={doc.title || doc.original_name || 'Documento'}
      description={[doc.account_name, doc.account_firm, fmtDate(doc.created_at)].filter(Boolean).join(' · ')}
      className="border-accent/30 glow-accent"
      footer={
        <Button variant="secondary" size="sm" onClick={() => window.open(doc.path, '_blank', 'noopener')} leftIcon={<ExternalLink className="h-3.5 w-3.5" />}>
          Abrir en una pestaña
        </Button>
      }
    >
      <div className="bg-spotlight flex min-h-[320px] items-center justify-center rounded-lg bg-black p-2">
        {pdf ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <FileText className="h-16 w-16 text-accent-soft drop-shadow-[0_0_24px_rgba(22,245,122,0.5)]" aria-hidden />
            <p className="text-sm text-gray-300">Este documento es un PDF. Ábrelo en una pestaña para verlo completo.</p>
          </div>
        ) : (
          <img src={doc.path} alt={doc.title || doc.original_name} className="max-h-[70vh] w-auto max-w-full rounded-md object-contain shadow-[0_0_60px_-10px_rgba(22,245,122,0.45)]" />
        )}
      </div>
    </Modal>
  );
}

export default CertificateCard;
