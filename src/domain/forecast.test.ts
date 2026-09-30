import { describe, expect, it } from 'vitest';
import { allocation, contact, doc, instrument, rule, tx } from '@/test/factories';
import { documentStatus, indexAllocations } from './documents';
import { monthlyFlows } from './aggregate';
import { paymentBehavior } from './behavior';
import { estimateVat } from './vat';
import { buildForecast, type ForecastInput } from './forecast';
import type { FinDocument } from './types';

const TODAY = '2026-03-01';
const RATES = { TRY: 1, USD: 50, EUR: 55, GBP: 65 };

describe('monthlyFlows', () => {
  it('sums income and expense per month in base currency, ignoring transfers', () => {
    const rows = monthlyFlows(
      [
        tx({ kind: 'income', amount: 1_000, date: '2026-01-05' }),
        tx({ kind: 'income', amount: 10, currency: 'USD', rateToBase: 50, date: '2026-01-20' }),
        tx({ kind: 'expense', amount: 300, date: '2026-01-25' }),
        tx({ kind: 'transfer', amount: 999, date: '2026-01-26', toAccountId: 'x' }),
        tx({ kind: 'expense', amount: 200, date: '2026-02-02' }),
      ],
      '2026-01-01',
      '2026-02-28',
    );
    expect(rows).toEqual([
      { key: '2026-01', inflow: 1_500, outflow: 300, net: 1_200 },
      { key: '2026-02', inflow: 0, outflow: 200, net: -200 },
    ]);
  });
});

describe('paymentBehavior', () => {
  it('computes amount-weighted average and P80 delay from settled receivables', () => {
    const c = contact({ id: 'k' });
    const docs = [
      doc({ id: 'a', contactId: 'k', amount: 100, dueDate: '2026-01-10' }),
      doc({ id: 'b', contactId: 'k', amount: 300, dueDate: '2026-01-20' }),
    ];
    const al = [
      allocation({ documentId: 'a', amount: 100, date: '2026-01-10' }), // 0 gün
      allocation({ documentId: 'b', amount: 300, date: '2026-02-09' }), // 20 gün
    ];
    const b = paymentBehavior([c], docs, indexAllocations(al), TODAY).get('k')!;
    expect(b.avgDelay).toBe(15); // (0*100 + 20*300) / 400
    expect(b.p80Delay).toBe(20);
    expect(b.onTimeRate).toBeCloseTo(0.25);
    expect(b.samples).toBe(2);
  });
});

describe('estimateVat', () => {
  it('nets output VAT against input VAT and schedules payment on the 28th of the next month', () => {
    const docs: FinDocument[] = [
      doc({ direction: 'receivable', issueDate: '2026-02-10', amount: 120_000, vatAmount: 20_000 }),
      doc({ direction: 'payable', issueDate: '2026-02-12', amount: 60_000, vatAmount: 10_000 }),
      doc({ direction: 'receivable', issueDate: '2026-03-01', amount: 60_000, vatAmount: 10_000 }),
    ];
    const vat = estimateVat(docs, TODAY);
    expect(vat).toEqual([
      { period: '2026-02', output: 20_000, input: 10_000, payable: 10_000, dueDate: '2026-03-30' },
      { period: '2026-03', output: 10_000, input: 0, payable: 10_000, dueDate: '2026-04-28' },
    ]);
  });
});

function input(overrides: Partial<ForecastInput> = {}): ForecastInput {
  const documents = overrides.documents ?? [];
  const allocations = indexAllocations([]);
  const docStates = new Map(documents.map((d) => [d.id, documentStatus(d, allocations, TODAY)]));
  return {
    today: TODAY,
    horizonDays: 30,
    startingBalance: 100_000,
    documents,
    docStates,
    recurring: [],
    postedOccurrences: new Set(),
    instruments: [],
    rates: RATES,
    behavior: new Map(),
    vat: [],
    minBalance: 50_000,
    ...overrides,
  };
}

