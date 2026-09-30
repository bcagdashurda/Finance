import Dexie, { type EntityTable } from 'dexie';
import type {
  Account,
  Allocation,
  CategorizationRule,
  Category,
  Contact,
  FinDocument,
  Instrument,
  Rate,
  RecurringRule,
  Scenario,
  Setting,
  Transaction,
  Workspace,
} from '@/domain/types';

export interface AiCacheRow {
  hash: string;
  value: unknown;
  createdAt: string;
}

export class MizanDB extends Dexie {
  workspaces!: EntityTable<Workspace, 'id'>;
  accounts!: EntityTable<Account, 'id'>;
  categories!: EntityTable<Category, 'id'>;
  contacts!: EntityTable<Contact, 'id'>;
  transactions!: EntityTable<Transaction, 'id'>;
  documents!: EntityTable<FinDocument, 'id'>;
  allocations!: EntityTable<Allocation, 'id'>;
  recurring!: EntityTable<RecurringRule, 'id'>;
  instruments!: EntityTable<Instrument, 'id'>;
  scenarios!: EntityTable<Scenario, 'id'>;
  rates!: EntityTable<Rate, 'id'>;
  rules!: EntityTable<CategorizationRule, 'id'>;
  settings!: EntityTable<Setting, 'key'>;
  aiCache!: EntityTable<AiCacheRow, 'hash'>;

  constructor(name = 'mizan') {
    super(name);
    this.version(1).stores({
      workspaces: 'id',
      accounts: 'id, workspaceId',
      categories: 'id, workspaceId, kind',
      contacts: 'id, workspaceId, name',
      transactions: 'id, workspaceId, date, accountId, toAccountId, contactId, categoryId, importHash, recurringId, instrumentId',
      documents: 'id, workspaceId, contactId, dueDate, direction',
      allocations: 'id, workspaceId, documentId, transactionId, instrumentId',
      recurring: 'id, workspaceId',
      instruments: 'id, workspaceId, contactId, dueDate, status',
      scenarios: 'id, workspaceId',
      rates: 'id, date, currency',
      rules: 'id, workspaceId, pattern',
      settings: 'key',
      aiCache: 'hash, createdAt',
    });
  }
}

export const db = new MizanDB();

/** Çalışma alanına bağlı tablolar (yedekleme ve sıfırlama bunları kapsar). */
export const WORKSPACE_TABLES = [
  'accounts',
  'categories',
  'contacts',
  'transactions',
  'documents',
  'allocations',
  'recurring',
  'instruments',
  'scenarios',
  'rules',
] as const;

export type WorkspaceTable = (typeof WORKSPACE_TABLES)[number];
