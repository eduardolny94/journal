// Control segmentado (pestañas compactas) accesible con teclado.
import { useRef, type KeyboardEvent } from 'react';
import { cn } from '../../lib/cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedTabsProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  ariaLabel: string;
  className?: string;
}

export function SegmentedTabs<T extends string>({ value, onChange, options, ariaLabel, className }: SegmentedTabsProps<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const idx = options.findIndex((o) => o.value === value);
    let next = idx;
    if (e.key === 'ArrowLeft') next = (idx - 1 + options.length) % options.length;
    else if (e.key === 'ArrowRight') next = (idx + 1) % options.length;
    else if (e.key === 'Home') next = 0;
    else next = options.length - 1;
    onChange(options[next].value);
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    buttons?.[next]?.focus();
  }

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-md border border-border bg-bg/60 p-0.5', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              'whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
              active ? 'bg-gray-800 text-gray-100 shadow-sm' : 'text-gray-400 hover:text-gray-200',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export default SegmentedTabs;
