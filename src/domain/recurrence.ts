import { addDays, addMonths, adjustToBusinessDay, type ISODate } from './dates';
import type { Frequency, RecurringRule } from './types';

export interface Occurrence {
  /** Kuralın ürettiği ham tarih; ödeme eşleştirmesinde kararlı anahtar */
  nominal: ISODate;
  /** İş günü politikası uygulanmış tarih */
  date: ISODate;
}

const MONTHS_PER: Record<Exclude<Frequency, 'weekly'>, number> = { monthly: 1, quarterly: 3, yearly: 12 };

function nth(anchor: ISODate, frequency: Frequency, step: number): ISODate {
  if (frequency === 'weekly') return addDays(anchor, 7 * step);
  return addMonths(anchor, MONTHS_PER[frequency] * step);
}

/** Kuralın [from, to] aralığına düşen oluşumları (tarih her zaman çapadan hesaplanır, kayma olmaz). */
export function occurrences(rule: RecurringRule, from: ISODate, to: ISODate): Occurrence[] {
  if (!rule.active) return [];
  const interval = Math.max(1, rule.interval || 1);
  const out: Occurrence[] = [];
  // Hafta sonu kaydırması aralığı birkaç gün taşabilir; biraz geriden başla.
  const lower = addDays(from, -7);
  for (let k = 0; k < 5000; k++) {
    const nominal = nth(rule.anchorDate, rule.frequency, k * interval);
    if (rule.endDate && nominal > rule.endDate) break;
    if (nominal > addDays(to, 7)) break;
    if (nominal < lower) continue;
    const date = adjustToBusinessDay(nominal, rule.weekendPolicy);
    if (date >= from && date <= to) out.push({ nominal, date });
  }
  return out;
}

/**
 * Geçmiş penceredeki işaretlenmemiş tekrarlar ("Bekleyenler"). Kuralın uygulamaya eklendiği günden
 * öncesi sayılmaz: bugün eklenen kiranın geçen ayki oluşumu "ödenmedi" diye görünmemeli.
 */
export function unpostedOccurrences(
  rules: RecurringRule[],
  posted: Set<string>,
  today: ISODate,
  lookbackDays: number,
): Array<{ rule: RecurringRule; occurrence: Occurrence }> {
  const out: Array<{ rule: RecurringRule; occurrence: Occurrence }> = [];
  for (const r of rules) {
    if (!r.active || r.autoPost) continue;
    const added = r.createdAt.slice(0, 10);
    const window = addDays(today, -lookbackDays);
    const from = added > window ? added : window;
    for (const o of occurrences(r, from, addDays(today, -1))) {
      if (!posted.has(`${r.id}:${o.nominal}`)) out.push({ rule: r, occurrence: o });
    }
  }
  return out;
}
