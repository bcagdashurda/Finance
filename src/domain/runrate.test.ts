import { describe, expect, it } from 'vitest';
import { doc, tx } from '@/test/factories';
import { computeRunRate } from './runrate';
import { buildForecast } from './forecast';

const TODAY = '2026-07-01';

describe('computeRunRate', () => {
  it('derives monthly sales from regular customers and ignores one-offs and uncertain offers', () => {
    const docs = [
      // Düzenli müşteri: 3 ayda 3 fatura × 90.000
      ...['2026-04-10', '2026-05-10', '2026-06-10'].map((d) => doc({ contactId: 'a', issueDate: d, dueDate: d, amount: 9_000_000 })),
      // Aykırı: aynı müşteriden dev fatura
      doc({ contactId: 'a', issueDate: '2026-06-20', dueDate: '2026-07-20', amount: 90_000_000 }),
      // Tek faturalık müşteri: düzenli değil
      doc({ contactId: 'b', issueDate: '2026-06-01', dueDate: '2026-07-01', amount: 50_000_000 }),
      // Teyit bekleyen teklif
      ...['2026-04-12', '2026-05-12', '2026-06-12'].map((d) => doc({ contactId: 'c', issueDate: d, dueDate: d, amount: 1_000_000, probability: 50 })),
    ];
    const r = computeRunRate({ documents: docs, transactions: [], today: TODAY, behavior: new Map() });
    expect(r.salesMonthly).toBe(9_000_000);
    expect(r.purchasesMonthly).toBe(0);
  });

  it('estimates the collection lag from payment terms plus the customer delay', () => {
    const docs = ['2026-04-10', '2026-05-10', '2026-06-10'].map((d) =>
      doc({ contactId: 'a', issueDate: d, dueDate: addDaysLocal(d, 30), amount: 9_000_000 }),
    );
    const r = computeRunRate({
      documents: docs,
      transactions: [],
      today: TODAY,
      behavior: new Map([['a', { avgDelay: 10, p80Delay: 15, onTimeRate: 0.2, samples: 5 }]]),
    });
    expect(r.salesLag).toBe(40);
  });

  it('averages unscheduled daily flows, skipping ledger, recurring and excluded categories', () => {
    const txs = [
      tx({ kind: 'income', amount: 900_000, date: '2026-06-15' }),
      tx({ kind: 'expense', amount: 450_000, date: '2026-06-16', categoryId: 'enerji' }),
      tx({ kind: 'expense', amount: 999_999, date: '2026-06-16', categoryId: 'kdv' }),
      tx({ kind: 'expense', amount: 999_999, date: '2026-06-17', recurringId: 'kira' }),
      tx({ kind: 'income', amount: 999_999, date: '2026-06-18', affectsLedger: true, contactId: 'a' }),
    ];
    const r = computeRunRate({ documents: [], transactions: txs, today: TODAY, behavior: new Map(), excludeCategoryIds: ['kdv'], windowDays: 90 });
    expect(r.dailyIn).toBe(10_000);
    expect(r.dailyOut).toBe(5_000);
  });
});

describe('buildForecast with run-rate', () => {
  it('spreads tempo evenly across business days for future sales and routine spending', () => {
    const f = buildForecast({
      today: TODAY,
      horizonDays: 60,
      startingBalance: 0,
      documents: [],
      docStates: new Map(),
      recurring: [],
      postedOccurrences: new Set(),
      instruments: [],
      rates: { TRY: 1, USD: 1, EUR: 1, GBP: 1 },
      behavior: new Map(),
      vat: [],
      minBalance: 0,
      runRate: { salesMonthly: 3_040_000, purchasesMonthly: 0, salesLag: 14, purchasesLag: 30, dailyIn: 0, dailyOut: 1_000 },
    });
    const tempo = f.items.filter((i) => i.source === 'runrate');
    // Satış temposu: yılda 250 iş günü → günlük 3.040.000 × 12 / 250 = 145.920
    const sales = tempo.filter((i) => i.direction === 'in');
    expect(sales[0]!.expectedAmount).toBe(145_920);
    // İlk tahsilat: yarın kesilen fatura + 14 gün
    expect(sales[0]!.expected >= '2026-07-16').toBe(true);
    // Rutin gider: takvim günü 1.000 → iş günü 1.460; hafta sonu kalem yok
    const outs = tempo.filter((i) => i.direction === 'out');
    expect(outs[0]!.expectedAmount).toBe(1_460);
    expect(outs.every((i) => ![0, 6].includes(new Date(`${i.expected}T00:00:00Z`).getUTCDay()))).toBe(true);
  });
});

function addDaysLocal(iso: string, days: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
