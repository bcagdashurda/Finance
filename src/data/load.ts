import { db, WORKSPACE_TABLES } from './db';
import { generateDemo } from './demo';
import { DEFAULT_CATEGORIES } from './seed';
import { createWorkspace, newId, nowStamp, requireWorkspace, setActiveWorkspace, setSetting } from './repo';
import { today } from '@/domain/dates';
import type { Category, ID, Workspace } from '@/domain/types';

import { SETTINGS_KEYS } from './keys';

export { SETTINGS_KEYS };

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
      // Demo kurları gerçek (ECB) kurların üzerine yazmasın: yalnızca eksik günleri doldur
      const existing = new Set(await db.rates.toCollection().primaryKeys());
      await db.rates.bulkPut(data.rates.filter((r) => !existing.has(r.id)));
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

/**
 * Demo işletmeden çıkar: demo verisini siler, karşılama ekranına döner.
 * Bulut, yapay zekâ ve kilit ayarları korunur; kullanıcı kendi işletmesini kurar.
 */
export async function exitDemo(): Promise<void> {
  const row = await db.settings.get(SETTINGS_KEYS.activeWorkspace);
  const wsId = row?.value as ID | undefined;
  await db.transaction('rw', [db.workspaces, db.settings, db.rates, ...WORKSPACE_TABLES.map((t) => db[t])], async () => {
    if (wsId) {
      for (const t of WORKSPACE_TABLES) await db[t].where('workspaceId').equals(wsId).delete();
      await db.workspaces.delete(wsId);
    }
    await db.settings.bulkDelete([SETTINGS_KEYS.demo, SETTINGS_KEYS.activeWorkspace, SETTINGS_KEYS.minCashBalance, SETTINGS_KEYS.tempo]);
    // Demonun ürettiği (uydurma) kurlar gerçek işletmede kalmasın; gerçek kur yeniden çekilir
    await db.rates.filter((r) => r.source === 'seed').delete();
  });
  setActiveWorkspace(null);
}

/** Tüm yerel veriyi siler (ayarlar dahil). */
export async function wipeEverything(): Promise<void> {
  await db.delete();
  await db.open();
  setActiveWorkspace(null);
}
