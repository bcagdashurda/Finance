import { describe, expect, it } from 'vitest';
import { account, allocation, contact, doc, instrument, tx } from '@/test/factories';
import { accountBalance, balanceSeries, balancesByAccount, totalInBase } from './balances';
import { documentStatus, planAllocation } from './documents';
import { contactBalance, contactBalances, contactStatement } from './ledger';
import { agingReport } from './aging';

describe('accountBalance', () => {
  const acc = account({ id: 'a1', openingBalance: 100_000, openingDate: '2026-01-01' });

  it('adds income, subtracts expense on top of the opening balance', () => {
    const txs = [
      tx({ accountId: 'a1', kind: 'income', amount: 50_000, date: '2026-01-05' }),
      tx({ accountId: 'a1', kind: 'expense', amount: 20_000, date: '2026-01-06' }),
    ];
    expect(accountBalance(acc, txs)).toBe(130_000);
  });

  it('moves transfers out of the source and into the target (in target currency)', () => {
    const usd = account({ id: 'a2', currency: 'USD' });
    const txs = [
      tx({ kind: 'transfer', accountId: 'a1', toAccountId: 'a2', amount: 49_000, toAmount: 1_000, date: '2026-01-07' }),
    ];
    expect(accountBalance(acc, txs)).toBe(51_000);
    expect(accountBalance(usd, txs)).toBe(1_000);
  });

  it('ignores transactions before the opening date and after asOf', () => {
    const txs = [
      tx({ accountId: 'a1', kind: 'income', amount: 999, date: '2025-12-31' }),
      tx({ accountId: 'a1', kind: 'income', amount: 10, date: '2026-01-02' }),
      tx({ accountId: 'a1', kind: 'income', amount: 777, date: '2026-02-01' }),
    ];
    expect(accountBalance(acc, txs, '2026-01-31')).toBe(100_010);
  });

  it('computes all balances in one pass and totals them in base currency', () => {
    const usd = account({ id: 'u', currency: 'USD', openingBalance: 10_000 });
    const map = balancesByAccount([acc, usd], []);
    expect(map.get('a1')).toBe(100_000);
    expect(map.get('u')).toBe(10_000);
    expect(totalInBase([acc, usd], map, { TRY: 1, USD: 49, EUR: 55, GBP: 65 })).toBe(100_000 + 490_000);
  });
});

describe('balanceSeries', () => {
  it('returns the end-of-day total in base currency for every day of the window', () => {
    const a = account({ id: 's1', openingBalance: 1_000, openingDate: '2026-01-01' });
    const u = account({ id: 's2', currency: 'USD', openingBalance: 10, openingDate: '2026-01-01' });
    const txs = [
      tx({ accountId: 's1', kind: 'income', amount: 500, date: '2026-01-02' }),
      tx({ accountId: 's1', kind: 'expense', amount: 200, date: '2026-01-04' }),
      tx({ accountId: 's2', kind: 'income', amount: 1, date: '2026-01-04' }),
    ];
    const series = balanceSeries([a, u], txs, '2026-01-02', '2026-01-04', { TRY: 1, USD: 50, EUR: 1, GBP: 1 });
    expect(series).toEqual([
      { date: '2026-01-02', value: 1_500 + 500 },
      { date: '2026-01-03', value: 1_500 + 500 },
      { date: '2026-01-04', value: 1_300 + 550 },
    ]);
  });
});

describe('documentStatus', () => {
  const invoice = doc({ id: 'd1', amount: 100_000, dueDate: '2026-02-01' });

  it('is open before the due date with nothing allocated', () => {
    expect(documentStatus(invoice, [], '2026-01-20')).toMatchObject({
      status: 'open',
      allocated: 0,
      remaining: 100_000,
      daysOverdue: 0,
    });
  });

  it('is partial when some amount is allocated', () => {
    const al = [allocation({ documentId: 'd1', amount: 40_000 })];
    expect(documentStatus(invoice, al, '2026-01-20')).toMatchObject({ status: 'partial', remaining: 60_000 });
  });

  it('is overdue after the due date and reports days late', () => {
    const al = [allocation({ documentId: 'd1', amount: 40_000 })];
    expect(documentStatus(invoice, al, '2026-02-11')).toMatchObject({ status: 'overdue', daysOverdue: 10 });
  });

  it('is paid when fully allocated, with the settlement date', () => {
    const al = [
      allocation({ documentId: 'd1', amount: 40_000, date: '2026-01-15' }),
      allocation({ documentId: 'd1', amount: 60_000, date: '2026-02-05' }),
    ];
    expect(documentStatus(invoice, al, '2026-03-01')).toMatchObject({
      status: 'paid',
      remaining: 0,
      paidDate: '2026-02-05',
    });
  });

  it('is cancelled regardless of allocations', () => {
    expect(documentStatus({ ...invoice, cancelled: true }, [], '2026-03-01').status).toBe('cancelled');
  });
});

