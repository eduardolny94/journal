// Humo animado en un canvas: decenas de "bocanadas" (sprites de nube pre-dibujados) que suben despacio, giran y se
// desvanecen, mezcladas de forma aditiva. Se usa de telón en el visor cinematográfico. Con «reducir movimiento»
// activado dibuja un único fotograma.
import { useEffect, useRef } from 'react';
import { cn } from '../../lib/cn';

export interface SmokeCanvasProps {
  /** Color del humo (RGB). Por defecto, verde-blanco de la marca. */
  tint?: [number, number, number];
  /** Densidad: número de bocanadas (por defecto 64). */
  count?: number;
  /** Intensidad 0-1 (por defecto 0.55). */
  intensity?: number;
  className?: string;
}

interface Puff {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  alpha: number;
  life: number;
  maxLife: number;
  sprite: number;
}

/** Sprite de nube: varias manchas radiales superpuestas para que no parezca un círculo perfecto. */
function makeSprite(size: number, tint: [number, number, number], seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  let s = seed;
  const rnd = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  const [r, g, b] = tint;
  const blobs = 7;
  for (let i = 0; i < blobs; i++) {
    const cx = size / 2 + (rnd() - 0.5) * size * 0.45;
    const cy = size / 2 + (rnd() - 0.5) * size * 0.45;
    const rad = size * (0.22 + rnd() * 0.2);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
    // Centro casi blanco con un poco del tinte; borde transparente.
    grad.addColorStop(0, `rgba(${Math.round(200 + r * 0.2)}, ${Math.round(200 + g * 0.2)}, ${Math.round(200 + b * 0.2)}, 0.55)`);
    grad.addColorStop(0.45, `rgba(${r}, ${g}, ${b}, 0.22)`);
    grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  return c;
}

export default function SmokeCanvas({ tint = [120, 255, 180], count = 64, intensity = 0.55, className }: SmokeCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let w = 0;
    let h = 0;
    let raf = 0;
    let last = performance.now();
    const sprites = [0, 1, 2, 3].map((i) => makeSprite(256, tint, 17 + i * 101));
    const puffs: Puff[] = [];

    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const spawn = (p: Puff, initial: boolean) => {
      p.r = rand(Math.min(w, h) * 0.12, Math.min(w, h) * 0.34);
      p.x = rand(-p.r * 0.3, w + p.r * 0.3);
      p.y = initial ? rand(-p.r, h + p.r) : h + p.r * rand(0.2, 0.9);
      p.vx = rand(-12, 12);
      p.vy = rand(-28, -10);
      p.rot = rand(0, Math.PI * 2);
      p.vr = rand(-0.08, 0.08);
      p.alpha = rand(0.18, 0.42) * intensity;
      p.maxLife = rand(14, 26);
      p.life = initial ? rand(0, p.maxLife) : 0;
      p.sprite = Math.floor(Math.random() * sprites.length);
    };
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!puffs.length) for (let i = 0; i < count; i++) { const p = {} as Puff; spawn(p, true); puffs.push(p); }
    };
    const draw = (dt: number) => {
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      for (const p of puffs) {
        p.life += dt;
        if (p.life > p.maxLife || p.y < -p.r * 1.2) spawn(p, false);
        p.x += p.vx * dt + Math.sin((p.life + p.rot) * 0.6) * 6 * dt;
        p.y += p.vy * dt;
        p.rot += p.vr * dt;
        // Aparece y se desvanece a lo largo de su vida.
        const t = p.life / p.maxLife;
        const env = t < 0.2 ? t / 0.2 : t > 0.75 ? (1 - t) / 0.25 : 1;
        ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha * env));
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.drawImage(sprites[p.sprite], -p.r, -p.r, p.r * 2, p.r * 2);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    };
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!document.hidden) draw(dt);
      raf = requestAnimationFrame(loop);
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    if (reduced) {
      // Un fotograma "maduro": avanzamos la simulación unos segundos y pintamos una vez.
      for (let i = 0; i < 120; i++) draw(0.05);
    } else {
      raf = requestAnimationFrame(loop);
    }
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [tint, count, intensity]);

  return <canvas ref={ref} className={cn('absolute inset-0 h-full w-full', className)} aria-hidden />;
}
