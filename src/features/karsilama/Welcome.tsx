import { useEffect, useMemo, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from 'motion/react';
import { toast } from 'sonner';
import { ArrowRight, LockSimple, Waves, Signature, Microphone, CloudArrowDown } from '@phosphor-icons/react';
import { db } from '@/data/db';
import { SETTINGS_KEYS } from '@/data/keys';
import { ensureClient, envCloudConfig, saveCloudConfig, testConnection, useCloud } from '@/cloud/store';
import { CloudAuthForm, RemoteWorkspacePicker, Steps } from '@/cloud/ui';
import { loadDemo, setupWorkspace } from '@/data/load';
import { LogoMark, Wordmark } from '@/ui/Logo';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Overlay';
import { Field, MoneyInput, TextInput, focusFirstInvalid } from '@/ui/Field';
import { ringPath, hypotrochoidPath } from '@/charts/guilloche';
import { isValidTaxId } from '@/domain/validators';
import { isCoarsePointer } from '@/ui/cn';

const LINES = ['Nakdinizin', '13 hafta sonrasını', 'bugünden görün.'];

export function Welcome() {
  // Demodan "Kendi işletmemi kur" ile gelindiyse kurulum doğrudan açılır
  const [setupOpen, setSetupOpen] = useState(() => {
    try {
      return sessionStorage.getItem('mizan:kurulum') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.removeItem('mizan:kurulum');
    } catch {
      /* depolama kapalı olabilir */
    }
  }, []);
  const [cloudOpen, setCloudOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const px = useMotionValue(0);
  const py = useMotionValue(0);

  async function startDemo() {
    setLoading(true);
    try {
      await loadDemo();
    } catch (e) {
      toast.error('Demo yüklenemedi', { description: e instanceof Error ? e.message : String(e) });
      setLoading(false);
    }
  }

  return (
    <div
      className="grain relative min-h-dvh overflow-hidden bg-ground"
      onPointerMove={(e) => {
        if (isCoarsePointer()) return;
        px.set(e.clientX / window.innerWidth - 0.5);
        py.set(e.clientY / window.innerHeight - 0.5);
      }}
    >
      <header className="relative z-10 mx-auto flex max-w-[1400px] items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center gap-2.5">
          <LogoMark size={30} />
          <Wordmark />
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/60 px-3 py-1.5 text-2xs text-muted backdrop-blur">
          <LockSimple size={12} weight="bold" className="text-inflow-text" />
          Verileriniz cihazınızda · bulut isteğe bağlı
        </span>
      </header>

      <main className="relative z-10 mx-auto grid max-w-[1400px] items-center gap-10 px-6 pb-16 sm:px-10 lg:min-h-[calc(100dvh-96px)] lg:grid-cols-[1.3fr_1fr] lg:pb-10">
        <div>
          <motion.p
            className="mb-5 text-sm text-muted"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            Türk KOBİ'leri için nakit akışı ve finans yönetimi
          </motion.p>
          <h1 className="display text-[2.7rem] font-semibold leading-[0.98] tracking-[-0.035em] text-ink sm:text-[4rem] xl:text-[4.6rem]">
            {LINES.map((line, i) => (
              <span key={line} className="block overflow-hidden whitespace-nowrap pb-[0.08em]">
                <motion.span
                  className="inline-block"
                  initial={{ y: '110%', rotate: 3 }}
                  animate={{ y: 0, rotate: 0 }}
                  transition={{ duration: 1.1, delay: 0.2 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                >
                  {line}
                </motion.span>
              </span>
            ))}
          </h1>
          <motion.p
            className="mt-7 max-w-xl text-base leading-relaxed text-ink-2"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.75 }}
          >
            Mizan; hesaplarınızı, carilerinizi, çek ve senetlerinizi tek yerde toplar. Nakit akışınızı, müşterilerinizin gerçek
            ödeme alışkanlıklarıyla hesaplar ve sıkışmayı gelmeden gösterir.
          </motion.p>
          <motion.div
            className="mt-9 flex flex-wrap items-center gap-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.95 }}
          >
            <Button variant="primary" size="lg" magnetic loading={loading} onClick={startDemo} trailing={<ArrowRight size={16} weight="bold" />}>
              Demo işletmeyle keşfet
            </Button>
            <Button variant="secondary" size="lg" onClick={() => setSetupOpen(true)} disabled={loading}>
              Kendi işletmemi kur
            </Button>
          </motion.div>
          <motion.button
            type="button"
            onClick={() => setCloudOpen(true)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.1 }}
            className="mt-4 inline-flex items-center gap-1.5 text-sm text-cobalt-ink underline-offset-4 hover:underline"
          >
            <CloudArrowDown size={16} /> Başka cihazda kullanıyorum: buluttaki işletmeme bağlan
          </motion.button>
          <motion.ul
            className="mt-12 grid max-w-xl gap-4 sm:grid-cols-3"
            initial="hidden"
            animate="show"
            variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 1.15 } } }}
          >
            {[
              { icon: Waves, title: 'Olasılıklı projeksiyon', text: '13 hafta ileriye, üç senaryoyla' },
              { icon: Signature, title: 'Çek, senet ve KDV', text: 'Vade merdiveni ve vergi takvimi' },
              { icon: Microphone, title: 'Yazarak ya da konuşarak', text: '“Yıldız’dan 45 bin tahsilat”' },
            ].map(({ icon: I, title, text }) => (
              <motion.li
                key={title}
                variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.25, 1, 0.5, 1] } } }}
                className="border-t border-line pt-4"
              >
                <I size={20} className="text-cobalt" />
                <div className="mt-2 text-sm font-semibold">{title}</div>
                <div className="mt-0.5 text-xs text-muted">{text}</div>
              </motion.li>
            ))}
          </motion.ul>
        </div>

        <WelcomeArt px={px} py={py} />
      </main>

      <SetupModal open={setupOpen} onOpenChange={setSetupOpen} />
      <CloudConnectModal open={cloudOpen} onOpenChange={setCloudOpen} />
    </div>
  );
}

