/**
 * Ücretsiz deneme. İşletmenin Groq anahtarı sitenin sunucu işlevinde (Vercel api/ai) durur, tarayıcıya hiç inmez.
 *   · Demo işletmede kendiliğinden açıktır (veriler örnek; kullanıcının kendi anahtarı yoksa).
 *   · Kullanıcının kendi işletmesinde "Ücretsiz deneme ile aç" düğmesiyle, bilgilendirme onayıyla açılır.
 *   · Kullanıcı kendi anahtarını bağlayınca o kullanılır. Süre ve kişi başı sınır yoktur.
 * Sunucu ayarlı değilse (/api/ai/status kapalı ya da yok) deneme hiçbir yerde görünmez; kısayollar Ayarlar'a götürür.
 */
import { create } from 'zustand';
import { PRESETS, TRIAL_BASE, type AiConfig } from './config';
import { saveAiConfig } from './useAi';

let probe: Promise<boolean> | null = null;

/** Deneme açık mı? Sunucu işlevi yoksa site sayfası (HTML) döner, JSON değil. Oturum boyunca bir kez sorulur. */
export function trialAvailable(): Promise<boolean> {
  probe ??= fetch(`${TRIAL_BASE}/status`, { headers: { Accept: 'application/json' } })
    .then(async (r) => {
      if (!r.ok || !(r.headers.get('content-type') ?? '').includes('application/json')) return false;
      return ((await r.json()) as { available?: boolean }).available === true;
    })
    .catch(() => {
      probe = null; // çevrimdışıysa sonra yeniden sorulsun
      return false;
    });
  return probe;
}

interface TrialState {
  /** null: henüz sorulmadı */
  available: boolean | null;
  dialogOpen: boolean;
  check: () => void;
  setDialogOpen: (open: boolean) => void;
}

export const useTrial = create<TrialState>((set, get) => ({
  available: null,
  dialogOpen: false,
  check: () => {
    if (get().available !== null) return;
    void trialAvailable().then((available) => set({ available }));
  },
  setDialogOpen: (dialogOpen) => set({ dialogOpen }),
}));

const TRIAL: Partial<AiConfig> = { ...PRESETS.groq, provider: 'trial', apiKey: '' };

/**
 * Demo işletmede yapay zekâ kendiliğinden açık: örnek verilerle denemek için onay ya da kayıt gerekmez.
 * Kullanıcı kendi anahtarını bağladıysa ya da denemeyi bilerek kapattıysa dokunulmaz.
 */
export function demoTrialConfig(config: AiConfig, isDemo: boolean, available: boolean | null): AiConfig {
  if (!isDemo || !available || config.apiKey || config.provider === 'trial') return config;
  return { ...config, ...TRIAL, enabled: true, consentAt: 'demo' } as AiConfig;
}

/** Kendi işletmesinde denemeyi açar (cihazdaki yapay zekâ ayarı; hesaba yazılmaz). */
export async function startTrial(current: AiConfig): Promise<void> {
  if (!(await trialAvailable())) throw new Error('Ücretsiz deneme şu an kapalı. Ayarlar › Yapay zekâ’dan kendi ücretsiz anahtarınızı bağlayabilirsiniz.');
  await saveAiConfig(current, { ...TRIAL, enabled: true, consentAt: new Date().toISOString() });
}
