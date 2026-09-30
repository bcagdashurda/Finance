import { addDays, adjustToBusinessDay, diffDays, eachDay, isBusinessDay, type ISODate } from './dates';
import { convertMinor, type Money } from './money';
import type { RateTable } from './balances';
import type { DocumentState } from './documents';
import type { PaymentBehavior } from './behavior';
import { occurrences } from './recurrence';
import type { VatPeriod } from './vat';
import type { RunRate } from './runrate';
import type { Adjustment, FinDocument, FlowDirection, Frequency, ID, Instrument, RecurringRule, TargetRef, Transaction } from './types';

export type ForecastSource = 'document' | 'recurring' | 'instrument' | 'vat' | 'scenario' | 'runrate' | 'planned';

export interface ForecastItem {
  key: string;
  source: ForecastSource;
  refId?: ID;
  direction: FlowDirection;
  label: string;
  contactId?: ID;
  categoryId?: ID;
  /** Baz para biriminde, olasılık uygulanmamış tam tutar */
  amount: Money;
  /** Baz senaryoda sayılan tutar (olasılık ağırlıklı) */
  expectedAmount: Money;
  dueDate: ISODate;
  expected: ISODate;
  optimistic: ISODate | null;
  pessimistic: ISODate | null;
  overdue: boolean;
  probability: number;
}

export interface ForecastDay {
  date: ISODate;
  expected: Money;
  optimistic: Money;
  pessimistic: Money;
  /** Baz senaryoda o günün girişleri / çıkışları */
  inflow: Money;
  outflow: Money;
}

export interface ForecastAlert {
  kind: 'below-min' | 'negative' | 'pessimistic-below-min';
  date: ISODate;
  value: Money;
  drivers: ForecastItem[];
}

export interface ForecastInput {
  today: ISODate;
  horizonDays: number;
  startingBalance: Money;
  documents: FinDocument[];
  docStates: Map<ID, DocumentState>;
  recurring: RecurringRule[];
  /** `${ruleId}:${nominal}` — gerçekleşmiş tekrar oluşumları */
  postedOccurrences: Set<string>;
  instruments: Instrument[];
  rates: RateTable;
  behavior: Map<ID, PaymentBehavior>;
  fallbackBehavior?: PaymentBehavior | null;
  vat: VatPeriod[];
  minBalance: Money;
  scenario?: { adjustments: Adjustment[] };
  /** Tempo tahmini (henüz kesilmemiş faturalar, belgesiz rutin akışlar) */
  runRate?: RunRate | null;
  /** İleri tarihli işlemler ("yarın kira ödemesi"): bugünkü bakiyede yok, vadesinde projeksiyona girer */
  transactions?: Transaction[];
}

export interface ForecastResult {
  items: ForecastItem[];
  days: ForecastDay[];
  alerts: ForecastAlert[];
  min: { date: ISODate; value: Money };
  end: ForecastDay;
  totals: { inflow: Money; outflow: Money };
}

const biz = (d: ISODate) => adjustToBusinessDay(d, 'next');
const later = (a: ISODate, b: ISODate) => (a > b ? a : b);

function toBase(amount: Money, currency: keyof RateTable, rates: RateTable): Money {
  return convertMinor(amount, rates[currency] ?? 1, 1);
}

function documentItem(d: FinDocument, state: DocumentState, input: ForecastInput): ForecastItem | null {
  if (d.cancelled || state.remaining <= 0) return null;
  const { today } = input;
  const amount = toBase(state.remaining, d.currency, input.rates);
  const probability = d.direction === 'receivable' ? (d.probability ?? 100) / 100 : 1;
  const overdue = d.dueDate < today;
  const base = {
    key: `doc:${d.id}`,
    source: 'document' as const,
    refId: d.id,
    direction: (d.direction === 'receivable' ? 'in' : 'out') as FlowDirection,
    label: d.title + (d.number ? ` · ${d.number}` : ''),
    contactId: d.contactId,
    categoryId: d.categoryId,
    amount,
    expectedAmount: Math.round(amount * probability),
    dueDate: d.dueDate,
    overdue,
    probability,
  };

  if (d.direction === 'payable') {
    const date = overdue ? today : biz(d.dueDate);
    return { ...base, expected: date, optimistic: date, pessimistic: date };
  }

  const b = (d.contactId && input.behavior.get(d.contactId)) || input.fallbackBehavior || null;
  const avg = Math.max(0, b?.avgDelay ?? 0);
  const p80 = Math.max(avg, b?.p80Delay ?? 0);

  if (overdue) {
    const late = diffDays(today, d.dueDate);
    const expected = biz(addDays(today, Math.max(3, avg - late)));
    const pessimistic = late > 90 ? null : biz(addDays(today, Math.max(14, p80 - late)));
    return { ...base, expected, optimistic: biz(addDays(today, 1)), pessimistic: probability < 0.5 ? null : pessimistic };
  }

  return {
    ...base,
    optimistic: biz(d.dueDate),
    expected: biz(addDays(d.dueDate, avg)),
    pessimistic: probability < 0.5 ? null : biz(addDays(d.dueDate, Math.max(p80, 3))),
  };
}

