import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';
import { toast } from 'sonner';
import {
  Buildings,
  Sparkle,
  Tag,
  CurrencyCircleDollar,
  LockSimple,
  Database,
  Palette,
  ArrowSquareOut,
  CheckCircle,
  PencilSimple,
  Plus,
  ArrowsClockwise,
  Keyboard,
  Cloud,
  Copy,
} from '@phosphor-icons/react';
import { CloudSection } from './CloudSection';
import aiProxySource from '../../../supabase/functions/ai-proxy/index.ts?raw';
import { useAi } from '@/ai/useAi';
import { envCloudConfig, useCloud } from '@/cloud/store';
import { useFinance } from '@/app/finance';
import { useUI, type ThemePref } from '@/app/ui-store';
import { PageHeader } from '@/ui/PageHeader';
import { Panel, PanelHeader } from '@/ui/Panel';
import { Button } from '@/ui/Button';
import { Field, MoneyInput, Select, TextInput } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Badge, Kbd, MOD_KEY, Toggle } from '@/ui/bits';
import { Modal } from '@/ui/Overlay';
import { Money } from '@/ui/Money';
import { CategoryIcon, CATEGORY_ICON_KEYS } from '@/ui/icons';
import { cn, slotColor } from '@/ui/cn';
import { formatDate } from '@/ui/format';
import { getAiUsage, listModels, onAiUsage, pickModel, type AiUsage } from '@/ai/client';
import { listGeminiModels } from '@/ai/gemini';
import { saveAiConfig } from '@/ai/useAi';
import { GROQ_BASE, type AiConfig } from '@/ai/config';
import { isValidTaxId } from '@/domain/validators';
import { diffDays, toISODate } from '@/domain/dates';
import type { Category } from '@/domain/types';
import { createCategory, setSetting, setWorkspaceSetting, updateCategory, updateWorkspace } from '@/data/repo';
import { SETTINGS_KEYS, loadDemo, wipeEverything } from '@/data/load';
import { exportBackup, restoreBackup, validateBackup } from '@/data/backup';
import { fetchLatestRates, setManualRate } from '@/data/rates';
import { download } from '@/data/export';
import { hashPin, newSalt } from '@/app/lock';

const SECTIONS = [
  { id: 'isletme', label: 'İşletme', icon: Buildings },
  { id: 'yapay-zeka', label: 'Yapay zekâ', icon: Sparkle },
  { id: 'bulut', label: 'Bulut senkronu', icon: Cloud },
  { id: 'kategoriler', label: 'Kategoriler ve bütçe', icon: Tag },
  { id: 'kurlar', label: 'Döviz kurları', icon: CurrencyCircleDollar },
  { id: 'guvenlik', label: 'Güvenlik', icon: LockSimple },
  { id: 'veri', label: 'Veri ve yedek', icon: Database },
  { id: 'gorunum', label: 'Görünüm ve kısayollar', icon: Palette },
];

export default function AyarlarPage() {
  const location = useLocation();
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id) window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }, [location.hash]);

  return (
    <div>
      <PageHeader kicker="Tüm ayarlar bu cihazda saklanır" title="Ayarlar" />
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="sticky top-24 hidden h-fit space-y-1 lg:block" aria-label="Ayar bölümleri">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-ink">
              <s.icon size={17} /> {s.label}
            </a>
          ))}
        </nav>
        <div className="min-w-0 space-y-5">
          <BusinessSection />
          <AiSection />
          <CloudSection index={2} />
          <CategoriesSection />
          <RatesSection />
          <SecuritySection />
          <DataSection />
          <AppearanceSection />
        </div>
      </div>
    </div>
  );
}

function Section({ id, title, description, children, index }: { id: string; title: string; description?: ReactNode; children: ReactNode; index: number }) {
  return (
    <Panel reveal={index} id={id} className="scroll-mt-24">
      <PanelHeader title={title} description={description} />
      {children}
    </Panel>
  );
}

// ---------------------------------------------------------------------------

