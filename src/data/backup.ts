import { db, WORKSPACE_TABLES } from './db';
import { requireWorkspace, setSetting } from './repo';
import { SETTINGS_KEYS } from './load';
import type { ID } from '@/domain/types';

export const BACKUP_VERSION = 1;

export interface Backup {
  app: 'mizan';
  version: number;
  exportedAt: string;
  workspace: unknown;
  tables: Record<string, unknown[]>;
  rates: unknown[];
  settings: Array<{ key: string; value: unknown }>;
}

/** Etkin çalışma alanının tüm verisi (API anahtarları hariç). */
export async function exportBackup(): Promise<Backup> {
  const ws = requireWorkspace();
  const tables: Record<string, unknown[]> = {};
  for (const t of WORKSPACE_TABLES) tables[t] = await db[t].where('workspaceId').equals(ws).toArray();
  const settings = (await db.settings.toArray()).filter((s) => s.key !== SETTINGS_KEYS.ai && s.key !== SETTINGS_KEYS.lock);
  const backup: Backup = {
    app: 'mizan',
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    workspace: await db.workspaces.get(ws),
    tables,
    rates: await db.rates.toArray(),
    settings,
  };
  await setSetting(SETTINGS_KEYS.lastBackup, backup.exportedAt);
  return backup;
}

export function validateBackup(data: unknown): data is Backup {
  const b = data as Backup;
  return Boolean(b && b.app === 'mizan' && typeof b.version === 'number' && b.version <= BACKUP_VERSION && b.workspace && b.tables);
}

/** Yedeği geri yükler: aynı çalışma alanının mevcut verisini değiştirir. */
export async function restoreBackup(b: Backup): Promise<ID> {
  const ws = (b.workspace as { id: ID }).id;
  await db.transaction('rw', [db.workspaces, db.rates, db.settings, ...WORKSPACE_TABLES.map((t) => db[t])], async () => {
    for (const t of WORKSPACE_TABLES) {
      await db[t].where('workspaceId').equals(ws).delete();
      const rows = (b.tables[t] ?? []) as never[];
      if (rows.length) await (db[t] as unknown as { bulkPut(r: unknown[]): Promise<unknown> }).bulkPut(rows);
    }
    await db.workspaces.put(b.workspace as never);
    if (b.rates?.length) await db.rates.bulkPut(b.rates as never[]);
    for (const s of b.settings ?? []) {
      if (s.key === SETTINGS_KEYS.ai || s.key === SETTINGS_KEYS.lock) continue;
      await db.settings.put(s);
    }
    await db.settings.put({ key: SETTINGS_KEYS.activeWorkspace, value: ws });
  });
  return ws;
}
