import { describe, expect, it } from 'vitest';
import { DEFAULT_AI, withProvider, type AiConfig } from '@/ai/config';
import { aiForAccount, reconcileAiOnSignIn } from './userSettings';

/**
 * Yapay zekâ anahtarı hesaba bağlı: bir kez girilir, aynı hesapla açılan her tarayıcıda hazır gelir.
 * (Supabase'de user_settings, satır düzeyi güvenlikle yalnızca kullanıcının kendisi okur.)
 */
const groq: AiConfig = { ...DEFAULT_AI, enabled: true, apiKey: 'gsk_LOCAL', consentAt: '2026-10-01T10:00:00.000Z' };
const gemini: AiConfig = { ...withProvider(DEFAULT_AI, 'gemini'), enabled: true, apiKey: 'AIzaREMOTE', consentAt: '2026-09-01T10:00:00.000Z', maskNames: true };

describe('aiForAccount', () => {
  it('stores what is needed to restore the connection, including consent', () => {
    expect(aiForAccount(groq)).toMatchObject({ provider: 'groq', apiKey: 'gsk_LOCAL', consentAt: groq.consentAt, enabled: true });
  });

  it('never uploads keys that came from the installer’s .env file', () => {
    expect(aiForAccount({ ...groq, consentAt: 'env' })).toBeNull();
    expect(aiForAccount({ ...groq, provider: 'cloud' })).toBeNull();
  });

  it('does not upload an empty (removed) connection', () => {
    expect(aiForAccount({ ...groq, apiKey: '' })).toBeNull();
  });
});

describe('reconcileAiOnSignIn', () => {
  it('restores the account’s key on a new browser that has none', () => {
    expect(reconcileAiOnSignIn(DEFAULT_AI, aiForAccount(gemini))).toEqual({ action: 'restore', ai: aiForAccount(gemini) });
  });

  it('uploads this browser’s key when the account has none', () => {
    expect(reconcileAiOnSignIn(groq, null)).toEqual({ action: 'upload', ai: aiForAccount(groq) });
  });

  it('keeps a key the user entered on this browser and makes it the account’s', () => {
    expect(reconcileAiOnSignIn(groq, aiForAccount(gemini))).toEqual({ action: 'upload', ai: aiForAccount(groq) });
  });

  it('does nothing when both are the same or neither has a key', () => {
    expect(reconcileAiOnSignIn(groq, aiForAccount(groq))).toEqual({ action: 'none' });
    expect(reconcileAiOnSignIn(DEFAULT_AI, null)).toEqual({ action: 'none' });
  });
});
