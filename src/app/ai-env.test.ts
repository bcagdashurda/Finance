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

  it('routes AI through the operator’s server when VITE_AI_SERVER=1', () => {
    vi.stubEnv('VITE_AI_SERVER', '1');
    vi.stubEnv('VITE_GROQ_API_KEY', 'gsk_ENV');
    expect(resolveAiConfig(undefined)).toMatchObject({ provider: 'cloud', consentAt: 'env', enabled: true });
  });

  it('never overrides a key the user entered in Settings', () => {
    vi.stubEnv('VITE_AI_SERVER', '1');
    vi.stubEnv('VITE_GEMINI_API_KEY', 'AIzaENV');
    expect(resolveAiConfig({ provider: 'groq', apiKey: 'gsk_USER', enabled: true, consentAt: 'x' })).toMatchObject({ provider: 'groq', apiKey: 'gsk_USER' });
  });
});
