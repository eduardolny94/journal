import { forwardRef, useId, type SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { FieldWrapper, inputBase, type FieldProps } from './Input';

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'>, FieldProps {
  options?: SelectOption[];
  placeholder?: string;
  selectClassName?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, hint, error, className, selectClassName, options, placeholder, id: idProp, children, ...rest },
  ref,
) {
  const autoId = useId();
  const id = idProp || autoId;
  return (
    <FieldWrapper id={id} label={label} hint={hint} error={error} className={className}>
      <div className="relative">
        <select
          ref={ref}
          id={id}
          aria-invalid={!!error}
          className={cn(inputBase, 'appearance-none pr-9 cursor-pointer', error && 'border-loss focus:border-loss focus:ring-loss/30', selectClassName)}
          {...rest}
        >
          {placeholder !== undefined && (
            <option value="" disabled={rest.required}>
              {placeholder}
            </option>
          )}
          {options
            ? options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" aria-hidden />
      </div>
    </FieldWrapper>
  );
});

export default Select;
