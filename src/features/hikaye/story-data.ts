import type { Finance } from '@/app/finance';
import { forecastInput } from '@/app/finance';
import { amountInBase } from '@/domain/balances';
import { categoryTotals, monthlyFlows } from '@/domain/aggregate';
import { addMonths, endOfMonth, monthKey, type ISODate } from '@/domain/dates';
import { buildForecast } from '@/domain/forecast';
import type { Money } from '@/domain/money';
import type { ID } from '@/domain/types';

export interface StoryData {
  month: string;
  from: ISODate;
  to: ISODate;
  inflow: Money;
  outflow: Money;
  net: Money;
  prevNet: Money;
  topCustomers: Array<{ id: ID; name: string; amount: Money }>;
  topCategories: Array<{ id: ID | null; name: string; amount: Money; color: string; icon: string }>;
  bestPayer: { name: string; delay: number; onTime: number } | null;
  latePayer: { name: string; delay: number } | null;
  txCount: number;
  forecastMin: { date: ISODate; value: Money };
  forecastEnd: Money;
  forecastDays: Array<{ date: ISODate; value: Money }>;
  alert: { date: ISODate; value: Money } | null;
}

/** Ayın hikâyesi için özet veri (seçilen ay; içinde bulunulan aysa bugüne kadar). */
export function buildStory(f: Finance, month: string): StoryData {
  const from = `${month}-01`;
  const end = endOfMonth(from);
  const to = end > f.today ? f.today : end;
  const flow = monthlyFlows(f.transactions, from, to)[0] ?? { inflow: 0, outflow: 0, net: 0 };
  const prev = monthlyFlows(f.transactions, addMonths(from, -1), endOfMonth(addMonths(from, -1)))[0];

  const byCustomer = new Map<ID, Money>();
  let txCount = 0;
  for (const t of f.transactions) {
    if (t.date < from || t.date > to) continue;
    txCount++;
    if (t.kind === 'income' && t.contactId) byCustomer.set(t.contactId, (byCustomer.get(t.contactId) ?? 0) + amountInBase(t.amount, t.rateToBase));
  }
  const topCustomers = [...byCustomer]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([id, amount]) => ({ id, name: f.contactsById.get(id)?.name ?? '—', amount }));

  const topCategories = categoryTotals(f.transactions, 'expense', from, to)
    .slice(0, 6)
    .map((c) => {
      const cat = c.categoryId ? f.categoriesById.get(c.categoryId) : undefined;
      return { id: c.categoryId, name: cat?.name ?? 'Kategorisiz', amount: c.total, color: cat?.color ?? 'other', icon: cat?.icon ?? 'dots' };
    });

  const payers = [...f.behavior].filter(([, b]) => b.samples >= 3);
  const best = payers.sort((a, b) => a[1].avgDelay - b[1].avgDelay)[0];
  const late = [...payers].sort((a, b) => b[1].avgDelay - a[1].avgDelay)[0];

  const fc = buildForecast(forecastInput(f, 30));
  return {
    month: monthKey(from),
    from,
    to,
    inflow: flow.inflow,
    outflow: flow.outflow,
    net: flow.net,
    prevNet: prev?.net ?? 0,
    topCustomers,
    topCategories,
    bestPayer: best ? { name: f.contactsById.get(best[0])?.name ?? '—', delay: best[1].avgDelay, onTime: best[1].onTimeRate } : null,
    latePayer: late && late[1].avgDelay > 5 ? { name: f.contactsById.get(late[0])?.name ?? '—', delay: late[1].avgDelay } : null,
    txCount,
    forecastMin: fc.min,
    forecastEnd: fc.end.expected,
    forecastDays: fc.days.map((d) => ({ date: d.date, value: d.expected })),
    alert: fc.alerts.find((a) => a.kind === 'below-min') ? { date: fc.alerts[0]!.date, value: fc.alerts[0]!.value } : null,
  };
}