describe('buildForecast', () => {
  it('projects a flat balance when nothing is planned', () => {
    const f = buildForecast(input());
    expect(f.days).toHaveLength(31);
    expect(f.days.at(-1)).toMatchObject({ expected: 100_000, optimistic: 100_000, pessimistic: 100_000 });
  });

  it('adds receivables and subtracts payables on their due dates', () => {
    const f = buildForecast(
      input({
        documents: [
          doc({ id: 'r', direction: 'receivable', amount: 40_000, dueDate: '2026-03-05', contactId: 'c' }),
          doc({ id: 'p', direction: 'payable', amount: 70_000, dueDate: '2026-03-10', contactId: 's' }),
        ],
      }),
    );
    const day = (d: string) => f.days.find((x) => x.date === d)!;
    expect(day('2026-03-04').expected).toBe(100_000);
    expect(day('2026-03-05').expected).toBe(140_000);
    expect(day('2026-03-10').expected).toBe(70_000);
    expect(day('2026-03-10').outflow).toBe(70_000);
  });

  it('delays receivables by the customer\'s habit in the base case and by P80 in the pessimistic band', () => {
    const f = buildForecast(
      input({
        documents: [doc({ id: 'r', direction: 'receivable', amount: 40_000, dueDate: '2026-03-05', contactId: 'late' })],
        behavior: new Map([['late', { avgDelay: 10, p80Delay: 20, onTimeRate: 0.1, samples: 6 }]]),
      }),
    );
    const item = f.items[0]!;
    expect(item.optimistic).toBe('2026-03-05');
    expect(item.expected).toBe('2026-03-16'); // 15 Mart pazar → pazartesi
    expect(item.pessimistic).toBe('2026-03-25');
  });

  it('weights uncertain receivables by probability and drops them below 50% in the pessimistic band', () => {
    const f = buildForecast(
      input({
        documents: [doc({ id: 'r', direction: 'receivable', amount: 100_000, dueDate: '2026-03-10', probability: 40 })],
      }),
    );
    const last = f.days.at(-1)!;
    expect(last.optimistic).toBe(200_000);
    expect(last.expected).toBe(140_000);
    expect(last.pessimistic).toBe(100_000);
  });

  it('includes unposted recurring occurrences and skips posted ones', () => {
    const r = rule({ id: 'rent', amount: 30_000, anchorDate: '2026-01-05', direction: 'out' });
    const f = buildForecast(input({ recurring: [r], postedOccurrences: new Set(['rent:2026-03-05']), horizonDays: 40 }));
    expect(f.items.map((i) => i.dueDate)).toEqual(['2026-04-05']);
  });

  it('treats portfolio cheques as inflows and issued cheques as outflows at maturity', () => {
    const f = buildForecast(
      input({
        instruments: [
          instrument({ amount: 25_000, dueDate: '2026-03-12', status: 'portfolio' }),
          instrument({ amount: 10_000, dueDate: '2026-03-15', direction: 'issued', status: 'issued' }),
          instrument({ amount: 99_000, dueDate: '2026-03-15', status: 'endorsed' }),
        ],
      }),
    );
    expect(f.days.at(-1)!.expected).toBe(115_000);
  });

  it('raises an alert on the first day below the minimum with the biggest drivers', () => {
    const f = buildForecast(
      input({
        documents: [
          doc({ id: 'p1', direction: 'payable', amount: 30_000, dueDate: '2026-03-08', title: 'Kira' }),
          doc({ id: 'p2', direction: 'payable', amount: 45_000, dueDate: '2026-03-09', title: 'Hammadde' }),
        ],
      }),
    );
    const alert = f.alerts.find((a) => a.kind === 'below-min')!;
    expect(alert.date).toBe('2026-03-09');
    expect(alert.value).toBe(25_000);
    expect(alert.drivers.map((d) => d.label)).toEqual(['Hammadde', 'Kira']);
    expect(f.min).toEqual({ date: '2026-03-09', value: 25_000 });
  });

  it('applies scenario adjustments: delay, exclude, one-off and scale', () => {
    const r1 = doc({ id: 'r1', direction: 'receivable', amount: 50_000, dueDate: '2026-03-05' });
    const p1 = doc({ id: 'p1', direction: 'payable', amount: 20_000, dueDate: '2026-03-06' });
    const f = buildForecast(
      input({
        documents: [r1, p1],
        scenario: {
          adjustments: [
            { id: 'a', type: 'delay', target: { kind: 'document', id: 'r1' }, days: 60 },
            { id: 'b', type: 'oneOff', direction: 'out', amount: 5_000, date: '2026-03-20', label: 'Tamir' },
            { id: 'c', type: 'scale', direction: 'out', percent: 50 },
            { id: 'd', type: 'exclude', target: { kind: 'document', id: 'nope' } },
          ],
        },
      }),
    );
    // r1 ufkun dışına kaydı; giderler %50 arttı: 20.000→30.000, 5.000→7.500
    expect(f.days.at(-1)!.expected).toBe(100_000 - 30_000 - 7_500);
  });
});
