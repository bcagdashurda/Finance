import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CloudArrowDown, CloudCheck, CloudSlash, CloudX, ArrowsClockwise, LockSimple } from '@phosphor-icons/react';
import { Button } from '@/ui/Button';
import { Field, TextInput } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Tip } from '@/ui/bits';
import { cn } from '@/ui/cn';
import { relativeDay } from '@/ui/format';
import { toISODate } from '@/domain/dates';
import { db } from '@/data/db';
import { SETTINGS_KEYS } from '@/data/keys';
import { setActiveWorkspace } from '@/data/repo';
import { SupabaseRemote } from './remote';
import { syncWorkspace } from './sync';
import { listRemoteWorkspaces, saveCloudConfig, useCloud } from './store';

/** Sol menüdeki küçük durum göstergesi. */
export function CloudStatusBadge({ linked, collapsed }: { linked: boolean; collapsed?: boolean }) {
  const { status, lastSyncAt, error } = useCloud();
  if (!linked || status === 'off') {
    return (
      <Tip content="Tüm verileriniz yalnızca bu cihazda, tarayıcınızın veritabanında saklanır. Düzenli yedek alın: Ayarlar › Veri ve yedek.">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-2xs text-muted">
          <LockSimple size={13} weight="bold" className="text-inflow-text" />
          {!collapsed && 'Veriler bu cihazda'}
        </span>
      </Tip>
    );
  }
  const map = {
    'signed-out': { icon: <CloudX size={14} className="text-saffron-text" />, text: 'Buluta giriş yapın' },
    idle: { icon: <CloudCheck size={14} weight="bold" className="text-inflow-text" />, text: lastSyncAt ? `Senkron · ${ago(lastSyncAt)}` : 'Bulut bağlı' },
    syncing: { icon: <ArrowsClockwise size={14} className="animate-spin text-cobalt" />, text: 'Eşitleniyor…' },
    error: { icon: <CloudSlash size={14} className="text-outflow-text" />, text: 'Senkron hatası' },
    offline: { icon: <CloudSlash size={14} className="text-muted" />, text: 'Çevrimdışı' },
    off: { icon: null, text: '' },
  } as const;
  const m = map[status];
  return (
    <Tip content={error ?? 'Değişiklikler buluta otomatik eşitlenir.'}>
      <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-2xs text-muted">
        {m.icon}
        {!collapsed && m.text}
      </span>
    </Tip>
  );
}

function ago(iso: string): string {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return 'az önce';
  if (s < 3600) return `${Math.round(s / 60)} dk önce`;
  return relativeDay(toISODate(new Date(iso)), toISODate(new Date())).toLocaleLowerCase('tr-TR');
}

