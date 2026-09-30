import { useState } from 'react';
import { toast } from 'sonner';
import { Trash } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { Sheet } from '@/ui/Overlay';
import { Button } from '@/ui/Button';
import { DateInput, Field, MoneyInput, Select, TextInput, focusFirstInvalid } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Toggle } from '@/ui/bits';
import { cn } from '@/ui/cn';
import { makeDate } from '@/domain/dates';
import type { FlowDirection, Frequency, RecurringRule, RecurringTemplate } from '@/domain/types';
import type { WeekendPolicy } from '@/domain/dates';
import { createRecurring, deleteRecurring, updateRecurring } from '@/data/repo';

interface Template {
  key: RecurringTemplate;
  title: string;
  day: number;
  frequency: Frequency;
  categoryIcon: string;
  hint: string;
  quarterlyAnchorMonth?: number;
}

/** Türk işletmelerinin tipik yükümlülükleri (tarihleri GİB/SGK duyurularından doğrulayın). */
export const TEMPLATES: Template[] = [
  { key: 'muhtasar', title: 'Muhtasar ve SGK primleri', day: 26, frequency: 'monthly', categoryIcon: 'bank', hint: 'Her ayın 26’sı' },
  { key: 'gecici-vergi', title: 'Geçici vergi', day: 17, frequency: 'quarterly', categoryIcon: 'scales', hint: 'Şubat, Mayıs, Ağustos, Kasım 17’si', quarterlyAnchorMonth: 2 },
  { key: 'kira', title: 'Kira', day: 5, frequency: 'monthly', categoryIcon: 'buildings', hint: 'Aylık' },
  { key: 'maas', title: 'Personel maaşları', day: 31, frequency: 'monthly', categoryIcon: 'users', hint: 'Ay sonu, önceki iş günü' },
  { key: 'kredi', title: 'Kredi taksiti', day: 15, frequency: 'monthly', categoryIcon: 'credit-card', hint: 'Aylık taksit' },
  { key: 'abonelik', title: 'Yazılım abonelikleri', day: 3, frequency: 'monthly', categoryIcon: 'cloud', hint: 'Aylık' },
];

