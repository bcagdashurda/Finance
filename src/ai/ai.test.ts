import { afterEach, describe, expect, it, vi } from 'vitest';
import { Masker } from './masking';
import { chat, AiError, getAiUsage, pickModel } from './client';
import { runTool } from './tools';
import { askAssistant } from './features';
import { demoFinance, testAiConfig as config } from '@/test/demoFinance';

afterEach(() => vi.unstubAllGlobals());

describe('Masker', () => {
  it('replaces full names and first-word mentions, then restores them', () => {
    const m = new Masker(['Yıldız Gıda A.Ş.', 'Kuzey Mobilya San. Tic.'], true);
    const masked = m.mask("Yıldız Gıda A.Ş. ve Kuzey'den ne kadar alacağım var?");
    expect(masked).not.toMatch(/Yıldız|Kuzey/);
    expect(m.unmask('Cari-1 ile Cari-2')).toBe('Yıldız Gıda A.Ş. ile Kuzey Mobilya San. Tic.');
  });

  it('is a no-op when disabled', () => {
    const m = new Masker(['Yıldız Gıda A.Ş.'], false);
    expect(m.mask('Yıldız Gıda A.Ş.')).toBe('Yıldız Gıda A.Ş.');
  });
});

describe('chat client', () => {
  it('maps 401 to an auth error with a Turkish message', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"bad key"}}', { status: 401 })));
    await expect(chat(config, { messages: [{ role: 'user', content: 'x' }] })).rejects.toMatchObject({ kind: 'auth' });
  });

  it('retries once after a short 429 and returns the message', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 429, headers: { 'retry-after': '0' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'tamam' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await chat(config, { messages: [{ role: 'user', content: 'x' }] });
    expect(r.message.content).toBe('tamam');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('asks gpt-oss models for low reasoning effort on Groq', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await chat(config, { messages: [{ role: 'user', content: 'x' }] });
    const body = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.reasoning_effort).toBe('low');
    expect(body.include_reasoning).toBe(false);
    expect(body.model).toBe('openai/gpt-oss-120b');
  });

  it('reads the daily request allowance from Groq rate-limit headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'ok' } }] }), {
          status: 200,
          headers: { 'x-ratelimit-limit-requests': '1000', 'x-ratelimit-remaining-requests': '987', 'x-ratelimit-remaining-tokens': '7400' },
        }),
      ),
    );
    await chat(config, { messages: [{ role: 'user', content: 'x' }] });
    expect(getAiUsage()).toMatchObject({ limitRequests: 1000, remainingRequests: 987, remainingTokens: 7400 });
  });

  it('picks the best available model when a default is withdrawn', () => {
    const available = ['qwen/qwen3.8-27b', 'whisper-large-v3', 'openai/gpt-oss-20b'];
    expect(pickModel(available, ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'], /gpt|qwen/)).toBe('qwen/qwen3.8-27b');
    expect(pickModel(available, ['whisper-large-v3-turbo'], /whisper/)).toBe('whisper-large-v3');
    expect(pickModel(['x'], ['y'], /z/)).toBeNull();
  });

  it('exposes AiError for callers', () => {
    expect(new AiError('rate', 'x').kind).toBe('rate');
  });
});

describe('assistant tools', () => {
  const f = demoFinance();

  it('returns a compact overview with formatted lira values', () => {
    const out = runTool('get_overview', '{}', f, new Masker([], false)) as Record<string, unknown>;
    expect(out.nakit_toplam).toMatch(/^₺[\d.]+$/);
    expect(out).toHaveProperty('projeksiyon_90_gun');
  });

  it('finds a contact by a partial name and masks it when enabled', () => {
    const m = new Masker(f.contacts.map((c) => c.name), true);
    const out = runTool('get_contact', JSON.stringify({ name: 'Kuzey' }), f, m) as Record<string, unknown>;
    expect(out.cari).toMatch(/^Cari-\d+$/);
    expect(out).toHaveProperty('odeme_aliskanligi');
  });

  it('simulates a delay and reports the difference', () => {
    const out = runTool('simulate', JSON.stringify({ days: 90, delays: [{ contact: 'Toros Deterjan', days: 45 }] }), f, new Masker([], false)) as { uygulanan_degisiklik: number; fark: unknown };
    expect(out.uygulanan_degisiklik).toBeGreaterThan(0);
    expect(out.fark).toBeTruthy();
  });

  it('runs the tool loop: tool call, then a final answer', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 't1', type: 'function', function: { name: 'get_overview', arguments: '{}' } }] } }],
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Nakdiniz güçlü.' } }] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const turn = await askAssistant([], 'Durum nasıl?', f, config);
    expect(turn.content).toBe('Nakdiniz güçlü.');
    expect(turn.tools).toEqual(['Genel durum']);
    const second = JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string);
    expect(second.messages.at(-1).role).toBe('tool');
  });
});
