import { db, WORKSPACE_TABLES } from './db';
import { generateDemo } from './demo';
import { DEFAULT_CATEGORIES } from './seed';
import { createWorkspace, newId, nowStamp, requireWorkspace, setActiveWorkspace, setSetting } from './repo';
import { today } from '@/domain/dates';
import type { Category, ID, Workspace } from '@/domain/types';

export const SETTINGS_KEYS = {
  activeWorkspace: 'activeWorkspaceId',
  minCashBalance: 'minCashBalance',
  demo: 'isDemo',
  tempo: 'forecastTempo',
  ai: 'ai',
  lock: 'appLock',
  lastBackup: 'lastBackupAt',
} as const;

/** Demo işletmeyi yükler ve etkin çalışma alanı yapar. */
export async function loadDemo(): Promise<ID> {
  const data = generateDemo(today());
  await db.transaction(
    'rw',
    [db.workspaces, db.rates, db.settings, ...WORKSPACE_TABLES.map((t) => db[t])],
    async () => {
      // Önceki demo varsa temizle
      for (const t of WORKSPACE_TABLES) {
        await db[t].where('workspaceId').equals(data.workspace.id).delete();
      }
      await db.workspaces.put(data.workspace);
      await db.accounts.bulkPut(data.accounts);
      await db.categories.bulkPut(data.categories);
      await db.contacts.bulkPut(data.contacts);
      await db.transactions.bulkPut(data.transactions);
      await db.documents.bulkPut(data.documents);
      await db.allocations.bulkPut(data.allocations);
      await db.recurring.bulkPut(data.recurring);
      await db.instruments.bulkPut(data.instruments);
      await db.scenarios.bulkPut(data.scenarios);
      await db.rates.bulkPut(data.rates);
      await db.settings.put({ key: SETTINGS_KEYS.minCashBalance, value: data.settings.minCashBalance });
      await db.settings.put({ key: SETTINGS_KEYS.demo, value: true });
      await db.settings.put({ key: SETTINGS_KEYS.activeWorkspace, value: data.workspace.id });
    },
  );
  setActiveWorkspace(data.workspace.id);
  return data.workspace.id;
}

export interface SetupInput {
  name: string;
  legalName?: string;
  taxId?: string;
  minCashBalance: number;
}

/** Boş bir işletme kurar: çalışma alanı + varsayılan kategoriler. */
export async function setupWorkspace(input: SetupInput): Promise<Workspace> {
  const ws = await createWorkspace({
    name: input.name,
    legalName: input.legalName,
    taxId: input.taxId,
    baseCurrency: 'TRY',
    fiscalYearStartMonth: 1,
  });
  const stamp = nowStamp();
  const categories: Category[] = DEFAULT_CATEGORIES.map((c) => ({
    id: newId(),
    workspaceId: requireWorkspace(),
    name: c.name,
    kind: c.kind,
    color: c.color,
    icon: c.icon,
    archived: false,
    system: true,
    createdAt: stamp,
    updatedAt: stamp,
  }));
  await db.categories.bulkAdd(categories);
  await setSetting(SETTINGS_KEYS.minCashBalance, input.minCashBalance);
  await setSetting(SETTINGS_KEYS.demo, false);
  return ws;
}

/** Tüm yerel veriyi siler (ayarlar dahil). */
export async function wipeEverything(): Promise<void> {
  await db.delete();
  await db.open();
  setActiveWorkspace(null);
}
