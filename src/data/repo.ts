import type { EntityTable, Table } from 'dexie';
import { db, WORKSPACE_TABLES, type WorkspaceTable } from './db';
import type { ISODate } from '@/domain/dates';
import type { Money } from '@/domain/money';
import type {
  Account,
  Allocation,
  CategorizationRule,
  Category,
  Contact,
  FinDocument,
  ID,
  Instrument,
  InstrumentEvent,
  InstrumentStatus,
  RecurringRule,
  Scenario,
  Transaction,
  Workspace,
} from '@/domain/types';

export const newId = (): ID => crypto.randomUUID();
export const nowStamp = (): string => new Date().toISOString();

let activeWorkspaceId: ID | null = null;

export function setActiveWorkspace(id: ID | null): void {
  activeWorkspaceId = id;
}

export function requireWorkspace(): ID {
  if (!activeWorkspaceId) throw new Error('Etkin çalışma alanı yok');
  return activeWorkspaceId;
}

type Scoped<T> = Omit<T, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'> & { id?: ID };

function scoped<T extends { id: ID }>(input: Scoped<T>): T {
  const stamp = nowStamp();
  return {
    ...input,
    id: input.id ?? newId(),
    workspaceId: requireWorkspace(),
    createdAt: stamp,
    updatedAt: stamp,
  } as unknown as T;
}

async function insert<T extends { id: ID }>(table: EntityTable<T, 'id'>, input: Scoped<T>): Promise<T> {
  const row = scoped<T>(input);
  await table.add(row as never);
  return row;
}

async function patch<T extends { id: ID }>(table: EntityTable<T, 'id'>, id: ID, changes: Partial<T>): Promise<void> {
  await table.update(id as never, { ...changes, updatedAt: nowStamp() } as never);
}

// ---------------------------------------------------------------------------
// Ayarlar

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  return (row?.value as T | undefined) ?? fallback;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({ key, value });
}

// ---------------------------------------------------------------------------
// Çalışma alanı

export async function createWorkspace(input: Omit<Workspace, 'id' | 'createdAt' | 'updatedAt'>, id: ID = newId()) {
  const stamp = nowStamp();
  const ws: Workspace = { ...input, id, createdAt: stamp, updatedAt: stamp };
  await db.workspaces.add(ws);
  await setSetting('activeWorkspaceId', id);
  setActiveWorkspace(id);
  return ws;
}

export async function updateWorkspace(id: ID, changes: Partial<Workspace>) {
  await db.workspaces.update(id, { ...changes, updatedAt: nowStamp() });
}

/** İşletme düzeyindeki ayar: değeri yazar ve işletmenin sürümünü ilerletir (bulut senkronu için). */
export async function setWorkspaceSetting<T>(key: string, value: T) {
  await setSetting(key, value);
  if (activeWorkspaceId) await db.workspaces.update(activeWorkspaceId, { updatedAt: nowStamp() });
}

/** Çalışma alanını ve tüm verisini siler. */
export async function deleteWorkspace(id: ID) {
  await db.transaction('rw', [db.workspaces, db.settings, ...WORKSPACE_TABLES.map((t) => db[t])], async () => {
    for (const t of WORKSPACE_TABLES) {
      await (db[t] as Table<{ workspaceId: ID }, ID>).where('workspaceId').equals(id).delete();
    }
    await db.workspaces.delete(id);
    const active = await db.settings.get('activeWorkspaceId');
    if (active?.value === id) await db.settings.delete('activeWorkspaceId');
  });
  if (activeWorkspaceId === id) setActiveWorkspace(null);
}

// ---------------------------------------------------------------------------
// Hesaplar, kategoriler, cariler

export const createAccount = (input: Scoped<Account>) => insert(db.accounts, input);
export const updateAccount = (id: ID, changes: Partial<Account>) => patch(db.accounts, id, changes);

