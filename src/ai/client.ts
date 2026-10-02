/**
 * OpenAI uyumlu sohbet istemcisi (varsayılan: Groq). Tarayıcıdan doğrudan çağrılır
 * (Groq CORS'a izin verir). İstemci tarafı hız sınırı, 429 yeniden deneme ve önbellek içerir.
 */
import { db } from '@/data/db';
import { GEMINI_NATIVE, type AiConfig } from './config';
import { audioFileName, geminiAcceptsAudio, toWav } from './audio';

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: Role;
  content: string | null;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  name?: string;
}

export interface ToolDef {
  type: 'function';
  function: { name: string; description: string; parameters: Record<string, unknown> };
}

export class AiError extends Error {
  constructor(
    public kind: 'auth' | 'rate' | 'network' | 'server' | 'schema' | 'disabled',
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

// ---- Hız sınırı: ücretsiz katman 30 istek/dk; güvenli pay bırak
const recent: number[] = [];
async function throttle() {
  const now = Date.now();
  while (recent.length && now - recent[0]! > 60_000) recent.shift();
  if (recent.length >= 26) {
    const wait = 60_000 - (now - recent[0]!) + 50;
    await new Promise((r) => setTimeout(r, wait));
  }
  recent.push(Date.now());
}

function hash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36) + s.length.toString(36);
}

// ---- Kullanım: Groq limit başlıkları (x-ratelimit-*) — Ayarlar'da gösterilir
export interface AiUsage {
  remainingRequests: number | null;
  limitRequests: number | null;
  remainingTokens: number | null;
  at: string;
}
let usage: AiUsage | null = null;
const usageListeners = new Set<(u: AiUsage) => void>();

function readUsage(res: Response) {
  const n = (h: string) => {
    const v = res.headers.get(h);
    return v === null || v === '' ? null : Number(v);
  };
  const limitRequests = n('x-ratelimit-limit-requests');
  if (limitRequests === null) return;
  usage = { limitRequests, remainingRequests: n('x-ratelimit-remaining-requests'), remainingTokens: n('x-ratelimit-remaining-tokens'), at: new Date().toISOString() };
  usageListeners.forEach((l) => l(usage!));
}

export function getAiUsage(): AiUsage | null {
  return usage;
}

export function onAiUsage(listener: (u: AiUsage) => void): () => void {
  usageListeners.add(listener);
  return () => usageListeners.delete(listener);
}

/** Hesapta kullanılabilir modellerden tercih sırasına göre seçim (model kaldırılırsa kırılmasın). */
export function pickModel(available: string[], preferred: string[], fallbackPattern: RegExp): string | null {
  for (const p of preferred) if (available.includes(p)) return p;
  return available.find((m) => fallbackPattern.test(m)) ?? null;
}

export interface ChatOptions {
  model?: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  temperature?: number;
  maxTokens?: number;
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  cache?: boolean;
  signal?: AbortSignal;
}

export interface ChatResult {
  message: ChatMessage;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

/** Hata gövdesinden mesaj: OpenAI biçimi {error:{message}}, Gemini bazen dizi [{error:{message}}] döndürür. */
function errorMessage(body: string): string {
  try {
    const j = JSON.parse(body);
    return (Array.isArray(j) ? j[0] : j)?.error?.message ?? body;
  } catch {
    return body;
  }
}

function friendly(status: number, body: string): AiError {
  const msg = errorMessage(body);
  // Gemini geçersiz anahtara 401 değil 400 döndürür ("Please pass a valid API key")
  if (status === 401 || status === 403 || (status === 400 && /api key/i.test(msg))) return new AiError('auth', 'Anahtar geçersiz ya da yetkisiz. Ayarlar › Yapay zekâ’dan kontrol edin.');
  if (status === 429) return new AiError('rate', 'Ücretsiz kullanım limiti doldu. Biraz sonra tekrar deneyin.');
  if (status === 413) return new AiError('server', 'İstek çok büyük; soruyu daraltın.');
  if (status >= 500) return new AiError('server', 'Yapay zekâ servisi şu an yanıt vermiyor.');
  return new AiError('server', msg.slice(0, 240));
}

/**
 * OpenAI'nin katı JSON şemasını Gemini'nin kabul ettiği biçime çevirir:
 * type: ['x','null'] → type: 'x', nullable: true; additionalProperties kaldırılır.
 */
export function toGeminiSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toGeminiSchema);
  if (!node || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
    if (k === 'additionalProperties' || k === 'strict') continue;
    if (k === 'type' && Array.isArray(v)) {
      const real = v.filter((t) => t !== 'null');
      out.type = real[0] ?? 'string';
      if (v.includes('null')) out.nullable = true;
      continue;
    }
    if (k === 'properties' && v && typeof v === 'object') {
      out.properties = Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([pk, pv]) => [pk, toGeminiSchema(pv)]));
      continue;
    }
    out[k] = k === 'items' || k === 'anyOf' ? toGeminiSchema(v) : v;
  }
  return out;
}

