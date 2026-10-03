// Escena espacial del visor, como en la referencia: un clip real de un planeta en bucle llena la pantalla sobre un
// cielo con el resplandor verde de la marca. El color sale de la propia imagen del documento (Apex azul, Lucid gris…):
// se leen sus píxeles, se busca el tono dominante, se elige el planeta más parecido (Tierra para azules y verdes,
// Venus para amarillos y naranjas, Marte para rojos) y se afina el matiz con un filtro para que coincida con la firma.
// El giro es suave, así que se mantiene incluso con «reducir movimiento»; si el navegador no deja reproducir el clip
// (ahorro de batería, bloqueo de autoplay) se usa el recorte fijo del planeta.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { cn } from '../../lib/cn';

export type RGB = [number, number, number];

export interface PlanetBackdropProps {
  /** Imagen de la que se extrae el color (mismo origen). Sin imagen, se usa `fallback`. */
  imageSrc?: string | null;
  fallback?: RGB;
  /** Se llama con el color elegido (para teñir otros elementos de la escena). */
  onColor?: (color: RGB) => void;
  className?: string;
}

const BRAND: RGB = [22, 245, 122];

/** Planetas disponibles (client/public/planets) con su matiz natural dominante. */
const PLANETS = [
  { key: 'tierra', hue: 205 },
  { key: 'venus', hue: 38 },
  { key: 'marte', hue: 16 },
] as const;

function rgbToHsv([r, g, b]: RGB): [number, number, number] {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, max === 0 ? 0 : d / max, max];
}

function hsvToRgb(h: number, s: number, v: number): RGB {
  const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** Color dominante: el matiz más presente entre los píxeles saturados; si casi no hay color, un gris plateado. */
export function dominantColor(img: HTMLImageElement): RGB {
  const S = 48;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  if (!ctx) return BRAND;
  ctx.drawImage(img, 0, 0, S, S);
  let data: Uint8ClampedArray;
  try {
    data = ctx.getImageData(0, 0, S, S).data;
  } catch {
    return BRAND; // imagen de otro origen
  }
  const bins = new Array(12).fill(0).map(() => ({ w: 0, r: 0, g: 0, b: 0 }));
  let saturated = 0, total = 0, valueSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const px: RGB = [data[i], data[i + 1], data[i + 2]];
    const [h, s, v] = rgbToHsv(px);
    total++;
    valueSum += v;
    if (s > 0.28 && v > 0.18 && v < 0.97) {
      saturated++;
      const w = s * v;
      const bin = bins[Math.floor(h / 30) % 12];
      bin.w += w; bin.r += px[0] * w; bin.g += px[1] * w; bin.b += px[2] * w;
    }
  }
  if (saturated / total >= 0.04) {
    const top = bins.reduce((a, b) => (b.w > a.w ? b : a), bins[0]);
    const [h, s] = rgbToHsv([top.r / top.w, top.g / top.w, top.b / top.w]);
    return hsvToRgb(h, Math.max(0.55, Math.min(0.9, s)), 0.92);
  }
  const v = Math.min(0.85, Math.max(0.55, valueSum / total + 0.3));
  return [Math.round(170 * v), Math.round(178 * v), Math.round(190 * v)];
}

/** Elige el planeta más cercano al color y el filtro que lo lleva exactamente a ese tono. */
export function planetFor(color: RGB): { key: (typeof PLANETS)[number]['key']; filter: string } {
  const [h, s] = rgbToHsv(color);
  if (s < 0.2) return { key: 'tierra', filter: 'saturate(0.12) brightness(1.05) contrast(1.05)' }; // gris/plata
  const dist = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
  const best = PLANETS.reduce((acc, p) => (dist(h, p.hue) < dist(h, acc.hue) ? p : acc), PLANETS[0]);
  let rot = h - best.hue;
  if (rot > 180) rot -= 360;
  if (rot < -180) rot += 360;
  return { key: best.key, filter: `hue-rotate(${Math.round(rot)}deg) saturate(${(1 + s * 0.4).toFixed(2)})` };
}

