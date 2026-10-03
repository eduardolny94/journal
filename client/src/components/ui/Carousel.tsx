// Carrusel horizontal: los elementos van uno al lado del otro, con desplazamiento por tarjeta (snap), flechas de
// cristal a los lados, contador y arrastre con el ratón. En móvil se desliza con el dedo.
import { Children, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface CarouselProps {
  children: ReactNode;
  /** Clases del envoltorio de cada elemento (ancho de la tarjeta). */
  itemClassName?: string;
  className?: string;
  ariaLabel?: string;
}

export function Carousel({ children, itemClassName = 'w-[300px] sm:w-[340px]', className, ariaLabel }: CarouselProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ canPrev: false, canNext: false, index: 0 });
  const items = Children.toArray(children);
  const count = items.length;

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const kids = Array.from(el.children) as HTMLElement[];
    let index = 0;
    for (let i = 0; i < kids.length; i++) if (kids[i].offsetLeft - el.scrollLeft <= 8) index = i;
    setState({ canPrev: el.scrollLeft > 4, canNext: el.scrollLeft < max - 4, index });
  }, []);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [measure, count]);

  const go = (dir: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    const kids = Array.from(el.children) as HTMLElement[];
    const target = Math.min(count - 1, Math.max(0, state.index + dir));
    const k = kids[target];
    if (k) el.scrollTo({ left: k.offsetLeft, behavior: 'smooth' });
  };

  // Arrastre con el ratón en escritorio.
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const onMouseDown = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || e.button !== 0) return;
    drag.current = { x: e.clientX, left: el.scrollLeft, moved: false };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || !drag.current) return;
    const dx = e.clientX - drag.current.x;
    if (Math.abs(dx) > 4) drag.current.moved = true;
    if (drag.current.moved) {
      el.scrollLeft = drag.current.left - dx;
      e.preventDefault();
    }
  };
  const endDrag = () => {
    drag.current = null;
  };

  if (count === 0) return null;

  return (
    <div className={cn('group/carousel relative', className)}>
      <div
        ref={ref}
        role="region"
        aria-label={ariaLabel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
        onClickCapture={(e) => {
          // Si se arrastró, no disparar el clic de la tarjeta.
          if (drag.current?.moved) e.stopPropagation();
        }}
        className="flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-1 pb-3 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((child, i) => (
          <div key={i} className={cn('shrink-0 snap-start', itemClassName)}>
            {child}
          </div>
        ))}
      </div>
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={!state.canPrev}
            className="liquid-glass absolute left-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60 disabled:opacity-0 sm:inline-flex"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={!state.canNext}
            className="liquid-glass absolute right-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60 disabled:opacity-0 sm:inline-flex"
            aria-label="Siguiente"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <div className="mt-1 flex items-center justify-center gap-1.5" aria-hidden>
            {items.map((_, i) => (
              <span key={i} className={cn('h-1.5 rounded-full transition-all', i === state.index ? 'w-5 bg-accent' : 'w-1.5 bg-gray-700')} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default Carousel;
