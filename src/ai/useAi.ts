import { useMemo } from 'react';
import { useFinance } from '@/app/finance';
import { setSetting } from '@/data/repo';
import { SETTINGS_KEYS } from '@/data/keys';
import { envCloudConfig, useCloud } from '@/cloud/store';
import { transcribe } from './client';
import { AiError } from './client';
import { DEFAULT_AI, effectiveAiConfig, type AiConfig } from './config';
import { askAssistant, categorizeBatch, draftReminder, narrateInsights, parseEntryAI, type AssistantTurn, type CategorizeLine } from './features';
import { readReceipt } from './gemini';

export async function saveAiConfig(current: AiConfig, patch: Partial<AiConfig>): Promise<void> {
  await setSetting(SETTINGS_KEYS.ai, { ...DEFAULT_AI, ...current, ...patch });
}

export function useAi() {
  const f = useFinance();
  const config = f.settings.ai;
  const session = useCloud((s) => s.session);
  const cloudUrl = f.settings.cloud?.url || envCloudConfig()?.url || '';

  return useMemo(() => {
    // Oturum jetonu yenilenebildiği için etkin yapılandırma her çağrıda hesaplanır.
    const resolve = (): AiConfig => {
      const s = useCloud.getState().session;
      const eff = effectiveAiConfig(config, s && cloudUrl ? { url: cloudUrl, accessToken: s.access_token } : null);
      if (!eff) throw new AiError('disabled', 'Yapay zekâ kapalı. Ayarlar › Yapay zekâ bölümünden açın.');
      return eff;
    };
    const enabled = Boolean(effectiveAiConfig(config, session && cloudUrl ? { url: cloudUrl, accessToken: session.access_token } : null));
    const gemini = config.gemini?.apiKey && config.gemini.consentAt ? config.gemini : null;
    return {
      enabled,
      config,
      parseEntry: (text: string) => parseEntryAI(text, f, resolve()),
      categorize: (lines: CategorizeLine[]) => categorizeBatch(lines, f, resolve()),
      draftReminder: (input: { tone: string; contactName: string; ourCompany: string; draft: string }) => draftReminder(input, f, resolve()),
      narrate: (insights: Array<{ title: string; body: string }>) => narrateInsights(insights, f, resolve()),
      ask: (history: AssistantTurn[], q: string, signal?: AbortSignal) => askAssistant(history, q, f, resolve(), signal),
      transcribe: (blob: Blob) => transcribe(resolve(), blob),
      receipt: gemini ? (image: Blob) => readReceipt(gemini.apiKey, gemini.model, image) : null,
    };
  }, [f, config, session, cloudUrl]);
}
