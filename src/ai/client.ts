/**
 * OpenAI uyumlu sohbet istemcisi (varsayılan: Groq). Tarayıcıdan doğrudan çağrılır
 * (Groq CORS'a izin verir). İstemci tarafı hız sınırı, 429 yeniden deneme ve önbellek içerir.
 */
import { db } from '@/data/db';
import type { AiConfig } from './config';

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

function friendly(status: number, body: string): AiError {
  if (status === 401 || status === 403) return new AiError('auth', 'API anahtarı geçersiz ya da yetkisiz. Ayarlar’dan kontrol edin.');
  if (status === 429) return new AiError('rate', 'Ücretsiz kullanım limiti doldu. Biraz sonra tekrar deneyin.');
  if (status === 413) return new AiError('server', 'İstek çok büyük; soruyu daraltın.');
  if (status >= 500) return new AiError('server', 'Yapay zekâ servisi şu an yanıt vermiyor.');
  let msg = body;
  try {
    msg = JSON.parse(body)?.error?.message ?? body;
  } catch {
    /* gövde düz metin olabilir */
  }
  return new AiError('server', msg.slice(0, 240));
}

export async function chat(config: AiConfig, opts: ChatOptions): Promise<ChatResult> {
  const model = opts.model ?? config.model;
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    temperature: opts.temperature ?? 0.2,
    max_completion_tokens: opts.maxTokens ?? 1200,
  };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.tool_choice = 'auto';
  }
  if (opts.jsonSchema) {
    body.response_format = { type: 'json_schema', json_schema: { name: opts.jsonSchema.name, strict: true, schema: opts.jsonSchema.schema } };
  }
  // gpt-oss akıl yürütme modelleri: kısa düşünme → daha az token (ücretsiz katman TPM'i dar)
  if (config.provider === 'groq' && model.startsWith('openai/gpt-oss')) body.reasoning_effort = 'low';

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
    if (!res.ok) throw friendly(res.status, await res.text());
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
  return (json.data ?? []).map((m: { id: string }) => m.id).sort();
}

/** Groq Whisper ile Türkçe konuşmayı yazıya çevirir. */
export async function transcribe(config: AiConfig, audio: Blob): Promise<string> {
  await throttle();
  const form = new FormData();
  form.append('file', audio, 'kayit.webm');
  form.append('model', config.sttModel);
  form.append('language', 'tr');
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
  if (!res.ok) throw friendly(res.status, await res.text());
  const json = await res.json();
  return String(json.text ?? '').trim();
}
