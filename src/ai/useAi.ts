import { useMemo } from 'react';
import { useFinance } from '@/app/finance';
import { setSetting } from '@/data/repo';
import { SETTINGS_KEYS } from '@/data/load';
import { transcribe } from './client';
import { DEFAULT_AI, isAiReady, type AiConfig } from './config';
import { askAssistant, categorizeBatch, draftReminder, narrateInsights, parseEntryAI, type AssistantTurn, type CategorizeLine } from './features';
import { readReceipt } from './gemini';

export async function saveAiConfig(current: AiConfig, patch: Partial<AiConfig>): Promise<void> {
  await setSetting(SETTINGS_KEYS.ai, { ...DEFAULT_AI, ...current, ...patch });
}

export function useAi() {
  const f = useFinance();
  const config = f.settings.ai;
  return useMemo(() => {
    const enabled = isAiReady(config);
    const gemini = config.gemini?.apiKey && config.gemini.consentAt ? config.gemini : null;
    return {
      enabled,
      config,
      parseEntry: (text: string) => parseEntryAI(text, f, config),
      categorize: (lines: CategorizeLine[]) => categorizeBatch(lines, f, config),
      draftReminder: (input: { tone: string; contactName: string; ourCompany: string; draft: string }) => draftReminder(input, f, config),
      narrate: (insights: Array<{ title: string; body: string }>) => narrateInsights(insights, f, config),
      ask: (history: AssistantTurn[], q: string, signal?: AbortSignal) => askAssistant(history, q, f, config, signal),
      transcribe: (blob: Blob) => transcribe(config, blob),
      receipt: gemini ? (image: Blob) => readReceipt(gemini.apiKey, gemini.model, image) : null,
    };
  }, [f, config]);
}
