import { describe, expect, it } from 'vitest';
import { tx } from '@/test/factories';
import { customerConcentration, expenseAnomalies } from './insights';

describe('expenseAnomalies', () => {
  it('flags a category whose last full month is well above its trailing average', () => {
    const txs = [
      ...['2026-05-10', '2026-06-10', '2026-07-10'].map((date) => tx({ kind: 'expense', categoryId: 'enerji', amount: 5_000_000, date })),
      tx({ kind: 'expense', categoryId: 'enerji', amount: 9_000_000, date: '2026-08-10' }),
      ...['2026-05-10', '2026-06-10', '2026-07-10', '2026-08-10'].map((date) => tx({ kind: 'expense', categoryId: 'kira', amount: 9_500_000, date })),
    ];
    const result = expenseAnomalies(txs, '2026-09-15');
    expect(result).toEqual([{ categoryId: 'enerji', month: '2026-08', actual: 9_000_000, baseline: 5_000_000, change: 0.8 }]);
  });

  it('ignores scheduled (recurring) payments and excluded categories', () => {
    const txs = [
      ...['2026-05-17', '2026-06-10', '2026-07-10'].map((date) => tx({ kind: 'expense', categoryId: 'vergi', amount: 1_000_000, date })),
      tx({ kind: 'expense', categoryId: 'vergi', amount: 9_000_000, date: '2026-08-17', recurringId: 'gecici' }),
      ...['2026-05-10', '2026-06-10', '2026-07-10'].map((date) => tx({ kind: 'expense', categoryId: 'kdv', amount: 5_000_000, date })),
      tx({ kind: 'expense', categoryId: 'kdv', amount: 9_000_000, date: '2026-08-28' }),
    ];
    expect(expenseAnomalies(txs, '2026-09-15', { excludeCategoryIds: ['kdv'] })).toEqual([]);
  });

  it('ignores small categories', () => {
    const txs = [
      ...['2026-05-10', '2026-06-10', '2026-07-10'].map((date) => tx({ kind: 'expense', categoryId: 'kahve', amount: 100, date })),
      tx({ kind: 'expense', categoryId: 'kahve', amount: 900, date: '2026-08-10' }),
    ];
    expect(expenseAnomalies(txs, '2026-09-15', { minAmount: 10_000 })).toEqual([]);
  });
});

describe('customerConcentration', () => {
  it('returns the share of the biggest customer in recent collections', () => {
    const txs = [
      tx({ kind: 'income', contactId: 'a', amount: 60_000, date: '2026-08-01' }),
      tx({ kind: 'income', contactId: 'b', amount: 30_000, date: '2026-08-02' }),
      tx({ kind: 'income', contactId: 'c', amount: 10_000, date: '2026-08-03' }),
      tx({ kind: 'income', contactId: 'a', amount: 99_000, date: '2025-01-01' }),
    ];
    expect(customerConcentration(txs, '2026-09-01', 90)).toEqual({ contactId: 'a', share: 0.6, total: 100_000 });
  });
});