describe('planAllocation', () => {
  it('allocates FIFO by due date and reports the unallocated rest as advance', () => {
    const plan = planAllocation(150_000, [
      { id: 'late', dueDate: '2026-03-01', remaining: 80_000 },
      { id: 'early', dueDate: '2026-01-15', remaining: 100_000 },
    ]);
    expect(plan.allocations).toEqual([
      { documentId: 'early', amount: 100_000 },
      { documentId: 'late', amount: 50_000 },
    ]);
    expect(plan.unallocated).toBe(0);
  });

  it('keeps the excess as unallocated', () => {
    const plan = planAllocation(120_000, [{ id: 'x', dueDate: '2026-01-15', remaining: 100_000 }]);
    expect(plan.unallocated).toBe(20_000);
  });
});

describe('contactBalance', () => {
  const customer = contact({ id: 'c1', openingBalance: 10_000 });

  it('adds receivables, subtracts collections and payables', () => {
    const docs = [
      doc({ contactId: 'c1', direction: 'receivable', amount: 100_000 }),
      doc({ contactId: 'c1', direction: 'payable', amount: 30_000 }),
      doc({ contactId: 'c1', direction: 'receivable', amount: 999_999, cancelled: true }),
    ];
    const txs = [
      tx({ contactId: 'c1', kind: 'income', amount: 40_000, affectsLedger: true }),
      tx({ contactId: 'c1', kind: 'expense', amount: 5_000, affectsLedger: true }),
      tx({ contactId: 'c1', kind: 'income', amount: 70_000, affectsLedger: false }),
    ];
    // 10.000 + 100.000 − 30.000 − 40.000 + 5.000
    expect(contactBalance(customer, docs, txs, [])).toBe(45_000);
  });

  it('treats a received cheque as settlement until it bounces or is returned', () => {
    const docs = [doc({ contactId: 'c1', amount: 100_000 })];
    const portfolio = instrument({ contactId: 'c1', amount: 60_000, status: 'portfolio' });
    const bounced = instrument({ contactId: 'c1', amount: 25_000, status: 'bounced' });
    expect(contactBalance(customer, docs, [], [portfolio, bounced])).toBe(10_000 + 100_000 - 60_000);
  });

  it('credits the supplier when a received cheque is endorsed to them', () => {
    const supplier = contact({ id: 's1', kind: 'supplier' });
    const docs = [doc({ contactId: 's1', direction: 'payable', amount: 80_000 })];
    const endorsed = instrument({ contactId: 'c1', endorsedToId: 's1', amount: 50_000, status: 'endorsed' });
    expect(contactBalance(supplier, docs, [], [endorsed])).toBe(-30_000);
    expect(contactBalance(customer, [], [], [endorsed])).toBe(10_000 - 50_000);
  });

  it('ignores movements dated after asOf (e.g. expected future orders)', () => {
    const docs = [
      doc({ contactId: 'c1', amount: 100_000, issueDate: '2026-01-10' }),
      doc({ contactId: 'c1', amount: 740_000, issueDate: '2026-03-01' }),
    ];
    expect(contactBalance(customer, docs, [], [], undefined, '2026-02-01')).toBe(110_000);
    expect(contactBalances([customer], docs, [], [], undefined, '2026-02-01').get('c1')).toBe(110_000);
  });

  it('treats an issued cheque as payment to the supplier', () => {
    const supplier = contact({ id: 's2', kind: 'supplier' });
    const docs = [doc({ contactId: 's2', direction: 'payable', amount: 80_000 })];
    const issued = instrument({ contactId: 's2', direction: 'issued', amount: 80_000, status: 'issued' });
    expect(contactBalance(supplier, docs, [], [issued])).toBe(0);
  });
});

describe('contactStatement', () => {
  it('lists movements chronologically with a running balance', () => {
    const c = contact({ id: 'c9', openingBalance: 5_000 });
    const docs = [doc({ id: 'inv', contactId: 'c9', amount: 20_000, issueDate: '2026-01-10', title: 'Fatura 1' })];
    const txs = [
      tx({ contactId: 'c9', kind: 'income', amount: 15_000, affectsLedger: true, date: '2026-01-20', description: 'Havale' }),
    ];
    const rows = contactStatement(c, docs, txs, []);
    expect(rows.map((r) => [r.date, r.debit, r.credit, r.balance])).toEqual([
      [null, 5_000, 0, 5_000],
      ['2026-01-10', 20_000, 0, 25_000],
      ['2026-01-20', 0, 15_000, 10_000],
    ]);
  });
});

describe('agingReport', () => {
  it('buckets remaining receivables by days overdue', () => {
    const docs = [
      doc({ id: 'a', contactId: 'c1', amount: 10_000, dueDate: '2026-03-10' }), // not due
      doc({ id: 'b', contactId: 'c1', amount: 20_000, dueDate: '2026-02-20' }), // 9 days
      doc({ id: 'c', contactId: 'c2', amount: 30_000, dueDate: '2026-01-10' }), // 50 days
      doc({ id: 'd', contactId: 'c2', amount: 40_000, dueDate: '2025-11-01' }), // 120 days
      doc({ id: 'e', contactId: 'c2', amount: 50_000, dueDate: '2026-01-01', direction: 'payable' }),
    ];
    const al = [allocation({ documentId: 'b', amount: 5_000 })];
    const report = agingReport(docs, al, '2026-03-01', 'receivable');
    expect(report.total).toEqual({ current: 10_000, d1_30: 15_000, d31_60: 30_000, d61_90: 0, d90p: 40_000, total: 95_000 });
    expect(report.byContact.get('c2')?.d90p).toBe(40_000);
  });
});
