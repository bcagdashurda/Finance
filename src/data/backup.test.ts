import { describe, expect, it } from 'vitest';
import { db, WORKSPACE_TABLES } from './db';
import { loadDemo, wipeEverything } from './load';
import { exportBackup, restoreBackup, validateBackup } from './backup';
import { setActiveWorkspace } from './repo';

async function counts(ws: string) {
  const out: Record<string, number> = {};
  for (const t of WORKSPACE_TABLES) out[t] = await db[t].where('workspaceId').equals(ws).count();
  return out;
}

describe('backup round-trip', () => {
  it('restores exactly the same records after a full wipe', async () => {
    const ws = await loadDemo();
    const before = await counts(ws);
    expect(before.transactions).toBeGreaterThan(500);

    const backup = JSON.parse(JSON.stringify(await exportBackup()));
    expect(validateBackup(backup)).toBe(true);

    await wipeEverything();
    expect(await db.transactions.count()).toBe(0);

    const restored = await restoreBackup(backup);
    setActiveWorkspace(restored);
    expect(restored).toBe(ws);
    expect(await counts(ws)).toEqual(before);
    expect((await db.settings.get('activeWorkspaceId'))?.value).toBe(ws);
  });

  it('never exports AI keys or the app lock', async () => {
    await loadDemo();
    await db.settings.put({ key: 'ai', value: { apiKey: 'gsk_secret' } });
    await db.settings.put({ key: 'appLock', value: { pinHash: 'x', salt: 'y' } });
    const text = JSON.stringify(await exportBackup());
    expect(text).not.toContain('gsk_secret');
    expect(text).not.toContain('pinHash');
  });

  it('keeps device-level settings and follows the backup on demo mode', async () => {
    await loadDemo();
    const backup = JSON.parse(JSON.stringify(await exportBackup()));
    // Gerçek işletmenin yedeği: demo bayrağı yok, eski tarihli son yedek ve bulut ayarı var
    backup.settings = backup.settings.filter((s: { key: string }) => s.key !== 'isDemo' && s.key !== 'lastBackupAt' && s.key !== 'cloud');
    backup.settings.push({ key: 'lastBackupAt', value: '2026-01-01T09:00:00.000Z' }, { key: 'cloud', value: { url: 'eski' } });

    await db.settings.put({ key: 'lastBackupAt', value: '2026-09-30T10:00:00.000Z' });
    await db.settings.put({ key: 'cloud', value: { url: 'bu-cihaz' } });
    await restoreBackup(backup);

    expect(await db.settings.get('isDemo')).toBeUndefined();
    expect((await db.settings.get('lastBackupAt'))?.value).toBe('2026-09-30T10:00:00.000Z');
    expect((await db.settings.get('cloud'))?.value).toEqual({ url: 'bu-cihaz' });
  });

  it('rejects files that are not Mizan backups', () => {
    expect(validateBackup({ hello: 'world' })).toBe(false);
  });
});
