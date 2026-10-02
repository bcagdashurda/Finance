import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { ChatCircleText, CheckCircle, GoogleLogo, Lightning, Microphone, PaperPlaneTilt, Question, Receipt, Rows, Sparkle, TextT, Trash } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { useUI } from '@/app/ui-store';
import { MOD_KEY } from '@/ui/bits';
import { useAi, saveAiConfig } from '@/ai/useAi';
import { getAiUsage, listModels, onAiUsage, pickModel, type AiUsage } from '@/ai/client';
import { listGeminiModels } from '@/ai/gemini';
import { DEFAULT_AI, GROQ_BASE, detectProvider, withProvider, type AiConfig } from '@/ai/config';
import { Panel, PanelHeader } from '@/ui/Panel';
import { Button } from '@/ui/Button';
import { Field, Select, TextInput } from '@/ui/Field';
import { Badge, Toggle } from '@/ui/bits';
import { Modal } from '@/ui/Overlay';
import { cn } from '@/ui/cn';
import { AiKeyGuide, type KeyProvider } from './AiKeyGuide';
import { KeySafety } from './KeySafety';
import { cloudAvailable } from './CloudSection';

const LABEL: Record<KeyProvider, string> = { groq: 'Groq', gemini: 'Google Gemini' };

/**
 * Ne kazanılır / nasıl kullanılır: kullanıcı neden bağlaması gerektiğini bilmez. Bağlı değilken somut
 * örneklerle anlatır; bağlıyken her özellik için "Dene" ile doğrudan oraya götürür.
 */
