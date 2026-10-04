// Carrusel horizontal sin scroll nativo: una pista que se mueve con `transform` dentro de una ventana fija, de modo que
// ni la página ni el panel que lo contiene se desplazan nunca. Flechas de cristal (visibles siempre que haya más
// tarjetas de las que caben), puntos, arrastre con ratón o dedo, rueda/trackpad horizontal (o Mayús + rueda) y
// teclado: ← → funcionan en cuanto el carrusel está a la vista, sin tener que pulsarlo antes.
import { Children, useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from 'react';
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

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (el as HTMLElement).isContentEditable;
}

export function Carousel({ children, itemClassName = 'w-[300px] sm:w-[340px]', className, ariaLabel }: CarouselProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const items = Children.toArray(children);
  const count = items.length;
  const [index, setIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [maxOffset, setMaxOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startOffset: number; moved: boolean; pointerId: number } | null>(null);
  const indexRef = useRef(0);
  indexRef.current = index;

  /** Ancho total de la pista (último elemento incluido) menos la ventana: hasta dónde se puede desplazar. */
  const computeMax = useCallback(() => {
    const track = trackRef.current;
    const vp = viewportRef.current;
    if (!track || !vp) return 0;
    const last = track.lastElementChild as HTMLElement | null;
    if (!last) return 0;
    const cs = getComputedStyle(vp);
    const inner = vp.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return Math.max(0, last.offsetLeft + last.offsetWidth - inner);
  }, []);

  /** Posición (px) para que el elemento `i` quede al principio, sin dejar hueco al final. */
  const offsetFor = useCallback(
    (i: number) => {
      const track = trackRef.current;
      if (!track) return 0;
      const kids = Array.from(track.children) as HTMLElement[];
      const k = kids[Math.min(Math.max(i, 0), kids.length - 1)];
      return Math.min(k ? k.offsetLeft : 0, computeMax());
    },
    [computeMax],
  );

  const measure = useCallback(() => {
    setMaxOffset(computeMax());
    setOffset(offsetFor(indexRef.current));
  }, [computeMax, offsetFor]);

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

  const goTo = useCallback(
    (i: number) => {
      const next = Math.min(Math.max(i, 0), count - 1);
      setIndex(next);
      setOffset(offsetFor(next));
    },
    [count, offsetFor],
  );
  const canPrev = offset > 1;
  const canNext = offset < maxOffset - 1;
  const overflowing = maxOffset > 1;

  // Teclado global: ← → mueven el carrusel cuando está a la vista, no hay un diálogo abierto y no se está escribiendo.
  useEffect(() => {
    if (!overflowing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (e.defaultPrevented || isTypingTarget(document.activeElement)) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const root = rootRef.current;
      if (!root) return;
      const r = root.getBoundingClientRect();
      const visible = r.bottom > 0 && r.top < window.innerHeight && r.right > 0 && r.left < window.innerWidth;
      if (!visible) return;
      e.preventDefault();
      goTo(indexRef.current + (e.key === 'ArrowRight' ? 1 : -1));
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overflowing, goTo]);

  // Rueda del ratón / trackpad: el desplazamiento horizontal (o vertical con Mayús) mueve la pista y, al parar,
  // encaja en la tarjeta más cercana. Listener nativo porque hay que cancelar el scroll de la página.
  const wheelOffset = useRef(0);
  const wheelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp || !overflowing) return;
    const onWheel = (e: WheelEvent) => {
      const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!horizontal) return;
      e.preventDefault();
      const max = computeMax();
      wheelOffset.current = Math.min(max, Math.max(0, (wheelTimer.current ? wheelOffset.current : offsetFor(indexRef.current)) + horizontal));
      setDragging(true); // sin transición mientras se mueve
      setOffset(wheelOffset.current);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      wheelTimer.current = setTimeout(() => {
        wheelTimer.current = null;
        setDragging(false);
        // Encajar en la tarjeta más cercana a la posición alcanzada.
        const track = trackRef.current;
        if (!track) return;
        const kids = Array.from(track.children) as HTMLElement[];
        let best = 0;
        let bestDist = Infinity;
        kids.forEach((k, i) => {
          const d = Math.abs(k.offsetLeft - wheelOffset.current);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        goTo(best);
      }, 140);
    };
    vp.addEventListener('wheel', onWheel, { passive: false });
    return () => vp.removeEventListener('wheel', onWheel);
  }, [overflowing, computeMax, offsetFor, goTo]);

  // Arrastre: con ratón o con el dedo (pointer events), sin que el navegador haga scroll.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    drag.current = { startX: e.clientX, startOffset: offset, moved: false, pointerId: e.pointerId };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) > 6) {
      d.moved = true;
      setDragging(true);
      try {
        e.currentTarget.setPointerCapture(d.pointerId);
      } catch {
        /* algunos navegadores no lo permiten tras el inicio del gesto */
      }
    }
    if (d.moved) {
      const raw = d.startOffset - dx;
      const clamped = raw < 0 ? raw * 0.3 : raw > maxOffset ? maxOffset + (raw - maxOffset) * 0.3 : raw;
      setOffset(clamped);
    }
  };
  const endDrag = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || !d.moved) return;
    const dx = e.clientX - d.startX;
    // Se mantiene `dragging` un instante para que el clic que cierra el gesto no abra la tarjeta.
    setTimeout(() => setDragging(false), 50);
    if (dx < -40) goTo(index + 1);
    else if (dx > 40) goTo(index - 1);
    else goTo(index);
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (dragging) {
      e.stopPropagation();
      e.preventDefault();
    }
  };

  if (count === 0) return null;

  return (
    <div ref={rootRef} className={cn('group/carousel relative', className)}>
      <div
        ref={viewportRef}
        role="region"
        aria-label={ariaLabel}
        aria-roledescription="carrusel"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onClickCapture={onClickCapture}
        className={cn('w-full overflow-hidden px-1 pb-3 pt-1', dragging ? 'cursor-grabbing select-none' : overflowing ? 'cursor-grab' : '')}
        style={{ touchAction: 'pan-y' }}
      >
        <div
          ref={trackRef}
          className={cn('flex', !dragging && 'transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]')}
          style={{ gap: GAP, transform: `translate3d(${-offset}px, 0, 0)` }}
        >
          {items.map((child, i) => (
            <div key={i} className={cn('shrink-0', itemClassName)}>
              {child}
            </div>
          ))}
        </div>
      </div>
      {overflowing && (
        <>
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            disabled={!canPrev}
            className="liquid-glass absolute left-1 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white shadow-lg transition hover:bg-black/70 disabled:cursor-default disabled:opacity-25 sm:left-2 sm:h-11 sm:w-11"
            aria-label="Anterior"
            title="Anterior (←)"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            disabled={!canNext}
            className="liquid-glass absolute right-1 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-white shadow-lg transition hover:bg-black/70 disabled:cursor-default disabled:opacity-25 sm:right-2 sm:h-11 sm:w-11"
            aria-label="Siguiente"
            title="Siguiente (→)"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        </>
      )}
      {count > 1 && (
        <div className="mt-1 flex items-center justify-center gap-1.5" aria-hidden>
          {items.map((_, i) => (
            <button key={i} type="button" tabIndex={-1} onClick={() => goTo(i)} className={cn('h-1.5 rounded-full transition-all', i === index ? 'w-5 bg-accent' : 'w-1.5 bg-gray-700 hover:bg-gray-500')} />
          ))}
        </div>
      )}
    </div>
  );
}

export default Carousel;
