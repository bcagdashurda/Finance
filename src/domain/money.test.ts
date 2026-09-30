import { describe, expect, it } from 'vitest';
import {
  convertMinor,
  detectCurrency,
  formatCompact,
  formatMoney,
  moneyParts,
  parseAmount,
  toMinor,
} from './money';

describe('toMinor', () => {
  it('converts major units to integer minor units without float drift', () => {
    expect(toMinor(12.34)).toBe(1234);
    expect(toMinor(1.005)).toBe(101);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    expect(toMinor(-45.5)).toBe(-4550);
  });
});

describe('formatMoney', () => {
  it('formats TRY in Turkish locale', () => {
    expect(formatMoney(481234055, 'TRY')).toBe('₺4.812.340,55');
  });

  it('formats foreign currencies with their symbols', () => {
    expect(formatMoney(1420000, 'USD')).toBe('$14.200,00');
    expect(formatMoney(300000, 'EUR')).toBe('€3.000,00');
  });

  it('shows an explicit sign when asked', () => {
    expect(formatMoney(150000, 'TRY', { sign: 'always' })).toBe('+₺1.500,00');
    expect(formatMoney(-150000, 'TRY', { sign: 'always' })).toBe('−₺1.500,00');
  });

  it('drops kuruş when decimals is 0', () => {
    expect(formatMoney(481234055, 'TRY', { decimals: 0 })).toBe('₺4.812.341');
  });
});

describe('formatCompact', () => {
  it('abbreviates large amounts the Turkish way, joined by a no-break space', () => {
    expect(formatCompact(481234055, 'TRY')).toBe('₺4,8 Mn');
    expect(formatCompact(4500000, 'TRY')).toBe('₺45 B');
    expect(formatCompact(95000, 'TRY')).toBe('₺950');
  });

  it('spells out bin / milyon in long form for running text', () => {
    expect(formatCompact(481234055, 'TRY', { long: true })).toBe('₺4,8 milyon');
    expect(formatCompact(1366200, 'USD', { long: true })).toBe('$13,7 bin');
  });
});

describe('moneyParts', () => {
  it('splits an amount for typographic rendering', () => {
    expect(moneyParts(481234055, 'TRY')).toEqual({
      negative: false,
      symbol: '₺',
      integer: '4.812.340',
      decimal: ',',
      fraction: '55',
    });
    expect(moneyParts(-99, 'USD')).toEqual({
      negative: true,
      symbol: '$',
      integer: '0',
      decimal: ',',
      fraction: '99',
    });
  });
});

describe('parseAmount', () => {
  it.each([
    ['1.234,56', 123456],
    ['1234,56', 123456],
    ['45.000', 4500000],
    ['45.5', 4550],
    ['1.250.000', 125000000],
    ['₺ 2.500', 250000],
    ['2.500 TL', 250000],
    ['$1,200.50', 120050],
    ['45 bin', 4500000],
    ['45bin', 4500000],
    ['1,5 milyon', 150000000],
    ['2 milyar', 200000000000],
    ['12k', 1200000],
    ['-300', -30000],
    ['(300)', -30000],
    ['0,5', 50],
  ])('parses %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it('returns null for text without a number', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('abc')).toBeNull();
  });
});

describe('detectCurrency', () => {
  it.each([
    ['500 dolar', 'USD'],
    ['$500', 'USD'],
    ['300 euro', 'EUR'],
    ['300 avro', 'EUR'],
    ['€300', 'EUR'],
    ['200 sterlin', 'GBP'],
    ['1.000 TL', 'TRY'],
    ['1.000 lira', 'TRY'],
  ])('detects %s as %s', (input, code) => {
    expect(detectCurrency(input)).toBe(code);
  });

  it('returns null when no currency is mentioned', () => {
    expect(detectCurrency('45 bin')).toBeNull();
  });
});

describe('convertMinor', () => {
  it('converts via TRY-per-unit rates and rounds to the nearest minor unit', () => {
    // 100 USD at 49,00 TRY = 4.900 TRY
    expect(convertMinor(10000, 49, 1)).toBe(490000);
    // 4.900 TRY to USD
    expect(convertMinor(490000, 1, 49)).toBe(10000);
    // 100 EUR (55,7 TRY) → USD (49 TRY)
    expect(convertMinor(10000, 55.7, 49)).toBe(11367);
  });
});
