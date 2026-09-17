// Logo de Global Traders FX: escudo gris acero con velas y flecha en verde neón + wordmark.
// Si tienes el PNG oficial, colócalo en client/public/logo.png y pasa `image` para usarlo.
import { useState } from 'react';
import { cn } from '../lib/cn';

interface BrandLogoProps {
  className?: string;
  /** Alto del escudo en px (el texto escala en proporción). */
  size?: number;
  /** Solo el escudo, sin texto. */
  markOnly?: boolean;
  /** Ruta a una imagen oficial (p. ej. "/logo.png") en lugar del escudo SVG. */
  image?: string;
}

export function BrandMark({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('shrink-0', className)}
      aria-hidden
    >
      <defs>
        <linearGradient id="gtfx-steel" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b6570" />
          <stop offset="0.5" stopColor="#2d343a" />
          <stop offset="1" stopColor="#151a1e" />
        </linearGradient>
        <linearGradient id="gtfx-green" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#0fbf5e" />
          <stop offset="1" stopColor="#16f57a" />
        </linearGradient>
      </defs>
      <path
        d="M32 3 L56 11 V31 C56 45 46 55 32 61 C18 55 8 45 8 31 V11 Z"
        fill="url(#gtfx-steel)"
        stroke="#16f57a"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <path d="M32 8 L51 14.5 V31 C51 42 43 50 32 55 C21 50 13 42 13 31 V14.5 Z" fill="#0b100d" opacity="0.55" />
      <g stroke="url(#gtfx-green)" strokeWidth="3" strokeLinecap="round">
        <line x1="22" y1="24" x2="22" y2="42" />
        <line x1="31" y1="18" x2="31" y2="40" />
        <line x1="40" y1="26" x2="40" y2="36" />
      </g>
      <g fill="url(#gtfx-green)">
        <rect x="19" y="29" width="6" height="9" rx="1" />
        <rect x="28" y="23" width="6" height="11" rx="1" />
        <rect x="37" y="29" width="6" height="5" rx="1" />
      </g>
      <path d="M17 45 L27 36 L34 41 L46 26" stroke="#16f57a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M40 25 H47 V32" stroke="#16f57a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

export default function BrandLogo({ className, size = 40, markOnly = false, image = '/logo.png' }: BrandLogoProps) {
  const textScale = size / 40;
  // Si existe client/public/logo.png (logo oficial) se usa; si no, el escudo SVG.
  const [imgOk, setImgOk] = useState(true);
  return (
    <span className={cn('inline-flex items-center gap-3 select-none', className)}>
      {image && imgOk ? (
        <img src={image} alt="Global Traders FX" style={{ height: size }} className="shrink-0" onError={() => setImgOk(false)} />
      ) : (
        <BrandMark size={size} />
      )}
      {!markOnly && (
        <span className="flex flex-col leading-none" style={{ fontSize: `${textScale}rem` }}>
          <span className="font-black uppercase tracking-[0.18em] text-white text-[0.95em]">Global</span>
          <span className="flex items-baseline gap-1">
            <span className="font-extrabold uppercase italic tracking-[0.12em] text-white text-[0.95em]">Traders</span>
            <span className="font-black italic text-accent text-glow-accent text-[1.05em]">FX</span>
          </span>
        </span>
      )}
    </span>
  );
}