export async function chat(config: AiConfig, opts: ChatOptions): Promise<ChatResult> {
  const gemini = config.provider === 'gemini';
  const model = opts.model ?? config.model;
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
  };
  // Gemini'nin OpenAI uyumlu ucu klasik max_tokens'ı bekler
  body[gemini ? 'max_tokens' : 'max_completion_tokens'] = opts.maxTokens ?? 1200;
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = 'auto';
  }
  if (opts.jsonSchema) {
    body.response_format = gemini
      ? { type: 'json_schema', json_schema: { name: opts.jsonSchema.name, schema: toGeminiSchema(opts.jsonSchema.schema) } }
      : { type: 'json_schema', json_schema: { name: opts.jsonSchema.name, strict: true, schema: opts.jsonSchema.schema } };
  }
  // gpt-oss akıl yürütme modelleri: kısa düşünme → daha az token (ücretsiz katman TPM'i dar);
  // iç düşünme metni yanıtta taşınmaz.
  if (config.provider !== 'openai-compatible' && model.startsWith('openai/gpt-oss')) {
    body.reasoning_effort = 'low';
    body.include_reasoning = false;
  }

  const cacheKey = opts.cache ? hash(JSON.stringify(body)) : null;
  if (cacheKey) {
    const hit = await db.aiCache.get(cacheKey);
    if (hit) return hit.value as ChatResult;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    await throttle();
    let res: Response;
    try {
      res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(body),
        signal: opts.signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new AiError('network', 'Yapay zekâ servisine ulaşılamadı. İnternet bağlantınızı kontrol edin.');
    }
    if (res.status === 429 && attempt < 2) {
      const header = res.headers.get('retry-after');
      const retry = header !== null && Number.isFinite(Number(header)) ? Number(header) : 4 * (attempt + 1);
      if (retry <= 20) {
        await new Promise((r) => setTimeout(r, retry * 1000));
        continue;
      }
      throw new AiError('rate', `Ücretsiz kullanım limiti doldu. Yaklaşık ${Math.ceil(retry / 60)} dakika sonra tekrar deneyin.`, retry);
    }
    readUsage(res);
    if (!res.ok) {
      const err = friendly(res.status, await res.text());
      // Gemini yapılandırılmış çıktı isteğini reddederse: şemasız, "yalnızca JSON" talimatıyla bir kez daha
      // (chatJson yanıttaki JSON'u ayıklar). Anahtar ve limit hataları yeniden denenmez.
      if (gemini && res.status === 400 && err.kind === 'server' && body.response_format && opts.jsonSchema) {
        delete body.response_format;
        body.messages = [
          ...opts.messages,
          { role: 'user', content: `Yanıtı yalnızca şu JSON şemasına uyan tek bir JSON nesnesi olarak ver, başka metin yazma:\n${JSON.stringify(opts.jsonSchema.schema)}` },
        ];
        continue;
      }
      throw err;
    }
    const json = await res.json();
    const result: ChatResult = { message: json.choices?.[0]?.message ?? { role: 'assistant', content: '' }, usage: json.usage };
    if (cacheKey) await db.aiCache.put({ hash: cacheKey, value: result, createdAt: new Date().toISOString() });
    return result;
  }
  throw new AiError('rate', 'Ücretsiz kullanım limiti doldu.');
}