function instrumentItem(ins: Instrument, input: ForecastInput): ForecastItem | null {
  const live =
    (ins.direction === 'received' && (ins.status === 'portfolio' || ins.status === 'deposited')) ||
    (ins.direction === 'issued' && ins.status === 'issued');
  if (!live) return null;
  const amount = toBase(ins.amount, ins.currency, input.rates);
  const due = later(biz(ins.dueDate), input.today);
  const inflow = ins.direction === 'received';
  return {
    key: `ins:${ins.id}`,
    source: 'instrument',
    refId: ins.id,
    direction: inflow ? 'in' : 'out',
    label: `${ins.kind === 'cheque' ? 'Çek' : 'Senet'} · ${ins.serialNo}`,
    contactId: ins.contactId,
    amount,
    expectedAmount: amount,
    dueDate: ins.dueDate,
    expected: due,
    optimistic: due,
    pessimistic: inflow ? biz(addDays(due, 2)) : due,
    overdue: ins.dueDate < input.today,
    probability: 1,
  };
}

function recurringItems(input: ForecastInput, to: ISODate): ForecastItem[] {
  const items: ForecastItem[] = [];
  for (const r of input.recurring) {
    for (const occ of occurrences(r, input.today, to)) {
      if (input.postedOccurrences.has(`${r.id}:${occ.nominal}`)) continue;
      const amount = toBase(r.amount, r.currency, input.rates);
      items.push({
        key: `rec:${r.id}:${occ.nominal}`,
        source: 'recurring',
        refId: r.id,
        direction: r.direction,
        label: r.title,
        contactId: r.contactId,
        categoryId: r.categoryId,
        amount,
        expectedAmount: amount,
        dueDate: occ.date,
        expected: occ.date,
        optimistic: occ.date,
        pessimistic: occ.date,
        overdue: false,
        probability: 1,
      });
    }
  }
  return items;
}

/** İleri tarihli gelir/gider işlemleri; kendi hesaplarınız arası transfer toplam nakdi değiştirmez. */
function plannedItems(input: ForecastInput, to: ISODate): ForecastItem[] {
  const items: ForecastItem[] = [];
  for (const t of input.transactions ?? []) {
    if (t.kind === 'transfer' || t.date <= input.today || t.date > to) continue;
    const amount = toBase(t.amount, t.currency, input.rates);
    items.push({
      key: `tx:${t.id}`,
      source: 'planned',
      refId: t.id,
      direction: t.kind === 'income' ? 'in' : 'out',
      label: t.description || (t.kind === 'income' ? 'Planlı giriş' : 'Planlı ödeme'),
      contactId: t.contactId,
      categoryId: t.categoryId,
      amount,
      expectedAmount: amount,
      dueDate: t.date,
      expected: t.date,
      optimistic: t.date,
      pessimistic: t.date,
      overdue: false,
      probability: 1,
    });
  }
  return items;
}

function vatItems(input: ForecastInput): ForecastItem[] {
  return input.vat
    .filter((v) => v.payable > 0)
    .map((v) => ({
      key: `vat:${v.period}`,
      source: 'vat' as const,
      direction: 'out' as const,
      label: `Tahmini KDV · ${v.period}`,
      amount: v.payable,
      expectedAmount: v.payable,
      dueDate: v.dueDate,
      expected: v.dueDate,
      optimistic: v.dueDate,
      pessimistic: v.dueDate,
      overdue: false,
      probability: 1,
    }));
}