/** Hareketi, düzenli ödemesi ya da çeki olan hesap arşivlenir; hiçbir şeye bağlı değilse silinir. */
export async function deleteOrArchiveAccount(id: ID): Promise<'deleted' | 'archived'> {
  const ws = requireWorkspace();
  const used =
    (await db.transactions.where('accountId').equals(id).count()) +
    (await db.transactions.where('toAccountId').equals(id).count()) +
    (await db.recurring.where('workspaceId').equals(ws).filter((r) => r.accountId === id).count()) +
    (await db.instruments.where('workspaceId').equals(ws).filter((i) => i.accountId === id).count());
  if (used > 0) {
    await patch(db.accounts, id, { archived: true });
    return 'archived';
  }
  await db.accounts.delete(id);
  return 'deleted';
}

export const createCategory = (input: Scoped<Category>) => insert(db.categories, input);
export const updateCategory = (id: ID, changes: Partial<Category>) => patch(db.categories, id, changes);

export const createContact = (input: Scoped<Contact>) => insert(db.contacts, input);
export const updateContact = (id: ID, changes: Partial<Contact>) => patch(db.contacts, id, changes);

/** Toplu cari aktarımı: tek işlemde (yarıda kesilirse hiçbiri yazılmaz). */
export async function importContacts(inputs: Array<Scoped<Contact>>): Promise<number> {
  const rows = inputs.map((i) => scoped<Contact>(i));
  await db.contacts.bulkAdd(rows);
  return rows.length;
}

/** Hareketi, belgesi, çeki ya da düzenli ödemesi olan cari arşivlenir; hiçbir şeye bağlı değilse silinir. */
export async function deleteOrArchiveContact(id: ID): Promise<'deleted' | 'archived'> {
  const ws = requireWorkspace();
  const used =
    (await db.transactions.where('contactId').equals(id).count()) +
    (await db.documents.where('contactId').equals(id).count()) +
    (await db.instruments.where('contactId').equals(id).count()) +
    (await db.instruments.where('workspaceId').equals(ws).filter((i) => i.endorsedToId === id).count()) +
    (await db.recurring.where('workspaceId').equals(ws).filter((r) => r.contactId === id).count());
  if (used > 0) {
    await patch(db.contacts, id, { archived: true });
    return 'archived';
  }
  // Öğrenilmiş içe aktarma kuralları kalsın, yalnızca silinen cariyle bağı kopsun.
  const rules = await db.rules.where('workspaceId').equals(ws).filter((r) => r.contactId === id).toArray();
  for (const r of rules) await patch(db.rules, r.id, { contactId: undefined });
  await db.contacts.delete(id);
  return 'deleted';
}

// ---------------------------------------------------------------------------
// İşlemler ve tahsisler

export interface AllocationInput {
  documentId: ID;
  amount: Money;
}

export async function createTransaction(
  input: Scoped<Transaction>,
  allocations: AllocationInput[] = [],
): Promise<Transaction> {
  return db.transaction('rw', db.transactions, db.allocations, async () => {
    const row = await insert(db.transactions, input);
    for (const a of allocations) {
      await insert<Allocation>(db.allocations, {
        documentId: a.documentId,
        transactionId: row.id,
        amount: a.amount,
        date: row.date,
      } as Scoped<Allocation>);
    }
    return row;
  });
}

export async function updateTransaction(id: ID, changes: Partial<Transaction>, allocations?: AllocationInput[]) {
  await db.transaction('rw', db.transactions, db.allocations, async () => {
    await patch(db.transactions, id, changes);
    if (allocations) {
      await db.allocations.where('transactionId').equals(id).delete();
      const t = await db.transactions.get(id);
      for (const a of allocations) {
        await insert<Allocation>(db.allocations, {
          documentId: a.documentId,
          transactionId: id,
          amount: a.amount,
          date: t?.date ?? changes.date ?? '',
        } as Scoped<Allocation>);
      }
    } else if (changes.date) {
      await db.allocations.where('transactionId').equals(id).modify({ date: changes.date });
    }
  });
}

export interface DeletedSnapshot {
  transactions: Transaction[];
  allocations: Allocation[];
  documents: FinDocument[];
}

export async function deleteTransactions(ids: ID[]): Promise<DeletedSnapshot> {
  return db.transaction('rw', db.transactions, db.allocations, async () => {
    const transactions = (await db.transactions.bulkGet(ids)).filter((t): t is Transaction => !!t);
    const allocations = await db.allocations.where('transactionId').anyOf(ids).toArray();
    await db.allocations.bulkDelete(allocations.map((a) => a.id));
    await db.transactions.bulkDelete(ids);
    return { transactions, allocations, documents: [] };
  });
}