/** Yapılandırılmış JSON (strict şema) döndüren çağrı. */
export async function chatJson<T>(config: AiConfig, opts: Omit<ChatOptions, 'tools'> & { jsonSchema: NonNullable<ChatOptions['jsonSchema']> }): Promise<T> {
  const r = await chat(config, opts);
  const text = r.message.content ?? '';
  try {
    return JSON.parse(text) as T;
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (m) return JSON.parse(m[0]) as T;
    throw new AiError('schema', 'Yapay zekâ beklenen biçimde yanıt vermedi.');
  }
}

export async function listModels(config: Pick<AiConfig, 'apiKey' | 'baseUrl'>): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/models`, { headers: { Authorization: `Bearer ${config.apiKey}` } });
  } catch {
    throw new AiError('network', 'Servise ulaşılamadı.');
  }
  if (!res.ok) throw friendly(res.status, await res.text());
  const json = await res.json();
  // Gemini model kimliklerini "models/gemini-…" olarak listeler; sohbette önekisiz kullanılır
  return (json.data ?? []).map((m: { id: string }) => m.id.replace(/^models\//, '')).sort();
}

async function base64(blob: Blob): Promise<string> {
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Ses → metin. Metin doğrudan kayıt ayrıştırıcısına gider: tutar ve tarihler rakamla yazılmalı
 * ("kırk beş bin" değil "45 bin"); ayrıştırıcı ve yapay zekâ iyileştirmesi rakamlı metinde çalışır.
 */
const STT_INSTRUCTION =
  'Bu Türkçe ses kaydını yazıya dök. Yalnızca söyleneni yaz; yorum ya da açıklama ekleme. Tutarları ve tarihleri rakamla yaz ("kırk beş bin lira" → "45 bin lira", "on beş ekim" → "15 Ekim"). Kayıtta konuşma yoksa boş yanıt ver.';
/** Whisper biçimi örnekten öğrenir (talimat değil, yazım örneği); gerçek cari adı içermez. */
const WHISPER_STYLE = 'Akın Yapı’dan 45.000 TL tahsilat geldi. 12.500 lira kira ödedim, vadesi 15 Ekim.';

/** Gemini'de Whisper ucu yok: ses kendi API'sine satır içi gönderilir. */
async function transcribeGemini(config: AiConfig, audio: Blob): Promise<string> {
  // Gemini webm/mp4 kabul etmez: cihazda WAV'a çevir (çözülemezse olduğu gibi dene)
  const sendable = geminiAcceptsAudio(audio.type) ? audio : await toWav(audio).catch(() => audio);
  let res: Response;
  try {
    res = await fetch(`${GEMINI_NATIVE}/models/${config.sttModel}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.apiKey },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: sendable.type.split(';')[0] || 'audio/webm', data: await base64(sendable) } },
              { text: STT_INSTRUCTION },
            ],
          },
        ],
        generationConfig: { temperature: 0 },
      }),
    });
  } catch {
    throw new AiError('network', 'Ses servisine ulaşılamadı.');
  }
  if (!res.ok) throw friendly(res.status, await res.text());
  const json = await res.json();
  return String(json.candidates?.[0]?.content?.parts?.[0]?.text ?? '').trim();
}

/** Türkçe konuşmayı yazıya çevirir: Groq'ta Whisper, Gemini'de modelin kendisi. */
export async function transcribe(config: AiConfig, audio: Blob): Promise<string> {
  if (!audio.size) throw new AiError('server', 'Ses kaydı boş; birkaç saniye konuşup tekrar deneyin.');
  await throttle();
  if (config.provider === 'gemini') return transcribeGemini(config, audio);
  const form = new FormData();
  form.append('file', audio, audioFileName(audio.type));
  form.append('model', config.sttModel);
  form.append('language', 'tr');
  form.append('prompt', WHISPER_STYLE);
  form.append('response_format', 'json');
  let res: Response;
  try {
    res = await fetch(`${config.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
    });
  } catch {
    throw new AiError('network', 'Ses servisine ulaşılamadı.');
  }
  readUsage(res);
  if (!res.ok) throw friendly(res.status, await res.text());
  const json = await res.json();
  return String(json.text ?? '').trim();
}