export function RecurringSheet({ open, onOpenChange, rule }: { open: boolean; onOpenChange: (o: boolean) => void; rule?: RecurringRule | null }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={rule ? 'Tekrarlayan kalemi düzenle' : 'Tekrarlayan kalem'} description="Kira, maaş, vergi gibi düzenli yükümlülükler projeksiyona kendiliğinden girer." width={560}>
      {open && <RecurringForm key={rule?.id ?? 'new'} rule={rule ?? null} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function RecurringForm({ rule, onDone }: { rule: RecurringRule | null; onDone: () => void }) {
  const f = useFinance();
  const [s, setS] = useState({
    title: rule?.title ?? '',
    direction: (rule?.direction ?? 'out') as FlowDirection,
    amount: rule?.amount ?? null,
    frequency: (rule?.frequency ?? 'monthly') as Frequency,
    interval: rule?.interval ?? 1,
    anchorDate: rule?.anchorDate ?? f.today,
    endDate: rule?.endDate ?? '',
    accountId: rule?.accountId ?? f.accounts.find((a) => a.kind === 'bank' && !a.archived)?.id ?? '',
    categoryId: rule?.categoryId ?? '',
    contactId: rule?.contactId ?? '',
    weekendPolicy: (rule?.weekendPolicy ?? 'next') as WeekendPolicy,
    autoPost: rule?.autoPost ?? false,
    template: rule?.template as RecurringTemplate | undefined,
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (p: Partial<typeof s>) => setS((prev) => ({ ...prev, ...p }));
  const account = f.accountsById.get(s.accountId);

  function applyTemplate(t: Template) {
    const y = Number(f.today.slice(0, 4));
    const m = Number(f.today.slice(5, 7));
    let anchor = makeDate(y, t.quarterlyAnchorMonth ?? m, Math.min(t.day, 28));
    if (t.day > 28) {
      // "Ay sonu": çapa 31 çeken bir ayda olmalı; yoksa (ör. 30 Eylül) sonraki aylar da 30'una kayar
      let yy = y;
      let mm = m;
      while (new Date(Date.UTC(yy, mm, 0)).getUTCDate() < 31) {
        mm -= 1;
        if (mm < 1) {
          mm = 12;
          yy -= 1;
        }
      }
      anchor = makeDate(yy, mm, 31);
    }
    if (t.frequency === 'quarterly') anchor = makeDate(y, t.quarterlyAnchorMonth!, t.day);
    const cat = f.categories.find((c) => c.icon === t.categoryIcon && c.kind === 'expense');
    set({
      title: t.title,
      frequency: t.frequency,
      anchorDate: anchor,
      direction: 'out',
      categoryId: cat?.id ?? '',
      weekendPolicy: t.key === 'maas' ? 'previous' : 'next',
      template: t.key,
    });
  }

  async function save() {
    const e: Record<string, string> = {};
    if (!s.title.trim()) e.title = 'Kalemi tanıyacağınız bir başlık yazın (ör. Fabrika kirası)';
    if (!s.amount || s.amount <= 0) e.amount = 'Tutarı yazın';
    if (s.endDate && s.endDate < s.anchorDate) e.end = 'Bitiş, başlangıçtan önce olamaz';
    setErrors(e);
    if (Object.keys(e).length) return focusFirstInvalid();
    setSaving(true);
    const payload = {
      title: s.title.trim(),
      direction: s.direction,
      amount: s.amount!,
      currency: account?.currency ?? 'TRY',
      frequency: s.frequency,
      interval: Math.max(1, s.interval),
      anchorDate: s.anchorDate,
      endDate: s.endDate || undefined,
      accountId: s.accountId || undefined,
      categoryId: s.categoryId || undefined,
      contactId: s.contactId || undefined,
      weekendPolicy: s.weekendPolicy,
      autoPost: s.autoPost,
      active: true,
      template: s.template,
    };
    try {
      if (rule) await updateRecurring(rule.id, payload);
      else await createRecurring(payload);
      toast.success('Tekrarlayan kalem kaydedildi');
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      {!rule && (
        <div>
          <div className="mb-2 text-xs font-medium text-ink-2">Hazır şablonlar</div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TEMPLATES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => applyTemplate(t)}
                className={cn('rounded-[12px] border px-3 py-2.5 text-left transition-colors', s.template === t.key ? 'border-cobalt bg-cobalt-soft' : 'border-line hover:border-line-strong')}
              >
                <div className="text-xs font-medium">{t.title}</div>
                <div className="text-2xs text-muted">{t.hint}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      <Segmented label="Yön" value={s.direction} onChange={(direction) => set({ direction })} options={[{ value: 'out', label: 'Ödeme (çıkış)' }, { value: 'in', label: 'Tahsilat (giriş)' }]} />
      <Field label="Başlık" error={errors.title}>{(p) => <TextInput {...p} value={s.title} onChange={(e) => set({ title: e.target.value })} placeholder="Fabrika kirası" />}</Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tutar" error={errors.amount}>{(p) => <MoneyInput {...p} value={s.amount} currency={account?.currency ?? 'TRY'} onValueChange={(amount) => set({ amount })} />}</Field>
        <Field label="Hesap">
          {(p) => (
            <Select {...p} value={s.accountId} onChange={(e) => set({ accountId: e.target.value })}>
              {f.accounts.filter((a) => !a.archived).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Sıklık">
          {(p) => (
            <Select {...p} value={s.frequency} onChange={(e) => set({ frequency: e.target.value as Frequency })}>
              <option value="weekly">Haftalık</option>
              <option value="monthly">Aylık</option>
              <option value="quarterly">Üç aylık</option>
              <option value="yearly">Yıllık</option>
            </Select>
          )}
        </Field>
        <Field label="İlk tarih" hint="Ay sonu için 31 seçin; kısa aylarda son güne kayar">
          {(p) => <DateInput {...p} value={s.anchorDate} today={f.today} onValueChange={(anchorDate) => set({ anchorDate })} />}
        </Field>
        <Field label="Kategori" optional>
          {(p) => (
            <Select {...p} value={s.categoryId} onChange={(e) => set({ categoryId: e.target.value })}>
              <option value="">—</option>
              {f.categories.filter((c) => c.kind === (s.direction === 'in' ? 'income' : 'expense')).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Cari" optional>
          {(p) => (
            <Select {...p} value={s.contactId} onChange={(e) => set({ contactId: e.target.value })}>
              <option value="">—</option>
              {f.contacts.filter((c) => !c.archived).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Hafta sonu / tatil">
          {(p) => (
            <Select {...p} value={s.weekendPolicy} onChange={(e) => set({ weekendPolicy: e.target.value as WeekendPolicy })}>
              <option value="next">Sonraki iş gününe kaydır</option>
              <option value="previous">Önceki iş gününe al</option>
              <option value="none">Kaydırma</option>
            </Select>
          )}
        </Field>
        <Field label="Bitiş" optional error={errors.end} hint={!errors.end ? 'Boşsa süresiz devam eder' : undefined}>
          {(p) => <TextInput {...p} type="date" value={s.endDate} onChange={(e) => set({ endDate: e.target.value })} />}
        </Field>
      </div>
      <label className="flex items-center justify-between gap-3 rounded-[14px] border border-line px-4 py-3 text-sm">
        <span>
          Otomatik ödeniyor
          <span className="block text-2xs text-muted">Talimatlı ödemeler: vadesi gelince onay beklemeden gerçekleşmiş sayılır.</span>
        </span>
        <Toggle checked={s.autoPost} onCheckedChange={(autoPost) => set({ autoPost })} label="Otomatik ödeniyor" />
      </label>
      <div className="sticky -bottom-5 -mx-6 -mb-5 flex justify-between gap-2 border-t border-line bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-6 py-4 backdrop-blur">
        {rule ? (
          <Button
            type="button"
            variant="ghost"
            icon={<Trash size={16} />}
            onClick={async () => {
              await deleteRecurring(rule.id);
              toast('Tekrarlayan kalem silindi');
              onDone();
            }}
          >
            Sil
          </Button>
        ) : (
          <span />
        )}
        <Button variant="primary" type="submit" loading={saving}>
          Kaydet
        </Button>
      </div>
    </form>
  );
}
