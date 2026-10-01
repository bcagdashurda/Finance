/**
 * Hesaba bağlı kullanıcı ayarları (şimdilik yapay zekâ bağlantısı): kullanıcı anahtarını bir kez girer,
 * aynı hesapla açtığı her tarayıcıda hazır gelir. Supabase'de `user_settings` tablosunda durur; satır düzeyi
 * güvenlik yalnızca kullanıcının kendi satırını okumasına izin verir (bkz. schema.sql).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AiConfig } from '@/ai/config';

export type AccountAi = Pick<AiConfig, 'provider' | 'apiKey' | 'baseUrl' | 'model' | 'fastModel' | 'sttModel' | 'maskNames' | 'enabled' | 'consentAt' | 'gemini'>;

export interface UserSettingsRemote {
  getAi(): Promise<AccountAi | null>;
  /** null: bağlantı kaldırıldı (diğer cihazlarda da geri gelmesin) */
  putAi(ai: AccountAi | null): Promise<void>;
}

/** Hesaba yazılacak hâl; kurulum dosyasından gelen ya da boş bağlantı yüklenmez. */
export function aiForAccount(c: AiConfig): AccountAi | null {
  if (!c.apiKey || c.consentAt === 'env' || c.provider === 'cloud') return null;
  const { provider, apiKey, baseUrl, model, fastModel, sttModel, maskNames, enabled, consentAt, gemini } = c;
  return { provider, apiKey, baseUrl, model, fastModel, sttModel, maskNames, enabled, consentAt, gemini };
}

export type Reconcile = { action: 'restore'; ai: AccountAi } | { action: 'upload'; ai: AccountAi } | { action: 'none' };

/**
 * Giriş anında: bu tarayıcıda anahtar yoksa hesaptakini geri yükle; varsa (kullanıcının burada girdiği)
 * hesaba yaz. Aynıysa dokunma.
 */
export function reconcileAiOnSignIn(local: AiConfig, account: AccountAi | null): Reconcile {
  const mine = aiForAccount(local);
  if (!mine) return account?.apiKey && !(local.consentAt === 'env' && local.apiKey) ? { action: 'restore', ai: account } : { action: 'none' };
  if (account && JSON.stringify(account) === JSON.stringify(mine)) return { action: 'none' };
  return { action: 'upload', ai: mine };
}

/** Supabase `user_settings` tablosu (satır düzeyi güvenlik: user_id = auth.uid()). */
export function supabaseUserSettings(sb: SupabaseClient, userId: string): UserSettingsRemote {
  return {
    async getAi() {
      const { data, error } = await sb.from('user_settings').select('ai').eq('user_id', userId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.ai as AccountAi | null | undefined) ?? null;
    },
    async putAi(ai) {
      const { error } = await sb.from('user_settings').upsert({ user_id: userId, ai, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
    },
  };
}
