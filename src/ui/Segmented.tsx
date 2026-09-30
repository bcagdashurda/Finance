import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from './cn';

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; title?: string }>;
  size?: 'sm' | 'md';
  className?: string;
  label: string;
}

/** Kayan göstergeli segment kontrolü (yaylı layout animasyonu). */
export function Segmented<T extends string>({ value, onChange, options, size = 'md', className, label }: SegmentedProps<T>) {
  const group = useId();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex items-center rounded-[12px] bg-sunken p-0.5', className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'relative z-0 inline-flex items-center justify-center whitespace-nowrap rounded-[10px] font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-2xs' : 'h-8 px-3 text-xs',
              active ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${group}`}
                className="absolute inset-0 -z-10 rounded-[10px] bg-surface shadow-[0_1px_2px_rgb(15_26_61/0.08),0_0_0_1px_var(--line)]"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
