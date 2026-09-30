import { diffDays, type ISODate } from './dates';
import { amountInBase } from './balances';
import { documentStatus, indexAllocations } from './documents';
import type { Money } from './money';
import type { Allocation, DocumentDirection, FinDocument, ID } from './types';

export interface AgingBuckets {
  current: Money;
  d1_30: Money;
  d31_60: Money;
  d61_90: Money;
  d90p: Money;
  total: Money;
}

export const emptyBuckets = (): AgingBuckets => ({ current: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0, total: 0 });

export function bucketFor(daysOverdue: number): keyof Omit<AgingBuckets, 'total'> {
  if (daysOverdue <= 0) return 'current';
  if (daysOverdue <= 30) return 'd1_30';
  if (daysOverdue <= 60) return 'd31_60';
  if (daysOverdue <= 90) return 'd61_90';
  return 'd90p';
}

export interface AgingReport {
  total: AgingBuckets;
  byContact: Map<ID, AgingBuckets>;
}

/** Açık kalan tutarların vade aşımına göre yaşlandırması (baz para biriminde). */
export function agingReport(
  documents: Iterable<FinDocument>,
  allocations: Iterable<Allocation>,
  asOf: ISODate,
  direction: DocumentDirection,
): AgingReport {
  const index = indexAllocations(allocations);
  const total = emptyBuckets();
  const byContact = new Map<ID, AgingBuckets>();

  for (const d of documents) {
    if (d.direction !== direction || d.cancelled) continue;
    const state = documentStatus(d, index, asOf);
    if (state.remaining <= 0) continue;
    const amount = amountInBase(state.remaining, d.rateToBase);
    const bucket = bucketFor(diffDays(asOf, d.dueDate));
    const key = d.contactId ?? '';
    const row = byContact.get(key) ?? emptyBuckets();
    row[bucket] += amount;
    row.total += amount;
    byContact.set(key, row);
    total[bucket] += amount;
    total.total += amount;
  }
  return { total, byContact };
}
