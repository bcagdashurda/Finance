import type {
  Account,
  Allocation,
  Contact,
  FinDocument,
  Instrument,
  RecurringRule,
  Transaction,
} from '@/domain/types';

const stamp = '2026-01-01T00:00:00.000Z';
let seq = 0;
const nextId = (prefix: string) => `${prefix}${++seq}`;

export function account(overrides: Partial<Account> = {}): Account {
  return {
    id: nextId('acc'),
    workspaceId: 'ws',
    name: 'Hesap',
    kind: 'bank',
    currency: 'TRY',
    openingBalance: 0,
    openingDate: '2026-01-01',
    color: '#2340B8',
    archived: false,
    sortOrder: 0,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

export function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: nextId('tx'),
    workspaceId: 'ws',
    kind: 'income',
    date: '2026-01-10',
    accountId: 'acc',
    amount: 0,
    currency: 'TRY',
    rateToBase: 1,
    affectsLedger: false,
    description: '',
    tags: [],
    source: 'manual',
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

export function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: nextId('c'),
    workspaceId: 'ws',
    name: 'Cari',
    kind: 'customer',
    currency: 'TRY',
    openingBalance: 0,
    tags: [],
    archived: false,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

export function doc(overrides: Partial<FinDocument> = {}): FinDocument {
  return {
    id: nextId('d'),
    workspaceId: 'ws',
    direction: 'receivable',
    title: 'Fatura',
    issueDate: '2026-01-01',
    dueDate: '2026-01-31',
    amount: 0,
    currency: 'TRY',
    rateToBase: 1,
    cancelled: false,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

export function allocation(overrides: Partial<Allocation> = {}): Allocation {
  return {
    id: nextId('al'),
    workspaceId: 'ws',
    documentId: 'd',
    amount: 0,
    date: '2026-01-15',
    createdAt: stamp,
    ...overrides,
  };
}

export function instrument(overrides: Partial<Instrument> = {}): Instrument {
  return {
    id: nextId('ins'),
    workspaceId: 'ws',
    kind: 'cheque',
    direction: 'received',
    serialNo: '0001',
    contactId: 'c',
    amount: 0,
    currency: 'TRY',
    rateToBase: 1,
    issueDate: '2026-01-05',
    dueDate: '2026-03-05',
    status: 'portfolio',
    history: [],
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}

export function rule(overrides: Partial<RecurringRule> = {}): RecurringRule {
  return {
    id: nextId('r'),
    workspaceId: 'ws',
    direction: 'out',
    title: 'Kira',
    amount: 0,
    currency: 'TRY',
    frequency: 'monthly',
    interval: 1,
    anchorDate: '2026-01-05',
    weekendPolicy: 'none',
    autoPost: false,
    active: true,
    createdAt: stamp,
    updatedAt: stamp,
    ...overrides,
  };
}
