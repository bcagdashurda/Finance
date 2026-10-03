/**
 * Bulut (Supabase) bağlantısı, oturum ve senkron durumu.
 * Yapılandırma: Ayarlar'dan yapıştırılan URL + anon anahtar ya da .env (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).
 * anon anahtar herkese açık olacak şekilde tasarlanmıştır; güvenliği satır düzeyi politikalar (RLS) sağlar.
 */
import { create } from 'zustand';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { db } from '@/data/db';
import { SETTINGS_KEYS } from '@/data/keys';
import { SupabaseRemote } from './remote';
import { syncWorkspace, type SyncResult } from './sync';

export interface CloudConfig {
  url: string;
  anonKey: string;
  /** Senkronlanan işletmeler */
  linked: string[];
}

export type CloudStatus = 'off' | 'signed-out' | 'idle' | 'syncing' | 'error' | 'offline';

interface CloudState {
  client: SupabaseClient | null;
  clientKey: string | null;
  session: Session | null;
  status: CloudStatus;
  lastSyncAt: string | null;
  lastResult: SyncResult | null;
  error: string | null;
  set: (patch: Partial<CloudState>) => void;
}

export const useCloud = create<CloudState>((set) => ({
  client: null,
  clientKey: null,
  session: null,
  status: 'off',
  lastSyncAt: null,
  lastResult: null,
  error: null,
  set: (patch) => set(patch),
}));

/** Hesap oturumu: ücretsiz denemenin açtığı kimliksiz oturum hesap sayılmaz (bulut ekranlarında "giriş yapılmamış"). */
export const accountSession = (s: Session | null): Session | null => (s && !s.user.is_anonymous ? s : null);

export function envCloudConfig(): Pick<CloudConfig, 'url' | 'anonKey'> | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  return url && anonKey ? { url: url.trim(), anonKey: anonKey.trim() } : null;
}

export async function saveCloudConfig(patch: Partial<CloudConfig>): Promise<void> {
  const row = await db.settings.get(SETTINGS_KEYS.cloud);
  const current = (row?.value as CloudConfig | undefined) ?? { url: '', anonKey: '', linked: [] };
  await db.settings.put({ key: SETTINGS_KEYS.cloud, value: { ...current, ...patch } });
}

/** Supabase kütüphanesi yalnızca bulut yapılandırıldığında yüklenir (ilk yük hafif kalsın). */
const loadSupabase = () => import('@supabase/supabase-js');

/** Yapılandırmaya göre istemciyi (yeniden) kurar ve oturum dinleyicisini bağlar. */
export async function ensureClient(cfg: Pick<CloudConfig, 'url' | 'anonKey'> | null): Promise<SupabaseClient | null> {
  const state = useCloud.getState();
  const key = cfg ? `${cfg.url}|${cfg.anonKey}` : null;
  if (key === state.clientKey) return state.client;
  if (!cfg) {
    state.set({ client: null, clientKey: null, session: null, status: 'off' });
    return null;
  }
  const { createClient } = await loadSupabase();
  if (useCloud.getState().clientKey === key) return useCloud.getState().client;
  const client = createClient(cfg.url, cfg.anonKey, {
    auth: { persistSession: true, autoRefreshToken: true, storageKey: 'mizan-auth' },
  });
  state.set({ client, clientKey: key, status: 'signed-out', error: null });
  client.auth.getSession().then(({ data }) => {
    useCloud.getState().set({ session: data.session, status: data.session ? 'idle' : 'signed-out' });
  });
  client.auth.onAuthStateChange((_event, session) => {
    useCloud.getState().set({ session, status: session ? (useCloud.getState().status === 'syncing' ? 'syncing' : 'idle') : 'signed-out' });
  });
  return client;
}

/** Bağlantı testi: şema kurulu mu, anahtar geçerli mi? */
export async function testConnection(url: string, anonKey: string): Promise<void> {
  if (!/^https:\/\/.+\.supabase\.(co|in|net)/.test(url.trim()) && !url.startsWith('http://localhost')) {
    throw new Error('Proje URL’si https://xxxx.supabase.co biçiminde olmalı.');
  }
  const { createClient } = await loadSupabase();
  const probe = createClient(url.trim(), anonKey.trim(), { auth: { persistSession: false } });
  const { error } = await probe.from('workspaces').select('id', { head: true, count: 'exact' });
  if (!error) return;
  if (error.code === '42501') return; // anon erişimi kapalı: şema kurulu ve güvenli
  if (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|Could not find the table/i.test(error.message)) {
    throw new Error('Bağlandı ama şema kurulmamış: supabase/schema.sql dosyasını SQL Editor’da çalıştırın.');
  }
  if (/Invalid API key|JWT|401/i.test(error.message)) throw new Error('Anahtar geçersiz: “anon public” anahtarını kopyaladığınızdan emin olun.');
  throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Senkron zamanlayıcı

let running: Promise<SyncResult | null> | null = null;
let applyingRemote = false;

export function isApplyingRemote(): boolean {
  return applyingRemote;
}

export async function syncNow(workspaceId: string): Promise<SyncResult | null> {
  const { client, session, set } = useCloud.getState();
  if (!client || !session) return null;
  if (running) return running;
  running = (async () => {
    set({ status: 'syncing', error: null });
    applyingRemote = true;
    try {
      const result = await syncWorkspace({ db, remote: new SupabaseRemote(client), workspaceId });
      set({ status: 'idle', lastSyncAt: new Date().toISOString(), lastResult: result });
      return result;
    } catch (e) {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      set({ status: offline ? 'offline' : 'error', error: offline ? 'İnternet bağlantısı yok' : e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      applyingRemote = false;
      running = null;
    }
  })();
  return running;
}

export async function listRemoteWorkspaces(): Promise<Array<{ id: string; name: string; updated_at: string }>> {
  const { client } = useCloud.getState();
  if (!client) return [];
  const rows = await new SupabaseRemote(client).listWorkspaces();
  return rows.map((r) => ({ id: String(r.id), name: String(r.name), updated_at: String(r.updated_at) }));
}

export async function addTeamMember(workspaceId: string, email: string, role: 'editor' | 'viewer'): Promise<void> {
  const { client } = useCloud.getState();
  if (!client) throw new Error('Önce buluta bağlanın');
  const { error } = await client.rpc('mizan_add_member', { ws: workspaceId, member_email: email, member_role: role });
  if (error) throw new Error(error.message);
}
