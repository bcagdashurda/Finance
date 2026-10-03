import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/ai';
import { effectiveAiConfig, DEFAULT_AI, type AiConfig } from './config';
import { demoTrialConfig } from './trial';

/** Vercel'deki ücretsiz deneme işlevi (api/ai): işletmenin anahtarı sunucuda, tarayıcıya inmez. */
const req = (path: string, init: RequestInit = {}) =>
  new Request(`https://app-mizan.vercel.app/api/ai${path}`, {
    method: 'POST',
    headers: { Authorization: 'Bearer mizan-deneme', 'Content-Type': 'application/json', Origin: 'https://app-mizan.vercel.app' },
    body: JSON.stringify({ model: 'openai/gpt-oss-20b', messages: [] }),
    ...init,
  });

beforeEach(() => vi.stubEnv('GROQ_API_KEY', 'gsk_SUNUCU'));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function fakeGroq() {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response('{"choices":[]}', { status: 200, headers: { 'Content-Type': 'application/json', 'x-ratelimit-remaining-requests': '900' } });
    }),
  );
  return calls;
}

describe('ücretsiz deneme sunucu işlevi', () => {
  it('durum: anahtar tanımlıysa açık, değilse kapalı', async () => {
    expect(await (await handler(req('/status', { method: 'GET', body: null }))).json()).toEqual({ available: true });
    vi.stubEnv('GROQ_API_KEY', '');
    expect(await (await handler(req('/status', { method: 'GET', body: null }))).json()).toEqual({ available: false });
    expect((await handler(req('/chat/completions'))).status).toBe(503);
  });

  it("Groq'a işletmenin anahtarıyla gider; tarayıcının gönderdiği değer kullanılmaz", async () => {
    const calls = fakeGroq();
    const res = await handler(req('/chat/completions'));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-ratelimit-remaining-requests')).toBe('900');
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer gsk_SUNUCU');
  });

  it("Vercel'in yönlendirdiği biçim (/api/ai?path=chat/completions) de aynı yere gider", async () => {
    const calls = fakeGroq();
    const viaRewrite = new Request('https://app-mizan.vercel.app/api/ai?path=chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://app-mizan.vercel.app' },
      body: JSON.stringify({ model: 'openai/gpt-oss-20b', messages: [] }),
    });
    expect((await handler(viaRewrite)).status).toBe(200);
    expect(calls[0]!.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(await (await handler(new Request('https://app-mizan.vercel.app/api/ai?path=status'))).json()).toEqual({ available: true });
  });

  it('başka siteden, izinsiz uç noktaya ya da başka modelle kullanılamaz', async () => {
    const calls = fakeGroq();
    expect((await handler(req('/chat/completions', { headers: { Origin: 'https://baska-site.com', 'Content-Type': 'application/json' } }))).status).toBe(403);
    expect((await handler(req('/models'))).status).toBe(404);
    expect((await handler(req('/chat/completions', { body: JSON.stringify({ model: 'llama-3.3-70b-versatile' }) }))).status).toBe(400);
    expect(calls).toHaveLength(0);
  });
});

describe('uygulama tarafı', () => {
  const base: AiConfig = { ...DEFAULT_AI };

  it('demo işletmede deneme kendiliğinden açık; kendi işletmesinde değil', () => {
    expect(demoTrialConfig(base, true, true)).toMatchObject({ provider: 'trial', enabled: true, consentAt: 'demo' });
    expect(demoTrialConfig(base, false, true)).toBe(base);
    // Sunucu ayarlı değilse demo'da da kapalı
    expect(demoTrialConfig(base, true, false)).toBe(base);
  });

  it('kullanıcının kendi anahtarı ya da bilerek kapattığı deneme ezilmez', () => {
    const own = { ...base, provider: 'groq' as const, apiKey: 'gsk_KULLANICI', enabled: true, consentAt: 'x' };
    expect(demoTrialConfig(own, true, true)).toBe(own);
    const closed = { ...base, provider: 'trial' as const, enabled: false };
    expect(demoTrialConfig(closed, true, true)).toBe(closed);
  });

  it('deneme aynı sitedeki işleve gider; onaysız kapalı', () => {
    const trial = { ...base, provider: 'trial' as const, apiKey: '' };
    expect(effectiveAiConfig({ ...trial, enabled: true, consentAt: 'demo' }, null)).toMatchObject({ baseUrl: '/api/ai' });
    expect(effectiveAiConfig({ ...trial, enabled: true, consentAt: undefined }, null)).toBeNull();
  });
});
