import { addMonths, monthKey, startOfMonth, type ISODate } from './dates';
import { amountInBase } from './balances';
import type { Money } from './money';
import type { ID, Transaction } from './types';

export interface MonthFlow {
  key: string;
  inflow: Money;
  outflow: Money;
  net: Money;
}

/** [from, to] aralığındaki her ay için giriş/çıkış (baz para birimi, transferler hariç). */
export function monthlyFlows(transactions: Iterable<Transaction>, from: ISODate, to: ISODate): MonthFlow[] {
  const rows = new Map<string, MonthFlow>();
  for (let m = startOfMonth(from); m <= to; m = addMonths(m, 1)) {
    rows.set(monthKey(m), { key: monthKey(m), inflow: 0, outflow: 0, net: 0 });
  }
  for (const t of transactions) {
    if (t.kind === 'transfer' || t.date < from || t.date > to) continue;
    const row = rows.get(monthKey(t.date));
    if (!row) continue;
    const v = amountInBase(t.amount, t.rateToBase);
    if (t.kind === 'income') row.inflow += v;
    else row.outflow += v;
    row.net = row.inflow - row.outflow;
  }
  return [...rows.values()];
}

export interface CategoryTotal {
  categoryId: ID | null;
  total: Money;
  count: number;
}

/** Kategori bazında toplam (baz para birimi). */
export function categoryTotals(
  transactions: Iterable<Transaction>,
  kind: 'income' | 'expense',
  from: ISODate,
  to: ISODate,
): CategoryTotal[] {
  const map = new Map<ID | null, CategoryTotal>();
  for (const t of transactions) {
    if (t.kind !== kind || t.date < from || t.date > to) continue;
    const key = t.categoryId ?? null;
    const row = map.get(key) ?? { categoryId: key, total: 0, count: 0 };
    row.total += amountInBase(t.amount, t.rateToBase);
    row.count += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
