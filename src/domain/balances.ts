import { addDays, type ISODate } from './dates';
import { convertMinor, type CurrencyCode, type Money } from './money';
import type { Account, ID, Transaction } from './types';

/** 1 birim = kaç baz para birimi. Baz para biriminin kuru 1'dir. */
export type RateTable = Record<CurrencyCode, number>;

/** İşlemin verilen hesap üzerindeki etkisi (hesap para biriminde). */
export function transactionEffect(t: Transaction, accountId: ID): Money {
  if (t.kind === 'transfer') {
    let effect = 0;
    if (t.accountId === accountId) effect -= t.amount;
    if (t.toAccountId === accountId) effect += t.toAmount ?? t.amount;
    return effect;
  }
  if (t.accountId !== accountId) return 0;
  return t.kind === 'income' ? t.amount : -t.amount;
}

function counts(t: Transaction, account: Account, asOf?: ISODate): boolean {
  return t.date >= account.openingDate && (asOf === undefined || t.date <= asOf);
}

export function accountBalance(account: Account, transactions: Iterable<Transaction>, asOf?: ISODate): Money {
  let balance = account.openingBalance;
  for (const t of transactions) {
    if (counts(t, account, asOf)) balance += transactionEffect(t, account.id);
  }
  return balance;
}

/** Tüm hesap bakiyeleri, işlemler üzerinden tek geçişte. */
export function balancesByAccount(
  accounts: Account[],
  transactions: Iterable<Transaction>,
  asOf?: ISODate,
): Map<ID, Money> {
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const result = new Map<ID, Money>(accounts.map((a) => [a.id, a.openingBalance]));
  const apply = (id: ID | undefined, t: Transaction) => {
    if (!id) return;
    const acc = byId.get(id);
    if (!acc || !counts(t, acc, asOf)) return;
    result.set(id, (result.get(id) ?? 0) + transactionEffect(t, id));
  };
  for (const t of transactions) {
    apply(t.accountId, t);
    if (t.kind === 'transfer' && t.toAccountId && t.toAccountId !== t.accountId) apply(t.toAccountId, t);
  }
  return result;
}

export function totalInBase(accounts: Account[], balances: Map<ID, Money>, rates: RateTable): Money {
  let total = 0;
  for (const a of accounts) {
    total += convertMinor(balances.get(a.id) ?? 0, rates[a.currency] ?? 1, 1);
  }
  return total;
}

/** Para birimi bazında toplamlar (yerel para biriminde). */
export function totalsByCurrency(accounts: Account[], balances: Map<ID, Money>): Map<CurrencyCode, Money> {
  const out = new Map<CurrencyCode, Money>();
  for (const a of accounts) out.set(a.currency, (out.get(a.currency) ?? 0) + (balances.get(a.id) ?? 0));
  return out;
}

/**
 * [from, to] aralığında her günün gün sonu toplam bakiyesi (baz para birimi, güncel kurla).
 * Tek geçiş: başlangıç bakiyesi + gün gün etkiler.
 */
export function balanceSeries(
  accounts: Account[],
  transactions: Iterable<Transaction>,
  from: ISODate,
  to: ISODate,
  rates: RateTable,
): Array<{ date: ISODate; value: Money }> {
  const txs = [...transactions];
  const start = balancesByAccount(accounts, txs, addDays(from, -1));
  let total = totalInBase(accounts, start, rates);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const deltas = new Map<ISODate, number>();
  for (const t of txs) {
    if (t.date < from || t.date > to) continue;
    let d = 0;
    for (const id of t.kind === 'transfer' ? [t.accountId, t.toAccountId] : [t.accountId]) {
      const acc = id ? byId.get(id) : undefined;
      if (!acc || t.date < acc.openingDate) continue;
      d += convertMinor(transactionEffect(t, acc.id), rates[acc.currency] ?? 1, 1);
    }
    if (d) deltas.set(t.date, (deltas.get(t.date) ?? 0) + d);
  }
  const out: Array<{ date: ISODate; value: Money }> = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    total += deltas.get(day) ?? 0;
    out.push({ date: day, value: total });
  }
  return out;
}

/** Bir işlemin baz para birimindeki tutarı (işlem anındaki kurla). */
export function amountInBase(amount: Money, rateToBase: number): Money {
  return convertMinor(amount, rateToBase, 1);
}
