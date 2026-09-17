// Visor de imágenes a pantalla completa: teclado (Esc / ← / →), botones, miniaturas y gesto de
// deslizar en táctil. Se monta en un portal sobre toda la página.
import { useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { TradeImage } from '../TradeRow';

export interface LightboxProps {
  images: TradeImage[];
  /** Índice de la imagen visible; null = cerrado */
  index: number | null;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

const SWIPE_PX = 50;

export default function Lightbox({ images, index, onClose, onIndexChange }: LightboxProps) {
  const count = images.length;
  const open = index !== null && count > 0;
  const safeIndex = open ? Math.min(Math.max(0, index), count - 1) : 0;
  const current = open ? images[safeIndex] : null;
  const startX = useRef<number | null>(null);

  const go = useCallback(
    (delta: number) => {
      if (!open || count < 2) return;
      onIndexChange((((safeIndex + delta) % count) + count) % count);
    },
    [open, count, safeIndex, onIndexChange],
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, go, onClose]);

  if (!open || !current) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur-sm text-gray-200 select-none"
      role="dialog"
      aria-modal="true"
      aria-label="Galería de capturas"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex items-center gap-3 px-4 h-12 shrink-0">
        <span className="text-xs text-gray-400 tnum">
          {safeIndex + 1} / {count}
        </span>
        {current.caption && <span className="text-sm text-gray-200 truncate">{current.caption}</span>}
        <span className="ml-auto hidden sm:inline text-[11px] text-gray-500">Esc para cerrar · ← → para navegar</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md p-1.5 text-gray-300 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          aria-label="Cerrar galería"
          autoFocus
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <div
        className="relative flex-1 min-h-0 flex items-center justify-center px-2 sm:px-14"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        onPointerDown={(e) => {
          startX.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (startX.current === null) return;
          const dx = e.clientX - startX.current;
          startX.current = null;
          if (Math.abs(dx) >= SWIPE_PX) go(dx < 0 ? 1 : -1);
        }}
      >
        {count > 1 && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 border border-white/10 p-2 text-gray-200 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label="Imagen anterior"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <img
          key={current.id}
          src={current.path}
          alt={current.caption || `Captura ${safeIndex + 1}`}
          className="max-h-full max-w-full object-contain rounded shadow-2xl"
          draggable={false}
        />
        {count > 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 rounded-full bg-black/60 border border-white/10 p-2 text-gray-200 hover:bg-white/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            aria-label="Imagen siguiente"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>

      {count > 1 && (
        <div className="shrink-0 flex justify-center gap-1.5 px-4 py-3 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => onIndexChange(i)}
              className={cn(
                'h-12 w-16 shrink-0 overflow-hidden rounded border transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                i === safeIndex ? 'border-accent opacity-100' : 'border-white/10 opacity-50 hover:opacity-90',
              )}
              aria-label={`Ver captura ${i + 1}`}
              aria-current={i === safeIndex}
            >
              <img src={img.path} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} />
            </button>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
