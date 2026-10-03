import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveAiConfig } from './finance';
import { GEMINI_BASE } from '@/ai/config';

/** Kurulumu yapan kişinin dosyasından (.env / Vercel) gelen yapay zekâ ayarı; kullanıcının girdiği anahtar her zaman önce gelir. */
afterEach(() => vi.unstubAllEnvs());

describe('resolveAiConfig', () => {
  it('uses a Gemini key from the environment with Gemini endpoint and models', () => {
    vi.stubEnv('VITE_GROQ_API_KEY', '');
    vi.stubEnv('VITE_GEMINI_API_KEY', 'AIzaENV');
    const c = resolveAiConfig(undefined);
    expect(c).toMatchObject({ provider: 'gemini', apiKey: 'AIzaENV', baseUrl: GEMINI_BASE, consentAt: 'env', enabled: true });
    expect(c.model).toMatch(/^gemini-/);
  });

  it('deneme yapay zekâsı (VITE_AI_SERVER=1): sunucu üzerinden, ama kullanıcı kendisi onaylayana kadar kapalı', () => {
    vi.stubEnv('VITE_AI_SERVER', '1');
    vi.stubEnv('VITE_GROQ_API_KEY', 'gsk_ENV');
    const c = resolveAiConfig(undefined);
    expect(c).toMatchObject({ provider: 'cloud', enabled: false, apiKey: '' });
    expect(c.consentAt).toBeUndefined();
    // Kullanıcı Ayarlar'da onay verince açılır
    expect(resolveAiConfig({ enabled: true, consentAt: '2026-10-03T10:00:00Z' })).toMatchObject({ provider: 'cloud', enabled: true, consentAt: '2026-10-03T10:00:00Z' });
  });

  it('never overrides a key the user entered in Settings', () => {
    vi.stubEnv('VITE_AI_SERVER', '1');
    vi.stubEnv('VITE_GEMINI_API_KEY', 'AIzaENV');
    expect(resolveAiConfig({ provider: 'groq', apiKey: 'gsk_USER', enabled: true, consentAt: 'x' })).toMatchObject({ provider: 'groq', apiKey: 'gsk_USER' });
  });
});