/**
 * Tempo kalemleri iş günlerine eşit yayılır (yılda ~250 iş günü). Yeni satışlar
 * kötümser bantta sayılmaz ("yeni sipariş gelmezse" varsayımı); rutin akışlar her bantta vardır.
 */
function runRateItems(input: ForecastInput, to: ISODate): ForecastItem[] {
  const r = input.runRate;
  if (!r) return [];
  const items: ForecastItem[] = [];
  const perBizDay = (monthly: Money) => Math.round((monthly * 12) / 250);
  const fromDaily = (daily: Money) => Math.round((daily * 365) / 250);
  const push = (key: string, direction: FlowDirection, label: string, amount: Money, date: ISODate, pessimistic: boolean) => {
    if (amount <= 0 || date > to) return;
    items.push({
      key, source: 'runrate', direction, label, amount, expectedAmount: amount, dueDate: date, expected: date,
      optimistic: date, pessimistic: pessimistic ? date : null, overdue: false, probability: 1,
    });
  };
  const sales = perBizDay(r.salesMonthly);
  const purchases = perBizDay(r.purchasesMonthly);
  const dailyIn = fromDaily(r.dailyIn);
  const dailyOut = fromDaily(r.dailyOut);
  for (let d = addDays(input.today, 1); d <= to; d = addDays(d, 1)) {
    if (!isBusinessDay(d)) continue;
    // Bugünden sonra kesilecek faturalar, vade + gecikme sonra tahsil / ödenir
    push(`rr:sales:${d}`, 'in', 'Tempo · yeni satışlar (tahmini)', sales, biz(addDays(d, r.salesLag)), false);
    push(`rr:purchases:${d}`, 'out', 'Tempo · yeni alışlar (tahmini)', purchases, biz(addDays(d, r.purchasesLag)), true);
    push(`rr:in:${d}`, 'in', 'Tempo · rutin gelirler', dailyIn, d, true);
    push(`rr:out:${d}`, 'out', 'Tempo · rutin giderler', dailyOut, d, true);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Senaryolar

function matches(item: ForecastItem, target: TargetRef): boolean {
  const kind = target.kind === 'document' ? 'document' : target.kind === 'instrument' ? 'instrument' : 'recurring';
  return item.source === kind && item.refId === target.id;
}

const shift = (d: ISODate | null, days: number) => (d ? addDays(d, days) : d);

function stepDates(start: ISODate, end: ISODate, frequency: Frequency): ISODate[] {
  const rule = {
    id: 'scn',
    workspaceId: '',
    createdAt: '',
    updatedAt: '',
    direction: 'out' as const,
    title: '',
    amount: 0,
    currency: 'TRY' as const,
    frequency,
    interval: 1,
    anchorDate: start,
    weekendPolicy: 'next' as const,
    autoPost: false,
    active: true,
  };
  return occurrences(rule, start, end).map((o) => o.date);
}

function applyScenario(items: ForecastItem[], adjustments: Adjustment[], today: ISODate, to: ISODate): ForecastItem[] {
  let out = items;
  for (const adj of adjustments) {
    if (adj.type === 'delay') {
      out = out.map((i) =>
        matches(i, adj.target)
          ? { ...i, expected: addDays(i.expected, adj.days), optimistic: shift(i.optimistic, adj.days), pessimistic: shift(i.pessimistic, adj.days) }
          : i,
      );
    } else if (adj.type === 'exclude') {
      out = out.filter((i) => !matches(i, adj.target));
    } else if (adj.type === 'oneOff') {
      const d = later(adj.date, today);
      out = [
        ...out,
        {
          key: `scn:${adj.id}`, source: 'scenario', direction: adj.direction, label: adj.label, amount: adj.amount,
          expectedAmount: adj.amount, dueDate: d, expected: d, optimistic: d, pessimistic: d, overdue: false, probability: 1,
        },
      ];
    } else if (adj.type === 'recurring') {
      const end = adj.end && adj.end < to ? adj.end : to;
      const dates = stepDates(later(adj.start, today), end, adj.frequency);
      out = [
        ...out,
        ...dates.map((d) => ({
          key: `scn:${adj.id}:${d}`, source: 'scenario' as const, direction: adj.direction, label: adj.label, amount: adj.amount,
          expectedAmount: adj.amount, dueDate: d, expected: d, optimistic: d, pessimistic: d, overdue: false, probability: 1,
        })),
      ];
    } else if (adj.type === 'scale') {
      const factor = 1 + adj.percent / 100;
      out = out.map((i) => {
        if (i.direction !== adj.direction) return i;
        if (adj.from && i.expected < adj.from) return i;
        if (adj.to && i.expected > adj.to) return i;
        return { ...i, amount: Math.round(i.amount * factor), expectedAmount: Math.round(i.expectedAmount * factor) };
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

export function buildForecast(input: ForecastInput): ForecastResult {
  const { today, horizonDays } = input;
  const to = addDays(today, horizonDays);

  let items: ForecastItem[] = [];
  for (const d of input.documents) {
    const state = input.docStates.get(d.id);
    if (!state) continue;
    const item = documentItem(d, state, input);
    if (item) items.push(item);
  }
  for (const ins of input.instruments) {
    const item = instrumentItem(ins, input);
    if (item) items.push(item);
  }
  items.push(...recurringItems(input, to), ...plannedItems(input, to), ...vatItems(input), ...runRateItems(input, to));
  if (input.scenario) items = applyScenario(items, input.scenario.adjustments, today, to);

  // Gün bazında değişimler
  const days = eachDay(today, to);
  const index = new Map(days.map((d, i) => [d, i]));
  const dExp = new Array<number>(days.length).fill(0);
  const dOpt = new Array<number>(days.length).fill(0);
  const dPes = new Array<number>(days.length).fill(0);
  const inflow = new Array<number>(days.length).fill(0);
  const outflow = new Array<number>(days.length).fill(0);

  for (const it of items) {
    const sign = it.direction === 'in' ? 1 : -1;
    const e = index.get(it.expected);
    if (e !== undefined) {
      dExp[e]! += sign * it.expectedAmount;
      if (sign > 0) inflow[e]! += it.expectedAmount;
      else outflow[e]! += it.expectedAmount;
    }
    const o = it.optimistic ? index.get(it.optimistic) : undefined;
    if (o !== undefined) dOpt[o]! += sign * it.amount;
    const p = it.pessimistic ? index.get(it.pessimistic) : undefined;
    if (p !== undefined) dPes[p]! += sign * it.amount;
  }

  let e = input.startingBalance;
  let o = input.startingBalance;
  let p = input.startingBalance;
  const series: ForecastDay[] = days.map((date, i) => {
    e += dExp[i]!;
    o += dOpt[i]!;
    p += dPes[i]!;
    return { date, expected: e, optimistic: o, pessimistic: p, inflow: inflow[i]!, outflow: outflow[i]! };
  });

  let min = { date: today, value: series[0]!.expected };
  for (const d of series) if (d.expected < min.value) min = { date: d.date, value: d.expected };

  const inWindow = items.filter((i) => i.expected >= today && i.expected <= to);
  const driversFor = (date: ISODate) =>
    inWindow
      .filter((i) => i.direction === 'out' && i.source !== 'runrate' && i.expected <= date && i.expected > addDays(date, -8))
      .sort((a, b) => b.expectedAmount - a.expectedAmount)
      .slice(0, 3);

  const alerts: ForecastAlert[] = [];
  const firstBelow = series.find((d) => d.expected < input.minBalance);
  if (firstBelow) alerts.push({ kind: 'below-min', date: firstBelow.date, value: firstBelow.expected, drivers: driversFor(firstBelow.date) });
  const firstNegative = series.find((d) => d.expected < 0);
  if (firstNegative) alerts.push({ kind: 'negative', date: firstNegative.date, value: firstNegative.expected, drivers: driversFor(firstNegative.date) });
  if (!firstBelow) {
    const pes = series.find((d) => d.pessimistic < input.minBalance);
    if (pes) alerts.push({ kind: 'pessimistic-below-min', date: pes.date, value: pes.pessimistic, drivers: driversFor(pes.date) });
  }

  return {
    items: inWindow.sort((a, b) => a.expected.localeCompare(b.expected) || b.expectedAmount - a.expectedAmount),
    days: series,
    alerts,
    min,
    end: series.at(-1)!,
    totals: {
      inflow: inflow.reduce((s, v) => s + v, 0),
      outflow: outflow.reduce((s, v) => s + v, 0),
    },
  };
}
