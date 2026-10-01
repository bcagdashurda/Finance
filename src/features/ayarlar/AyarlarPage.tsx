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
  PencilSimple,
  Plus,
  ArrowsClockwise,
  Keyboard,
  Cloud,
} from '@phosphor-icons/react';
import { CloudSection, cloudAvailable } from './CloudSection';
import { AiSection } from './AiSection';
import { useFinance } from '@/app/finance';
import { useUI, type ThemePref } from '@/app/ui-store';
import { PageHeader } from '@/ui/PageHeader';
import { Panel, PanelHeader } from '@/ui/Panel';
import { Button } from '@/ui/Button';
import { Field, MoneyInput, TextInput } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Badge, Kbd, MOD_KEY, Toggle } from '@/ui/bits';
import { Modal } from '@/ui/Overlay';
import { Money } from '@/ui/Money';
import { CategoryIcon, CATEGORY_ICON_KEYS } from '@/ui/icons';
import { cn, slotColor } from '@/ui/cn';
import { formatDate } from '@/ui/format';
import { isValidTaxId } from '@/domain/validators';
import { diffDays, toISODate } from '@/domain/dates';
import type { Category } from '@/domain/types';
import { createCategory, setSetting, setWorkspaceSetting, updateCategory, updateWorkspace } from '@/data/repo';
import { SETTINGS_KEYS, loadDemo, wipeEverything } from '@/data/load';
import { exportBackup, restoreBackup, validateBackup, type Backup } from '@/data/backup';
import { fetchLatestRates, setManualRate } from '@/data/rates';
import { download } from '@/data/export';
import { ensurePersistentStorage, isStoragePersistent } from '@/data/persist';
import { hashPin, lockNow, newSalt } from '@/app/lock';

const SECTIONS = [
  { id: 'isletme', label: 'İşletme', icon: Buildings },
  { id: 'yapay-zeka', label: 'Yapay zekâ', icon: Sparkle },
  { id: 'bulut', label: 'Hesap ve eşitleme', icon: Cloud },
  { id: 'kategoriler', label: 'Kategoriler ve bütçe', icon: Tag },
  { id: 'kurlar', label: 'Döviz kurları', icon: CurrencyCircleDollar },
  { id: 'guvenlik', label: 'Güvenlik', icon: LockSimple },
  { id: 'veri', label: 'Veri ve yedek', icon: Database },
  { id: 'gorunum', label: 'Görünüm ve kısayollar', icon: Palette },
];

