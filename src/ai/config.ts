/**
 * groq: anahtar bu cihazda · openai-compatible: özel uç nokta (ör. Ollama) ·
 * cloud: Supabase Edge Function (ai-proxy) — anahtar sunucuda, oturum jetonuyla çağrılır.
 */
export type AiProvider = 'groq' | 'openai-compatible' | 'cloud';

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

export const DEFAULT_AI: AiConfig = {
  enabled: false,
  provider: 'groq',
  apiKey: '',
  baseUrl: GROQ_BASE,
  model: 'openai/gpt-oss-120b',
  fastModel: 'openai/gpt-oss-20b',
  sttModel: 'whisper-large-v3-turbo',
  maskNames: false,
};

export function isAiReady(c: AiConfig | undefined | null): c is AiConfig {
  return Boolean(c && c.enabled && c.apiKey && c.consentAt);
}

/**
 * Çağrı anındaki etkin yapılandırma. Bulut sağlayıcısında anahtar yerine oturum jetonu
 * ve Edge Function adresi kullanılır.
 */
export function effectiveAiConfig(c: AiConfig, cloud: { url: string; accessToken: string } | null): AiConfig | null {
  if (c.provider !== 'cloud') return isAiReady(c) ? c : null;
  if (!cloud || !c.enabled || !c.consentAt) return null;
  return { ...c, apiKey: cloud.accessToken, baseUrl: `${cloud.url.replace(/\/$/, '')}/functions/v1/ai-proxy` };
}
