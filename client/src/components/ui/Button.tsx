import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warn';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-black font-semibold hover:bg-accent-soft focus-visible:ring-accent/60 shadow-[0_0_20px_-6px_rgba(22,245,122,0.7)]',
  secondary: 'bg-panel border border-border text-gray-200 hover:bg-gray-800 hover:border-gray-600 focus-visible:ring-gray-500/60',
  ghost: 'bg-transparent text-gray-300 hover:bg-gray-800/70 hover:text-white focus-visible:ring-gray-500/60',
  danger: 'bg-loss/15 text-loss border border-loss/40 hover:bg-loss/25 focus-visible:ring-loss/60',
  success: 'bg-profit/15 text-profit border border-profit/40 hover:bg-profit/25 focus-visible:ring-profit/60',
  warn: 'bg-warn/15 text-warn border border-warn/40 hover:bg-warn/25 focus-visible:ring-warn/60',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-9 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-base gap-2',
  icon: 'h-9 w-9 p-0',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, leftIcon, rightIcon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-md font-medium transition-colors select-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : leftIcon}
      {children}
      {!loading && rightIcon}
    </button>
  );
});

export default Button;