/** Katmanlı gravür kompozisyonu; her katman farklı derinlikte imlece tepki verir (2.5D). */
function WelcomeArt({ px, py }: { px: MotionValue<number>; py: MotionValue<number> }) {
  const size = 620;
  const c = size / 2;
  const layers = useMemo(() => {
    const rings = Array.from({ length: 14 }, (_, i) => {
      const t = i / 13;
      return ringPath(c, c, {
        radius: 110 + i * 13,
        amplitude: 2 + Math.sin(i * 0.9) * 5 + t * 5,
        lobes: 20 + i * 3,
        phase: i * 0.4,
        ripple: 0.8,
        rippleLobes: (20 + i * 3) * 3 + 1,
        samples: 520,
      });
    });
    return {
      back: [ringPath(c, c, { radius: 292, amplitude: 2.4, lobes: 120, phase: 0, ripple: 1, rippleLobes: 241, samples: 1100 }), ringPath(c, c, { radius: 280, amplitude: 2.4, lobes: 120, phase: Math.PI, samples: 1100 })],
      mid: rings,
      front: hypotrochoidPath(c, c, 96, (96 * 3) / 11, 34, 3, 2200),
    };
  }, [c]);

  const spring = { stiffness: 60, damping: 18 };
  const bx = useSpring(useTransform(px, (v) => v * -14), spring);
  const by = useSpring(useTransform(py, (v) => v * -14), spring);
  const mx = useSpring(useTransform(px, (v) => v * 22), spring);
  const my = useSpring(useTransform(py, (v) => v * 22), spring);
  const fx = useSpring(useTransform(px, (v) => v * 40), spring);
  const fy = useSpring(useTransform(py, (v) => v * 40), spring);
  const rot = useSpring(useTransform(px, (v) => v * 6), spring);

  const draw = (delay: number, duration = 2.2) =>
    ({ pathLength: 1, className: 'draw-path', style: { '--len': 1, '--draw-delay': `${delay}s`, '--draw-duration': `${duration}s` } as React.CSSProperties });

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[620px]" aria-hidden>
      {/* Derinlik 0: arka halo */}
      <motion.div
        className="absolute inset-[8%] rounded-full blur-3xl"
        style={{ x: bx, y: by, background: 'radial-gradient(circle, color-mix(in oklab, var(--cobalt) 18%, transparent), transparent 65%)' }}
      />
      {/* Derinlik 1: çerçeve */}
      <motion.svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 h-full w-full" style={{ x: bx, y: by }}>
        <g className="slow-spin-reverse" opacity={0.5}>
          {layers.back.map((d, i) => (
            <path key={i} d={d} fill="none" stroke="var(--cobalt)" strokeWidth={0.7} {...draw(0.2 + i * 0.15, 2.8)} />
          ))}
        </g>
      </motion.svg>
      {/* Derinlik 2: halkalar */}
      <motion.svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 h-full w-full" style={{ x: mx, y: my, rotate: rot }}>
        <g className="slow-spin">
          {layers.mid.map((d, i) => (
            <path
              key={i}
              d={d}
              fill="none"
              stroke={i % 4 === 1 ? 'var(--inflow)' : i % 4 === 3 ? 'var(--outflow)' : 'var(--cobalt)'}
              strokeOpacity={i % 2 ? 0.75 : 0.4}
              strokeWidth={i % 2 ? 0.9 : 0.6}
              {...draw(0.45 + i * 0.07, 2)}
            />
          ))}
        </g>
      </motion.svg>
      {/* Derinlik 3: merkez rozet */}
      <motion.svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 h-full w-full" style={{ x: fx, y: fy }}>
        <path d={layers.front} fill="none" stroke="var(--cobalt)" strokeWidth={0.8} strokeOpacity={0.8} {...draw(1.3, 3.2)} />
        <circle cx={c} cy={c} r={6} fill="var(--cobalt)" />
      </motion.svg>
      {/* Derinlik 4: yüzen rakam kartı */}
      <motion.div
        className="panel absolute bottom-[10%] left-[-2%] px-5 py-4 sm:left-[2%]"
        style={{ x: fx, y: fy }}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.6, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="text-2xs text-muted">17 Ekim · tahmini en düşük nakit</div>
        <div className="display mt-1 text-3xl text-outflow-text">₺1.184.000</div>
        <div className="mt-1 text-2xs text-muted">Kuzey Mobilya tahsilatı 29 gün gecikirse</div>
      </motion.div>
      <motion.div
        className="panel absolute right-[-2%] top-[12%] px-5 py-4 sm:right-[4%]"
        style={{ x: mx, y: my }}
        initial={{ opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1.85, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="text-2xs text-muted">Portföyde çek</div>
        <div className="display mt-1 text-3xl text-inflow-text">₺1.462.500</div>
        <div className="mt-1 text-2xs text-muted">ortalama 34 gün vade</div>
      </motion.div>
    </div>
  );
}

/** İkinci cihaz: Supabase bağlantısı → giriş → buluttaki işletmeyi indir. */
function CloudConnectModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const session = useCloud((s) => s.session);
  const client = useCloud((s) => s.client);
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const env = envCloudConfig();
    if (env) {
      ensureClient(env);
      return;
    }
    void db.settings.get(SETTINGS_KEYS.cloud).then((row) => {
      const cfg = row?.value as { url?: string; anonKey?: string } | undefined;
      if (cfg?.url && cfg.anonKey) ensureClient({ url: cfg.url, anonKey: cfg.anonKey });
    });
  }, [open]);

  const step = !client ? 0 : !session ? 1 : 2;
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Buluttaki işletmeme bağlan" description="Başka bir cihazda kullandığınız Mizan verilerini bu cihaza indirin." className="max-w-xl">
      <Steps steps={['Bağlantı', 'Giriş', 'İşletme']} current={step} />
      {step === 0 && (
        <div className="space-y-3">
          <Field label="Supabase Project URL">{(p) => <TextInput {...p} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://abcd1234.supabase.co" />}</Field>
          <Field label="anon public anahtarı">{(p) => <TextInput {...p} value={key} onChange={(e) => setKey(e.target.value)} className="num" />}</Field>
          <div className="flex justify-end">
            <Button
              variant="primary"
              loading={busy}
              disabled={!url || !key}
              onClick={async () => {
                setBusy(true);
                try {
                  await testConnection(url, key);
                  await saveCloudConfig({ url: url.trim().replace(/\/$/, ''), anonKey: key.trim(), linked: [] });
                  ensureClient({ url: url.trim().replace(/\/$/, ''), anonKey: key.trim() });
                } catch (e) {
                  toast.error('Bağlanılamadı', { description: e instanceof Error ? e.message : '' });
                } finally {
                  setBusy(false);
                }
              }}
            >
              Bağlan
            </Button>
          </div>
        </div>
      )}
      {step === 1 && <CloudAuthForm />}
      {step === 2 && <RemoteWorkspacePicker localIds={[]} onDownloaded={() => onOpenChange(false)} />}
    </Modal>
  );
}

