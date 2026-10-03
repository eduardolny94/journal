// Carrusel horizontal sin scroll nativo: una pista que se mueve con `transform` dentro de una ventana fija, de modo que
// ni la página ni el panel que lo contiene se desplazan nunca (el scroll-snap del navegador arrastraba a los
// contenedores). Flechas de cristal, puntos, arrastre con ratón o dedo y teclado (← →).
import { Children, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface CarouselProps {
  children: ReactNode;
  /** Clases del envoltorio de cada elemento (ancho de la tarjeta). */
  itemClassName?: string;
  className?: string;
  ariaLabel?: string;
}

const GAP = 20; // px, igual que gap-5

export function Carousel({ children, itemClassName = 'w-[300px] sm:w-[340px]', className, ariaLabel }: CarouselProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children);
  const count = items.length;
  const [index, setIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [maxOffset, setMaxOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startOffset: number; moved: boolean; pointerId: number } | null>(null);

  /** Posición (px) a la que hay que llevar la pista para que el elemento `i` quede al principio, sin dejar hueco al final. */
  const offsetFor = useCallback(
    (i: number) => {
      const track = trackRef.current;
      const vp = viewportRef.current;
      if (!track || !vp) return 0;
      const kids = Array.from(track.children) as HTMLElement[];
      const k = kids[Math.min(Math.max(i, 0), kids.length - 1)];
      const max = Math.max(0, track.scrollWidth - vp.clientWidth);
      return Math.min(k ? k.offsetLeft : 0, max);
    },
    [],
  );

  const measure = useCallback(() => {
    const track = trackRef.current;
    const vp = viewportRef.current;
    if (!track || !vp) return;
    setMaxOffset(Math.max(0, track.scrollWidth - vp.clientWidth));
    setOffset(offsetFor(index));
  }, [index, offsetFor]);

  useLayoutEffect(() => {
    measure();
  }, [measure, count]);

  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const ro = new ResizeObserver(measure);
    ro.observe(vp);
    return () => ro.disconnect();
  }, [measure]);

  const goTo = (i: number) => {
    const next = Math.min(Math.max(i, 0), count - 1);
    setIndex(next);
    setOffset(offsetFor(next));
  };
  const canPrev = offset > 1;
  const canNext = offset < maxOffset - 1;

  // Arrastre: con ratón o con el dedo (pointer events), sin que el navegador haga scroll.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { startX: e.clientX, startOffset: offset, moved: false, pointerId: e.pointerId };
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true;
      (e.currentTarget as HTMLElement).setPointerCapture(d.pointerId);
    }
    if (d.moved) {
      const raw = d.startOffset - dx;
      // Resistencia en los extremos.
      const clamped = raw < 0 ? raw * 0.3 : raw > maxOffset ? maxOffset + (raw - maxOffset) * 0.3 : raw;
      setOffset(clamped);
    }
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    if (!d.moved) return;
    const dx = e.clientX - d.startX;
    if (dx < -40) goTo(index + 1);
    else if (dx > 40) goTo(index - 1);
    else goTo(index);
  };
  const onClickCapture = (e: React.MouseEvent) => {
    // Tras arrastrar, el clic no debe abrir la tarjeta.
    if (dragging || drag.current?.moved) {
      e.stopPropagation();
      e.preventDefault();
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); goTo(index + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); goTo(index - 1); }
  };

  if (count === 0) return null;

  return (
    <div className={cn('group/carousel relative', className)}>
      <div
        ref={viewportRef}
        role="region"
        aria-label={ariaLabel}
        aria-roledescription="carrusel"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        className={cn('w-full overflow-hidden px-1 pb-3 pt-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50', dragging ? 'cursor-grabbing select-none' : 'cursor-grab')}
        style={{ touchAction: 'pan-y' }}
      >
        <div
          ref={trackRef}
          className={cn('flex will-change-transform', !dragging && 'transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]')}
          style={{ gap: GAP, transform: `translate3d(${-offset}px, 0, 0)` }}
        >
          {items.map((child, i) => (
            <div key={i} className={cn('shrink-0', itemClassName)} aria-hidden={i !== index ? undefined : undefined}>
              {child}
            </div>
          ))}
        </div>
      </div>
      {count > 1 && (
        <>
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={!canPrev}
            className="liquid-glass absolute left-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60 disabled:opacity-0 sm:inline-flex"
            aria-label="Anterior"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={!canNext}
            className="liquid-glass absolute right-2 top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/40 text-white transition hover:bg-black/60 disabled:opacity-0 sm:inline-flex"
            aria-label="Siguiente"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
          <div className="mt-1 flex items-center justify-center gap-1.5" aria-hidden>
            {items.map((_, i) => (
              <button key={i} type="button" tabIndex={-1} onClick={() => goTo(i)} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-accent' : 'w-1.5 bg-gray-700 hover:bg-gray-500')} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default Carousel;
