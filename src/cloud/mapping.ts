/**
 * Yerel (camelCase, IndexedDB) ↔ sunucu (snake_case, Postgres) eşlemesi.
 * Boş alanlar sunucuya açıkça null gider; sunucudan gelen null'lar yerelde
 * alan hiç yokmuş gibi atlanır (TypeScript isteğe bağlı alan anlamı korunur).
 */
import type { WorkspaceTable } from '@/data/db';
import type { Workspace } from '@/domain/types';

export interface SyncTable {
  local: WorkspaceTable;
  remote: string;
  /** id, workspaceId, createdAt, updatedAt dışındaki alanlar */
  fields: string[];
  /** Yerel kayıtta updatedAt alanı var mı (tahsislerde yok) */
  hasUpdatedAt: boolean;
}

export const SYNC_TABLES: SyncTable[] = [
  { local: 'accounts', remote: 'accounts', hasUpdatedAt: true, fields: ['name', 'kind', 'institution', 'iban', 'currency', 'openingBalance', 'openingDate', 'minBalance', 'creditLimit', 'color', 'archived', 'sortOrder'] },
  { local: 'categories', remote: 'categories', hasUpdatedAt: true, fields: ['name', 'kind', 'parentId', 'color', 'icon', 'monthlyBudget', 'archived', 'system'] },
  {
    local: 'contacts',
    remote: 'contacts',
    hasUpdatedAt: true,
    fields: ['name', 'kind', 'taxId', 'taxOffice', 'email', 'phone', 'iban', 'address', 'paymentTermDays', 'riskLimit', 'currency', 'openingBalance', 'openingDate', 'tags', 'notes', 'archived'],
  },
  {
    local: 'transactions',
    remote: 'transactions',
    hasUpdatedAt: true,
    fields: [
      'kind', 'date', 'accountId', 'amount', 'currency', 'rateToBase', 'toAccountId', 'toAmount', 'categoryId', 'contactId', 'affectsLedger',
      'description', 'reference', 'tags', 'source', 'recurringId', 'occurrenceDate', 'instrumentId', 'importHash',
    ],
  },
  {
    local: 'documents',
    remote: 'documents',
    hasUpdatedAt: true,
    fields: [
      'direction', 'contactId', 'categoryId', 'title', 'number', 'issueDate', 'dueDate', 'amount', 'currency', 'rateToBase', 'vatRate', 'vatAmount',
      'expectedAccountId', 'probability', 'cancelled', 'notes',
    ],
  },
  { local: 'allocations', remote: 'allocations', hasUpdatedAt: false, fields: ['documentId', 'transactionId', 'instrumentId', 'amount', 'date'] },
  {
    local: 'recurring',
    remote: 'recurring_rules',
    hasUpdatedAt: true,
    fields: ['direction', 'title', 'amount', 'currency', 'accountId', 'categoryId', 'contactId', 'frequency', 'interval', 'anchorDate', 'endDate', 'weekendPolicy', 'autoPost', 'active', 'template'],
  },
  {
    local: 'instruments',
    remote: 'instruments',
    hasUpdatedAt: true,
    fields: ['kind', 'direction', 'serialNo', 'bank', 'branch', 'drawer', 'contactId', 'amount', 'currency', 'rateToBase', 'issueDate', 'dueDate', 'status', 'history', 'accountId', 'endorsedToId'],
  },
  { local: 'scenarios', remote: 'scenarios', hasUpdatedAt: true, fields: ['name', 'color', 'active', 'adjustments'] },
  { local: 'rules', remote: 'categorization_rules', hasUpdatedAt: true, fields: ['pattern', 'categoryId', 'contactId', 'hits', 'source'] },
];

const NUMERIC = new Set([
  'amount', 'openingBalance', 'minBalance', 'creditLimit', 'monthlyBudget', 'paymentTermDays', 'riskLimit', 'rateToBase', 'toAmount',
  'vatRate', 'vatAmount', 'probability', 'interval', 'hits', 'sortOrder', 'fiscalYearStartMonth',
]);

export const snake = (s: string) => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const iso = (v: unknown) => new Date(String(v)).toISOString();

export type RemoteRow = Record<string, unknown> & { id: string; workspace_id: string; updated_at: string; created_at: string; deleted_at: string | null; server_updated_at?: string };

type LocalRow = Record<string, unknown> & { id: string; workspaceId: string; createdAt: string; updatedAt?: string };

/** Satırın senkron sürümü (değişiklik tespiti için). */
export const versionOf = (row: { updatedAt?: string; createdAt: string }) => row.updatedAt ?? row.createdAt;

export function toRemote(table: SyncTable, row: { id: string; workspaceId: string; createdAt: string; updatedAt?: string }): RemoteRow {
  const out: RemoteRow = {
    id: row.id,
    workspace_id: row.workspaceId,
    created_at: row.createdAt,
    updated_at: versionOf(row),
    deleted_at: null,
  };
  const values = row as unknown as Record<string, unknown>;
  for (const f of table.fields) out[snake(f)] = values[f] ?? null;
  return out;
}

export function fromRemote(table: SyncTable, r: RemoteRow): LocalRow {
  const out: LocalRow = { id: r.id, workspaceId: r.workspace_id, createdAt: iso(r.created_at) };
  if (table.hasUpdatedAt) out.updatedAt = iso(r.updated_at);
  for (const f of table.fields) {
    const v = r[snake(f)];
    if (v === null || v === undefined) continue;
    out[f] = NUMERIC.has(f) && typeof v === 'string' ? Number(v) : v;
  }
  return out;
}

/** Sürüm karşılaştırması: sunucudaki updated_at biçimi farklı olabilir. */
export const remoteVersion = (r: RemoteRow) => iso(r.updated_at);

export interface WorkspaceSettings {
  minCashBalance?: number;
  tempo?: boolean;
}

export function workspaceToRemote(ws: Workspace, settings: WorkspaceSettings): Record<string, unknown> {
  return {
    id: ws.id,
    name: ws.name,
    legal_name: ws.legalName ?? null,
    tax_id: ws.taxId ?? null,
    base_currency: ws.baseCurrency,
    fiscal_year_start_month: ws.fiscalYearStartMonth,
    settings,
    created_at: ws.createdAt,
    updated_at: ws.updatedAt,
    deleted_at: null,
  };
}

export function workspaceFromRemote(r: Record<string, unknown>): { workspace: Workspace; settings: WorkspaceSettings } {
  const workspace: Workspace = {
    id: String(r.id),
    name: String(r.name),
    baseCurrency: (r.base_currency as Workspace['baseCurrency']) ?? 'TRY',
    fiscalYearStartMonth: Number(r.fiscal_year_start_month ?? 1),
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
  };
  if (r.legal_name) workspace.legalName = String(r.legal_name);
  if (r.tax_id) workspace.taxId = String(r.tax_id);
  return { workspace, settings: (r.settings as WorkspaceSettings) ?? {} };
}
