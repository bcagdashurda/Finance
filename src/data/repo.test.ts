import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { loadDemo, wipeEverything } from './load';
import { createAccount, createContact, deleteOrArchiveAccount, deleteOrArchiveContact, setActiveWorkspace } from './repo';

const contact = () => createContact({ name: 'Yanlışlıkla Eklenen Ltd.', kind: 'customer', currency: 'TRY', openingBalance: 0, tags: [], archived: false });
const account = (name: string) => createAccount({ name, kind: 'cash', currency: 'TRY', openingBalance: 0, openingDate: '2026-09-01', archived: false, sortOrder: 99, color: 'slot-1' });

let ws: string;
beforeEach(async () => {
  await wipeEverything();
  ws = await loadDemo();
  setActiveWorkspace(ws);
});

describe('deleteOrArchiveAccount', () => {
  it('archives an account a recurring payment still draws from, deletes an unused one', async () => {
    const acc = await account('Yeni kasa');
    const rule = (await db.recurring.where('workspaceId').equals(ws).first())!;
    await db.recurring.update(rule.id, { accountId: acc.id });
    expect(await deleteOrArchiveAccount(acc.id)).toBe('archived');

    const empty = await account('Boş hesap');
    expect(await deleteOrArchiveAccount(empty.id)).toBe('deleted');
  });
});

describe('deleteOrArchiveContact', () => {
  it('deletes a contact nothing refers to', async () => {
    const c = await contact();
    expect(await deleteOrArchiveContact(c.id)).toBe('deleted');
    expect(await db.contacts.get(c.id)).toBeUndefined();
  });

  it('archives instead of deleting when a recurring payment or an endorsed cheque points to it', async () => {
    const a = await contact();
    const rule = (await db.recurring.where('workspaceId').equals(ws).first())!;
    await db.recurring.update(rule.id, { contactId: a.id });
    expect(await deleteOrArchiveContact(a.id)).toBe('archived');

    const b = await contact();
    const ins = (await db.instruments.where('workspaceId').equals(ws).first())!;
    await db.instruments.update(ins.id, { endorsedToId: b.id });
    expect(await deleteOrArchiveContact(b.id)).toBe('archived');
    expect((await db.contacts.get(b.id))?.archived).toBe(true);
  });

  it('keeps learned import rules but drops the deleted contact from them', async () => {
    const c = await contact();
    await db.rules.put({ id: 'r1', workspaceId: ws, pattern: 'yanlis', categoryId: 'cat', contactId: c.id, hits: 2, source: 'user', createdAt: '', updatedAt: '' } as never);
    expect(await deleteOrArchiveContact(c.id)).toBe('deleted');
    const r = await db.rules.get('r1');
    expect(r?.categoryId).toBe('cat');
    expect(r?.contactId).toBeUndefined();
  });
});
