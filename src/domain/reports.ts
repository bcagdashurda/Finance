import { addMonths, daysInMonth, monthKey, startOfMonth, type ISODate } from './dates';
import { amountInBase, type RateTable } from './balances';
import { documentStatus } from './documents';
import { vatDueDate } from './vat';
import type { CurrencyCode, Money } from './money';
import type { Account, Allocation, Category, FinDocument, ID, Transaction } from './types';

export type Basis = 'cash' | 'accrual';

export interface PnlRow {
  categoryId: ID | null;
  values: Money[];
  total: Money;
}

export interface PnlReport {
  months: string[];
  income: PnlRow[];
  expense: PnlRow[];
  totals: { income: Money[]; expense: Money[]; net: Money[] };
}

interface PnlInput {
  transactions: Iterable<Transaction>;
  documents: Iterable<FinDocument>;
  allocationIndex: Map<ID, Allocation[]>;
  categories: Category[];
}

function monthList(from: ISODate, to: ISODate): string[] {
  const out: string[] = [];
  for (let m = startOfMonth(from); m <= to; m = addMonths(m, 1)) out.push(monthKey(m));
  return out;
}

/**
 * Gelir-gider tablosu.
 * - Nakit esası: gerçekleşen tahsilat/ödemeler; cari tahsilatları kategorisini kapattığı belgeden alır.
 * - Tahakkuk esası: belgeler KDV hariç tutarla düzenleme tarihinde; doğrudan gelir/giderler kendi
 *   tarihinde; KDV ödemeleri (vergi yükümlülüğü) gider sayılmaz.
 */
