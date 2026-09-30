import type { ISODate } from './dates';
import { convertMinor, type CurrencyCode, type Money } from './money';
import type { RateTable } from './balances';
import type { Contact, FinDocument, ID, Instrument, InstrumentStatus, Transaction } from './types';

/**
 * Cari hesap hareketi. Borç (debit) carinin bize olan borcunu artırır,
 * alacak (credit) azaltır. Bakiye pozitifse cari bize borçludur.
 */
export interface LedgerEntry {
  contactId: ID;
  date: ISODate;
  kind: 'document' | 'payment' | 'instrument';
  refId: ID;
  description: string;
  debit: Money;
  credit: Money;
  currency: CurrencyCode;
  rateToBase: number;
}

const RECEIVED_REVERSAL: InstrumentStatus[] = ['bounced', 'returned'];
const ISSUED_REVERSAL: InstrumentStatus[] = ['bounced', 'cancelled'];

function eventDate(ins: Instrument, status: InstrumentStatus, fallback: ISODate): ISODate {
  return ins.history.find((h) => h.status === status)?.date ?? fallback;
}

function receivedDate(ins: Instrument): ISODate {
  return ins.history[0]?.date ?? ins.issueDate;
}

export function* ledgerEntries(
  documents: Iterable<FinDocument>,
  transactions: Iterable<Transaction>,
  instruments: Iterable<Instrument>,
): Generator<LedgerEntry> {
  for (const d of documents) {
    if (!d.contactId || d.cancelled) continue;
    const receivable = d.direction === 'receivable';
    yield {
      contactId: d.contactId,
      date: d.issueDate,
      kind: 'document',
      refId: d.id,
      description: d.title,
      debit: receivable ? d.amount : 0,
      credit: receivable ? 0 : d.amount,
      currency: d.currency,
      rateToBase: d.rateToBase,
    };
  }

  for (const t of transactions) {
    if (!t.contactId || !t.affectsLedger || t.kind === 'transfer') continue;
    const collection = t.kind === 'income';
    yield {
      contactId: t.contactId,
      date: t.date,
      kind: 'payment',
      refId: t.id,
      description: t.description || (collection ? 'Tahsilat' : 'Ödeme'),
      debit: collection ? 0 : t.amount,
      credit: collection ? t.amount : 0,
      currency: t.currency,
      rateToBase: t.rateToBase,
    };
  }

  for (const ins of instruments) {
    const label = ins.kind === 'cheque' ? 'Çek' : 'Senet';
    const base = { kind: 'instrument' as const, refId: ins.id, currency: ins.currency, rateToBase: ins.rateToBase };
    if (ins.direction === 'received') {
      // Müşteriden alınan çek borcunu kapatır.
      yield {
        ...base,
        contactId: ins.contactId,
        date: receivedDate(ins),
        description: `${label} alındı · ${ins.serialNo}`,
        debit: 0,
        credit: ins.amount,
      };
      if (RECEIVED_REVERSAL.includes(ins.status)) {
        yield {
          ...base,
          contactId: ins.contactId,
          date: eventDate(ins, ins.status, ins.dueDate),
          description: `${label} ${ins.status === 'bounced' ? 'karşılıksız' : 'iade'} · ${ins.serialNo}`,
          debit: ins.amount,
          credit: 0,
        };
      }
      if (ins.status === 'endorsed' && ins.endorsedToId) {
        // Tedarikçiye ciro: bizim ona olan borcumuzu azaltır.
        yield {
          ...base,
          contactId: ins.endorsedToId,
          date: eventDate(ins, 'endorsed', ins.issueDate),
          description: `${label} ciro edildi · ${ins.serialNo}`,
          debit: ins.amount,
          credit: 0,
        };
      }
    } else {
      yield {
        ...base,
        contactId: ins.contactId,
        date: ins.history[0]?.date ?? ins.issueDate,
        description: `${label} verildi · ${ins.serialNo}`,
        debit: ins.amount,
        credit: 0,
      };
      if (ISSUED_REVERSAL.includes(ins.status)) {
        yield {
          ...base,
          contactId: ins.contactId,
          date: eventDate(ins, ins.status, ins.dueDate),
          description: `${label} ${ins.status === 'bounced' ? 'karşılıksız' : 'iptal'} · ${ins.serialNo}`,
          debit: 0,
          credit: ins.amount,
        };
      }
    }
  }
}

function toContactCurrency(amount: Money, entry: LedgerEntry, contact: Contact, rates?: RateTable): Money {
  if (entry.currency === contact.currency) return amount;
  const contactRate = rates?.[contact.currency] ?? 1;
  return convertMinor(amount, entry.rateToBase, contactRate);
}

/** Devir tarihinden önceki hareket devire zaten dahildir. */
const beforeOpening = (c: Contact, date: ISODate) => Boolean(c.openingDate && date < c.openingDate);

export function contactBalance(
  contact: Contact,
  documents: Iterable<FinDocument>,
  transactions: Iterable<Transaction>,
  instruments: Iterable<Instrument>,
  rates?: RateTable,
  asOf?: ISODate,
): Money {
  let balance = contact.openingBalance;
  for (const e of ledgerEntries(documents, transactions, instruments)) {
    if (e.contactId !== contact.id || (asOf && e.date > asOf) || beforeOpening(contact, e.date)) continue;
    balance += toContactCurrency(e.debit - e.credit, e, contact, rates);
  }
  return balance;
}

/** Tüm carilerin bakiyeleri, tek geçişte (cari para biriminde). */
export function contactBalances(
  contacts: Contact[],
  documents: Iterable<FinDocument>,
  transactions: Iterable<Transaction>,
  instruments: Iterable<Instrument>,
  rates?: RateTable,
  asOf?: ISODate,
): Map<ID, Money> {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const out = new Map<ID, Money>(contacts.map((c) => [c.id, c.openingBalance]));
  for (const e of ledgerEntries(documents, transactions, instruments)) {
    const c = byId.get(e.contactId);
    if (!c || (asOf && e.date > asOf) || beforeOpening(c, e.date)) continue;
    out.set(c.id, (out.get(c.id) ?? 0) + toContactCurrency(e.debit - e.credit, e, c, rates));
  }
  return out;
}

export interface StatementRow {
  /** Açılış satırında null */
  date: ISODate | null;
  kind: LedgerEntry['kind'] | 'opening';
  refId: ID | null;
  description: string;
  debit: Money;
  credit: Money;
  balance: Money;
}

export function contactStatement(
  contact: Contact,
  documents: Iterable<FinDocument>,
  transactions: Iterable<Transaction>,
  instruments: Iterable<Instrument>,
  rates?: RateTable,
): StatementRow[] {
  const entries = [...ledgerEntries(documents, transactions, instruments)]
    .filter((e) => e.contactId === contact.id && !beforeOpening(contact, e.date))
    .sort((a, b) => a.date.localeCompare(b.date) || b.debit - a.debit);

  const opening = contact.openingBalance;
  const rows: StatementRow[] = [
    {
      date: null,
      kind: 'opening',
      refId: null,
      description: 'Devir bakiyesi',
      debit: Math.max(opening, 0),
      credit: Math.max(-opening, 0),
      balance: opening,
    },
  ];
  let balance = opening;
  for (const e of entries) {
    const debit = toContactCurrency(e.debit, e, contact, rates);
    const credit = toContactCurrency(e.credit, e, contact, rates);
    balance += debit - credit;
    rows.push({ date: e.date, kind: e.kind, refId: e.refId, description: e.description, debit, credit, balance });
  }
  return rows;
}
