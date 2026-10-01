import { afterEach, describe, expect, it, vi } from 'vitest';
import { chat, chatJson, listModels, transcribe } from './client';
import { DEFAULT_AI, GEMINI_BASE, detectProvider, withProvider } from './config';

/**
 * Gemini, Groq ile aynı yoldan (OpenAI uyumlu uç nokta) tam destekli. Canlı ölçüm (2026-10-01, anahtarsız):
 * uç noktalar tarayıcıdan çağrılabiliyor (CORS açık); geçersiz anahtara 400 + dizi gövdesi dönüyor.
 */
const gemini = { ...withProvider(DEFAULT_AI, 'gemini'), enabled: true, apiKey: 'AIzaTEST', consentAt: '2026-10-01' };
const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }), { status: 200 });
const sent = (m: ReturnType<typeof vi.fn>, i = 0) => {
  const [url, init] = m.mock.calls[i] as unknown as [string, RequestInit];
  return { url, init, body: typeof init.body === 'string' ? JSON.parse(init.body) : init.body };
};

afterEach(() => vi.unstubAllGlobals());

describe('provider presets', () => {
  it('recognises the provider from the pasted key', () => {
    expect(detectProvider('AIzaSyD-abc')).toBe('gemini');
    expect(detectProvider('  gsk_abc123 ')).toBe('groq');
    expect(detectProvider('sk-xyz')).toBeNull();
  });

  it('switches endpoint and models together', () => {
    expect(gemini.baseUrl).toBe(GEMINI_BASE);
    expect(gemini.model).toMatch(/^gemini-/);
    expect(gemini.fastModel).toMatch(/^gemini-/);
    const back = withProvider(gemini, 'groq');
    expect(back.baseUrl).toContain('api.groq.com');
    expect(back.model).toBe(DEFAULT_AI.model);
  });
});

describe('Gemini chat', () => {
  it('calls the OpenAI-compatible endpoint without Groq-only parameters', async () => {
    const f = vi.fn(async () => ok('tamam'));
    vi.stubGlobal('fetch', f);
    await chat(gemini, { messages: [{ role: 'user', content: 'x' }], maxTokens: 300 });
    const { url, init, body } = sent(f);
    expect(url).toBe(`${GEMINI_BASE}/chat/completions`);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer AIzaTEST');
    expect(body.max_tokens).toBe(300);
    expect(body.max_completion_tokens).toBeUndefined();
    expect(body.reasoning_effort).toBeUndefined();
  });

  it('rewrites OpenAI-strict JSON schemas into the form Gemini accepts', async () => {
    const f = vi.fn(async () => ok('{"a":null}'));
    vi.stubGlobal('fetch', f);
    await chatJson(gemini, {
      messages: [{ role: 'user', content: 'x' }],
      jsonSchema: {
        name: 's',
        schema: { type: 'object', additionalProperties: false, required: ['a'], properties: { a: { type: ['number', 'null'] }, b: { type: 'array', items: { type: 'object', additionalProperties: false, properties: { c: { type: ['string', 'null'] } } } } } },
      },
    });
    const schema = sent(f).body.response_format.json_schema.schema;
    expect(JSON.stringify(schema)).not.toContain('additionalProperties');
    expect(schema.properties.a).toEqual({ type: 'number', nullable: true });
    expect(schema.properties.b.items.properties.c).toEqual({ type: 'string', nullable: true });
  });

  it('turns Gemini’s 400 "invalid API key" (array body) into a Turkish auth error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[{"error":{"code":400,"message":"Please pass a valid API key","status":"INVALID_ARGUMENT"}}]', { status: 400 })));
    await expect(chat(gemini, { messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ kind: 'auth' });
  });

  it('retries without a schema when Gemini rejects the structured-output request', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response('[{"error":{"code":400,"message":"Invalid JSON payload received. Unknown name \\"x\\""}}]', { status: 400 }))
      .mockResolvedValueOnce(ok('Elbette: {"a": 5}'));
    vi.stubGlobal('fetch', f);
    const out = await chatJson<{ a: number }>(gemini, { messages: [{ role: 'user', content: 'x' }], jsonSchema: { name: 's', schema: { type: 'object', properties: { a: { type: 'number' } } } } });
    expect(out).toEqual({ a: 5 });
    expect(f).toHaveBeenCalledTimes(2);
    const retry = sent(f, 1).body;
    expect(retry.response_format).toBeUndefined();
    expect(JSON.stringify(retry.messages)).toContain('JSON');
  });
});

describe('Gemini voice and models', () => {
  it('transcribes speech with Gemini’s own API (it has no Whisper endpoint)', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: ' Yıldız’dan 45 bin tahsilat ' }] } }] }), { status: 200 }));
    vi.stubGlobal('fetch', f);
    const text = await transcribe(gemini, new Blob(['ses'], { type: 'audio/webm' }));
    expect(text).toBe('Yıldız’dan 45 bin tahsilat');
    const { url, init, body } = sent(f);
    expect(url).toContain('generativelanguage.googleapis.com/v1beta/models/');
    expect(url).toContain(':generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIzaTEST');
    expect(body.contents[0].parts[0].inline_data.mime_type).toBe('audio/webm');
  });

  it('lists model ids without the "models/" prefix', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'models/gemini-2.5-flash' }, { id: 'models/gemini-2.5-flash-lite' }] }), { status: 200 })));
    expect(await listModels(gemini)).toEqual(['gemini-2.5-flash', 'gemini-2.5-flash-lite']);
  });
});
