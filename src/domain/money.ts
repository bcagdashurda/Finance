/**
 * Para birimi yardımcıları. Tüm tutarlar tam sayı alt birimdir (kuruş / cent):
 * `Money = number` ve daima tam sayı. Kayan nokta yalnızca kur çarpımında ve
 * hemen yuvarlanarak kullanılır.
 */

export type Money = number;

export const CURRENCIES = ['TRY', 'USD', 'EUR', 'GBP'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const CURRENCY_META: Record<CurrencyCode, { symbol: string; name: string }> = {
  TRY: { symbol: '₺', name: 'Türk lirası' },
  USD: { symbol: '$', name: 'ABD doları' },
  EUR: { symbol: '€', name: 'Euro' },
  GBP: { symbol: '£', name: 'İngiliz sterlini' },
};

const MINUS = '−';
const LOCALE = 'tr-TR';

/** Yarımı sıfırdan uzağa yuvarlar; kayan nokta kalıntısını önce temizler. */
function roundHalfAway(value: number): number {
  const cleaned = Number(value.toFixed(8));
  return Math.sign(cleaned) * Math.round(Math.abs(cleaned));
}

export function toMinor(major: number): Money {
  return roundHalfAway(major * 100);
}

export function toMajor(minor: Money): number {
  return minor / 100;
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();
function currencyFormatter(currency: CurrencyCode, decimals: 0 | 2): Intl.NumberFormat {
  const key = `${currency}:${decimals}`;
  let fmt = currencyFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(LOCALE, {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    currencyFormatters.set(key, fmt);
  }
  return fmt;
}

export interface FormatMoneyOptions {
  /** 'auto': yalnızca negatifte işaret; 'always': + / −; 'never': mutlak değer */
  sign?: 'auto' | 'always' | 'never';
  decimals?: 0 | 2;
}

export function formatMoney(
  minor: Money,
  currency: CurrencyCode = 'TRY',
  { sign = 'auto', decimals = 2 }: FormatMoneyOptions = {},
): string {
  const abs = currencyFormatter(currency, decimals).format(Math.abs(minor) / 100);
  if (minor < 0 && sign !== 'never') return MINUS + abs;
  if (minor > 0 && sign === 'always') return `+${abs}`;
  return abs;
}

const compactFormatter = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const compactLongFormatter = new Intl.NumberFormat(LOCALE, {
  notation: 'compact',
  compactDisplay: 'long',
  maximumFractionDigits: 1,
});

/**
 * "₺4,8 Mn", "₺45 B" — grafik eksenleri ve dar alanlar için.
 * `long`: "₺4,8 milyon", "$13,7 bin" — cümle içinde (B, İngilizce "billion" ile karışmasın).
 */
export function formatCompact(minor: Money, currency: CurrencyCode = 'TRY', { long = false }: { long?: boolean } = {}): string {
  const symbol = CURRENCY_META[currency].symbol;
  const body = (long ? compactLongFormatter : compactFormatter).format(Math.abs(minor) / 100);
  return `${minor < 0 ? MINUS : ''}${symbol}${body}`;
}

/** Cümle içi kısa tutar. */
export const formatShort = (minor: Money, currency: CurrencyCode = 'TRY') => formatCompact(minor, currency, { long: true });

/** Sadece sayı, sembolsüz: "4.812.340,55" */
export function formatNumber(minor: Money, decimals: 0 | 2 = 2): string {
  const abs = new Intl.NumberFormat(LOCALE, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Math.abs(minor) / 100);
  return minor < 0 ? MINUS + abs : abs;
}

export interface MoneyParts {
  negative: boolean;
  symbol: string;
  integer: string;
  decimal: string;
  fraction: string;
}

/** Tutarı tipografik parçalara ayırır (büyük rakam + küçük kuruş gösterimi için). */
export function moneyParts(minor: Money, currency: CurrencyCode = 'TRY'): MoneyParts {
  const parts = currencyFormatter(currency, 2).formatToParts(Math.abs(minor) / 100);
  let integer = '';
  let decimal = ',';
  let fraction = '';
  for (const p of parts) {
    if (p.type === 'integer' || p.type === 'group') integer += p.value;
    else if (p.type === 'decimal') decimal = p.value;
    else if (p.type === 'fraction') fraction = p.value;
  }
  return {
    negative: minor < 0,
    symbol: CURRENCY_META[currency].symbol,
    integer,
    decimal,
    fraction,
  };
}

const MULTIPLIERS: Array<[RegExp, number]> = [
  [/milyar/i, 1_000_000_000],
  [/milyon|mn\b/i, 1_000_000],
  [/bin\b|bin(?=\s|$)|\d\s*k\b/i, 1_000],
];

/**
 * Türkçe tutar metnini alt birime çevirir.
 * "1.234,56" · "45.000" · "45 bin" · "1,5 milyon" · "12k" · "₺2.500" · "(300)" · "$1,200.50"
 */
export function parseAmount(input: string): Money | null {
  if (!input) return null;
  let text = input.trim().toLocaleLowerCase(LOCALE);
  const parenNegative = /^\(.*\)$/.test(text);
  const negative = parenNegative || /^[-−–]/.test(text);

  let multiplier = 1;
  for (const [pattern, value] of MULTIPLIERS) {
    if (pattern.test(text)) {
      multiplier = value;
      break;
    }
  }

  const match = text.match(/\d[\d.,\s]*\d|\d/);
  if (!match) return null;
  let digits = match[0].replace(/\s/g, '');

  const lastDot = digits.lastIndexOf('.');
  const lastComma = digits.lastIndexOf(',');
  let normalized: string;

  if (lastDot !== -1 && lastComma !== -1) {
    // İkisi birden varsa sondaki ondalık ayırıcıdır.
    if (lastComma > lastDot) normalized = digits.replace(/\./g, '').replace(',', '.');
    else normalized = digits.replace(/,/g, '');
  } else if (lastComma !== -1) {
    const commaCount = (digits.match(/,/g) ?? []).length;
    const after = digits.length - lastComma - 1;
    // Türkçede virgül ondalıktır; yalnızca "1,234,567" gibi çoklu gruplamada binliktir.
    normalized =
      commaCount > 1 && after === 3 ? digits.replace(/,/g, '') : digits.replace(/,/g, '.');
  } else if (lastDot !== -1) {
    const dotCount = (digits.match(/\./g) ?? []).length;
    const after = digits.length - lastDot - 1;
    normalized =
      dotCount > 1 || after === 3 ? digits.replace(/\./g, '') : digits;
  } else {
    normalized = digits;
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  const minor = toMinor(value * multiplier);
  return negative ? -Math.abs(minor) : minor;
}

const CURRENCY_PATTERNS: Array<[RegExp, CurrencyCode]> = [
  [/\$|\busd\b|dolar/i, 'USD'],
  [/€|\beur\b|euro|avro/i, 'EUR'],
  [/£|\bgbp\b|sterlin/i, 'GBP'],
  [/₺|\btl\b|\btry\b|lira/i, 'TRY'],
];

export function detectCurrency(input: string): CurrencyCode | null {
  for (const [pattern, code] of CURRENCY_PATTERNS) {
    if (pattern.test(input)) return code;
  }
  return null;
}

/**
 * Kurlar "baz para birimi başına" verilir (1 USD = 49 TRY → 49; TRY → 1).
 * minor × fromRate / toRate, en yakın alt birime yuvarlanır.
 */
export function convertMinor(minor: Money, fromRate: number, toRate: number): Money {
  if (fromRate === toRate) return minor;
  return roundHalfAway((minor * fromRate) / toRate);
}

export function sumMoney(values: Iterable<Money>): Money {
  let total = 0;
  for (const v of values) total += v;
  return total;
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return typeof value === 'string' && (CURRENCIES as readonly string[]).includes(value);
}