export async function restoreSnapshot(snapshot: DeletedSnapshot) {
  await db.transaction('rw', db.transactions, db.allocations, db.documents, async () => {
    await db.documents.bulkPut(snapshot.documents);
    await db.transactions.bulkPut(snapshot.transactions);
    await db.allocations.bulkPut(snapshot.allocations);
  });
}

export interface ImportRow {
  transaction: Scoped<Transaction>;
  allocations: AllocationInput[];
}

/** Ekstre içe aktarma: tüm satırlar tek atomik yazımda. */
export async function importTransactions(rows: ImportRow[]): Promise<ID[]> {
  return db.transaction('rw', db.transactions, db.allocations, async () => {
    const ids: ID[] = [];
    for (const r of rows) {
      const t = await insert(db.transactions, r.transaction);
      ids.push(t.id);
      for (const a of r.allocations) {
        await insert<Allocation>(db.allocations, { documentId: a.documentId, transactionId: t.id, amount: a.amount, date: t.date } as Scoped<Allocation>);
      }
    }
    return ids;
  });
}

// ---------------------------------------------------------------------------
// Belgeler (alacak / borç)

export const createDocument = (input: Scoped<FinDocument>) => insert(db.documents, input);
export const updateDocument = (id: ID, changes: Partial<FinDocument>) => patch(db.documents, id, changes);

export async function deleteDocument(id: ID): Promise<DeletedSnapshot> {
  return db.transaction('rw', db.documents, db.allocations, async () => {
    const doc = await db.documents.get(id);
    const allocations = await db.allocations.where('documentId').equals(id).toArray();
    await db.allocations.bulkDelete(allocations.map((a) => a.id));
    await db.documents.delete(id);
    return { transactions: [], allocations, documents: doc ? [doc] : [] };
  });
}

export interface SettleInput {
  documentIds: ID[];
  accountId: ID;
  amount: Money;
  currency: Transaction['currency'];
  rateToBase: number;
  date: ISODate;
  description: string;
  allocations: AllocationInput[];
  contactId?: ID;
  categoryId?: ID;
}

/** Belge(ler)i tahsil et / öde: işlem + tahsisler tek atomik yazımda. */
export async function settleDocuments(direction: FinDocument['direction'], input: SettleInput) {
  return createTransaction(
    {
      kind: direction === 'receivable' ? 'income' : 'expense',
      date: input.date,
      accountId: input.accountId,
      amount: input.amount,
      currency: input.currency,
      rateToBase: input.rateToBase,
      contactId: input.contactId,
      categoryId: input.categoryId,
      affectsLedger: Boolean(input.contactId),
      description: input.description,
      tags: [],
      source: 'document',
    },
    input.allocations,
  );
}

// ---------------------------------------------------------------------------
// Tekrarlayan kurallar

/** Tekrarlayan kalemin bir oluşumunu gerçekleşmiş işlem olarak kaydeder. */
export async function postRecurringOccurrence(
  rule: RecurringRule,
  occurrence: { nominal: ISODate; date: ISODate },
  options: { amount?: Money; accountId?: ID; rateToBase?: number } = {},
) {
  if (!rule.accountId && !options.accountId) throw new Error('Kalem için bir hesap seçin');
  return createTransaction({
    kind: rule.direction === 'in' ? 'income' : 'expense',
    date: occurrence.date,
    accountId: (options.accountId ?? rule.accountId)!,
    amount: options.amount ?? rule.amount,
    currency: rule.currency,
    rateToBase: options.rateToBase ?? 1,
    categoryId: rule.categoryId,
    contactId: rule.contactId,
    affectsLedger: false,
    description: rule.title,
    tags: [],
    source: 'recurring',
    recurringId: rule.id,
    occurrenceDate: occurrence.nominal,
  });
}

export const createRecurring = (input: Scoped<RecurringRule>) => insert(db.recurring, input);
export const updateRecurring = (id: ID, changes: Partial<RecurringRule>) => patch(db.recurring, id, changes);
export const deleteRecurring = (id: ID) => db.recurring.delete(id);

// ---------------------------------------------------------------------------
// Çek / senet