function AiFeatures({ connected }: { connected: boolean }) {
  const { setPaletteOpen, setAssistantOpen, openEntry } = useUI();
  const navigate = useNavigate();
  const items = [
    { icon: <TextT size={18} />, title: 'Yazarak kayıt', body: '“Yıldız’dan 45 bin tahsilat” yazın; tür, cari, tutar ve tarih kendiliğinden dolar.', how: `${MOD_KEY} K`, run: () => setPaletteOpen(true) },
    { icon: <Microphone size={18} />, title: 'Sesle kayıt', body: 'Mikrofona söyleyin, kayıt hazır olsun; telefondan, yoldayken bile.', how: `${MOD_KEY} K › mikrofon`, run: () => setPaletteOpen(true) },
    { icon: <Receipt size={18} />, title: 'Fiş ve fatura okuma', body: 'Fotoğrafını çekin; satıcı, tutar, KDV ve tarih gelsin. (Gemini ile; Groq’ta ek anahtar.)', how: 'Kayıt › Fiş okut', run: () => openEntry({ kind: 'expense' }) },
    { icon: <Rows size={18} />, title: 'Ekstreyi sınıflandırma', body: 'Banka satırlarını kategoriye ve cariye kendisi dağıtır; onayladıkça öğrenir.', how: 'İşlemler › Ekstre içe aktar', run: () => navigate('/islemler?ice-aktar=1') },
    { icon: <ChatCircleText size={18} />, title: 'Finans asistanı', body: '“Bu ay en çok nereye harcadım?”, “Kuzey Mobilya ne zaman öder?” diye sorun.', how: `${MOD_KEY} J`, run: () => setAssistantOpen(true) },
    { icon: <PaperPlaneTilt size={18} />, title: 'Tahsilat mesajı ve yorum', body: 'Kibar ya da kararlı hatırlatma yazar; raporu ve sabah durumunu birkaç cümleyle özetler.', how: 'Cari › Hatırlat', run: () => navigate('/cariler') },
  ];
  return (
    <div>
      <div className="mb-2 text-sm font-semibold text-ink">{connected ? 'Nasıl kullanılır?' : 'Bağlayınca neler yapabilirsiniz?'}</div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((it) => (
          <li key={it.title} className="flex items-start gap-3 rounded-[14px] border border-line p-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-cobalt-soft text-cobalt-ink">{it.icon}</span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">{it.title}</span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted">{it.body}</span>
              {connected && (
                <span className="mt-1.5 flex items-center gap-2">
                  <button type="button" onClick={it.run} className="text-xs font-semibold text-cobalt-ink underline-offset-2 hover:underline">
                    Dene
                  </button>
                  <span className="text-2xs text-faint">{it.how}</span>
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      {!connected && <p className="mt-2 text-2xs text-muted">Yapay zekâ olmadan da Mizan tam çalışır; bunlar zaman kazandıran ek kolaylıklardır. Rakamlar her zaman cihazınızda hesaplanır.</p>}
    </div>
  );
}

/** Hesapta olan modellerden, sağlayıcıya göre en uygununu seçer (sağlayıcı model kaldırırsa kırılmasın). */
function chooseModels(provider: KeyProvider, list: string[], current: AiConfig): Pick<AiConfig, 'model' | 'fastModel' | 'sttModel'> {
  const keep = (value: string, preferred: string[], pattern: RegExp) => (list.includes(value) ? value : (pickModel(list, preferred, pattern) ?? value));
  if (provider === 'gemini') {
    const model = keep(current.model, ['gemini-2.5-flash', 'gemini-flash-latest', 'gemini-2.0-flash'], /^gemini-[\d.]+-flash$/);
    return { model, fastModel: keep(current.fastModel, ['gemini-2.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-2.0-flash-lite'], /flash-lite/) || model, sttModel: model };
  }
  return {
    model: keep(current.model, ['openai/gpt-oss-120b', 'openai/gpt-oss-20b'], /gpt|qwen|llama|kimi|mistral|gemma/i),
    fastModel: keep(current.fastModel, ['openai/gpt-oss-20b', 'openai/gpt-oss-120b'], /gpt|qwen|llama|gemma/i),
    sttModel: keep(current.sttModel, ['whisper-large-v3-turbo', 'whisper-large-v3'], /whisper/i),
  };
}

/**
 * Yapay zekâ: herkesin anlayacağı üç adım (servis seç → anahtarı al → yapıştır).
 * Teknik ayrıntılar (model, özel uç nokta) "Gelişmiş" altında; sunucu/Supabase seçenekleri kullanıcıya gösterilmez.
 */
export function AiSection({ index }: { index: number }) {
  const f = useFinance();
  const cfg = f.settings.ai;
  const ai = useAi();
  const connected = Boolean(cfg.apiKey) || cfg.provider === 'cloud';
  const [provider, setProvider] = useState<KeyProvider>(cfg.provider === 'gemini' ? 'gemini' : 'groq');
  const [changing, setChanging] = useState(false);
  const [key, setKey] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const save = (patch: Partial<AiConfig>) => saveAiConfig(cfg, patch);

  // Yapıştırılan anahtar diğer servise aitse seçimi kendiliğinden düzelt
  const onKey = (value: string) => {
    setKey(value);
    const d = detectProvider(value);
    if (d && d !== provider) {
      setProvider(d);
      setNote(`Bu bir ${LABEL[d]} anahtarı; ${LABEL[d]} seçildi.`);
    } else setNote(null);
  };

  async function connect() {
    const k = key.trim();
    const chosen = detectProvider(k) ?? provider;
    const preset = withProvider({ ...DEFAULT_AI, ...cfg }, chosen);
    setBusy(true);
    try {
      const list = await listModels({ apiKey: k, baseUrl: preset.baseUrl });
      const models = chooseModels(chosen, list, preset);
      // Servis değiştiyse veri politikası da değişir: onay yeniden alınır
      const needConsent = !cfg.consentAt || cfg.consentAt === 'env' || cfg.provider !== chosen;
      await save({
        ...preset,
        ...models,
        apiKey: k,
        enabled: !needConsent,
        consentAt: needConsent ? undefined : cfg.consentAt,
        // Gemini'nin ücretsiz katmanı içerikleri geliştirmede kullanabilir: adlar varsayılan olarak takma adla
        maskNames: chosen === 'gemini' ? true : cfg.maskNames,
      });
      setKey('');
      setChanging(false);
      setNote(null);
      if (needConsent) setConsentOpen(true);
      else toast.success(`${LABEL[chosen]} bağlandı`);
    } catch (e) {
      toast.error('Bağlanılamadı', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  const activeLabel = cfg.provider === 'gemini' ? LABEL.gemini : cfg.provider === 'groq' ? LABEL.groq : cfg.provider === 'cloud' ? 'İşletme sunucusu' : 'Özel servis';

  return (
    <Panel reveal={index} id="yapay-zeka" className="scroll-mt-24">
      <PanelHeader
        title="Yapay zekâ asistanı"
        description={
          <span className="flex flex-wrap items-center gap-2">
            {ai.enabled ? <Badge tone="in" icon={<CheckCircle size={12} />}>Açık · {activeLabel}</Badge> : <Badge tone="muted">Kapalı</Badge>}
            Yazarak ya da konuşarak kayıt, ekstreyi otomatik sınıflandırma, fiş okuma ve işletmenize soru sorma.
          </span>
        }
      />

      {!connected || changing ? (
        <div className="space-y-5">
          {!changing && <AiFeatures connected={false} />}
          {/* 1. Servis */}
          <fieldset>
            <legend className="mb-2 text-sm font-semibold text-ink">1. Bir servis seçin</legend>
            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Yapay zekâ servisi">
              {(
                [
                  { id: 'groq', icon: <Lightning size={18} weight="duotone" />, title: 'Groq', tag: 'Önerilen', body: 'Çok hızlı. Sesle kayıt dahil her şey için.' },
                  { id: 'gemini', icon: <GoogleLogo size={18} weight="bold" />, title: 'Google Gemini', tag: null, body: 'Google hesabınızla. Fiş ve fatura fotoğrafı okumada güçlü.' },
                ] as const
              ).map((o) => (
                <button
                  key={o.id}
                  type="button"
                  role="radio"
                  aria-checked={provider === o.id}
                  onClick={() => {
                    setProvider(o.id);
                    setNote(null);
                  }}
                  className={cn(
                    'flex items-start gap-3 rounded-[14px] border p-3.5 text-left transition-colors',
                    provider === o.id ? 'border-cobalt bg-cobalt-soft/50 shadow-[0_0_0_1px_var(--cobalt)]' : 'border-line hover:border-cobalt/40',
                  )}
                >
                  <span className={cn('mt-0.5 shrink-0', provider === o.id ? 'text-cobalt' : 'text-muted')}>{o.icon}</span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                      {o.title}
                      {o.tag && <span className="rounded-full bg-inflow-soft px-1.5 text-2xs font-medium text-inflow-text">{o.tag}</span>}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">{o.body}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>

          {/* 2. Anahtar */}
          <div>
            <div className="mb-2 text-sm font-semibold text-ink">2. Ücretsiz anahtarınızı alın</div>
            <div className="flex flex-wrap items-center gap-3 rounded-[14px] bg-sunken p-3.5">
              <Button variant="secondary" icon={<Question size={16} />} onClick={() => setGuideOpen(true)}>
                Nasıl alınır?
              </Button>
              <span className="text-xs text-muted">Adım adım, çizimli anlatım · yaklaşık 3 dakika · kredi kartı gerekmez</span>
            </div>
          </div>

          {/* 3. Yapıştır */}
          <div>
            <div className="mb-2 text-sm font-semibold text-ink">3. Anahtarı yapıştırıp bağlanın</div>
            <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-start">
              <Field label={`${LABEL[provider]} anahtarı`} hint={note ?? `Bir kez girersiniz; bu tarayıcı hatırlar. Yalnızca ${provider === 'groq' ? 'Groq’a' : 'Google’a'} gönderilir.`}>
                {(p) => (
                  <TextInput {...p} type="password" autoComplete="off" spellCheck={false} value={key} onChange={(e) => onKey(e.target.value)} placeholder={provider === 'groq' ? 'gsk_…' : 'AIza…'} className="num" />
                )}
              </Field>
              <Button variant="primary" className="sm:mt-6" loading={busy} disabled={!key.trim()} onClick={() => void connect()}>
                Bağlan
              </Button>
            </div>
            {changing && (
              <button type="button" className="mt-2 text-2xs text-muted underline" onClick={() => setChanging(false)}>
                Vazgeç, mevcut bağlantıyı koru
              </button>
            )}
            <KeySafety provider={provider} accountSync={cloudAvailable(f.settings.cloud)} className="mt-3" />
          </div>
        </div>
      ) : (
        <ConnectedView cfg={cfg} activeLabel={activeLabel} accountSync={cloudAvailable(f.settings.cloud)} onChange={() => setChanging(true)} onConsent={() => setConsentOpen(true)} />
      )}

      <AiKeyGuide provider={provider} open={guideOpen} onOpenChange={setGuideOpen} onPaste={onKey} />

      <Modal
        open={consentOpen}
        onOpenChange={setConsentOpen}
        title="Yapay zekâyı açmadan önce"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConsentOpen(false)}>
              Vazgeç
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                await save({ enabled: true, consentAt: new Date().toISOString() });
                setConsentOpen(false);
                toast.success('Yapay zekâ açıldı', { description: 'Ctrl+K ile yazarak kayıt girmeyi deneyin.' });
              }}
            >
              Anladım, aç
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-sm text-ink-2">
          <li>• Sorunuz ve yanıt için gereken <strong>özet bilgiler</strong> (ör. “açık alacak ₺6,2 milyon”) {cfg.provider === 'gemini' ? 'Google’a' : 'Groq’a'} gönderilir.</li>
          {cfg.provider === 'gemini' ? (
            <li>• Ücretsiz Gemini’de Google bu içerikleri ürünlerini geliştirmek için kullanabilir. Bu yüzden müşteri adları <strong>takma adla</strong> (Cari-1…) gönderilir.</li>
          ) : (
            <li>• Groq, gönderilen verileri model eğitiminde kullanmadığını belirtir.</li>
          )}
          <li>• Defterinizin tamamı, IBAN’larınız ve dosyalarınız gönderilmez; tüm hesaplamalar cihazınızda yapılır.</li>
        </ul>
      </Modal>
    </Panel>
  );
}

function ConnectedView({
  cfg,
  activeLabel,
  accountSync,
  onChange,
  onConsent,
}: {
  cfg: AiConfig;
  activeLabel: string;
  accountSync: boolean;
  onChange: () => void;
  onConsent: () => void;
}) {
  const save = (patch: Partial<AiConfig>) => saveAiConfig(cfg, patch);
  const masked = cfg.apiKey ? `${cfg.apiKey.slice(0, 4)}…${cfg.apiKey.slice(-4)}` : '';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line px-4 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-inflow-soft text-inflow-text">
          <Sparkle size={18} weight="duotone" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-ink">{activeLabel} bağlı</div>
          <div className="num text-2xs text-muted">{cfg.consentAt === 'env' ? 'Anahtar kurulum dosyasından geliyor' : masked && `Anahtar ${masked}`}</div>
        </div>
        {cfg.consentAt !== 'env' && (
          <>
            <Button size="sm" variant="secondary" onClick={onChange}>
              Anahtarı değiştir
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash size={14} />}
              onClick={async () => {
                await save({ apiKey: '', enabled: false });
                toast('Yapay zekâ bağlantısı kaldırıldı');
              }}
            >
              Kaldır
            </Button>
          </>
        )}
      </div>
      {(cfg.provider === 'groq' || cfg.provider === 'gemini') && cfg.consentAt !== 'env' && <KeySafety provider={cfg.provider} accountSync={accountSync} />}

      <label className="flex items-center justify-between gap-3 rounded-[14px] border border-line px-4 py-3 text-sm">
        <span>
          Yapay zekâyı kullan
          <span className="block text-2xs text-muted">Kapalıyken hiçbir veri gönderilmez; uygulamanın geri kalanı aynen çalışır.</span>
        </span>
        <Toggle
          checked={cfg.enabled}
          onCheckedChange={(v) => {
            if (v && !cfg.consentAt) onConsent();
            else void save({ enabled: v });
          }}
          label="Yapay zekâyı kullan"
        />
      </label>

      <label className="flex items-center justify-between gap-3 rounded-[14px] border border-line px-4 py-3 text-sm">
        <span>
          Müşteri adlarını gizle
          <span className="block text-2xs text-muted">“Yıldız Gıda” yerine “Cari-3” gönderilir; yanıt cihazınızda geri çevrilir.</span>
        </span>
        <Toggle checked={cfg.maskNames} onCheckedChange={(v) => void save({ maskNames: v })} label="Müşteri adlarını gizle" />
      </label>

      {cfg.enabled && <AiFeatures connected />}

      {cfg.provider === 'groq' && <UsageMeter />}
      {cfg.provider === 'gemini' && <p className="text-2xs text-muted">Ücretsiz Gemini’nin dakikalık ve günlük sınırı vardır; dolarsa uygulama birkaç saniye bekleyip yeniden dener.</p>}

      <Advanced cfg={cfg} />
    </div>
  );
}

/** Teknik ayarlar: model seçimi, Groq'ta ayrı fiş anahtarı, özel servis adresi. */
function Advanced({ cfg }: { cfg: AiConfig }) {
  const save = (patch: Partial<AiConfig>) => saveAiConfig(cfg, patch);
  const [models, setModels] = useState<string[]>([]);
  const [baseUrl, setBaseUrl] = useState(cfg.baseUrl);
  const [gKey, setGKey] = useState('');
  const chatModels = models.filter((m) => !/whisper|tts|guard|orpheus|playai|embedding|imagen|veo|aqa/i.test(m));
  return (
    <details
      className="rounded-[14px] border border-line px-4 py-3 text-sm"
      onToggle={(e) => {
        if ((e.target as HTMLDetailsElement).open && !models.length && cfg.apiKey && cfg.provider !== 'cloud')
          void listModels(cfg)
            .then(setModels)
            .catch(() => {});
      }}
    >
      <summary className="cursor-pointer text-ink-2">Gelişmiş ayarlar</summary>
      <div className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Asistan modeli">
            {(p) => (
              <Select {...p} value={cfg.model} onChange={(e) => void save({ model: e.target.value })}>
                {[cfg.model, ...chatModels.filter((m) => m !== cfg.model)].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Hızlı model (ayrıştırma, sınıflandırma)">
            {(p) => (
              <Select {...p} value={cfg.fastModel} onChange={(e) => void save({ fastModel: e.target.value })}>
                {[cfg.fastModel, ...chatModels.filter((m) => m !== cfg.fastModel)].map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        {cfg.provider === 'groq' && (
          <div className="rounded-[12px] bg-sunken p-3">
            <div className="text-xs font-medium text-ink">Fiş ve fatura fotoğrafı okuma</div>
            <p className="mt-1 text-2xs text-muted">Groq fotoğraf okumaz; bu özellik için ayrıca ücretsiz bir Gemini anahtarı ekleyebilirsiniz. Yalnızca okuttuğunuz fotoğraf gönderilir.</p>
            {cfg.gemini ? (
              <div className="mt-2 flex items-center gap-2 text-xs">
                <Badge tone="in">Bağlı</Badge>
                <Button size="sm" variant="ghost" onClick={() => void save({ gemini: undefined }).then(() => toast('Fiş okuma kaldırıldı'))}>
                  Kaldır
                </Button>
              </div>
            ) : (
              <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                <TextInput aria-label="Gemini anahtarı (fiş okuma)" type="password" value={gKey} onChange={(e) => setGKey(e.target.value)} placeholder="AIza…" />
                <Button
                  variant="secondary"
                  disabled={!gKey.trim()}
                  onClick={async () => {
                    try {
                      const list = await listGeminiModels(gKey.trim());
                      await save({ gemini: { apiKey: gKey.trim(), model: list[0] ?? 'gemini-2.5-flash', consentAt: new Date().toISOString() } });
                      setGKey('');
                      toast.success('Fiş okuma açıldı');
                    } catch (e) {
                      toast.error('Anahtar doğrulanamadı', { description: e instanceof Error ? e.message : '' });
                    }
                  }}
                >
                  Ekle
                </Button>
              </div>
            )}
          </div>
        )}

        <div>
          <Field label="Farklı bir OpenAI uyumlu servis (ör. yerel Ollama)" hint="Yalnızca ne yaptığınızı biliyorsanız değiştirin.">
            {(p) => <TextInput {...p} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />}
          </Field>
          <div className="mt-2 flex gap-2">
            <Button size="sm" variant="secondary" disabled={baseUrl === cfg.baseUrl} onClick={() => void save({ baseUrl, provider: 'openai-compatible' }).then(() => toast.success('Servis adresi kaydedildi'))}>
              Kaydet
            </Button>
            {cfg.provider === 'openai-compatible' && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setBaseUrl(GROQ_BASE);
                  void save(withProvider(cfg, 'groq'));
                }}
              >
                Groq’a dön
              </Button>
            )}
          </div>
        </div>
      </div>
    </details>
  );
}

/** Groq limit başlıklarından: bugün kalan istek. */
function UsageMeter() {
  const [u, setU] = useState<AiUsage | null>(getAiUsage);
  useEffect(() => onAiUsage(setU), []);
  if (!u || u.limitRequests == null || u.remainingRequests == null) {
    return <p className="text-2xs text-muted">Ücretsiz Groq: günde yaklaşık 1.000 istek. İlk kullanımdan sonra kalan hakkınız burada görünür.</p>;
  }
  const ratio = u.remainingRequests / u.limitRequests;
  return (
    <div className="rounded-[14px] border border-line px-4 py-3 text-sm">
      <div className="flex items-center justify-between text-xs">
        <span className="text-muted">Bugün kalan istek</span>
        <span className="num font-medium">
          {u.remainingRequests.toLocaleString('tr-TR')} / {u.limitRequests.toLocaleString('tr-TR')}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-sunken">
        <div className={cn('h-full rounded-full', ratio < 0.15 ? 'bg-outflow' : 'bg-cobalt')} style={{ width: `${Math.max(2, ratio * 100)}%` }} />
      </div>
    </div>
  );
}
