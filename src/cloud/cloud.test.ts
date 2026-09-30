import { beforeEach, describe, expect, it } from 'vitest';
import { MizanDB } from '@/data/db';
import { fromRemote, SYNC_TABLES, toRemote, workspaceFromRemote, workspaceToRemote } from './mapping';
import { MemoryRemote } from './memory-remote';
import { syncWorkspace } from './sync';
import { account, tx } from '@/test/factories';
import type { Workspace } from '@/domain/types';

const txTable = SYNC_TABLES.find((t) => t.local === 'transactions')!;

describe('mapping', () => {
  it('maps camelCase rows to snake_case columns with explicit nulls and back', () => {
    const t = tx({ id: 't1', workspaceId: 'ws', categoryId: undefined, tags: ['a'], date: '2026-09-30', rateToBase: 49.5, amount: 12_345 });
    const remote = toRemote(txTable, t);
    expect(remote).toMatchObject({ id: 't1', workspace_id: 'ws', account_id: 'acc', rate_to_base: 49.5, amount: 12_345, category_id: null, tags: ['a'], deleted_at: null });
    const back = fromRemote(txTable, { ...remote, created_at: '2026-01-01T00:00:00+00:00', updated_at: '2026-01-01T00:00:00.5+00:00', server_updated_at: 'x' });
    expect(back).toEqual({ ...t, updatedAt: '2026-01-01T00:00:00.500Z', createdAt: '2026-01-01T00:00:00.000Z' });
    expect('categoryId' in back).toBe(false);
  });

  it('carries workspace settings in a jsonb column', () => {
    const ws: Workspace = { id: 'ws', name: 'Deniz', baseCurrency: 'TRY', fiscalYearStartMonth: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z' };
    const r = workspaceToRemote(ws, { minCashBalance: 100, tempo: false });
    expect(r).toMatchObject({ id: 'ws', name: 'Deniz', settings: { minCashBalance: 100, tempo: false } });
    expect(workspaceFromRemote({ ...r, owner_id: 'u', server_updated_at: 's' })).toEqual({ workspace: ws, settings: { minCashBalance: 100, tempo: false } });
  });
});

describe('syncWorkspace (two devices through a fake server)', () => {
  let remote: MemoryRemote;
  let a: MizanDB;
  let b: MizanDB;
  const ws: Workspace = { id: 'ws1', name: 'Deniz', baseCurrency: 'TRY', fiscalYearStartMonth: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  let n = 0;

  beforeEach(async () => {
    remote = new MemoryRemote();
    a = new MizanDB(`device-a-${++n}`);
    b = new MizanDB(`device-b-${n}`);
    await a.workspaces.put(ws);
  });

  it('uploads a workspace and downloads it on a second device', async () => {
    await a.accounts.put(account({ id: 'acc1', workspaceId: 'ws1', name: 'Garanti' }));
    await a.transactions.put(tx({ id: 't1', workspaceId: 'ws1', accountId: 'acc1', amount: 500 }));
    const r1 = await syncWorkspace({ db: a, remote, workspaceId: 'ws1' });
    expect(r1.pushed).toBe(2);

    const r2 = await syncWorkspace({ db: b, remote, workspaceId: 'ws1' });
    expect(r2.pulled).toBe(2);
    expect((await b.accounts.get('acc1'))?.name).toBe('Garanti');
    expect((await b.workspaces.get('ws1'))?.name).toBe('Deniz');
  });

  it('propagates edits with last-write-wins and deletions both ways', async () => {
    await a.transactions.put(tx({ id: 't1', workspaceId: 'ws1', amount: 100, updatedAt: '2026-02-01T00:00:00.000Z' }));
    await a.transactions.put(tx({ id: 't2', workspaceId: 'ws1', amount: 200 }));
    await syncWorkspace({ db: a, remote, workspaceId: 'ws1' });
    await syncWorkspace({ db: b, remote, workspaceId: 'ws1' });

    // B düzenler, A siler
    await b.transactions.update('t1', { amount: 999, updatedAt: '2026-03-01T00:00:00.000Z' });
    await a.transactions.delete('t2');
    await syncWorkspace({ db: b, remote, workspaceId: 'ws1' });
    await syncWorkspace({ db: a, remote, workspaceId: 'ws1' });
    await syncWorkspace({ db: b, remote, workspaceId: 'ws1' });

    expect((await a.transactions.get('t1'))?.amount).toBe(999);
    expect(await b.transactions.get('t2')).toBeUndefined();
    expect(remote.rows('transactions').find((r) => r.id === 't2')?.deleted_at).toBeTruthy();
  });

  it('keeps the newer local edit when the server copy is older', async () => {
    await a.transactions.put(tx({ id: 't1', workspaceId: 'ws1', amount: 100, updatedAt: '2026-02-01T00:00:00.000Z' }));
    await syncWorkspace({ db: a, remote, workspaceId: 'ws1' });
    await syncWorkspace({ db: b, remote, workspaceId: 'ws1' });

    await b.transactions.update('t1', { amount: 111, updatedAt: '2026-02-02T00:00:00.000Z' });
    await a.transactions.update('t1', { amount: 222, updatedAt: '2026-02-03T00:00:00.000Z' });
    await syncWorkspace({ db: b, remote, workspaceId: 'ws1' });
    await syncWorkspace({ db: a, remote, workspaceId: 'ws1' });
    await syncWorkspace({ db: b, remote, workspaceId: 'ws1' });

    expect((await a.transactions.get('t1'))?.amount).toBe(222);
    expect((await b.transactions.get('t1'))?.amount).toBe(222);
  });

  it('does not delete rows another device created but has not synced yet', async () => {
    await syncWorkspace({ db: a, remote, workspaceId: 'ws1' });
    await syncWorkspace({ db: b, remote, workspaceId: 'ws1' });
    await b.transactions.put(tx({ id: 'late', workspaceId: 'ws1', amount: 7 }));
    await syncWorkspace({ db: a, remote, workspaceId: 'ws1' });
    await syncWorkspace({ db: b, remote, workspaceId: 'ws1' });
    await syncWorkspace({ db: a, remote, workspaceId: 'ws1' });
    expect((await a.transactions.get('late'))?.amount).toBe(7);
  });

  it('lets a later edit on one device win over a delete on another', async () => {
    await a.transactions.put(tx({ id: 'x', workspaceId: 'ws1', amount: 1, updatedAt: '2026-02-01T00:00:00.000Z' }));
    await syncWorkspace({ db: a, remote, workspaceId: 'ws1' });
    await syncWorkspace({ db: b, remote, workspaceId: 'ws1' });
    await b.transactions.update('x', { amount: 2, updatedAt: '2026-02-05T00:00:00.000Z' });
    await syncWorkspace({ db: b, remote, workspaceId: 'ws1' });
    await a.transactions.delete('x');
    await syncWorkspace({ db: a, remote, workspaceId: 'ws1' });
    expect((await a.transactions.get('x'))?.amount).toBe(2);
  });

  it('carries workspace settings to other devices', async () => {
    await a.settings.put({ key: 'minCashBalance', value: 4_500_000_00 });
    await syncWorkspace({ db: a, remote, workspaceId: 'ws1' });
    await syncWorkspace({ db: b, remote, workspaceId: 'ws1' });
    expect((await b.settings.get('minCashBalance'))?.value).toBe(4_500_000_00);
  });

  it('pages through more than one page of remote changes', async () => {
    remote.pageSize = 3;
    for (let i = 0; i < 8; i++) await a.transactions.put(tx({ id: `p${i}`, workspaceId: 'ws1', amount: i }));
    await syncWorkspace({ db: a, remote, workspaceId: 'ws1' });
    const r = await syncWorkspace({ db: b, remote, workspaceId: 'ws1' });
    expect(await b.transactions.count()).toBe(8);
    expect(r.pulled).toBe(8);
  });
});
