import type { CSSProperties } from 'react';
import { cn } from '../../lib/cn';

/** Bloque de carga (placeholder animado). Es un <span> para poder ir dentro de <p>. */
export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span className={cn('inline-block animate-pulse rounded-md bg-gray-800/80 align-middle', className)} style={style} aria-hidden />;
}

export default Skeleton;