function BusinessSection() {
  const f = useFinance();
  const [name, setName] = useState(f.workspace.name);
  const [legalName, setLegalName] = useState(f.workspace.legalName ?? '');
  const [taxId, setTaxId] = useState(f.workspace.taxId ?? '');
  const [minCash, setMinCash] = useState<number | null>(f.settings.minCashBalance);
  const dirty = name !== f.workspace.name || legalName !== (f.workspace.legalName ?? '') || taxId !== (f.workspace.taxId ?? '') || minCash !== f.settings.minCashBalance;
  return (
    <Section id="isletme" title="İşletme" index={0}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="İşletme adı">{(p) => <TextInput {...p} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <Field label="Ticari unvan" optional>{(p) => <TextInput {...p} value={legalName} onChange={(e) => setLegalName(e.target.value)} />}</Field>
        <Field label="VKN / TCKN" optional error={taxId && !isValidTaxId(taxId) ? 'Geçersiz numara' : undefined}>
          {(p) => <TextInput {...p} value={taxId} inputMode="numeric" onChange={(e) => setTaxId(e.target.value.replace(/\D/g, '').slice(0, 11))} />}
        </Field>
        <Field label="Minimum nakit eşiği" hint="Toplam nakit bu seviyenin altına inecekse projeksiyon uyarır.">
          {(p) => <MoneyInput {...p} value={minCash} onValueChange={setMinCash} />}
        </Field>
      </div>
      <label className="mt-4 flex items-center justify-between gap-3 rounded-[14px] border border-line px-4 py-3 text-sm">
        <span>
          Tempo tahmini
          <span className="block text-2xs text-muted">Son 3 ayın satış/alış temposuyla henüz kesilmemiş faturaları ve rutin giderleri projeksiyona ekler.</span>
        </span>
        <Toggle checked={f.settings.tempo} onCheckedChange={(v) => void setWorkspaceSetting(SETTINGS_KEYS.tempo, v)} label="Tempo tahmini" />
      </label>
      <div className="mt-4 flex justify-end">
        <Button
          variant="primary"
          disabled={!dirty || Boolean(taxId && !isValidTaxId(taxId))}
          onClick={async () => {
            await updateWorkspace(f.workspace.id, { name: name.trim() || f.workspace.name, legalName: legalName || undefined, taxId: taxId || undefined });
            await setWorkspaceSetting(SETTINGS_KEYS.minCashBalance, minCash ?? 0);
            toast.success('İşletme bilgileri kaydedildi');
          }}
        >
          Kaydet
        </Button>
      </div>
    </Section>
  );
}

// ---------------------------------------------------------------------------

function AiSection() {
  const f = useFinance();
  const cfg = f.settings.ai;
  const [key, setKey] = useState(cfg.apiKey);
  const [baseUrl, setBaseUrl] = useState(cfg.baseUrl);
  const [models, setModels] = useState<string[]>([]);
  const [testing, setTesting] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [gKey, setGKey] = useState(cfg.gemini?.apiKey ?? '');
  const [gModels, setGModels] = useState<string[]>([]);
  const save = (patch: Partial<AiConfig>) => saveAiConfig(cfg, patch);

  async function test() {
    setTesting(true);
    try {
      const list = await listModels({ apiKey: key.trim(), baseUrl });
      setModels(list);
      // Varsayılan modeller hesapta yoksa (Groq model kaldırırsa) en uygununu seç
      const keep = (current: string, preferred: string[], pattern: RegExp) => (list.includes(current) ? current : (pickModel(list, preferred, pattern) ?? current));
      await save({
        apiKey: key.trim(),
        baseUrl,
        model: keep(cfg.model, ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'], /gpt|qwen|llama|kimi|mistral|gemma/i),
        fastModel: keep(cfg.fastModel, ['openai/gpt-oss-20b', 'openai/gpt-oss-120b', 'qwen/qwen3.8-27b'], /gpt|qwen|llama|gemma/i),
        sttModel: keep(cfg.sttModel, ['whisper-large-v3-turbo', 'whisper-large-v3'], /whisper/i),
      });
      toast.success('Bağlantı başarılı', { description: `${list.length} model kullanılabilir.` });
      if (!cfg.consentAt) setConsentOpen(true);
    } catch (e) {
      toast.error('Bağlantı kurulamadı', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  const chatModels = models.filter((m) => !/whisper|tts|guard|orpheus|playai/i.test(m));
  const ai = useAi();
  const ready = ai.enabled;
  const isCloud = cfg.provider === 'cloud';
  const cloudSession = useCloud((s) => s.session);
  const cloudUrl = f.settings.cloud?.url || envCloudConfig()?.url || '';

  async function testCloud() {
    if (!cloudSession || !cloudUrl) {
      toast('Önce “Bulut senkronu” bölümünden giriş yapın');
      return;
    }
    setTesting(true);
    try {
      const list = await listModels({ apiKey: cloudSession.access_token, baseUrl: `${cloudUrl}/functions/v1/ai-proxy` });
      setModels(list);
      toast.success('Bulut yapay zekâsı çalışıyor', { description: `${list.length} model kullanılabilir.` });
      if (!cfg.consentAt) setConsentOpen(true);
      else await save({ enabled: true });
    } catch (e) {
      toast.error('Bulut fonksiyonuna ulaşılamadı', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setTesting(false);
    }
  }

  return (
    <Section
      id="yapay-zeka"
      index={1}
      title="Yapay zekâ"
      description={
        <span className="flex flex-wrap items-center gap-2">
          {ready ? <Badge tone="in" icon={<CheckCircle size={12} />}>Açık · {cfg.model.replace('openai/', '')}</Badge> : <Badge tone="muted">Kapalı</Badge>}
          Rakamlar her zaman cihazınızda hesaplanır; yapay zekâ yalnızca yorumlar ve dili yapıya çevirir.
        </span>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Segmented
          label="Anahtar kaynağı"
          value={isCloud ? 'cloud' : 'device'}
          onChange={(v) => void save({ provider: v === 'cloud' ? 'cloud' : baseUrl.includes('groq.com') ? 'groq' : 'openai-compatible' })}
          options={[
            { value: 'device', label: 'Anahtar bu cihazda' },
            { value: 'cloud', label: 'Anahtar bulut sunucusunda' },
          ]}
        />
        <span className="text-2xs text-muted">{isCloud ? 'Ekip ve yayındaki site için önerilir: anahtar tarayıcıya hiç inmez.' : 'En basit yol: anahtarı yapıştırın, bu cihazda çalışır.'}</span>
      </div>

      {isCloud ? (
        <div className="space-y-4">
          <ol className="space-y-3 rounded-[16px] bg-sunken p-4 text-sm text-ink-2">
            <li>
              <strong>1.</strong> Bulut senkronu bölümünden Supabase’e bağlanıp giriş yapın{cloudSession ? <Badge tone="in" className="ml-2">Tamam</Badge> : null}.
            </li>
            <li className="space-y-2">
              <span className="block">
                <strong>2.</strong> Supabase panelinde <strong>Edge Functions › Deploy a new function › Via Editor</strong> açın, adını <code className="rounded bg-surface px-1">ai-proxy</code> yapın, kodu yapıştırıp <strong>Deploy</strong> deyin.
              </span>
              <Button
                size="sm"
                variant="secondary"
                icon={<Copy size={14} />}
                onClick={async () => {
                  await navigator.clipboard.writeText(aiProxySource);
                  toast.success('Fonksiyon kodu kopyalandı');
                }}
              >
                Fonksiyon kodunu kopyala
              </Button>
            </li>
            <li>
              <strong>3.</strong> <strong>Edge Functions › Secrets</strong> sayfasında <code className="rounded bg-surface px-1">GROQ_API_KEY</code> adıyla Groq anahtarınızı ekleyin (
              <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="text-cobalt-ink underline">
                anahtar al
              </a>
              ).
            </li>
          </ol>
          <div className="flex justify-end">
            <Button variant="primary" loading={testing} onClick={testCloud} disabled={!cloudSession}>
              Bulut bağlantısını test et
            </Button>
          </div>
        </div>
      ) : (
      <>
      <div className="rounded-[16px] bg-sunken p-4 text-sm text-ink-2">
        <div className="font-medium text-ink">Ücretsiz Groq anahtarı nasıl alınır?</div>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted">
          <li>
            <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-cobalt-ink underline">
              console.groq.com/keys <ArrowSquareOut size={12} />
            </a>{' '}
            adresine gidin, Google hesabınızla ücretsiz giriş yapın (kredi kartı gerekmez).
          </li>
          <li>“Create API Key” deyin, bir ad verin ve oluşan anahtarı kopyalayın (gsk_ ile başlar).</li>
          <li>Aşağıya yapıştırıp “Bağlantıyı test et” deyin.</li>
        </ol>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <Field label="Groq API anahtarı" hint="Yalnızca bu cihazda saklanır; yedek dosyalarına eklenmez.">
          {(p) => <TextInput {...p} type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="gsk_…" className="num" />}
        </Field>
        <Button variant="primary" loading={testing} onClick={test} disabled={!key.trim()}>
          Bağlantıyı test et
        </Button>
      </div>
      </>
      )}

      {(cfg.apiKey || isCloud) && (
        <div className="mt-5 space-y-4">
          {cfg.consentAt === 'env' && <p className="text-2xs text-muted">Anahtar .env dosyasından (VITE_GROQ_API_KEY) okunuyor.</p>}
          <UsageMeter />
          <label className="flex items-center justify-between gap-3 rounded-[14px] border border-line px-4 py-3 text-sm">
            <span>
              Yapay zekâ özelliklerini kullan
              <span className="block text-2xs text-muted">Asistan, doğal dil ve sesle kayıt, ekstre sınıflandırma, mesaj ve rapor yorumları.</span>
            </span>
            <Toggle
              checked={cfg.enabled}
              onCheckedChange={(v) => {
                if (v && !cfg.consentAt) setConsentOpen(true);
                else void save({ enabled: v });
              }}
              label="Yapay zekâ"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-[14px] border border-line px-4 py-3 text-sm">
            <span>
              Cari isimlerini maskele
              <span className="block text-2xs text-muted">Groq’a “Yıldız Gıda” yerine “Cari-3” gönderilir; yanıt cihazınızda geri çözülür.</span>
            </span>
            <Toggle checked={cfg.maskNames} onCheckedChange={(v) => void save({ maskNames: v })} label="İsimleri maskele" />
          </label>
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
          <details className="rounded-[14px] border border-line px-4 py-3 text-sm">
            <summary className="cursor-pointer text-ink-2">Gelişmiş: farklı bir OpenAI uyumlu servis (ör. yerel Ollama)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Servis adresi" hint="Groq: https://api.groq.com/openai/v1 · Ollama: http://localhost:11434/v1">
                {(p) => <TextInput {...p} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />}
              </Field>
              <Button variant="secondary" onClick={() => void save({ baseUrl, provider: baseUrl.includes('groq.com') ? 'groq' : 'openai-compatible' }).then(() => toast.success('Servis adresi kaydedildi'))}>
                Kaydet
              </Button>
            </div>
            {baseUrl !== GROQ_BASE && (
              <button type="button" className="mt-2 text-2xs text-cobalt-ink underline" onClick={() => setBaseUrl(GROQ_BASE)}>
                Groq’a dön
              </button>
            )}
          </details>
        </div>
      )}

      <details className="mt-5 rounded-[14px] border border-line px-4 py-3 text-sm">
        <summary className="cursor-pointer text-ink-2">İsteğe bağlı: fiş ve fatura fotoğrafı okuma (Google Gemini)</summary>
        <p className="mt-2 text-xs text-muted">
          Gemini’nin ücretsiz katmanında Google, gönderilen içeriği model eğitiminde kullanabilir. Bu yüzden yalnızca okuttuğunuz fiş fotoğrafı gönderilir; defter verileriniz gönderilmez. Anahtarı{' '}
          <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="text-cobalt-ink underline">
            aistudio.google.com/apikey
          </a>{' '}
          adresinden ücretsiz alabilirsiniz.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Gemini API anahtarı">{(p) => <TextInput {...p} type="password" value={gKey} onChange={(e) => setGKey(e.target.value)} placeholder="AIza…" />}</Field>
          <Button
            variant="secondary"
            disabled={!gKey.trim()}
            onClick={async () => {
              try {
                const list = await listGeminiModels(gKey.trim());
                setGModels(list);
                await save({ gemini: { apiKey: gKey.trim(), model: list[0] ?? 'gemini-flash-latest', consentAt: new Date().toISOString() } });
                toast.success('Gemini bağlandı', { description: list[0] });
              } catch (e) {
                toast.error('Gemini doğrulanamadı', { description: e instanceof Error ? e.message : '' });
              }
            }}
          >
            Onayla ve bağla
          </Button>
        </div>
        {cfg.gemini && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <Badge tone="in">Bağlı</Badge>
            <Select aria-label="Gemini modeli" value={cfg.gemini.model} onChange={(e) => void save({ gemini: { ...cfg.gemini!, model: e.target.value } })} className="h-8 text-xs">
              {[cfg.gemini.model, ...gModels.filter((m) => m !== cfg.gemini!.model)].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
            <Button size="sm" variant="ghost" onClick={() => void save({ gemini: undefined }).then(() => toast('Gemini bağlantısı kaldırıldı'))}>
              Kaldır
            </Button>
          </div>
        )}
      </details>

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
                toast.success('Yapay zekâ açıldı');
              }}
            >
              Anladım, aç
            </Button>
          </>
        }
      >
        <ul className="space-y-2 text-sm text-ink-2">
          <li>• Sorularınız ve yanıt için gereken <strong>özet veriler</strong> (ör. “açık alacak ₺6,2 milyon”, ilgili cari adı) Groq’a gönderilir.</li>
          <li>• Groq, sözleşmesi gereği bu verileri model eğitiminde kullanmaz ve varsayılan olarak saklamaz.</li>
          <li>• Ham defteriniz, IBAN’larınız ve dosyalarınız gönderilmez; tüm hesaplamalar cihazınızda yapılır.</li>
          <li>• İsterseniz cari isimlerini maskeleyebilirsiniz.</li>
        </ul>
      </Modal>
    </Section>
  );
}

/** Groq limit başlıklarından: bugün kalan istek. */
function UsageMeter() {
  const [u, setU] = useState<AiUsage | null>(getAiUsage);
  useEffect(() => onAiUsage(setU), []);
  if (!u || u.limitRequests == null || u.remainingRequests == null) {
    return <p className="text-2xs text-muted">Ücretsiz katman: günde yaklaşık 1.000 istek. İlk kullanımdan sonra kalan hakkınız burada görünür.</p>;
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

// ---------------------------------------------------------------------------

function CategoriesSection() {
  const f = useFinance();
  const [edit, setEdit] = useState<Category | 'new-income' | 'new-expense' | null>(null);
  const group = (kind: 'income' | 'expense') => f.categories.filter((c) => c.kind === kind && !c.archived);
  return (
    <Section id="kategoriler" index={2} title="Kategoriler ve bütçe" description="Aylık bütçe tanımladığınız kategoriler Raporlar › Bütçe’de izlenir.">
      <div className="grid gap-6 lg:grid-cols-2">
        {(['income', 'expense'] as const).map((kind) => (
          <div key={kind}>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold text-muted">{kind === 'income' ? 'Gelir kategorileri' : 'Gider kategorileri'}</h3>
              <Button size="sm" variant="ghost" icon={<Plus size={13} />} onClick={() => setEdit(kind === 'income' ? 'new-income' : 'new-expense')}>
                Ekle
              </Button>
            </div>
            <ul className="divide-y divide-line rounded-[16px] border border-line">
              {group(kind).map((c) => (
                <li key={c.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ color: slotColor(c.color), background: `color-mix(in oklab, ${slotColor(c.color)} 12%, transparent)` }}>
                    <CategoryIcon name={c.icon} size={15} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                  {c.monthlyBudget ? <Money value={c.monthlyBudget} decimals={0} className="text-2xs text-muted" /> : null}
                  <button type="button" aria-label={`${c.name} düzenle`} onClick={() => setEdit(c)} className="rounded-[8px] p-1.5 text-muted hover:bg-sunken hover:text-ink">
                    <PencilSimple size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      {edit && <CategoryModal value={edit} onClose={() => setEdit(null)} />}
    </Section>
  );
}

function CategoryModal({ value, onClose }: { value: Category | 'new-income' | 'new-expense'; onClose: () => void }) {
  const existing = typeof value === 'string' ? null : value;
  const kind = existing?.kind ?? (value === 'new-income' ? 'income' : 'expense');
  const [name, setName] = useState(existing?.name ?? '');
  const [icon, setIcon] = useState(existing?.icon ?? 'dots');
  const [color, setColor] = useState(existing?.color ?? 'c1');
  const [budget, setBudget] = useState<number | null>(existing?.monthlyBudget ?? null);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={existing ? 'Kategoriyi düzenle' : 'Yeni kategori'}
      footer={
        <>
          {existing && (
            <Button
              variant="ghost"
              className="mr-auto"
              onClick={async () => {
                await updateCategory(existing.id, { archived: true });
                toast('Kategori arşivlendi');
                onClose();
              }}
            >
              Arşivle
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={async () => {
              const payload = { name: name.trim(), icon, color, monthlyBudget: kind === 'expense' ? (budget ?? undefined) : undefined };
              if (existing) await updateCategory(existing.id, payload);
              else await createCategory({ ...payload, kind, archived: false });
              toast.success('Kategori kaydedildi');
              onClose();
            }}
          >
            Kaydet
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Ad">{(p) => <TextInput {...p} autoFocus value={name} onChange={(e) => setName(e.target.value)} />}</Field>
        <div>
          <div className="mb-2 text-xs font-medium text-ink-2">Simge</div>
          <div className="grid grid-cols-8 gap-1.5">
            {CATEGORY_ICON_KEYS.map((k) => (
              <button key={k} type="button" aria-label={k} onClick={() => setIcon(k)} className={cn('flex h-9 items-center justify-center rounded-[10px] border', icon === k ? 'border-cobalt bg-cobalt-soft text-cobalt' : 'border-line text-muted hover:text-ink')}>
                <CategoryIcon name={k} size={16} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium text-ink-2">Renk</div>
          <div className="flex gap-2">
            {['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'other'].map((c) => (
              <button key={c} type="button" aria-label={c} onClick={() => setColor(c)} className={cn('h-7 w-7 rounded-full', color === c && 'ring-2 ring-[var(--cobalt)] ring-offset-2 ring-offset-[var(--surface)]')} style={{ background: slotColor(c) }} />
            ))}
          </div>
        </div>
        {kind === 'expense' && <Field label="Aylık bütçe" optional>{(p) => <MoneyInput {...p} value={budget} onValueChange={setBudget} />}</Field>}
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function RatesSection() {
  const f = useFinance();
  const [busy, setBusy] = useState(false);
  return (
    <Section id="kurlar" index={3} title="Döviz kurları" description={`Kaynak: Avrupa Merkez Bankası referans kurları · son güncelleme ${f.ratesDate ? formatDate(f.ratesDate) : '—'}`}>
      <div className="grid gap-3 sm:grid-cols-3">
        {(['USD', 'EUR', 'GBP'] as const).map((c) => (
          <RateCard key={c} currency={c} value={f.rates[c]} />
        ))}
      </div>
      <div className="mt-4 flex justify-end">
        <Button
          variant="secondary"
          icon={<ArrowsClockwise size={16} />}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await fetchLatestRates();
              toast.success('Kurlar güncellendi');
            } catch (e) {
              toast.error('Kurlar alınamadı', { description: e instanceof Error ? e.message : '' });
            } finally {
              setBusy(false);
            }
          }}
        >
          Şimdi güncelle
        </Button>
      </div>
    </Section>
  );
}

function RateCard({ currency, value }: { currency: 'USD' | 'EUR' | 'GBP'; value: number }) {
  const f = useFinance();
  const [v, setV] = useState(String(value).replace('.', ','));
  useEffect(() => setV(String(value).replace('.', ',')), [value]);
  return (
    <div className="rounded-[16px] border border-line p-4">
      <div className="text-xs text-muted">1 {currency} =</div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-muted">₺</span>
        <input
          aria-label={`${currency} kuru`}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onBlur={async () => {
            const n = Number(v.replace(/\./g, '').replace(',', '.'));
            if (n > 0 && n !== value) {
              await setManualRate(currency, n, f.today);
              toast.success(`${currency} kuru elle ayarlandı`);
            }
          }}
          className="display num-wide w-full bg-transparent text-2xl font-semibold outline-none"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function SecuritySection() {
  const f = useFinance();
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const has = Boolean(f.settings.lock);
  return (
    <Section id="guvenlik" index={4} title="Güvenlik" description="Uygulama kilidi, bilgisayarınızı başkası kullandığında verilerinizi gizler. Veriler tarayıcıda şifrelenmez; bilgisayar hesabınızı da parolayla koruyun.">
      {has ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Badge tone="in" icon={<LockSimple size={12} />}>
            PIN kilidi açık · 15 dk hareketsizlikte kilitlenir
          </Badge>
          <Button
            variant="secondary"
            onClick={async () => {
              await setSetting(SETTINGS_KEYS.lock, null);
              toast('Uygulama kilidi kaldırıldı');
            }}
          >
            Kilidi kaldır
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <Field label="Yeni PIN (4–6 rakam)">{(p) => <TextInput {...p} type="password" inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />}</Field>
          <Field label="PIN tekrar">{(p) => <TextInput {...p} type="password" inputMode="numeric" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))} />}</Field>
          <Button
            variant="primary"
            disabled={pin.length < 4 || pin !== pin2}
            onClick={async () => {
              const salt = newSalt();
              await setSetting(SETTINGS_KEYS.lock, { salt, pinHash: await hashPin(pin, salt) });
              try {
                sessionStorage.setItem('mizan:unlocked', '1');
              } catch {
                /* yok say */
              }
              setPin('');
              setPin2('');
              toast.success('PIN kilidi açıldı');
            }}
          >
            Kilidi aç
          </Button>
        </div>
      )}
    </Section>
  );
}

// ---------------------------------------------------------------------------

function DataSection() {
  const f = useFinance();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirm, setConfirm] = useState<null | 'wipe' | 'demo'>(null);
  const days = f.settings.lastBackupAt ? diffDays(f.today, toISODate(new Date(f.settings.lastBackupAt))) : null;
  return (
    <Section
      id="veri"
      index={5}
      title="Veri ve yedek"
      description={
        days === null ? (
          <span className="text-saffron-text">Henüz yedek alınmadı. Veriler yalnızca bu tarayıcıda; düzenli yedek alın.</span>
        ) : (
          `Son yedek ${days === 0 ? 'bugün' : `${days} gün önce`} alındı.`
        )
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <DataCard
          title="Yedek al"
          body="Tüm veriler tek bir .json dosyasına indirilir. Başka bilgisayara taşımak için de kullanılır."
          action={
            <Button
              variant="primary"
              onClick={async () => {
                const b = await exportBackup();
                download(`mizan-yedek-${f.today}.json`, JSON.stringify(b), 'application/json');
                toast.success('Yedek indirildi');
              }}
            >
              Yedeği indir
            </Button>
          }
        />
        <DataCard
          title="Yedekten geri yükle"
          body="Seçtiğiniz yedek bu cihazdaki aynı işletmenin verisinin yerine geçer."
          action={
            <>
              <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                Dosya seç
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const data = JSON.parse(await file.text());
                    if (!validateBackup(data)) throw new Error('Bu bir Mizan yedeği değil');
                    await restoreBackup(data);
                    toast.success('Yedek geri yüklendi', { description: `${new Date(data.exportedAt).toLocaleString('tr-TR')} tarihli` });
                  } catch (err) {
                    toast.error('Geri yükleme başarısız', { description: err instanceof Error ? err.message : '' });
                  } finally {
                    e.target.value = '';
                  }
                }}
              />
            </>
          }
        />
        {f.settings.isDemo && (
          <DataCard
            title="Demo verisini yenile"
            body="Demo işletmeyi bugünün tarihine göre baştan üretir."
            action={
              <Button variant="secondary" onClick={() => setConfirm('demo')}>
                Yenile
              </Button>
            }
          />
        )}
        <DataCard
          title="Tüm verileri sil"
          body="Bu cihazdaki tüm Mizan verisi kalıcı olarak silinir. Önce yedek almanızı öneririz."
          danger
          action={
            <Button variant="danger" onClick={() => setConfirm('wipe')}>
              Verileri sil
            </Button>
          }
        />
      </div>
      <Modal
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'wipe' ? 'Tüm veriler silinsin mi?' : 'Demo yeniden üretilsin mi?'}
        description={confirm === 'wipe' ? 'Bu işlem geri alınamaz.' : 'Demo üzerinde yaptığınız değişiklikler kaybolur.'}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Vazgeç
            </Button>
            <Button
              variant={confirm === 'wipe' ? 'danger' : 'primary'}
              onClick={async () => {
                if (confirm === 'wipe') {
                  await wipeEverything();
                  window.location.href = '/';
                } else {
                  await loadDemo();
                  toast.success('Demo yenilendi');
                }
                setConfirm(null);
              }}
            >
              {confirm === 'wipe' ? 'Evet, sil' : 'Yenile'}
            </Button>
          </>
        }
      >
        <span />
      </Modal>
    </Section>
  );
}

function DataCard({ title, body, action, danger }: { title: string; body: string; action: ReactNode; danger?: boolean }) {
  return (
    <div className={cn('flex flex-col justify-between gap-3 rounded-[16px] border p-4', danger ? 'border-outflow/30' : 'border-line')}>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <p className="mt-1 text-xs text-muted">{body}</p>
      </div>
      <div className="flex">{action}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function AppearanceSection() {
  const { theme, setTheme } = useUI();
  const shortcuts: Array<[string[], string]> = [
    [[MOD_KEY, 'K'], 'Arama ve komut paleti (yazarak kayıt)'],
    [['N'], 'Yeni kayıt'],
    [[MOD_KEY, 'J'], 'Asistan'],
    [['G', 'K'], 'Kokpit'],
    [['G', 'A'], 'Nakit akışı'],
    [['G', 'T'], 'Ödeme takvimi'],
    [['G', 'I'], 'İşlemler'],
    [['G', 'C'], 'Cariler'],
    [['G', 'R'], 'Raporlar'],
  ];
  return (
    <Section id="gorunum" index={6} title="Görünüm ve kısayollar">
      <Segmented<ThemePref>
        label="Tema"
        value={theme}
        onChange={setTheme}
        options={[
          { value: 'system', label: 'Sistem' },
          { value: 'light', label: 'Açık' },
          { value: 'dark', label: 'Koyu' },
        ]}
      />
      <div className="mt-5 flex items-center gap-2 text-xs font-semibold text-muted">
        <Keyboard size={15} /> Klavye kısayolları
      </div>
      <ul className="mt-2 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {shortcuts.map(([keys, label]) => (
          <li key={label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-2">{label}</span>
            <span className="flex gap-1">
              {keys.map((k) => (
                <Kbd key={k}>{k}</Kbd>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-2xs text-muted">Mizan 0.1 · verileriniz yalnızca bu cihazdadır · hareket azaltma tercihiniz (işletim sistemi) otomatik uygulanır.</p>
    </Section>
  );
}
