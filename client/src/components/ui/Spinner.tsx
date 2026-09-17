import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Texto opcional debajo */
  label?: string;
}

const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' };

export function Spinner({ size = 'md', className, label }: SpinnerProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 text-gray-400', className)} role="status" aria-live="polite">
      <Loader2 className={cn('animate-spin', sizes[size])} aria-hidden />
      {label && <span className="text-xs">{label}</span>}
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

/** Spinner centrado que ocupa una zona de la página. */
export function PageSpinner({ label = 'Cargando…' }: { label?: string }) {
  return <Spinner size="lg" label={label} className="py-16" />;
}

export default Spinner;
