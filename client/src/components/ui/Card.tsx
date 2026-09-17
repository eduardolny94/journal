import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Contenido a la derecha del título (botones, filtros...) */
  actions?: ReactNode;
  /** Sin padding interno (para tablas a sangre) */
  flush?: boolean;
  footer?: ReactNode;
}

export function Card({ title, subtitle, actions, flush = false, footer, className, children, ...rest }: CardProps) {
  const hasHeader = title || subtitle || actions;
  return (
    <div className={cn('rounded-lg border border-border bg-panel shadow-sm', className)} {...rest}>
      {hasHeader && (
        <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div className="min-w-0">
            {title && <h3 className="text-sm font-semibold text-gray-100 truncate">{title}</h3>}
            {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      <div className={cn(!flush && 'p-4')}>{children}</div>
      {footer && <div className="border-t border-border px-4 py-3 text-xs text-gray-400">{footer}</div>}
    </div>
  );
}

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  valueClassName?: string;
  className?: string;
}

/** Tarjeta compacta para métricas (P&L del día, win rate, etc.). */
export function StatCard({ label, value, hint, icon, valueClassName, className }: StatCardProps) {
  return (
    <div className={cn('rounded-lg border border-border bg-panel p-4 flex items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <p className="text-xs uppercase tracking-wide text-gray-400">{label}</p>
        <p className={cn('mt-1 text-2xl font-semibold tnum text-gray-100 truncate', valueClassName)}>{value}</p>
        {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
      </div>
      {icon && <div className="text-gray-500 shrink-0">{icon}</div>}
    </div>
  );
}

export default Card;
