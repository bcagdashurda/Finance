import { describe, expect, it } from 'vitest';
import { guessMapping, importHash, normalizeRows, parseDateCell, suggestCategory } from './statement';

describe('parseDateCell', () => {
  it.each([
    ['29.09.2026', '2026-09-29'],
    ['29/09/2026', '2026-09-29'],
    ['2026-09-29', '2026-09-29'],
    ['29.09.26', '2026-09-29'],
    ['29.09.2026 14:35', '2026-09-29'],
    [46294, '2026-09-29'], // Excel seri tarihi
  ])('parses %s', (input, expected) => {
    expect(parseDateCell(input)).toBe(expected);
  });

  it('returns null for garbage', () => {
    expect(parseDateCell('Bakiye')).toBeNull();
    expect(parseDateCell('')).toBeNull();
  });
});

describe('guessMapping', () => {
  it('maps typical Turkish bank headers with a single signed amount column', () => {
    expect(guessMapping(['İşlem Tarihi', 'Açıklama', 'İşlem Tutarı', 'Bakiye'])).toEqual({ date: 0, description: 1, amount: 2, balance: 3 });
  });

  it('maps separate debit / credit columns', () => {
    expect(guessMapping(['Tarih', 'Valör', 'Açıklama', 'Borç', 'Alacak', 'Bakiye'])).toEqual({ date: 0, description: 2, debit: 3, credit: 4, balance: 5 });
  });
});

describe('normalizeRows', () => {
  it('turns cells into signed minor amounts and reports bad rows', () => {
    const rows = [
      ['29.09.2026', 'EFT GELEN YILDIZ GIDA', '45.000,00', '1.000.000,00'],
      ['28.09.2026', 'OPET AKARYAKIT', '-2.350,50', '955.000,00'],
      ['Toplam', '', '', ''],
    ];
    const { items, errors } = normalizeRows(rows, { date: 0, description: 1, amount: 2, balance: 3 });
    expect(items).toEqual([
      { row: 0, date: '2026-09-29', description: 'EFT GELEN YILDIZ GIDA', amount: 4_500_000 },
      { row: 1, date: '2026-09-28', description: 'OPET AKARYAKIT', amount: -235_050 },
    ]);
    expect(errors).toEqual([{ row: 2, reason: 'Tarih okunamadı' }]);
  });

  it('uses debit as outflow and credit as inflow', () => {
    const { items } = normalizeRows([['01.10.2026', 'Kira', '95.000', '']], { date: 0, description: 1, debit: 2, credit: 3 });
    expect(items[0]!.amount).toBe(-9_500_000);
  });
});

describe('importHash', () => {
  it('is stable for the same account, date, amount and normalized description', () => {
    expect(importHash('acc', '2026-09-29', 100, ' Opet  Akaryakıt ')).toBe(importHash('acc', '2026-09-29', 100, 'OPET AKARYAKIT'));
    expect(importHash('acc', '2026-09-29', 100, 'x')).not.toBe(importHash('acc', '2026-09-30', 100, 'x'));
  });
});

describe('suggestCategory', () => {
  const ctx = {
    categories: [
      { id: 'yakit', kind: 'expense' as const, keywords: ['akaryakıt', 'opet', 'shell'] },
      { id: 'satis', kind: 'income' as const, keywords: ['satış'] },
    ],
    contacts: [{ id: 'yildiz', name: 'Yıldız Gıda A.Ş.' }],
    rules: [{ pattern: 'turkcell', categoryId: 'tel' }],
  };

  it('prefers learned rules', () => {
    expect(suggestCategory('TURKCELL FATURA ODEMESI', -100, ctx)).toMatchObject({ categoryId: 'tel', source: 'rule' });
  });

  it('matches a contact by name inside the description', () => {
    expect(suggestCategory('EFT GELEN YILDIZ GIDA AS', 100, ctx)).toMatchObject({ contactId: 'yildiz', source: 'contact' });
  });

  it('falls back to keyword categories of the right direction', () => {
    expect(suggestCategory('OPET AKARYAKIT ISTASYONU', -100, ctx)).toMatchObject({ categoryId: 'yakit', source: 'keyword' });
    expect(suggestCategory('OPET', 100, ctx).categoryId).toBeUndefined();
  });
});
