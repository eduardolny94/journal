import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type BadgeVariant = 'default' | 'accent' | 'profit' | 'loss' | 'warn' | 'outline';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  /** Color personalizado (hex); se usa como fondo translúcido + texto */
  color?: string;
  dot?: boolean;
  size?: 'sm' | 'md';
  children?: ReactNode;
}

const variants: Record<BadgeVariant, string> = {
  default: 'bg-gray-800 text-gray-300 border-gray-700',
  accent: 'bg-accent/15 text-accent-soft border-accent/30',
  profit: 'bg-profit/15 text-profit border-profit/30',
  loss: 'bg-loss/15 text-loss border-loss/30',
  warn: 'bg-warn/15 text-warn border-warn/30',
  outline: 'bg-transparent text-gray-300 border-border',
};

function hexToRgba(hex: string, alpha: number): string {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  return `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})`;
}

export function Badge({ variant = 'default', color, dot = false, size = 'sm', className, style, children, ...rest }: BadgeProps) {
  const customStyle: CSSProperties | undefined = color
    ? { backgroundColor: hexToRgba(color, 0.15), color, borderColor: hexToRgba(color, 0.4), ...style }
    : style;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium whitespace-nowrap',
        size === 'sm' ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs',
        !color && variants[variant],
        className,
      )}
      style={customStyle}
      {...rest}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

/** Badge para el lado de la operación. */
export function SideBadge({ side }: { side: 'long' | 'short' }) {
  return <Badge variant={side === 'long' ? 'profit' : 'loss'}>{side === 'long' ? 'LONG' : 'SHORT'}</Badge>;
}

export default Badge;
