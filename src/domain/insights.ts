import { addDays, addMonths, monthKey, startOfMonth, type ISODate } from './dates';
import { amountInBase } from './balances';
import type { Money } from './money';
import type { ID, Transaction } from './types';

export interface ExpenseAnomaly {
  categoryId: ID;
  month: string;
  actual: Money;
  baseline: Money;
  /** (actual − baseline) / baseline */
  change: number;
}

/**
 * Son tamamlanmış ayın kategori gideri, önceki 3 ayın ortalamasını belirgin biçimde aşıyor mu?
 */
export function expenseAnomalies(
  transactions: Iterable<Transaction>,
  today: ISODate,
  {
    threshold = 0.35,
    minAmount = 10_000_00,
    excludeCategoryIds = [],
  }: { threshold?: number; minAmount?: Money; excludeCategoryIds?: ID[] } = {},
): ExpenseAnomaly[] {
  const lastMonth = monthKey(addMonths(startOfMonth(today), -1));
  const prev = [1, 2, 3].map((k) => monthKey(addMonths(startOfMonth(today), -1 - k)));
  const excluded = new Set(excludeCategoryIds);
  const sums = new Map<ID, Map<string, Money>>();
  for (const t of transactions) {
    // Planlı (tekrarlayan) ödemeler sürpriz harcama değildir
    if (t.kind !== 'expense' || !t.categoryId || t.recurringId || excluded.has(t.categoryId)) continue;
    const key = monthKey(t.date);
    if (key !== lastMonth && !prev.includes(key)) continue;
    const byMonth = sums.get(t.categoryId) ?? new Map<string, Money>();
    byMonth.set(key, (byMonth.get(key) ?? 0) + amountInBase(t.amount, t.rateToBase));
    sums.set(t.categoryId, byMonth);
  }
  const out: ExpenseAnomaly[] = [];
  for (const [categoryId, byMonth] of sums) {
    const actual = byMonth.get(lastMonth) ?? 0;
    const baseline = Math.round(prev.reduce((s, k) => s + (byMonth.get(k) ?? 0), 0) / prev.length);
    if (actual < minAmount || baseline <= 0) continue;
    const change = (actual - baseline) / baseline;
    if (change >= threshold) out.push({ categoryId, month: lastMonth, actual, baseline, change: Math.round(change * 100) / 100 });
  }
  return out.sort((a, b) => b.actual - b.baseline - (a.actual - a.baseline));
}

export interface Concentration {
  contactId: ID;
  share: number;
  total: Money;
}

/** Son N günde tahsilatların en büyük müşteriye düşen payı. */
export function customerConcentration(transactions: Iterable<Transaction>, today: ISODate, days = 90): Concentration | null {
  const from = addDays(today, -days);
  const by = new Map<ID, Money>();
  let total = 0;
  for (const t of transactions) {
    if (t.kind !== 'income' || !t.contactId || t.date < from || t.date > today) continue;
    const v = amountInBase(t.amount, t.rateToBase);
    by.set(t.contactId, (by.get(t.contactId) ?? 0) + v);
    total += v;
  }
  if (!total) return null;
  let top: [ID, Money] | null = null;
  for (const e of by) if (!top || e[1] > top[1]) top = e;
  return top ? { contactId: top[0], share: Math.round((top[1] / total) * 100) / 100, total } : null;
}

/** Günlük ortalama satıştan hesaplanan alacak tahsil süresi (gün). */
export function daysSalesOutstanding(openReceivables: Money, transactions: Iterable<Transaction>, today: ISODate, window = 90): number | null {
  const from = addDays(today, -window);
  let sales = 0;
  for (const t of transactions) {
    if (t.kind === 'income' && t.date >= from && t.date <= today) sales += amountInBase(t.amount, t.rateToBase);
  }
  if (!sales) return null;
  return Math.round(openReceivables / (sales / window));
}
