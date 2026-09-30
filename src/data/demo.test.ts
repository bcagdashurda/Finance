import { describe, expect, it } from 'vitest';
import { generateDemo } from './demo';
import { balancesByAccount, totalInBase } from '@/domain/balances';
import { documentStatus, indexAllocations } from '@/domain/documents';
import { contactBalances } from '@/domain/ledger';

const T = '2026-09-29';
const demo = generateDemo(T);

describe('generateDemo', () => {
  it('is deterministic for the same day and seed', () => {
    const again = generateDemo(T);
    expect(again.transactions.length).toBe(demo.transactions.length);
    expect(again.transactions.map((t) => t.amount)).toEqual(demo.transactions.map((t) => t.amount));
  });

  it('produces a realistic volume of activity', () => {
    expect(demo.transactions.length).toBeGreaterThan(600);
    expect(demo.documents.length).toBeGreaterThan(250);
    expect(demo.instruments.length).toBeGreaterThan(15);
  });

  it('keeps all transactions in the past and only valid references', () => {
    const accountIds = new Set(demo.accounts.map((a) => a.id));
    const contactIds = new Set(demo.contacts.map((c) => c.id));
    const categoryIds = new Set(demo.categories.map((c) => c.id));
    for (const t of demo.transactions) {
      expect(t.date <= T).toBe(true);
      expect(accountIds.has(t.accountId)).toBe(true);
      if (t.toAccountId) expect(accountIds.has(t.toAccountId)).toBe(true);
      if (t.contactId) expect(contactIds.has(t.contactId)).toBe(true);
      if (t.categoryId) expect(categoryIds.has(t.categoryId)).toBe(true);
      expect(Number.isInteger(t.amount) && t.amount > 0).toBe(true);
    }
  });

  it('never over-allocates a document', () => {
    const index = indexAllocations(demo.allocations);
    for (const d of demo.documents) {
      const allocated = (index.get(d.id) ?? []).reduce((s, a) => s + a.amount, 0);
      expect(allocated).toBeLessThanOrEqual(d.amount);
    }
  });

  it('never lets a bank or cash account go negative in history', () => {
    const txs = [...demo.transactions].sort((a, b) => a.date.localeCompare(b.date));
    const dates = [...new Set(txs.map((t) => t.date))];
    for (const a of demo.accounts.filter((x) => x.kind !== 'card')) {
      for (const d of dates.filter((_, i) => i % 5 === 0)) {
        const bal = balancesByAccount([a], txs, d).get(a.id)!;
        expect(bal, `${a.name} @ ${d}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('ends with a healthy multi-million lira cash position', () => {
    const balances = balancesByAccount(demo.accounts, demo.transactions);
    const total = totalInBase(demo.accounts, balances, { TRY: 1, USD: 49, EUR: 55.7, GBP: 65.4 });
    expect(total).toBeGreaterThan(2_000_000_00);
    expect(total).toBeLessThan(12_000_000_00);
  });

  it('has overdue receivables from the chronically late customer', () => {
    const index = indexAllocations(demo.allocations);
    const overdue = demo.documents.filter(
      (d) => d.contactId === 'demo-c-kuzey' && documentStatus(d, index, T).status === 'overdue',
    );
    expect(overdue.length).toBeGreaterThan(0);
  });

  it('keeps customer balances non-negative (no accidental over-collection)', () => {
    const balances = contactBalances(demo.contacts, demo.documents, demo.transactions, demo.instruments, {
      TRY: 1, USD: 49, EUR: 55.7, GBP: 65.4,
    });
    for (const c of demo.contacts.filter((x) => x.kind === 'customer')) {
      expect(balances.get(c.id)!, c.name).toBeGreaterThanOrEqual(0);
    }
  });
});
