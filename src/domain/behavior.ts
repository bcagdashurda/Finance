import { diffDays, type ISODate } from './dates';
import type { Allocation, Contact, FinDocument, ID } from './types';

export interface PaymentBehavior {
  /** Tutar ağırlıklı ortalama gecikme (gün; negatif = erken) */
  avgDelay: number;
  /** Tutar ağırlıklı %80'lik gecikme */
  p80Delay: number;
  /** Vadesinde ya da erken ödenen tutar payı */
  onTimeRate: number;
  samples: number;
}

interface Sample {
  delay: number;
  weight: number;
}

function weightedPercentile(samples: Sample[], p: number): number {
  const sorted = [...samples].sort((a, b) => a.delay - b.delay);
  const total = sorted.reduce((s, x) => s + x.weight, 0);
  let acc = 0;
  for (const s of sorted) {
    acc += s.weight;
    if (acc / total >= p - 1e-9) return s.delay;
  }
  return sorted.at(-1)?.delay ?? 0;
}

/**
 * Carilerin geçmiş ödeme davranışı: kapanmış alacak belgelerinin vade ile
 * kapanış (son tahsis) tarihi arasındaki fark.
 */
export function paymentBehavior(
  contacts: Contact[],
  documents: Iterable<FinDocument>,
  allocationIndex: Map<ID, Allocation[]>,
  asOf: ISODate,
): Map<ID, PaymentBehavior> {
  const samples = new Map<ID, Sample[]>();
  for (const d of documents) {
    if (d.direction !== 'receivable' || d.cancelled || !d.contactId) continue;
    const allocs = allocationIndex.get(d.id);
    if (!allocs?.length) continue;
    const paid = allocs.reduce((s, a) => s + a.amount, 0);
    if (paid < d.amount) continue;
    const closed = allocs.reduce((m, a) => (a.date > m ? a.date : m), allocs[0]!.date);
    if (closed > asOf) continue;
    const list = samples.get(d.contactId) ?? [];
    list.push({ delay: diffDays(closed, d.dueDate), weight: d.amount });
    samples.set(d.contactId, list);
  }

  const out = new Map<ID, PaymentBehavior>();
  for (const c of contacts) {
    const list = samples.get(c.id);
    if (!list?.length) continue;
    const total = list.reduce((s, x) => s + x.weight, 0);
    const avg = list.reduce((s, x) => s + x.delay * x.weight, 0) / total;
    const onTime = list.filter((x) => x.delay <= 0).reduce((s, x) => s + x.weight, 0) / total;
    out.set(c.id, {
      avgDelay: Math.round(avg),
      p80Delay: weightedPercentile(list, 0.8),
      onTimeRate: onTime,
      samples: list.length,
    });
  }
  return out;
}

/** Tüm carilerin tutar ağırlıklı genel davranışı (verisi olmayan cariler için yedek). */
export function overallBehavior(map: Map<ID, PaymentBehavior>): PaymentBehavior | null {
  let weight = 0;
  let avg = 0;
  let p80 = 0;
  let onTime = 0;
  for (const b of map.values()) {
    weight += b.samples;
    avg += b.avgDelay * b.samples;
    p80 += b.p80Delay * b.samples;
    onTime += b.onTimeRate * b.samples;
  }
  if (!weight) return null;
  return { avgDelay: Math.round(avg / weight), p80Delay: Math.round(p80 / weight), onTimeRate: onTime / weight, samples: weight };
}
