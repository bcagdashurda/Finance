import { formatCompact, formatMoney, moneyParts, type CurrencyCode, type Money as MoneyValue } from '@/domain/money';
import { cn } from './cn';

type Tone = 'neutral' | 'auto' | 'in' | 'out' | 'muted';

interface MoneyProps {
  value: MoneyValue;
  currency?: CurrencyCode;
  /** 'auto' negatifte −; 'always' + / − gösterir */
  sign?: 'auto' | 'always' | 'never';
  tone?: Tone;
  compact?: boolean;
  /** Kuruşu küçük ve hafif göster (tipografik) */
  split?: boolean;
  decimals?: 0 | 2;
  className?: string;
}

function toneClass(tone: Tone, value: number): string {
  if (tone === 'in') return 'text-inflow-text';
  if (tone === 'out') return 'text-outflow-text';
  if (tone === 'muted') return 'text-muted';
  if (tone === 'auto') return value > 0 ? 'text-inflow-text' : value < 0 ? 'text-outflow-text' : '';
  return '';
}

/** Tutar gösterimi: tabular rakamlar, isteğe bağlı küçük kuruş. */
export function Money({
  value,
  currency = 'TRY',
  sign = 'auto',
  tone = 'neutral',
  compact,
  split,
  decimals = 2,
  className,
}: MoneyProps) {
  const label = formatMoney(value, currency, { sign, decimals });
  if (compact) {
    return (
      <span className={cn('num', toneClass(tone, value), className)} title={label}>
        {sign === 'always' && value > 0 ? '+' : ''}
        {formatCompact(value, currency)}
      </span>
    );
  }
  if (!split) {
    return <span className={cn('num whitespace-nowrap', toneClass(tone, value), className)}>{label}</span>;
  }
  const p = moneyParts(value, currency);
  const signChar = p.negative && sign !== 'never' ? '−' : sign === 'always' && value > 0 ? '+' : '';
  return (
    <span className={cn('num whitespace-nowrap', toneClass(tone, value), className)} aria-label={label}>
      <span aria-hidden>
        {signChar}
        <span className="opacity-60">{p.symbol}</span>
        {p.integer}
        {decimals === 2 && (
          <span className="text-[0.72em] opacity-55">
            {p.decimal}
            {p.fraction}
          </span>
        )}
      </span>
    </span>
  );
}
