import { useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle, SignOut, UserPlus, ArrowsClockwise, LinkBreak } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { Panel, PanelHeader } from '@/ui/Panel';
import { Button } from '@/ui/Button';
import { Field, Select, TextInput } from '@/ui/Field';
import { Badge } from '@/ui/bits';
import { CloudAuthForm, RemoteWorkspacePicker, Steps } from '@/cloud/ui';
import { addTeamMember, envCloudConfig, saveCloudConfig, syncNow, useCloud } from '@/cloud/store';

/** Bulut kurulumu yapılmış mı? Bağlantı bilgisi yalnızca kurulumu yapan kişinin ayarından (.env) gelir. */
export function cloudAvailable(saved?: { url?: string; anonKey?: string } | null): boolean {
  return Boolean(envCloudConfig() || (saved?.url && saved.anonKey));
}

/**
 * Hesap ve eşitleme. Kullanıcıya teknik bağlantı adımı (proje adresi, anahtar) gösterilmez:
 * kurulum yapılmamışsa bölüm hiç görünmez (bkz. KURULUM.md).
 */
export function CloudSection({ index }: { index: number }) {
  const f = useFinance();
  const cloud = useCloud();
  const cfg = f.settings.cloud;
  const linked = Boolean(cfg?.linked.includes(f.workspace.id));
  if (!cloudAvailable(cfg)) return null;
  const step = !cloud.session ? 0 : 1;

  return (
    <Panel reveal={index} id="bulut" className="scroll-mt-24">
      <PanelHeader
        title="Hesap ve eşitleme"
        description={
          <span className="flex flex-wrap items-center gap-2">
            {linked && cloud.session ? <Badge tone="in" icon={<CheckCircle size={12} />}>Bu işletme eşitleniyor</Badge> : <Badge tone="muted">Yalnızca bu cihaz</Badge>}
            Verilerinizi telefon, ofis bilgisayarı ve ekip arkadaşlarınızla güvenle paylaşın.
          </span>
        }
      />
      <Steps steps={['Hesap', 'İşletmeyi bağla']} current={step} />

      {step === 0 && (
        <div className="space-y-3">
          <p className="text-xs text-muted">Hesabınızla giriş yapın. İlk kez kullanıyorsanız “Hesap oluştur” deyin.</p>
          <CloudAuthForm />
        </div>
      )}
      {step === 1 && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-sunken px-4 py-3 text-sm">
            <span>
              Giriş yapıldı: <strong>{cloud.session?.user.email}</strong>
            </span>
            <Button size="sm" variant="ghost" icon={<SignOut size={14} />} onClick={() => void cloud.client?.auth.signOut()}>
              Çıkış yap
            </Button>
          </div>

          {f.settings.isDemo ? (
            <p className="rounded-[14px] border border-saffron/40 bg-saffron-soft/50 px-4 py-3 text-xs text-ink-2">
              Demo işletme buluta yüklenmez. Kendi işletmenizi kurduğunuzda ya da buluttaki bir işletmeyi indirdiğinizde eşitleme başlar.
            </p>
          ) : linked ? (
            <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-line px-4 py-3 text-sm">
              <CheckCircle size={18} className="text-inflow-text" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{f.workspace.name} bulutla eşitleniyor</div>
                <div className="text-2xs text-muted">
                  {cloud.status === 'syncing'
                    ? 'Eşitleniyor…'
                    : cloud.error
                      ? cloud.error
                      : cloud.lastSyncAt
                        ? `Son eşitleme ${new Date(cloud.lastSyncAt).toLocaleTimeString('tr-TR')}${cloud.lastResult ? ` · ${cloud.lastResult.pushed} gönderildi, ${cloud.lastResult.pulled} alındı` : ''}`
                        : 'Değişiklikler otomatik eşitlenir'}
                </div>
              </div>
              <Button size="sm" variant="secondary" icon={<ArrowsClockwise size={14} />} loading={cloud.status === 'syncing'} onClick={() => void syncNow(f.workspace.id)}>
                Şimdi eşitle
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<LinkBreak size={14} />}
                onClick={async () => {
                  await saveCloudConfig({ linked: (cfg?.linked ?? []).filter((id) => id !== f.workspace.id) });
                  toast('Bu cihazda eşitleme durduruldu', { description: 'Buluttaki veri silinmedi.' });
                }}
              >
                Eşitlemeyi durdur
              </Button>
            </div>
          ) : (
            <div className="rounded-[16px] border border-cobalt/30 bg-cobalt-soft/40 p-4">
              <div className="text-sm font-semibold">“{f.workspace.name}” işletmesini buluta bağlayın</div>
              <p className="mt-1 text-xs text-muted">Tüm kayıtlar güvenli şekilde yüklenir; sonrasında değişiklikler her cihazda otomatik eşitlenir.</p>
              <Button
                className="mt-3"
                variant="primary"
                loading={cloud.status === 'syncing'}
                onClick={async () => {
                  await saveCloudConfig({ linked: [...new Set([...(cfg?.linked ?? []), f.workspace.id])] });
                  const r = await syncNow(f.workspace.id);
                  if (r) toast.success('İşletme buluta yüklendi', { description: `${r.pushed} kayıt gönderildi.` });
                  else toast.error('Yükleme tamamlanamadı', { description: useCloud.getState().error ?? '' });
                }}
              >
                Buluta yükle ve eşitlemeyi başlat
              </Button>
            </div>
          )}

          <div>
            <div className="mb-2 text-xs font-semibold text-muted">Buluttaki işletmelerim</div>
            <RemoteWorkspacePicker localIds={[f.workspace.id]} />
          </div>

          {linked && <TeamInvite workspaceId={f.workspace.id} />}
        </div>
      )}
    </Panel>
  );
}

function TeamInvite({ workspaceId }: { workspaceId: string }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'editor' | 'viewer'>('editor');
  const [busy, setBusy] = useState(false);
  return (
    <div className="rounded-[16px] border border-line p-4">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <UserPlus size={16} /> Ekip üyesi ekle
      </div>
      <p className="mt-1 text-xs text-muted">Kişi önce Mizan’da hesap oluşturmalı. Muhasebeciniz için “Görüntüleyici” önerilir.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_180px_auto] sm:items-end">
        <Field label="E-posta">{(p) => <TextInput {...p} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
        <Field label="Yetki">
          {(p) => (
            <Select {...p} value={role} onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}>
              <option value="editor">Düzenleyici</option>
              <option value="viewer">Görüntüleyici</option>
            </Select>
          )}
        </Field>
        <Button
          variant="secondary"
          loading={busy}
          disabled={!email}
          onClick={async () => {
            setBusy(true);
            try {
              await addTeamMember(workspaceId, email.trim(), role);
              toast.success(`${email} eklendi`);
              setEmail('');
            } catch (e) {
              toast.error('Eklenemedi', { description: e instanceof Error ? e.message : '' });
            } finally {
              setBusy(false);
            }
          }}
        >
          Ekle
        </Button>
      </div>
    </div>
  );
}
