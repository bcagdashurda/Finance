import {
  forwardRef,
  useEffect,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { CaretDown } from '@phosphor-icons/react';
import { CURRENCY_META, formatNumber, parseAmount, type CurrencyCode, type Money } from '@/domain/money';
import { addDays, type ISODate } from '@/domain/dates';
import { cn } from './cn';

const control =
  'w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-3.5 text-sm text-ink ' +
  'placeholder:text-faint transition-[border-color,box-shadow] duration-150 ' +
  'hover:border-[color-mix(in_oklab,var(--cobalt)_35%,var(--line-strong))] ' +
  'focus:border-cobalt focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--cobalt)_18%,transparent)] focus:outline-none ' +
  'aria-[invalid=true]:border-outflow disabled:opacity-60';

interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: (props: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode;
  className?: string;
  optional?: boolean;
}

export function Field({ label, hint, error, children, className, optional }: FieldProps) {
  const id = useId();
  const descId = `${id}-desc`;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-baseline justify-between text-xs font-medium text-ink-2">
        <span>{label}</span>
        {optional && <span className="font-normal text-faint">isteğe bağlı</span>}
      </label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': hint || error ? descId : undefined })}
      {(error || hint) && (
        <p id={descId} className={cn('text-2xs', error ? 'text-outflow-text' : 'text-muted')}>
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

export const TextInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function TextInput(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cn(control, 'h-10', className)} {...rest} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cn(control, 'min-h-20 py-2.5 leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(control, 'h-10 appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <CaretDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
    </div>
  );
});

interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: Money | null;
  onValueChange: (value: Money | null) => void;
  currency?: CurrencyCode;
}

/** Türkçe tutar girişi: "45 bin", "1.250,50", "1,5 milyon" kabul eder; odak dışında biçimler. */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onValueChange, currency = 'TRY', className, onBlur, onFocus, ...rest },
  ref,
) {
  const [text, setText] = useState(value != null ? formatNumber(value) : '');
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value != null ? formatNumber(value) : '');
  }, [value, focused]);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">
        {CURRENCY_META[currency].symbol}
      </span>
      <input
        ref={ref}
        inputMode="decimal"
        autoComplete="off"
        className={cn(control, 'num h-10 pl-8 text-right text-[0.95rem] font-medium', className)}
        value={text}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onChange={(e) => {
          setText(e.target.value);
          onValueChange(parseAmount(e.target.value));
        }}
        onBlur={(e) => {
          setFocused(false);
          const parsed = parseAmount(text);
          onValueChange(parsed);
          setText(parsed != null ? formatNumber(parsed) : '');
          onBlur?.(e);
        }}
        {...rest}
      />
    </div>
  );
});

interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: ISODate;
  onValueChange: (value: ISODate) => void;
  today: ISODate;
  presets?: Array<{ label: string; days: number }>;
}

export const DateInput = forwardRef<HTMLInputElement, DateInputProps>(function DateInput(
  { value, onValueChange, today, presets, className, ...rest },
  ref,
) {
  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={ref}
        type="date"
        className={cn(control, 'num h-10', className)}
        value={value}
        onChange={(e) => e.target.value && onValueChange(e.target.value)}
        {...rest}
      />
      {presets && (
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => {
            const d = addDays(today, p.days);
            const active = d === value;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => onValueChange(d)}
                className={cn(
                  'rounded-full border px-2.5 py-0.5 text-2xs transition-colors',
                  active ? 'border-cobalt bg-cobalt-soft text-cobalt-ink' : 'border-line text-muted hover:text-ink',
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
