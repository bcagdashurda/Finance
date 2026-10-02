import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { ArrowSquareOut, ClipboardText, Copy, Cursor, Key, Lock, ShieldCheck } from '@phosphor-icons/react';
import { Sheet } from '@/ui/Overlay';
import { Button } from '@/ui/Button';
import { cn } from '@/ui/cn';

export type KeyProvider = 'groq' | 'gemini';

interface Step {
  title: string;
  body: ReactNode;
  art: ReactNode;
}

interface Guide {
  title: string;
  site: string;
  siteLabel: string;
  prefix: string;
  minutes: number;
  steps: Step[];
  note?: ReactNode;
}

// ---------------------------------------------------------------------------
// Temsili çizimler: gerçek sitenin birebir görüntüsü değil, nereye tıklanacağını gösteren sade şemalar.

function Browser({ url, children }: { url: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-line bg-surface shadow-[0_8px_24px_-16px_rgb(15_26_61/0.35)]" aria-hidden>
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-3 py-2">
        <span className="flex gap-1">
          <span className="h-2 w-2 rounded-full bg-line-strong" />
          <span className="h-2 w-2 rounded-full bg-line-strong" />
          <span className="h-2 w-2 rounded-full bg-line-strong" />
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-surface px-3 py-0.5 text-[11px] text-muted">
          <Lock size={10} weight="bold" className="shrink-0" />
          <span className="truncate">{url}</span>
        </span>
      </div>
      {/* Sağda pay: kenardaki düğmenin imleci kırpılmasın */}
      <div className="relative min-h-[118px] py-4 pl-4 pr-7">{children}</div>
    </div>
  );
}

/** Tıklanacak öğe: halka + imleç */
function Target({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn('relative inline-flex', className)}>
      <span className="absolute -inset-1.5 animate-pulse rounded-[12px] border-2 border-cobalt/70" />
      {children}
      <Cursor size={20} weight="fill" className="absolute -bottom-3 -right-3 text-ink drop-shadow" />
    </span>
  );
}

const Fake = ({ children, primary, className }: { children: ReactNode; primary?: boolean; className?: string }) => (
  <span className={cn('inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 text-xs font-medium', primary ? 'bg-ink text-inverse' : 'border border-line bg-surface text-ink-2', className)}>{children}</span>
);

const Line = ({ w }: { w: string }) => <span className={cn('block h-2 rounded-full bg-sunken', w)} />;

function KeyField({ prefix, highlight }: { prefix: string; highlight?: boolean }) {
  const copy = (
    <span className="flex h-7 w-7 items-center justify-center rounded-[8px] border border-line bg-surface text-ink-2">
      <Copy size={14} />
    </span>
  );
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-line bg-surface-2 px-3 py-2">
      <Key size={14} className="shrink-0 text-muted" />
      <span className="num flex-1 truncate text-xs text-ink-2">{prefix}••••••••••••••••••••</span>
      {highlight ? <Target>{copy}</Target> : copy}
    </div>
  );
}

function SignIn({ url, brand, button }: { url: string; brand: string; button: string }) {
  return (
    <Browser url={url}>
      <div className="mx-auto flex max-w-[220px] flex-col items-center gap-3 text-center">
        <span className="text-sm font-semibold text-ink">{brand}</span>
        <Line w="w-32" />
        <Target>
          <Fake className="w-[200px] justify-center">
            <span className="font-bold text-[#4285f4]">G</span> {button}
          </Fake>
        </Target>
      </div>
    </Browser>
  );
}