function drawStars(canvas: HTMLCanvasElement, color: RGB) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = (canvas.width = canvas.clientWidth || 1280);
  const h = (canvas.height = canvas.clientHeight || 720);
  ctx.fillStyle = '#020403';
  ctx.fillRect(0, 0, w, h);
  const g1 = ctx.createRadialGradient(w * 0.12, h * 0.08, 0, w * 0.12, h * 0.08, Math.max(w, h) * 0.75);
  g1.addColorStop(0, `rgba(${BRAND.join(',')},0.22)`);
  g1.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g1; ctx.fillRect(0, 0, w, h);
  const g2 = ctx.createRadialGradient(w * 0.9, h * 0.95, 0, w * 0.9, h * 0.95, Math.max(w, h) * 0.6);
  g2.addColorStop(0, `rgba(${color.join(',')},0.16)`);
  g2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g2; ctx.fillRect(0, 0, w, h);
  let s = 99;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 520; i++) {
    const x = rnd() * w, y = rnd() * h, r = rnd() * 1.5 + 0.2, a = 0.3 + rnd() * 0.7;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
}

export default function PlanetBackdrop({ imageSrc, fallback = BRAND, onColor, className }: PlanetBackdropProps) {
  const [color, setColor] = useState<RGB>(fallback);
  const [videoOk, setVideoOk] = useState(true);
  const starsRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!imageSrc) { setColor(fallback); return; }
    let alive = true;
    const img = new Image();
    img.onload = () => { if (alive) setColor(dominantColor(img)); };
    img.onerror = () => { if (alive) setColor(fallback); };
    img.src = imageSrc;
    return () => { alive = false; };
  }, [imageSrc, fallback]);

  useEffect(() => { onColor?.(color); }, [color, onColor]);

  useEffect(() => {
    const c = starsRef.current;
    if (!c) return;
    drawStars(c, color);
    const ro = new ResizeObserver(() => drawStars(c, color));
    ro.observe(c);
    return () => ro.disconnect();
  }, [color]);

  const planet = useMemo(() => planetFor(color), [color]);

  // Arrancar el clip de forma explícita (el visor se abre tras un clic, así que el autoplay silencioso está permitido);
  // si el navegador lo rechaza, pasamos al recorte fijo en vez de quedarnos con el póster quieto.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let alive = true;
    const tryPlay = () => {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => { if (alive && document.visibilityState === 'visible') setVideoOk(false); });
    };
    tryPlay();
    const onVis = () => { if (document.visibilityState === 'visible') tryPlay(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; document.removeEventListener('visibilitychange', onVis); };
  }, [planet.key, videoOk]);
  const rgba = (a: number) => `rgba(${color.join(',')},${a})`;
  const media: CSSProperties = { filter: planet.filter };

  return (
    <div className={cn('absolute inset-0 overflow-hidden bg-black', className)} aria-hidden>
      <canvas ref={starsRef} className="absolute inset-0 h-full w-full" />
      {videoOk ? (
        // El clip llena la pantalla, como en la referencia; se mezcla en «pantalla» para que su negro deje ver las estrellas.
        <video
          key={planet.key}
          ref={videoRef}
          className="absolute inset-0 h-full w-full object-cover mix-blend-screen"
          style={media}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={`/planets/${planet.key}-poster.jpg`}
          onError={() => setVideoOk(false)}
        >
          <source src={`/planets/${planet.key}.webm`} type="video/webm" />
          <source src={`/planets/${planet.key}.mp4`} type="video/mp4" />
        </video>
      ) : (
        <img src={`/planets/${planet.key}.webp`} alt="" className="absolute left-1/2 top-1/2 h-auto w-[min(120vmin,1100px)] -translate-x-1/2 -translate-y-1/2" style={media} />
      )}
      {/* Halo del color de la firma alrededor del planeta y velo verde arriba a la izquierda */}
      <div className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(ellipse at 50% 55%, transparent 38%, ${rgba(0.0)} 55%, rgba(0,0,0,0.55) 100%)` }} />
    </div>
  );
}
