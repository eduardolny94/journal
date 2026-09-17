import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Ancho completo del contenedor */
  className?: string;
}

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'>, FieldProps {
  inputClassName?: string;
  leftAddon?: ReactNode;
  rightAddon?: ReactNode;
}

export const inputBase =
  'w-full rounded-md border border-border bg-bg px-3 py-2 text-sm text-gray-100 placeholder:text-gray-500 ' +
  'transition-colors focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/30 ' +
  'disabled:opacity-50 disabled:cursor-not-allowed tnum';

export function FieldWrapper({
  id,
  label,
  hint,
  error,
  className,
  children,
}: FieldProps & { id?: string; children: ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && (
        <label htmlFor={id} className="text-xs font-medium text-gray-300">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-loss">{error}</p>
      ) : hint ? (
        <p className="text-xs text-gray-500">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, hint, error, className, inputClassName, leftAddon, rightAddon, id: idProp, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp || autoId;
  const control = (
    <input
      ref={ref}
      id={id}
      aria-invalid={!!error}
      className={cn(inputBase, error && 'border-loss focus:border-loss focus:ring-loss/30', leftAddon && 'pl-9', rightAddon && 'pr-10', inputClassName)}
      {...rest}
    />
  );
  return (
    <FieldWrapper id={id} label={label} hint={hint} error={error} className={className}>
      {leftAddon || rightAddon ? (
        <div className="relative">
          {leftAddon && (
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-500">{leftAddon}</span>
          )}
          {control}
          {rightAddon && <span className="absolute inset-y-0 right-3 flex items-center text-gray-500 text-xs">{rightAddon}</span>}
        </div>
      ) : (
        control
      )}
    </FieldWrapper>
  );
});

export interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>, FieldProps {
  textareaClassName?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, hint, error, className, textareaClassName, id: idProp, rows = 4, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp || autoId;
  return (
    <FieldWrapper id={id} label={label} hint={hint} error={error} className={className}>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        aria-invalid={!!error}
        className={cn(inputBase, 'resize-y min-h-[80px]', error && 'border-loss focus:border-loss focus:ring-loss/30', textareaClassName)}
        {...rest}
      />
    </FieldWrapper>
  );
});

export default Input;
