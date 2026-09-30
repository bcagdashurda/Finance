/**
 * İki yönlü senkron motoru (son yazan kazanır).
 *
 *  1. İşletme satırı: yerel sürüm değiştiyse gönderilir; sunucudaki daha yeniyse alınır.
 *  2. Her tablo için:
 *     a) Çek: (server_updated_at, id) imlecinden itibaren, 2 dk güvenlik örtüşmesiyle, sayfa sayfa.
 *        Silinmişse yerelden sil; yerelde yoksa ya da sunucu sürümü daha yeniyse yaz.
 *     b) Gönder: sürümü son senkrondan farklı olan yerel satırlar (upsert).
 *     c) Sil: sunucuda bilinen ama yerelde artık olmayan satırlar (yumuşak silme).
 *  "Bilinen sürümler" (known) cihaz saatine güvenmeden değişikliği tespit eder.
 */
import type { MizanDB } from '@/data/db';
import { SETTINGS_KEYS, syncStateKey } from '@/data/keys';
import { fromRemote, remoteVersion, SYNC_TABLES, toRemote, versionOf, workspaceFromRemote, workspaceToRemote, type WorkspaceSettings } from './mapping';
import type { Cursor, RemoteStore } from './remote';

interface SyncState {
  cursors: Record<string, Cursor>;
  known: Record<string, Record<string, string>>;
  workspaceVersion?: string;
}

export interface SyncResult {
  pulled: number;
  pushed: number;
  deleted: number;
}

const OVERLAP_MS = 120_000;
const EPOCH: Cursor = { ts: '1970-01-01T00:00:00.000Z', id: '' };

function rewind(c: Cursor): Cursor {
  const t = Date.parse(c.ts);
  if (Number.isNaN(t)) return EPOCH;
  return { ts: new Date(Math.max(0, t - OVERLAP_MS)).toISOString(), id: '' };
}

async function readSettings(db: MizanDB): Promise<WorkspaceSettings> {
  const [min, tempo] = await Promise.all([db.settings.get(SETTINGS_KEYS.minCashBalance), db.settings.get(SETTINGS_KEYS.tempo)]);
  const out: WorkspaceSettings = {};
  if (typeof min?.value === 'number') out.minCashBalance = min.value;
  if (typeof tempo?.value === 'boolean') out.tempo = tempo.value;
  return out;
}

export async function syncWorkspace({ db, remote, workspaceId }: { db: MizanDB; remote: RemoteStore; workspaceId: string }): Promise<SyncResult> {
  const stateRow = await db.settings.get(syncStateKey(workspaceId));
  const state: SyncState = (stateRow?.value as SyncState | undefined) ?? { cursors: {}, known: {} };
  const result: SyncResult = { pulled: 0, pushed: 0, deleted: 0 };

  // 1. İşletme
  const localWs = await db.workspaces.get(workspaceId);
  const remoteWs = await remote.getWorkspace(workspaceId);
  if (remoteWs && (!localWs || new Date(String(remoteWs.updated_at)).toISOString() > localWs.updatedAt)) {
    const { workspace, settings } = workspaceFromRemote(remoteWs);
    await db.workspaces.put(workspace);
    if (settings.minCashBalance != null) await db.settings.put({ key: SETTINGS_KEYS.minCashBalance, value: settings.minCashBalance });
    if (settings.tempo != null) await db.settings.put({ key: SETTINGS_KEYS.tempo, value: settings.tempo });
    state.workspaceVersion = workspace.updatedAt;
  } else if (localWs && (!remoteWs || state.workspaceVersion !== localWs.updatedAt)) {
    await remote.upsertWorkspace(workspaceToRemote(localWs, await readSettings(db)));
    state.workspaceVersion = localWs.updatedAt;
  }
  if (!localWs && !remoteWs) throw new Error('İşletme ne bu cihazda ne de bulutta bulundu.');

  // 2. Tablolar
  for (const t of SYNC_TABLES) {
    const table = db[t.local] as unknown as {
      get(id: string): Promise<Record<string, unknown> | undefined>;
      put(row: unknown): Promise<unknown>;
      delete(id: string): Promise<void>;
      where(k: string): { equals(v: string): { toArray(): Promise<Array<Record<string, unknown> & { id: string; createdAt: string; updatedAt?: string }>> } };
    };
    const known = (state.known[t.remote] ??= {});

    // a) Çek
    let after = state.cursors[t.remote] ? rewind(state.cursors[t.remote]!) : EPOCH;
    let maxCursor = state.cursors[t.remote] ?? EPOCH;
    for (;;) {
      const page = await remote.pullPage(t.remote, workspaceId, after, remote.pageSize);
      for (const r of page) {
        const local = await table.get(r.id);
        if (r.deleted_at) {
          if (local) {
            await table.delete(r.id);
            result.pulled++;
          }
          delete known[r.id];
        } else {
          const version = remoteVersion(r);
          const localVersion = local ? versionOf(local as { updatedAt?: string; createdAt: string }) : null;
          if (!local && known[r.id] === version) {
            // Bu cihazda silinmiş ve sunucuda o günden beri değişmemiş: geri getirme,
            // aşağıda silme olarak gönderilecek.
          } else if (!local || version > localVersion!) {
            await table.put(fromRemote(t, r));
            result.pulled++;
            known[r.id] = version;
          } else if (version === localVersion) {
            known[r.id] = version;
          }
          // Yerel daha yeniyse dokunma; aşağıda gönderilecek.
        }
        const c = { ts: r.server_updated_at!, id: r.id };
        if (c.ts > maxCursor.ts || (c.ts === maxCursor.ts && c.id > maxCursor.id)) maxCursor = c;
      }
      if (page.length < remote.pageSize) break;
      const last = page.at(-1)!;
      after = { ts: last.server_updated_at!, id: last.id };
    }
    state.cursors[t.remote] = maxCursor;

    // b) Gönder
    const locals = await table.where('workspaceId').equals(workspaceId).toArray();
    const dirty = locals.filter((row) => known[row.id] !== versionOf(row));
    if (dirty.length) {
      await remote.upsert(t.remote, dirty.map((row) => toRemote(t, row as never)));
      for (const row of dirty) known[row.id] = versionOf(row);
      result.pushed += dirty.length;
    }

    // c) Yerelde silinenler
    const present = new Set(locals.map((r) => r.id));
    const gone = Object.keys(known).filter((id) => !present.has(id));
    if (gone.length) {
      await remote.softDelete(t.remote, workspaceId, gone);
      for (const id of gone) delete known[id];
      result.deleted += gone.length;
    }
  }

  await db.settings.put({ key: syncStateKey(workspaceId), value: state });
  return result;
}