export function profitLoss(input: PnlInput, from: ISODate, to: ISODate, basis: Basis): PnlReport {
  const months = monthList(from, to);
  const idx = new Map(months.map((m, i) => [m, i]));
  const rows = { income: new Map<ID | null, Money[]>(), expense: new Map<ID | null, Money[]>() };
  const add = (kind: 'income' | 'expense', categoryId: ID | null, month: string, v: Money) => {
    const i = idx.get(month);
    if (i === undefined || !v) return;
    const row = rows[kind].get(categoryId) ?? new Array<Money>(months.length).fill(0);
    row[i]! += v;
    rows[kind].set(categoryId, row);
  };
  const vatCategories = new Set(input.categories.filter((c) => c.icon === 'receipt').map((c) => c.id));
  const docsById = new Map<ID, FinDocument>();
  for (const d of input.documents) docsById.set(d.id, d);

  if (basis === 'cash') {
    // İşlem → kapattığı belgeler
    const txDocs = new Map<ID, Array<{ documentId: ID; amount: Money }>>();
    for (const list of input.allocationIndex.values()) {
      for (const a of list) {
        if (!a.transactionId) continue;
        const arr = txDocs.get(a.transactionId) ?? [];
        arr.push({ documentId: a.documentId, amount: a.amount });
        txDocs.set(a.transactionId, arr);
      }
    }
    for (const t of input.transactions) {
      if (t.kind === 'transfer' || t.date < from || t.date > to) continue;
      let categoryId = t.categoryId ?? null;
      if (!categoryId) {
        const docs = txDocs.get(t.id);
        const biggest = docs?.sort((a, b) => b.amount - a.amount)[0];
        categoryId = (biggest && docsById.get(biggest.documentId)?.categoryId) ?? null;
      }
      add(t.kind, categoryId, monthKey(t.date), amountInBase(t.amount, t.rateToBase));
    }
  } else {
    for (const d of docsById.values()) {
      if (d.cancelled || d.issueDate < from || d.issueDate > to) continue;
      const net = amountInBase(d.amount - (d.vatAmount ?? 0), d.rateToBase);
      add(d.direction === 'receivable' ? 'income' : 'expense', d.categoryId ?? null, monthKey(d.issueDate), net);
    }
    for (const t of input.transactions) {
      if (t.kind === 'transfer' || t.affectsLedger || t.instrumentId || t.date < from || t.date > to) continue;
      if (t.categoryId && vatCategories.has(t.categoryId)) continue;
      add(t.kind, t.categoryId ?? null, monthKey(t.date), amountInBase(t.amount, t.rateToBase));
    }
  }

  const toRows = (m: Map<ID | null, Money[]>): PnlRow[] =>
    [...m.entries()].map(([categoryId, values]) => ({ categoryId, values, total: values.reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total);
  const income = toRows(rows.income);
  const expense = toRows(rows.expense);
  const sumCol = (list: PnlRow[]) => months.map((_, i) => list.reduce((s, r) => s + r.values[i]!, 0));
  const ti = sumCol(income);
  const te = sumCol(expense);
  return { months, income, expense, totals: { income: ti, expense: te, net: ti.map((v, i) => v - te[i]!) } };
}

export interface BudgetRow {
  categoryId: ID;
  budget: Money;
  actual: Money;
  ratio: number;
  /** Ay sonu tahmini (bugünkü hıza göre) */
  projected: Money;
}

export function budgetVsActual(transactions: Iterable<Transaction>, categories: Category[], today: ISODate): BudgetRow[] {
  const month = monthKey(today);
  const day = Number(today.slice(8, 10));
  const dim = daysInMonth(Number(today.slice(0, 4)), Number(today.slice(5, 7)));
  const budgets = categories.filter((c) => c.monthlyBudget && c.kind === 'expense');
  const spent = new Map<ID, Money>();
  for (const t of transactions) {
    if (t.kind !== 'expense' || !t.categoryId || monthKey(t.date) !== month || t.date > today) continue;
    spent.set(t.categoryId, (spent.get(t.categoryId) ?? 0) + amountInBase(t.amount, t.rateToBase));
  }
  return budgets
    .map((c) => {
      const actual = spent.get(c.id) ?? 0;
      return { categoryId: c.id, budget: c.monthlyBudget!, actual, ratio: Math.round((actual / c.monthlyBudget!) * 100) / 100, projected: Math.round((actual / day) * dim) };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

export interface VatRow {
  period: string;
  output: Money;
  input: Money;
  carriedIn: Money;
  payable: Money;
  carriedOut: Money;
  dueDate: ISODate;
}

/** Aylık KDV: hesaplanan − indirilecek − devreden; negatif sonuç bir sonraki aya devreder. */
export function vatHistory(documents: Iterable<FinDocument>, fromMonth: string, toMonth: string): VatRow[] {
  const sums = new Map<string, { output: Money; input: Money }>();
  for (const d of documents) {
    if (d.cancelled || !d.vatAmount) continue;
    const k = monthKey(d.issueDate);
    const row = sums.get(k) ?? { output: 0, input: 0 };
    const v = amountInBase(d.vatAmount, d.rateToBase);
    if (d.direction === 'receivable') row.output += v;
    else row.input += v;
    sums.set(k, row);
  }
  const out: VatRow[] = [];
  let carry = 0;
  for (let m = `${fromMonth}-01`; monthKey(m) <= toMonth; m = addMonths(m, 1)) {
    const period = monthKey(m);
    const { output, input } = sums.get(period) ?? { output: 0, input: 0 };
    const net = output - input - carry;
    out.push({ period, output, input, carriedIn: carry, payable: Math.max(0, net), carriedOut: net < 0 ? -net : 0, dueDate: vatDueDate(period) });
    carry = net < 0 ? -net : 0;
  }
  return out;
}

export interface FxRow {
  currency: CurrencyCode;
  cash: Money;
  receivable: Money;
  payable: Money;
  net: Money;
  netBase: Money;
  /** TL %10 değer kaybederse net pozisyonun TL karşılığındaki değişim */
  shock10: Money;
}

export function fxExposure(
  accounts: Account[],
  balances: Map<ID, Money>,
  documents: Iterable<FinDocument>,
  allocationIndex: Map<ID, Allocation[]>,
  rates: RateTable,
  today: ISODate,
): FxRow[] {
  const rows = new Map<CurrencyCode, FxRow>();
  const row = (c: CurrencyCode) => {
    let r = rows.get(c);
    if (!r) {
      r = { currency: c, cash: 0, receivable: 0, payable: 0, net: 0, netBase: 0, shock10: 0 };
      rows.set(c, r);
    }
    return r;
  };
  for (const a of accounts) if (a.currency !== 'TRY' && !a.archived) row(a.currency).cash += balances.get(a.id) ?? 0;
  for (const d of documents) {
    if (d.currency === 'TRY' || d.cancelled || d.issueDate > today) continue;
    const st = documentStatus(d, allocationIndex, today);
    if (st.remaining <= 0) continue;
    if (d.direction === 'receivable') row(d.currency).receivable += st.remaining;
    else row(d.currency).payable += st.remaining;
  }
  for (const r of rows.values()) {
    r.net = r.cash + r.receivable - r.payable;
    r.netBase = Math.round(r.net * (rates[r.currency] ?? 1));
    r.shock10 = Math.round(r.netBase * 0.1);
  }
  return [...rows.values()];
}