function SetupModal({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [minCash, setMinCash] = useState<number | null>(25_000_000);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function submit() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'İşletmenizin adını yazın';
    if (taxId && !isValidTaxId(taxId)) e.taxId = 'Vergi numarası geçersiz görünüyor (10 haneli VKN ya da 11 haneli TCKN)';
    setErrors(e);
    if (Object.keys(e).length) return focusFirstInvalid();
    setSaving(true);
    try {
      await setupWorkspace({ name: name.trim(), legalName: legalName.trim() || undefined, taxId: taxId || undefined, minCashBalance: minCash ?? 0 });
      toast.success('İşletmeniz hazır', { description: 'İlk hesabınızı ekleyerek başlayın.' });
    } catch (err) {
      toast.error('Kurulum tamamlanamadı', { description: err instanceof Error ? err.message : String(err) });
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="İşletmenizi kurun"
      description="Bu bilgileri daha sonra ayarlardan değiştirebilirsiniz."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Vazgeç
          </Button>
          <Button variant="primary" loading={saving} onClick={submit}>
            İşletmeyi kur
          </Button>
        </>
      }
    >
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field label="İşletme adı" error={errors.name}>
          {(p) => <TextInput {...p} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Deniz Ambalaj" />}
        </Field>
        <Field label="Ticari unvan" optional>
          {(p) => (
            <TextInput
              {...p}
              value={legalName}
              onChange={(e) => setLegalName(e.target.value)}
              placeholder={`${name.trim() || 'Deniz Ambalaj'} San. ve Tic. Ltd. Şti.`}
            />
          )}
        </Field>
        <Field label="Vergi numarası" optional error={errors.taxId}>
          {(p) => <TextInput {...p} inputMode="numeric" value={taxId} onChange={(e) => setTaxId(e.target.value.replace(/\D/g, '').slice(0, 11))} placeholder="10 haneli VKN" />}
        </Field>
        <Field label="Minimum nakit eşiği" hint="Toplam nakit bu seviyenin altına düşecekse Mizan sizi önceden uyarır.">
          {(p) => <MoneyInput {...p} value={minCash} onValueChange={setMinCash} />}
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
