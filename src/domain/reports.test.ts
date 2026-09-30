import { describe, expect, it } from 'vitest';
import { account, allocation, doc, tx } from '@/test/factories';
import { indexAllocations } from './documents';
import { budgetVsActual, fxExposure, profitLoss, vatHistory } from './reports';
import type { Category } from './types';

const cat = (id: string, kind: 'income' | 'expense', extra: Partial<Category> = {}): Category => ({
  id, workspaceId: 'ws', name: id, kind, color: 'c1', icon: 'dots', archived: false, createdAt: '', updatedAt: '', ...extra,
});

describe('profitLoss', () => {
  const categories = [cat('satis', 'income'), cat('kira', 'expense'), cat('kdv', 'expense', { icon: 'receipt' })];

  it('cash basis: realized income/expense by category and month, category inherited from settled documents', () => {
    const invoice = doc({ id: 'inv', categoryId: 'satis', amount: 120_000, vatAmount: 20_000, issueDate: '2026-01-10' });
    const collection = tx({ id: 'col', kind: 'income', amount: 120_000, date: '2026-02-05', affectsLedger: true, contactId: 'c' });
    const txs = [collection, tx({ kind: 'expense', categoryId: 'kira', amount: 30_000, date: '2026-02-05' })];
    const al = [allocation({ documentId: 'inv', transactionId: 'col', amount: 120_000 })];
    const r = profitLoss({ transactions: txs, documents: [invoice], allocationIndex: indexAllocations(al), categories }, '2026-01-01', '2026-02-28', 'cash');
    expect(r.months).toEqual(['2026-01', '2026-02']);
    expect(r.income.find((x) => x.categoryId === 'satis')?.values).toEqual([0, 120_000]);
    expect(r.expense.find((x) => x.categoryId === 'kira')?.values).toEqual([0, 30_000]);
    expect(r.totals.net).toEqual([0, 90_000]);
  });

  it('accrual basis: documents net of VAT on issue date, KDV payments excluded', () => {
    const invoice = doc({ categoryId: 'satis', amount: 120_000, vatAmount: 20_000, issueDate: '2026-01-10' });
    const txs = [
      tx({ kind: 'income', amount: 120_000, date: '2026-02-05', affectsLedger: true, contactId: 'c' }),
      tx({ kind: 'expense', categoryId: 'kdv', amount: 20_000, date: '2026-02-28' }),
      tx({ kind: 'expense', categoryId: 'kira', amount: 30_000, date: '2026-01-05' }),
    ];
    const r = profitLoss({ transactions: txs, documents: [invoice], allocationIndex: new Map(), categories }, '2026-01-01', '2026-02-28', 'accrual');
    expect(r.income.find((x) => x.categoryId === 'satis')?.values).toEqual([100_000, 0]);
    expect(r.expense.find((x) => x.categoryId === 'kdv')).toBeUndefined();
    expect(r.totals.net).toEqual([70_000, 0]);
  });
});

describe('budgetVsActual', () => {
  it('compares this month spending to the monthly budget', () => {
    const categories = [cat('yemek', 'expense', { monthlyBudget: 20_000 }), cat('kira', 'expense')];
    const r = budgetVsActual([tx({ kind: 'expense', categoryId: 'yemek', amount: 25_000, date: '2026-03-10' })], categories, '2026-03-20');
    expect(r).toEqual([{ categoryId: 'yemek', budget: 20_000, actual: 25_000, ratio: 1.25, projected: 38_750 }]);
  });
});

describe('vatHistory', () => {
  it('computes output, input, net and carry-forward per month', () => {
    const docs = [
      doc({ direction: 'receivable', issueDate: '2026-01-10', amount: 0, vatAmount: 10_000 }),
      doc({ direction: 'payable', issueDate: '2026-01-12', amount: 0, vatAmount: 25_000 }),
      doc({ direction: 'receivable', issueDate: '2026-02-10', amount: 0, vatAmount: 30_000 }),
    ];
    expect(vatHistory(docs, '2026-01', '2026-02')).toEqual([
      // 28 Şubat 2026 cumartesi → 2 Mart pazartesi
      { period: '2026-01', output: 10_000, input: 25_000, carriedIn: 0, payable: 0, carriedOut: 15_000, dueDate: '2026-03-02' },
      { period: '2026-02', output: 30_000, input: 0, carriedIn: 15_000, payable: 15_000, carriedOut: 0, dueDate: '2026-03-30' },
    ]);
  });
});

describe('fxExposure', () => {
  it('nets foreign cash, receivables and payables and shows a 10% TL shock', () => {
    const usd = account({ id: 'u', currency: 'USD' });
    const docs = [doc({ currency: 'USD', amount: 50_000, rateToBase: 50 }), doc({ currency: 'USD', direction: 'payable', amount: 20_000, rateToBase: 50 })];
    const r = fxExposure([usd], new Map([['u', 100_000]]), docs, new Map(), { TRY: 1, USD: 50, EUR: 55, GBP: 65 }, '2026-01-01');
    expect(r).toEqual([{ currency: 'USD', cash: 100_000, receivable: 50_000, payable: 20_000, net: 130_000, netBase: 6_500_000, shock10: 650_000 }]);
  });
});
