/**
 * groq / gemini: kullanıcının ücretsiz anahtarı bu cihazda (ikisi de OpenAI uyumlu uç noktayla, tarayıcıdan) ·
 * openai-compatible: özel uç nokta (ör. Ollama) · cloud: Supabase Edge Function (ai-proxy) — anahtar sunucuda.
 */
export type AiProvider = 'groq' | 'gemini' | 'openai-compatible' | 'cloud' | 'trial';

/** Ücretsiz deneme: aynı sitedeki sunucu işlevi (Vercel api/ai); işletmenin anahtarı orada durur. */
export const TRIAL_BASE = '/api/ai';

export interface AiConfig {
  enabled: boolean;
  provider: AiProvider;
  apiKey: string;
  baseUrl: string;
  /** Asistan, anlatım, mesaj taslakları */
  model: string;
  /** Ayrıştırma, sınıflandırma (hızlı) */
  fastModel: string;
  /** Konuşmayı yazıya çevirme */
  sttModel: string;
  /** Cari isimleri takma adla gönderilsin */
  maskNames: boolean;
  /** Bilgilendirilmiş onay zamanı */
  consentAt?: string;
  /** İsteğe bağlı: fiş/fatura fotoğrafı okuma için Gemini */
  gemini?: { apiKey: string; model: string; consentAt?: string };
}

export const GROQ_BASE = 'https://api.groq.com/openai/v1';
/** Gemini'nin OpenAI uyumlu uç noktası (sohbet, araç çağrısı, yapılandırılmış JSON) */
export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/openai';
/** Gemini'nin kendi API'si (ses ve görüntü girdisi) */
export const GEMINI_NATIVE = 'https://generativelanguage.googleapis.com/v1beta';

type Preset = Pick<AiConfig, 'baseUrl' | 'model' | 'fastModel' | 'sttModel'>;
export const PRESETS: Record<'groq' | 'gemini', Preset> = {
  groq: { baseUrl: GROQ_BASE, model: 'openai/gpt-oss-120b', fastModel: 'openai/gpt-oss-20b', sttModel: 'whisper-large-v3-turbo' },
  gemini: { baseUrl: GEMINI_BASE, model: 'gemini-2.5-flash', fastModel: 'gemini-2.5-flash-lite', sttModel: 'gemini-2.5-flash' },
};

export const DEFAULT_AI: AiConfig = {
  enabled: false,
  provider: 'groq',
  apiKey: '',
  ...PRESETS.groq,
  maskNames: false,
};

/** Sağlayıcı değişince uç nokta ve modeller birlikte değişir (Groq modeli Gemini'ye gönderilmesin). */
export function withProvider(c: AiConfig, provider: 'groq' | 'gemini'): AiConfig {
  return { ...c, provider, ...PRESETS[provider] };
}

/** Yapıştırılan anahtardan sağlayıcıyı tanır: Groq "gsk_", Google "AIza" ile başlar. */
export function detectProvider(key: string): 'groq' | 'gemini' | null {
  const k = key.trim();
  if (k.startsWith('gsk_')) return 'groq';
  if (k.startsWith('AIza')) return 'gemini';
  return null;
}

export function isAiReady(c: AiConfig | undefined | null): c is AiConfig {
  return Boolean(c && c.enabled && c.apiKey && c.consentAt);
}

/**
 * Çağrı anındaki etkin yapılandırma. Bulut sağlayıcısında anahtar yerine oturum jetonu
 * ve Edge Function adresi kullanılır.
 */
export function effectiveAiConfig(c: AiConfig, cloud: { url: string; accessToken: string } | null): AiConfig | null {
  // Deneme: anahtar sunucuda; Authorization yalnızca biçim gereği (sunucu kullanmaz)
  if (c.provider === 'trial') return c.enabled && c.consentAt ? { ...c, baseUrl: TRIAL_BASE, apiKey: 'mizan-deneme' } : null;
  if (c.provider !== 'cloud') return isAiReady(c) ? c : null;
  if (!cloud || !c.enabled || !c.consentAt) return null;
  return { ...c, apiKey: cloud.accessToken, baseUrl: `${cloud.url.replace(/\/$/, '')}/functions/v1/ai-proxy` };
}
