import { diffDays, type ISODate } from './dates';
import type { Money } from './money';
import type { Allocation, FinDocument, ID } from './types';

export type DocumentStatusKind = 'open' | 'partial' | 'overdue' | 'paid' | 'cancelled';

export interface DocumentState {
  status: DocumentStatusKind;
  allocated: Money;
  remaining: Money;
  daysOverdue: number;
  /** Tamamen kapandığı gün (son tahsis tarihi) */
  paidDate?: ISODate;
}

/** documentId → tahsisler dizini; çok sayıda belge durumunu hesaplarken kullanılır. */
export function indexAllocations(allocations: Iterable<Allocation>): Map<ID, Allocation[]> {
  const map = new Map<ID, Allocation[]>();
  for (const a of allocations) {
    const list = map.get(a.documentId);
    if (list) list.push(a);
    else map.set(a.documentId, [a]);
  }
  return map;
}

export function documentStatus(
  doc: FinDocument,
  allocations: Allocation[] | Map<ID, Allocation[]>,
  today: ISODate,
): DocumentState {
  const own = Array.isArray(allocations)
    ? allocations.filter((a) => a.documentId === doc.id)
    : (allocations.get(doc.id) ?? []);
  let allocated = 0;
  let lastDate: ISODate | undefined;
  for (const a of own) {
    allocated += a.amount;
    if (!lastDate || a.date > lastDate) lastDate = a.date;
  }
  const remaining = Math.max(0, doc.amount - allocated);

  if (doc.cancelled) return { status: 'cancelled', allocated, remaining: 0, daysOverdue: 0 };
  if (remaining === 0) return { status: 'paid', allocated, remaining: 0, daysOverdue: 0, paidDate: lastDate };

  const late = diffDays(today, doc.dueDate);
  if (late > 0) return { status: 'overdue', allocated, remaining, daysOverdue: late };
  return { status: allocated > 0 ? 'partial' : 'open', allocated, remaining, daysOverdue: 0 };
}

export interface OpenItem {
  id: ID;
  dueDate: ISODate;
  remaining: Money;
}

export interface AllocationPlan {
  allocations: Array<{ documentId: ID; amount: Money }>;
  /** Hiçbir belgeye düşmeyen kalan (avans / cari mahsup) */
  unallocated: Money;
}

/** Ödemeyi açık belgelere vade sırasıyla (FIFO) dağıtır. */
export function planAllocation(amount: Money, openItems: OpenItem[]): AllocationPlan {
  const sorted = [...openItems].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  let left = amount;
  const allocations: AllocationPlan['allocations'] = [];
  for (const item of sorted) {
    if (left <= 0) break;
    const take = Math.min(left, item.remaining);
    if (take > 0) {
      allocations.push({ documentId: item.id, amount: take });
      left -= take;
    }
  }
  return { allocations, unallocated: left };
}
