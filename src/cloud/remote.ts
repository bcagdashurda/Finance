import type { SupabaseClient } from '@supabase/supabase-js';
import type { RemoteRow } from './mapping';

export interface Cursor {
  ts: string;
  id: string;
}

/** Senkron motorunun ihtiyaç duyduğu sunucu işlemleri (Supabase ya da testte bellek). */
export interface RemoteStore {
  pageSize: number;
  getWorkspace(id: string): Promise<Record<string, unknown> | null>;
  listWorkspaces(): Promise<Array<Record<string, unknown>>>;
  upsertWorkspace(row: Record<string, unknown>): Promise<void>;
  /** (server_updated_at, id) > after, artan sırada, en fazla limit satır */
  pullPage(table: string, workspaceId: string, after: Cursor, limit: number): Promise<RemoteRow[]>;
  upsert(table: string, rows: RemoteRow[]): Promise<void>;
  softDelete(table: string, workspaceId: string, ids: string[]): Promise<void>;
}

const chunk = <T,>(list: T[], size: number) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

function fail(error: { message: string; code?: string } | null, what: string): void {
  if (!error) return;
  if (error.code === '42P01' || /relation .* does not exist|Could not find the table/i.test(error.message)) {
    throw new Error('Supabase şeması kurulmamış: supabase/schema.sql dosyasını SQL Editor’da çalıştırın.');
  }
  if (error.code === '42501' || /row-level security/i.test(error.message)) {
    throw new Error('Bu işletmeye yazma yetkiniz yok.');
  }
  throw new Error(`${what}: ${error.message}`);
}

export class SupabaseRemote implements RemoteStore {
  pageSize = 1000;
  constructor(private sb: SupabaseClient) {}

  async getWorkspace(id: string) {
    const { data, error } = await this.sb.from('workspaces').select('*').eq('id', id).maybeSingle();
    fail(error, 'İşletme okunamadı');
    return data;
  }

  async listWorkspaces() {
    const { data, error } = await this.sb.from('workspaces').select('*').is('deleted_at', null).order('name');
    fail(error, 'İşletmeler listelenemedi');
    return data ?? [];
  }

  async upsertWorkspace(row: Record<string, unknown>) {
    const { error } = await this.sb.from('workspaces').upsert(row, { onConflict: 'id' });
    fail(error, 'İşletme yüklenemedi');
  }

  async pullPage(table: string, workspaceId: string, after: Cursor, limit: number) {
    const { data, error } = await this.sb
      .from(table)
      .select('*')
      .eq('workspace_id', workspaceId)
      .or(`server_updated_at.gt.${after.ts},and(server_updated_at.eq.${after.ts},id.gt.${after.id})`)
      .order('server_updated_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit);
    fail(error, 'Değişiklikler alınamadı');
    return (data ?? []) as RemoteRow[];
  }

  async upsert(table: string, rows: RemoteRow[]) {
    for (const part of chunk(rows, 500)) {
      const { error } = await this.sb.from(table).upsert(part, { onConflict: 'id' });
      fail(error, 'Değişiklikler gönderilemedi');
    }
  }

  async softDelete(table: string, workspaceId: string, ids: string[]) {
    const now = new Date().toISOString();
    for (const part of chunk(ids, 200)) {
      const { error } = await this.sb.from(table).update({ deleted_at: now, updated_at: now }).eq('workspace_id', workspaceId).in('id', part);
      fail(error, 'Silmeler gönderilemedi');
    }
  }
}