export async function createInstrument(input: Scoped<Instrument>, allocations: AllocationInput[] = []) {
  return db.transaction('rw', db.instruments, db.allocations, async () => {
    const row = await insert(db.instruments, input);
    for (const a of allocations) {
      await insert<Allocation>(db.allocations, {
        documentId: a.documentId,
        instrumentId: row.id,
        amount: a.amount,
        date: row.history[0]?.date ?? row.issueDate,
      } as Scoped<Allocation>);
    }
    return row;
  });
}

export const updateInstrument = (id: ID, changes: Partial<Instrument>) => patch(db.instruments, id, changes);

export interface TransitionInput {
  status: InstrumentStatus;
  date: ISODate;
  note?: string;
  accountId?: ID;
  endorsedToId?: ID;
  /** Ciroda tedarikçi belgelerine tahsis */
  allocations?: AllocationInput[];
}

/**
 * Çek/senet durum geçişi. Tahsil edildi / ödendi durumları hesaba nakit hareketi
 * olarak düşer (cari etkisi yok; cari, çek alındığında/verildiğinde kapanmıştır).
 */
export async function transitionInstrument(ins: Instrument, input: TransitionInput) {
  await db.transaction('rw', db.instruments, db.transactions, db.allocations, async () => {
    const event: InstrumentEvent = {
      status: input.status,
      date: input.date,
      note: input.note,
      accountId: input.accountId,
      contactId: input.endorsedToId,
    };
    const changes: Partial<Instrument> = { status: input.status, history: [...ins.history, event] };
    if (input.endorsedToId) changes.endorsedToId = input.endorsedToId;
    if (input.accountId) changes.accountId = input.accountId;
    await patch(db.instruments, ins.id, changes);

    const cashMove =
      (ins.direction === 'received' && input.status === 'collected') ||
      (ins.direction === 'issued' && input.status === 'paid');
    if (cashMove && input.accountId) {
      await insert(db.transactions, {
        kind: ins.direction === 'received' ? 'income' : 'expense',
        date: input.date,
        accountId: input.accountId,
        amount: ins.amount,
        currency: ins.currency,
        rateToBase: ins.rateToBase,
        contactId: ins.contactId,
        affectsLedger: false,
        description: `${ins.kind === 'cheque' ? 'Çek' : 'Senet'} ${ins.direction === 'received' ? 'tahsilatı' : 'ödemesi'} · ${ins.serialNo}`,
        tags: [],
        source: 'instrument',
        instrumentId: ins.id,
      } as Scoped<Transaction>);
    }

    // Karşılıksız / iade: çekle kapatılan belge tahsisleri geri alınır.
    if (['bounced', 'returned', 'cancelled'].includes(input.status)) {
      await db.allocations.where('instrumentId').equals(ins.id).delete();
    }

    for (const a of input.allocations ?? []) {
      await insert<Allocation>(db.allocations, {
        documentId: a.documentId,
        instrumentId: ins.id,
        amount: a.amount,
        date: input.date,
      } as Scoped<Allocation>);
    }
  });
}

export async function deleteInstrument(id: ID) {
  await db.transaction('rw', db.instruments, db.allocations, db.transactions, async () => {
    await db.allocations.where('instrumentId').equals(id).delete();
    await db.transactions.where('instrumentId').equals(id).delete();
    await db.instruments.delete(id);
  });
}

// ---------------------------------------------------------------------------
// Senaryolar, kurallar

export const createScenario = (input: Scoped<Scenario>) => insert(db.scenarios, input);
export const updateScenario = (id: ID, changes: Partial<Scenario>) => patch(db.scenarios, id, changes);
export const deleteScenario = (id: ID) => db.scenarios.delete(id);

export async function learnRule(pattern: string, target: { categoryId?: ID; contactId?: ID }, source: 'user' | 'ai') {
  const ws = requireWorkspace();
  const existing = await db.rules.where('pattern').equals(pattern).filter((r) => r.workspaceId === ws).first();
  if (existing) {
    await patch(db.rules, existing.id, { ...target, hits: existing.hits + 1, source });
  } else {
    await insert<CategorizationRule>(db.rules, { pattern, ...target, hits: 1, source } as Scoped<CategorizationRule>);
  }
}

export type { WorkspaceTable };
