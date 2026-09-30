import type { RemoteRow } from './mapping';
import type { Cursor, RemoteStore } from './remote';

/**
 * Testler için bellek içi sunucu: Postgres tetikleyicisini taklit ederek her yazımda
 * artan bir server_updated_at damgalar; yumuşak silme ve sayfalama davranışı gerçektekiyle aynı.
 */
export class MemoryRemote implements RemoteStore {
  pageSize = 1000;
  private tables = new Map<string, Map<string, RemoteRow>>();
  private workspaces = new Map<string, Record<string, unknown>>();
  private clock = Date.parse('2030-01-01T00:00:00.000Z');

  private stamp(): string {
    this.clock += 1;
    return new Date(this.clock).toISOString();
  }

  private table(name: string) {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }

  rows(name: string): RemoteRow[] {
    return [...this.table(name).values()];
  }

  async getWorkspace(id: string) {
    return this.workspaces.get(id) ?? null;
  }

  async listWorkspaces() {
    return [...this.workspaces.values()];
  }

  async upsertWorkspace(row: Record<string, unknown>) {
    this.workspaces.set(String(row.id), { ...this.workspaces.get(String(row.id)), ...row, server_updated_at: this.stamp() });
  }

  async pullPage(name: string, workspaceId: string, after: Cursor, limit: number) {
    return this.rows(name)
      .filter((r) => r.workspace_id === workspaceId)
      .filter((r) => r.server_updated_at! > after.ts || (r.server_updated_at === after.ts && r.id > after.id))
      .sort((a, b) => a.server_updated_at!.localeCompare(b.server_updated_at!) || a.id.localeCompare(b.id))
      .slice(0, limit)
      .map((r) => ({ ...r }));
  }

  async upsert(name: string, rows: RemoteRow[]) {
    // Aynı "işlem"deki satırlar aynı damgayı alır (Postgres now() gibi)
    const ts = this.stamp();
    for (const r of rows) this.table(name).set(r.id, { ...r, server_updated_at: ts });
  }

  async softDelete(name: string, workspaceId: string, ids: string[]) {
    const ts = this.stamp();
    for (const id of ids) {
      const r = this.table(name).get(id);
      if (r && r.workspace_id === workspaceId) this.table(name).set(id, { ...r, deleted_at: new Date().toISOString(), server_updated_at: ts });
    }
  }
}
