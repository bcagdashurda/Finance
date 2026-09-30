import { addMonths, adjustToBusinessDay, makeDate, monthKey, type ISODate } from './dates';
import { amountInBase } from './balances';
import type { Money } from './money';
import type { FinDocument } from './types';

export interface VatPeriod {
  /** 'YYYY-MM' */
  period: string;
  output: Money;
  input: Money;
  /** Ödenecek (devreden düşülmüş); 0 ise devreder */
  payable: Money;
  /** İzleyen ayın 28'i, iş gününe kaydırılmış */
  dueDate: ISODate;
}

/** Dönemin KDV beyan/ödeme son günü. */
export function vatDueDate(period: string): ISODate {
  const y = Number(period.slice(0, 4));
  const m = Number(period.slice(5, 7));
  return adjustToBusinessDay(addMonths(makeDate(y, m, 28), 1), 'next');
}

/**
 * Henüz ödeme günü gelmemiş dönemlerin tahmini KDV'si. Hesaplanan KDV (alacak
 * belgeleri) − indirilecek KDV (borç belgeleri); negatif tutar sonraki döneme devreder.
 * Tahmindir; beyan süresi uzatmaları GİB duyurularından doğrulanmalıdır.
 */
export function estimateVat(documents: Iterable<FinDocument>, today: ISODate): VatPeriod[] {
  const periods = new Map<string, { output: Money; input: Money }>();
  for (const d of documents) {
    if (d.cancelled || !d.vatAmount || d.issueDate > today) continue;
    const key = monthKey(d.issueDate);
    const row = periods.get(key) ?? { output: 0, input: 0 };
    const vat = amountInBase(d.vatAmount, d.rateToBase);
    if (d.direction === 'receivable') row.output += vat;
    else row.input += vat;
    periods.set(key, row);
  }
  const keys = [...periods.keys()].sort();
  const out: VatPeriod[] = [];
  let carry = 0;
  for (const key of keys) {
    const { output, input } = periods.get(key)!;
    const net = output - input - carry;
    const payable = Math.max(0, net);
    carry = net < 0 ? -net : 0;
    const dueDate = vatDueDate(key);
    if (dueDate >= today) out.push({ period: key, output, input, payable, dueDate });
  }
  return out;
}