export default function AyarlarPage() {
  const location = useLocation();
  const cloud = cloudAvailable(useFinance().settings.cloud);
  useEffect(() => {
    const id = location.hash.slice(1);
    if (id) window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }, [location.hash]);

  return (
    <div>
      <PageHeader kicker="İşletme, yapay zekâ, güvenlik ve yedek" title="Ayarlar" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav className="sticky top-24 hidden h-fit space-y-1 lg:block" aria-label="Ayar bölümleri">
          {SECTIONS.filter((s) => s.id !== 'bulut' || cloud).map((s) => (
            <a key={s.id} href={`#${s.id}`} className="flex items-center gap-2.5 rounded-[12px] px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-ink">
              <s.icon size={17} /> {s.label}
            </a>
          ))}
        </nav>
        <div className="min-w-0 space-y-5">
          <BusinessSection />
          <AiSection index={1} />
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
                <li key={c.id}>
                  {/* Satırın tamamı düzenleyiciyi açar (yalnızca küçük kalem simgesi değil) */}
                  <button
                    type="button"
                    aria-label={`${c.name} düzenle`}
                    onClick={() => setEdit(c)}
                    className="group flex w-full items-center gap-3 px-3 py-2 text-left transition-colors first:rounded-t-[16px] hover:bg-surface-2"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-[10px]" style={{ color: slotColor(c.color), background: `color-mix(in oklab, ${slotColor(c.color)} 12%, transparent)` }}>
                      <CategoryIcon name={c.icon} size={15} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm">{c.name}</span>
                    {c.monthlyBudget ? (
                      <span className="text-2xs text-muted">
                        bütçe <Money value={c.monthlyBudget} decimals={0} />
                      </span>
                    ) : kind === 'expense' ? (
                      <span className="text-2xs text-faint opacity-0 transition-opacity group-hover:opacity-100">bütçe ekle</span>
                    ) : null}
                    <PencilSimple size={14} className="text-muted group-hover:text-ink" />
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
            PIN kilidi etkin · 15 dk hareketsizlikte kilitlenir
          </Badge>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<LockSimple size={16} />} onClick={lockNow}>
              Şimdi kilitle
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await setSetting(SETTINGS_KEYS.lock, null);
                toast('Uygulama kilidi kaldırıldı');
              }}
            >
              Kilidi kaldır
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
          <Field label="Yeni PIN (4–6 rakam)">{(p) => <TextInput {...p} type="password" inputMode="numeric" autoComplete="new-password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} />}</Field>
          <Field label="PIN tekrar" error={pin2.length >= 4 && pin !== pin2 ? 'PIN’ler eşleşmiyor' : undefined}>
            {(p) => <TextInput {...p} type="password" inputMode="numeric" autoComplete="new-password" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 6))} />}
          </Field>
          <Button
            variant="primary"
            disabled={pin.length < 4 || pin !== pin2}
            onClick={async () => {
              const salt = newSalt();
              const pinHash = await hashPin(pin, salt);
              // Önce bu oturumu "açık" işaretle, sonra kilidi kaydet: kuran kişi hemen kilitlenmesin
              try {
                sessionStorage.setItem('mizan:unlocked', '1');
              } catch {
                /* yok say */
              }
              await setSetting(SETTINGS_KEYS.lock, { salt, pinHash, length: pin.length });
              setPin('');
              setPin2('');
              toast.success('PIN kilidi etkinleştirildi', { description: '15 dakika hareketsizlikte ya da “Şimdi kilitle” ile kilitlenir.' });
            }}
            className="sm:mt-[1.375rem]"
          >
            Kilidi etkinleştir
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
  const [pending, setPending] = useState<Backup | null>(null);
  const days = f.settings.lastBackupAt ? diffDays(f.today, toISODate(new Date(f.settings.lastBackupAt))) : null;
  const [persistent, setPersistent] = useState<boolean | null>(null);
  useEffect(() => {
    void isStoragePersistent().then(setPersistent);
  }, []);
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
      {persistent !== null && (
        <p className={cn('mb-3 flex items-start gap-2 rounded-[12px] px-3 py-2 text-xs', persistent ? 'bg-inflow-soft text-inflow-text' : 'bg-saffron-soft/60 text-saffron-text')}>
          {persistent
            ? 'Bu tarayıcı verilerinizi kalıcı saklıyor: yalnızca siz silerseniz gider.'
            : 'Tarayıcı, yer azalırsa site verilerini silebilir. Düzenli yedek alın ya da Mizan’ı ana ekrana / uygulama olarak yükleyin.'}
          {!persistent && (
            <button type="button" className="ml-auto shrink-0 underline" onClick={() => void ensurePersistentStorage().then(setPersistent)}>
              Kalıcı saklamayı iste
            </button>
          )}
        </p>
      )}
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
                aria-label="Yedek dosyası seç"
                tabIndex={-1}
                className="sr-only"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const data = JSON.parse(await file.text());
                    if (!validateBackup(data)) throw new Error('Bu bir Mizan yedeği değil');
                    // Yanlış dosya seçilirse mevcut veri gitmesin: önce ne yükleneceğini göster.
                    setPending(data);
                  } catch (err) {
                    toast.error('Dosya okunamadı', { description: err instanceof SyntaxError ? 'Geçerli bir JSON dosyası değil' : err instanceof Error ? err.message : '' });
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
      <Modal
        open={pending !== null}
        onOpenChange={(o) => !o && setPending(null)}
        title="Yedek geri yüklensin mi?"
        description="Bu cihazdaki aynı işletmenin mevcut verisi, yedektekiyle değiştirilir."
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Vazgeç
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!pending) return;
                try {
                  await restoreBackup(pending);
                  toast.success('Yedek geri yüklendi', { description: `${new Date(pending.exportedAt).toLocaleString('tr-TR')} tarihli` });
                } catch (err) {
                  toast.error('Geri yükleme başarısız', { description: err instanceof Error ? err.message : '' });
                }
                setPending(null);
              }}
            >
              Geri yükle
            </Button>
          </>
        }
      >
        {pending && <BackupSummary backup={pending} />}
      </Modal>
    </Section>
  );
}

function BackupSummary({ backup }: { backup: Backup }) {
  const count = (t: string) => backup.tables[t]?.length ?? 0;
  const ws = backup.workspace as { name?: string };
  const rows: Array<[string, string]> = [
    ['İşletme', ws.name ?? '—'],
    ['Yedek tarihi', new Date(backup.exportedAt).toLocaleString('tr-TR', { dateStyle: 'long', timeStyle: 'short' })],
    ['İçerik', `${count('transactions')} işlem · ${count('contacts')} cari · ${count('documents')} fatura · ${count('accounts')} hesap`],
  ];
  return (
    <dl className="grid gap-2 rounded-[12px] border border-line p-3 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="grid grid-cols-[96px_1fr] gap-2">
          <dt className="text-muted">{k}</dt>
          <dd className="min-w-0 font-medium break-words">{v}</dd>
        </div>
      ))}
    </dl>
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
