import { useState } from 'react';
import { toast } from 'sonner';
import { CaretDown } from '@phosphor-icons/react';
import { cn } from '@/ui/cn';
import { Sheet } from '@/ui/Overlay';
import { Button } from '@/ui/Button';
import { DateInput, Field, MoneyInput, Select, TextArea, TextInput, focusFirstInvalid } from '@/ui/Field';
import { useFinance } from '@/app/finance';
import { Segmented } from '@/ui/Segmented';
import type { Contact, ContactKind } from '@/domain/types';
import { isValidIban, isValidTaxId, formatIban, normalizeIban } from '@/domain/validators';
import { createContact, updateContact } from '@/data/repo';

export function ContactSheet({ open, onOpenChange, contact }: { open: boolean; onOpenChange: (o: boolean) => void; contact?: Contact | null }) {
  const [round, setRound] = useState(0);
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={contact ? 'Cariyi düzenle' : 'Yeni cari'} width={560}>
      {open && (
        <ContactForm
          key={contact?.id ?? `new-${round}`}
          contact={contact ?? null}
          onDone={() => onOpenChange(false)}
          onNext={() => setRound((r) => r + 1)}
        />
      )}
    </Sheet>
  );
}

function ContactForm({ contact, onDone, onNext }: { contact: Contact | null; onDone: () => void; onNext: () => void }) {
  const f = useFinance();
  const [more, setMore] = useState(() =>
    Boolean(contact && (contact.taxId || contact.taxOffice || contact.email || contact.iban || contact.address || contact.riskLimit || contact.notes)),
  );
  const [s, setS] = useState({
    name: contact?.name ?? '',
    kind: (contact?.kind ?? 'customer') as ContactKind,
    taxId: contact?.taxId ?? '',
    taxOffice: contact?.taxOffice ?? '',
    phone: contact?.phone ?? '',
    email: contact?.email ?? '',
    iban: contact?.iban ? formatIban(contact.iban) : '',
    address: contact?.address ?? '',
    paymentTermDays: contact?.paymentTermDays ?? 30,
    riskLimit: contact?.riskLimit ?? null,
    opening: contact ? Math.abs(contact.openingBalance) : null,
    openingSide: (contact && contact.openingBalance < 0 ? 'we' : 'they') as 'they' | 'we',
    openingDate: contact?.openingDate ?? f.today,
    currency: contact?.currency ?? 'TRY',
    notes: contact?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<typeof s>) => setS((prev) => ({ ...prev, ...p }));

  async function save(next = false) {
    const e: Record<string, string> = {};
    if (!s.name.trim()) e.name = 'Cari adını yazın';
    if (s.taxId && !isValidTaxId(s.taxId)) e.taxId = 'Geçersiz VKN/TCKN';
    if (s.iban && !isValidIban(s.iban)) e.iban = 'IBAN doğrulanamadı; rakamları kontrol edin';
    if (s.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) e.email = 'E-posta adresi geçersiz';
    setErrors(e);
    if (e.taxId || e.iban || e.email) setMore(true);
    if (Object.keys(e).length) return focusFirstInvalid();
    setSaving(true);
    const payload = {
      name: s.name.trim(),
      kind: s.kind,
      taxId: s.taxId || undefined,
      taxOffice: s.taxOffice || undefined,
      phone: s.phone || undefined,
      email: s.email || undefined,
      iban: s.iban ? normalizeIban(s.iban) : undefined,
      address: s.address || undefined,
      paymentTermDays: s.paymentTermDays,
      riskLimit: s.riskLimit ?? undefined,
      currency: s.currency,
      openingBalance: (s.opening ?? 0) * (s.openingSide === 'they' ? 1 : -1),
      // Devir varsa tarihi de saklanır: bu tarihten önceki (sonradan içe aktarılan) hareketler bakiyeye tekrar eklenmez
      openingDate: s.opening ? s.openingDate : undefined,
      notes: s.notes || undefined,
    };
    try {
      if (contact) {
        await updateContact(contact.id, payload);
        toast.success('Cari güncellendi');
      } else {
        await createContact({ ...payload, tags: [], archived: false });
        toast.success(`“${payload.name}” eklendi`, next ? { description: 'Sıradaki cariyi yazabilirsiniz.' } : undefined);
      }
      if (next) onNext();
      else onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <Segmented
        label="Cari türü"
        value={s.kind}
        onChange={(kind) => set({ kind })}
        options={[
          { value: 'customer', label: 'Müşteri' },
          { value: 'supplier', label: 'Tedarikçi' },
          { value: 'both', label: 'İkisi de' },
          { value: 'other', label: 'Diğer' },
        ]}
      />
      <Field label="Ad / unvan" error={errors.name}>
        {(p) => <TextInput {...p} autoFocus value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder="Yıldız Gıda A.Ş." />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Telefon" optional hint="WhatsApp hatırlatmaları için">
          {(p) => <TextInput {...p} type="tel" autoComplete="off" value={s.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+90 5xx xxx xx xx" />}
        </Field>
        <Field label="Ödeme vadesi" hint="Faturadan kaç gün sonra ödenir">
          {(p) => (
            <div className="relative">
              <TextInput {...p} type="number" inputMode="numeric" min={0} max={365} className="pr-12" value={s.paymentTermDays} onChange={(e) => set({ paymentTermDays: Math.max(0, Math.min(365, Number(e.target.value) || 0)) })} />
              <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-muted">gün</span>
            </div>
          )}
        </Field>
      </div>
      <button
        type="button"
        aria-expanded={more}
        onClick={() => setMore((m) => !m)}
        className="-my-1 inline-flex items-center gap-1.5 self-start rounded-[8px] py-1 text-xs font-medium text-cobalt-ink hover:underline"
      >
        <CaretDown size={12} weight="bold" className={cn('transition-transform', more && 'rotate-180')} />
        {more ? 'Ek bilgileri gizle' : 'Vergi, IBAN, e-posta, adres ve risk limiti'}
      </button>
      {more && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="VKN / TCKN" optional error={errors.taxId}>
              {(p) => <TextInput {...p} inputMode="numeric" value={s.taxId} onChange={(e) => set({ taxId: e.target.value.replace(/\D/g, '').slice(0, 11) })} />}
            </Field>
            <Field label="Vergi dairesi" optional>
              {(p) => <TextInput {...p} value={s.taxOffice} onChange={(e) => set({ taxOffice: e.target.value })} />}
            </Field>
            <Field label="E-posta" optional error={errors.email}>
              {(p) => <TextInput {...p} type="email" autoComplete="off" value={s.email} onChange={(e) => set({ email: e.target.value })} />}
            </Field>
            <Field label="Risk limiti" optional hint="Aşılınca uyarı verilir">
              {(p) => <MoneyInput {...p} value={s.riskLimit} onValueChange={(riskLimit) => set({ riskLimit })} />}
            </Field>
          </div>
          <Field label="IBAN" optional error={errors.iban}>
            {(p) => <TextInput {...p} value={s.iban} onChange={(e) => set({ iban: formatIban(e.target.value).slice(0, 32) })} placeholder="TR00 0000 0000 0000 0000 0000 00" className="num" />}
          </Field>
          <Field label="Adres" optional>
            {(p) => <TextInput {...p} value={s.address} onChange={(e) => set({ address: e.target.value })} />}
          </Field>
        </div>
      )}
      <fieldset className="rounded-[16px] border border-line p-4">
        <legend className="px-1 text-xs font-medium text-ink-2">Devir bakiyesi</legend>
        <p className="-mt-1 mb-3 text-2xs text-muted">Mizan’a başlamadan önceki açık bakiye (varsa). Faturaları tek tek girmeniz gerekmez.</p>
        <div className="grid items-end gap-3 sm:grid-cols-[auto_minmax(0,1fr)_7rem]">
          <Segmented
            label="Devir bakiyesinin yönü"
            size="sm"
            value={s.openingSide}
            onChange={(openingSide) => set({ openingSide })}
            options={[
              { value: 'they', label: 'Bize borçlu' },
              { value: 'we', label: 'Biz borçluyuz' },
            ]}
          />
          <MoneyInput aria-label="Devir tutarı" value={s.opening} onValueChange={(opening) => set({ opening })} currency={s.currency} />
          <Select aria-label="Para birimi" value={s.currency} onChange={(e) => set({ currency: e.target.value as typeof s.currency })}>
            <option value="TRY">TRY</option>
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </Select>
        </div>
        {Boolean(s.opening) && (
          <Field className="mt-3" label="Devir tarihi" hint="Bu tarihten önceki hareketleri sonradan içe aktarsanız da bakiye iki kez sayılmaz">
            {(p) => <DateInput {...p} value={s.openingDate} today={f.today} onValueChange={(openingDate) => set({ openingDate })} />}
          </Field>
        )}
      </fieldset>
      <Field label="Not" optional>
        {(p) => <TextArea {...p} rows={2} value={s.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Ödeme günü, muhatap kişi, anlaşma notları…" />}
      </Field>
      <div className="sticky -bottom-5 -mx-6 -mb-5 flex flex-wrap justify-end gap-2 border-t border-line bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-6 py-4 backdrop-blur">
        <Button variant="ghost" type="button" onClick={onDone} className="mr-auto">
          Vazgeç
        </Button>
        {!contact && (
          <Button variant="secondary" type="button" loading={saving} onClick={() => void save(true)}>
            Kaydet ve yenisini ekle
          </Button>
        )}
        <Button variant="primary" type="submit" loading={saving}>
          {contact ? 'Kaydet' : 'Cariyi ekle'}
        </Button>
      </div>
    </form>
  );
}
