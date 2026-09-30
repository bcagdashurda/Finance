export type AiProvider = 'groq' | 'openai-compatible';

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