function PasteInMizan({ prefix }: { prefix: string }) {
  return (
    <div className="rounded-[14px] border border-line bg-surface p-4" aria-hidden>
      <div className="mb-2 text-[11px] font-medium text-muted">Mizan › Ayarlar › Yapay zekâ</div>
      <div className="flex items-center gap-2">
        <span className="num flex h-9 flex-1 items-center rounded-[10px] border-2 border-cobalt bg-surface px-3 text-xs text-ink-2">{prefix}••••••••••••</span>
        <Target>
          <span className="inline-flex h-9 items-center rounded-[10px] bg-cobalt px-4 text-xs font-semibold text-inverse">Bağlan</span>
        </Target>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

const GUIDES: Record<KeyProvider, Guide> = {
  groq: {
    title: 'Groq anahtarı nasıl alınır?',
    site: 'https://console.groq.com/keys',
    siteLabel: 'Groq’u aç',
    prefix: 'gsk_',
    minutes: 3,
    steps: [
      {
        title: 'Groq sitesini açın ve giriş yapın',
        body: (
          <>
            Aşağıdaki <strong>“Groq’u aç”</strong> düğmesi siteyi yeni sekmede açar. <strong>“Continue with Google”</strong> ile Google hesabınızla giriş yapın. Ücretsizdir,
            kredi kartı istenmez.
          </>
        ),
        art: <SignIn url="console.groq.com" brand="groq" button="Continue with Google" />,
      },
      {
        title: '“API Keys” sayfasına gidin',
        body: (
          <>
            Giriş yapınca soldaki menüden <strong>API Keys</strong>’e tıklayın. (Düğme doğrudan bu sayfayı açtıysa bu adımı geçin.)
          </>
        ),
        art: (
          <Browser url="console.groq.com/keys">
            <div className="flex gap-4">
              <div className="flex w-28 flex-col gap-2 text-xs text-muted">
                <span>Playground</span>
                <Target className="w-fit">
                  <span className="rounded-[8px] bg-sunken px-2 py-1 font-medium text-ink">API Keys</span>
                </Target>
                <span className="mt-1">Settings</span>
              </div>
              <div className="flex flex-1 flex-col gap-2 pt-1">
                <Line w="w-3/4" />
                <Line w="w-1/2" />
              </div>
            </div>
          </Browser>
        ),
      },
      {
        title: 'Yeni bir anahtar oluşturun',
        body: (
          <>
            <strong>“Create API Key”</strong> düğmesine basın. Ad olarak <strong>Mizan</strong> yazın ve <strong>“Submit”</strong> deyin.
          </>
        ),
        art: (
          <Browser url="console.groq.com/keys">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">API Keys</span>
                <Target>
                  <Fake primary>+ Create API Key</Fake>
                </Target>
              </div>
              <div className="rounded-[10px] border border-line px-3 py-2 text-xs text-muted">
                Display name: <span className="font-medium text-ink">Mizan</span>
              </div>
            </div>
          </Browser>
        ),
      },
      {
        title: 'Anahtarı kopyalayın',
        body: (
          <>
            <strong>gsk_</strong> ile başlayan anahtarı kopyalama simgesiyle kopyalayın. Site anahtarı <strong>yalnızca bir kez</strong> gösterir; kaybederseniz yenisini
            oluşturmanız yeterli.
          </>
        ),
        art: (
          <Browser url="console.groq.com/keys">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-ink">Your new API key</span>
              <KeyField prefix="gsk_" highlight />
            </div>
          </Browser>
        ),
      },
      {
        title: 'Mizan’a yapıştırın',
        body: (
          <>
            Bu pencereye dönüp <strong>“Panodan yapıştır”</strong>a basın ya da anahtarı kutuya yapıştırıp <strong>“Bağlan”</strong> deyin.
          </>
        ),
        art: <PasteInMizan prefix="gsk_" />,
      },
    ],
  },
  gemini: {
    title: 'Gemini anahtarı nasıl alınır?',
    site: 'https://aistudio.google.com/apikey',
    siteLabel: 'Google AI Studio’yu aç',
    prefix: 'AIza',
    minutes: 3,
    steps: [
      {
        title: 'Google AI Studio’yu açın',
        body: (
          <>
            Aşağıdaki düğme <strong>aistudio.google.com/apikey</strong> sayfasını açar. Google hesabınızla giriş yapın; ilk girişte kullanım koşullarını onaylamanız
            istenir.
          </>
        ),
        art: <SignIn url="aistudio.google.com/apikey" brand="Google AI Studio" button="Google ile oturum açın" />,
      },
      {
        title: 'Anahtar oluşturun',
        body: (
          <>
            <strong>“Create API key”</strong> (API anahtarı oluştur) düğmesine basın. Bir proje sorulursa önerileni seçin; Google bunu kendiliğinden hazırlar.
          </>
        ),
        art: (
          <Browser url="aistudio.google.com/apikey">
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink">API Keys</span>
                <Target>
                  <Fake primary>
                    <Key size={12} /> Create API key
                  </Fake>
                </Target>
              </div>
              <Line w="w-2/3" />
              <Line w="w-1/2" />
            </div>
          </Browser>
        ),
      },
      {
        title: 'Anahtarı kopyalayın',
        body: (
          <>
            <strong>AIza</strong> ile başlayan anahtarın yanındaki kopyalama simgesine basın.
          </>
        ),
        art: (
          <Browser url="aistudio.google.com/apikey">
            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-ink">API key generated</span>
              <KeyField prefix="AIza" highlight />
            </div>
          </Browser>
        ),
      },
      {
        title: 'Mizan’a yapıştırın',
        body: (
          <>
            Bu pencereye dönüp <strong>“Panodan yapıştır”</strong>a basın ya da anahtarı kutuya yapıştırıp <strong>“Bağlan”</strong> deyin.
          </>
        ),
        art: <PasteInMizan prefix="AIza" />,
      },
    ],
    note: (
      <>
        Ücretsiz Gemini’de Google, gönderilen içerikleri ürünlerini geliştirmek için kullanabilir. Mizan yalnızca sorunuz için gereken özet bilgileri gönderir; Gemini
        seçildiğinde müşteri adları varsayılan olarak <strong>takma adla</strong> (Cari-1, Cari-2…) gönderilir.
      </>
    ),
  },
};

export function AiKeyGuide({
  provider,
  open,
  onOpenChange,
  onPaste,
}: {
  provider: KeyProvider;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Panodan okunan anahtarı forma aktarır */
  onPaste: (key: string) => void;
}) {
  const g = GUIDES[provider];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={g.title} description={`Ücretsiz · yaklaşık ${g.minutes} dakika · kredi kartı gerekmez`} width={560}>
      <ol className="space-y-6">
        {g.steps.map((s, i) => (
          <li key={s.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 gap-y-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cobalt text-xs font-semibold text-inverse" aria-hidden>
              {i + 1}
            </span>
            <div>
              <h3 className="text-sm font-semibold text-ink">
                <span className="sr-only">Adım {i + 1}: </span>
                {s.title}
              </h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-2">{s.body}</p>
              {i === 0 && (
                <a
                  href={g.site}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-cobalt px-4 text-sm font-semibold text-inverse transition-colors hover:bg-cobalt/90"
                >
                  {g.siteLabel} <ArrowSquareOut size={14} />
                </a>
              )}
            </div>
            <div className="col-start-2">{s.art}</div>
          </li>
        ))}
      </ol>

      {g.note && (
        <p className="mt-6 flex gap-2 rounded-[14px] bg-sunken p-3 text-xs leading-relaxed text-ink-2">
          <ShieldCheck size={16} className="mt-0.5 shrink-0 text-cobalt" />
          <span>{g.note}</span>
        </p>
      )}
      <p className="mt-4 text-2xs text-muted">Çizimler temsilidir; sitelerin görünümü zamanla değişebilir. Anahtarınız yalnızca {provider === 'groq' ? 'Groq’a' : 'Google’a'} gönderilir; ayrıntılar Ayarlar’daki “Anahtarım güvende mi?” bölümünde.</p>

      <div className="sticky -bottom-5 -mx-6 -mb-5 mt-6 flex items-center justify-end gap-2 border-t border-line bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-6 py-4 backdrop-blur">
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Kapat
        </Button>
        <Button
          variant="primary"
          icon={<ClipboardText size={16} />}
          onClick={async () => {
            try {
              const text = (await navigator.clipboard.readText()).trim();
              if (!text) throw new Error('boş');
              onPaste(text);
              onOpenChange(false);
            } catch {
              toast('Pano okunamadı', { description: 'Anahtarı kutuya Ctrl+V (Mac’te ⌘V) ile yapıştırın.' });
              onOpenChange(false);
            }
          }}
        >
          Panodan yapıştır
        </Button>
      </div>
    </Sheet>
  );
}
