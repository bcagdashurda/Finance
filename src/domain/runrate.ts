import { addDays, diffDays, type ISODate } from './dates';
import { amountInBase } from './balances';
import type { PaymentBehavior } from './behavior';
import type { Money } from './money';
import type { DocumentDirection, FinDocument, ID, Transaction } from './types';

/**
 * Tempo tahmini: henüz kesilmemiş faturalar ve belgesiz rutin akışlar.
 * Belgeye dayalı projeksiyonun ufuk ilerledikçe yapay olarak düşmesini önler.
 */
export interface RunRate {
  /** Düzenli carilerden aylık yeni satış faturası (baz) */
  salesMonthly: Money;
  /** Düzenli tedarikçilerden aylık yeni alış faturası (baz) */
  purchasesMonthly: Money;
  /** Satış faturası kesiminden tahsilata ortalama gün (vade + gecikme) */
  salesLag: number;
  purchasesLag: number;
  /** Belgesiz, planlanmamış günlük ortalama giriş / çıkış */
  dailyIn: Money;
  dailyOut: Money;
}

interface RunRateInput {
  documents: Iterable<FinDocument>;
  transactions: Iterable<Transaction>;
  today: ISODate;
  behavior: Map<ID, PaymentBehavior>;
  excludeCategoryIds?: ID[];
  windowDays?: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function directionRate(
  docs: FinDocument[],
  direction: DocumentDirection,
  today: ISODate,
  windowDays: number,
  behavior: Map<ID, PaymentBehavior>,
): { monthly: Money; lag: number } {
  const historyFrom = addDays(today, -180);
  const windowFrom = addDays(today, -windowDays);
  const months = windowDays / 30;
  const byContact = new Map<ID, FinDocument[]>();
  for (const d of docs) {
    if (d.direction !== direction || d.cancelled || !d.contactId) continue;
    if ((d.probability ?? 100) < 100) continue;
    if (d.issueDate <= historyFrom || d.issueDate > today) continue;
    const list = byContact.get(d.contactId) ?? [];
    list.push(d);
    byContact.set(d.contactId, list);
  }
  let monthly = 0;
  let lagWeighted = 0;
  for (const [contactId, list] of byContact) {
    if (list.length < 3) continue;
    const amounts = list.map((d) => amountInBase(d.amount, d.rateToBase));
    const limit = median(amounts) * 2.5;
    const recent = list.filter((d) => d.issueDate > windowFrom && amountInBase(d.amount, d.rateToBase) <= limit);
    if (!recent.length) continue;
    const sum = recent.reduce((s, d) => s + amountInBase(d.amount, d.rateToBase), 0);
    const rate = sum / months;
    const term = recent.reduce((s, d) => s + diffDays(d.dueDate, d.issueDate) * d.amount, 0) / recent.reduce((s, d) => s + d.amount, 0);
    const delay = direction === 'receivable' ? Math.max(0, behavior.get(contactId)?.avgDelay ?? 0) : 0;
    monthly += rate;
    lagWeighted += (term + delay) * rate;
  }
  return { monthly: Math.round(monthly), lag: monthly ? Math.round(lagWeighted / monthly) : 30 };
}

export function computeRunRate({
  documents,
  transactions,
  today,
  behavior,
  excludeCategoryIds = [],
  windowDays = 90,
}: RunRateInput): RunRate {
  const docs = [...documents];
  const sales = directionRate(docs, 'receivable', today, windowDays, behavior);
  const purchases = directionRate(docs, 'payable', today, windowDays, behavior);

  const excluded = new Set(excludeCategoryIds);
  const from = addDays(today, -windowDays);
  let inSum = 0;
  let outSum = 0;
  for (const t of transactions) {
    if (t.kind === 'transfer' || t.affectsLedger || t.recurringId || t.instrumentId) continue;
    if (t.date < from || t.date >= today) continue;
    if (t.categoryId && excluded.has(t.categoryId)) continue;
    const v = amountInBase(t.amount, t.rateToBase);
    if (t.kind === 'income') inSum += v;
    else outSum += v;
  }

  return {
    salesMonthly: sales.monthly,
    purchasesMonthly: purchases.monthly,
    salesLag: sales.lag,
    purchasesLag: purchases.lag,
    dailyIn: Math.round(inSum / windowDays),
    dailyOut: Math.round(outSum / windowDays),
  };
}