/** E-posta + şifre ile giriş / kayıt. */
export function CloudAuthForm({ onDone }: { onDone?: () => void }) {
  const client = useCloud((s) => s.client);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  if (!client) return null;

  async function submit() {
    if (!email || password.length < 6) {
      toast.error('E-posta ve en az 6 karakterli şifre girin');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'in') {
        const { error } = await client!.auth.signInWithPassword({ email, password });
        if (error) throw new Error(/Invalid login/i.test(error.message) ? 'E-posta ya da şifre hatalı' : /Email not confirmed/i.test(error.message) ? 'E-postanıza gelen doğrulama bağlantısına tıklayın' : error.message);
        toast.success('Giriş yapıldı');
      } else {
        const { data, error } = await client!.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw new Error(error.message);
        if (!data.session) toast.success('Hesap oluşturuldu', { description: 'E-postanıza gelen doğrulama bağlantısına tıklayıp giriş yapın.' });
        else toast.success('Hesap oluşturuldu ve giriş yapıldı');
      }
      onDone?.();
    } catch (e) {
      toast.error(mode === 'in' ? 'Giriş yapılamadı' : 'Hesap oluşturulamadı', { description: e instanceof Error ? e.message : '' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
      <Segmented label="Giriş türü" size="sm" value={mode} onChange={setMode} options={[{ value: 'in', label: 'Giriş yap' }, { value: 'up', label: 'Hesap oluştur' }]} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="E-posta">{(p) => <TextInput {...p} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Şifre" hint={mode === 'up' ? 'En az 6 karakter' : undefined}>
          {(p) => <TextInput {...p} type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />}
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {mode === 'in' ? (
          <button
            type="button"
            className="text-2xs text-cobalt-ink underline"
            onClick={async () => {
              if (!email) return toast('Önce e-postanızı yazın');
              const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
              if (error) toast.error(error.message);
              else toast.success('Şifre sıfırlama bağlantısı gönderildi');
            }}
          >
            Şifremi unuttum
          </button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary" loading={busy}>
          {mode === 'in' ? 'Giriş yap' : 'Hesap oluştur'}
        </Button>
      </div>
    </form>
  );
}

/** Buluttaki işletmeleri listeler; seçileni bu cihaza indirip etkin yapar. */
export function RemoteWorkspacePicker({ localIds, onDownloaded }: { localIds: string[]; onDownloaded?: () => void }) {
  const client = useCloud((s) => s.client);
  const session = useCloud((s) => s.session);
  const [list, setList] = useState<Array<{ id: string; name: string; updated_at: string }> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    listRemoteWorkspaces()
      .then(setList)
      .catch((e) => toast.error('Buluttaki işletmeler alınamadı', { description: e instanceof Error ? e.message : '' }));
  }, [session]);

  if (!session) return null;
  if (!list) return <p className="text-xs text-muted">Buluttaki işletmeler yükleniyor…</p>;
  if (!list.length) return <p className="text-xs text-muted">Bu hesapta henüz buluta yüklenmiş işletme yok.</p>;

  return (
    <ul className="divide-y divide-line rounded-[14px] border border-line">
      {list.map((w) => {
        const here = localIds.includes(w.id);
        return (
          <li key={w.id} className="flex items-center gap-3 px-4 py-3 text-sm">
            <CloudArrowDown size={18} className="text-cobalt" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{w.name}</div>
              <div className="text-2xs text-muted">Son değişiklik {relativeDay(toISODate(new Date(w.updated_at)), toISODate(new Date())).toLocaleLowerCase('tr-TR')}</div>
            </div>
            <Button
              size="sm"
              variant={here ? 'ghost' : 'primary'}
              loading={busy === w.id}
              disabled={Boolean(busy)}
              onClick={async () => {
                if (!client) return;
                setBusy(w.id);
                try {
                  const r = await syncWorkspace({ db, remote: new SupabaseRemote(client), workspaceId: w.id });
                  const cfgRow = await db.settings.get(SETTINGS_KEYS.cloud);
                  const linked = new Set(((cfgRow?.value as { linked?: string[] } | undefined)?.linked ?? []).concat(w.id));
                  await saveCloudConfig({ linked: [...linked] });
                  await db.settings.put({ key: SETTINGS_KEYS.demo, value: false });
                  await db.settings.put({ key: SETTINGS_KEYS.activeWorkspace, value: w.id });
                  setActiveWorkspace(w.id);
                  toast.success(`“${w.name}” bu cihaza indirildi`, { description: `${r.pulled} kayıt alındı` });
                  onDownloaded?.();
                } catch (e) {
                  toast.error('İndirilemedi', { description: e instanceof Error ? e.message : '' });
                } finally {
                  setBusy(null);
                }
              }}
            >
              {here ? 'Bu cihazda · aç' : 'Bu cihaza indir'}
            </Button>
          </li>
        );
      })}
    </ul>
  );
}

/** Adım göstergesi (yapılandırma akışları için). */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-5 flex flex-wrap items-center gap-2 text-2xs">
      {steps.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <span
            className={cn(
              'flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold',
              i < current ? 'border-inflow bg-inflow text-white' : i === current ? 'border-cobalt text-cobalt-ink' : 'border-line-strong text-muted',
            )}
          >
            {i < current ? '✓' : i + 1}
          </span>
          <span className={i === current ? 'font-medium text-ink' : 'text-muted'}>{s}</span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-6 bg-line-strong" />}
        </li>
      ))}
    </ol>
  );
}
