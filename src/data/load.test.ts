import { beforeEach, describe, expect, it } from 'vitest';
import { db, WORKSPACE_TABLES } from './db';
import { exitDemo, loadDemo, wipeEverything } from './load';
import { SETTINGS_KEYS } from './keys';
import { today } from '@/domain/dates';

describe('demo lifecycle', () => {
  beforeEach(async () => {
    await wipeEverything();
  });

  it('does not overwrite real (ECB) rates with synthetic demo rates', async () => {
    const T = today();
    await db.rates.put({ id: `${T}:USD`, date: T, currency: 'USD', perBase: 48.996, source: 'ecb' });
    await loadDemo();
    expect((await db.rates.get(`${T}:USD`))?.perBase).toBe(48.996);
  });

  it('exitDemo removes demo data and synthetic rates but keeps real rates and AI settings', async () => {
    const T = today();
    const ws = await loadDemo();
    await db.rates.put({ id: `2026-01-02:EUR`, date: '2026-01-02', currency: 'EUR', perBase: 51, source: 'ecb' });
    await db.settings.put({ key: SETTINGS_KEYS.ai, value: { apiKey: 'gsk_x' } });
    await exitDemo();
    for (const t of WORKSPACE_TABLES) expect(await db[t].where('workspaceId').equals(ws).count(), t).toBe(0);
    expect(await db.workspaces.get(ws)).toBeUndefined();
    expect(await db.rates.filter((r) => r.source === 'seed').count()).toBe(0);
    expect(await db.rates.get('2026-01-02:EUR')).toBeDefined();
    expect(await db.settings.get(SETTINGS_KEYS.activeWorkspace)).toBeUndefined();
    expect(await db.settings.get(SETTINGS_KEYS.demo)).toBeUndefined();
    expect((await db.settings.get(SETTINGS_KEYS.ai))?.value).toEqual({ apiKey: 'gsk_x' });
    expect(T).toBeTruthy();
  });
});
