import { useState } from 'react';
import { toast } from 'sonner';
import { Sheet } from '@/ui/Overlay';
import { Button } from '@/ui/Button';
import { Field, MoneyInput, Select, TextArea, TextInput } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import type { Contact, ContactKind } from '@/domain/types';
import { isValidIban, isValidTaxId, formatIban, normalizeIban } from '@/domain/validators';
import { createContact, updateContact } from '@/data/repo';

export function ContactSheet({ open, onOpenChange, contact }: { open: boolean; onOpenChange: (o: boolean) => void; contact?: Contact | null }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={contact ? 'Cariyi düzenle' : 'Yeni cari'} width={560}>
      {open && <ContactForm key={contact?.id ?? 'new'} contact={contact ?? null} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function ContactForm({ contact, onDone }: { contact: Contact | null; onDone: () => void }) {
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
    currency: contact?.currency ?? 'TRY',
    notes: contact?.notes ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<typeof s>) => setS((prev) => ({ ...prev, ...p }));

  async function save() {
    const e: Record<string, string> = {};
    if (!s.name.trim()) e.name = 'Cari adını yazın';
    if (s.taxId && !isValidTaxId(s.taxId)) e.taxId = 'Geçersiz VKN/TCKN';
    if (s.iban && !isValidIban(s.iban)) e.iban = 'IBAN doğrulanamadı; rakamları kontrol edin';
    if (s.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s.email)) e.email = 'E-posta adresi geçersiz';
    setErrors(e);
    if (Object.keys(e).length) return;
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
      notes: s.notes || undefined,
    };
    try {
      if (contact) {
        await updateContact(contact.id, payload);
        toast.success('Cari güncellendi');
      } else {
        await createContact({ ...payload, tags: [], archived: false });
        toast.success(`“${payload.name}” eklendi`);
      }
      onDone();
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
        <Field label="VKN / TCKN" optional error={errors.taxId}>
          {(p) => <TextInput {...p} inputMode="numeric" value={s.taxId} onChange={(e) => set({ taxId: e.target.value.replace(/\D/g, '').slice(0, 11) })} />}
        </Field>
        <Field label="Vergi dairesi" optional>
          {(p) => <TextInput {...p} value={s.taxOffice} onChange={(e) => set({ taxOffice: e.target.value })} />}
        </Field>
        <Field label="Telefon" optional hint="WhatsApp hatırlatmaları için">
          {(p) => <TextInput {...p} type="tel" value={s.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="+90 5xx xxx xx xx" />}
        </Field>
        <Field label="E-posta" optional error={errors.email}>
          {(p) => <TextInput {...p} type="email" value={s.email} onChange={(e) => set({ email: e.target.value })} />}
        </Field>
      </div>
      <Field label="IBAN" optional error={errors.iban}>
        {(p) => <TextInput {...p} value={s.iban} onChange={(e) => set({ iban: formatIban(e.target.value).slice(0, 32) })} placeholder="TR00 0000 0000 0000 0000 0000 00" className="num" />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Vade (gün)">
          {(p) => <TextInput {...p} type="number" min={0} max={365} value={s.paymentTermDays} onChange={(e) => set({ paymentTermDays: Number(e.target.value) })} />}
        </Field>
        <Field label="Risk limiti" optional>
          {(p) => <MoneyInput {...p} value={s.riskLimit} onValueChange={(riskLimit) => set({ riskLimit })} />}
        </Field>
        <Field label="Para birimi">
          {(p) => (
            <Select {...p} value={s.currency} onChange={(e) => set({ currency: e.target.value as typeof s.currency })}>
              <option value="TRY">TRY</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </Select>
          )}
        </Field>
      </div>
      <div className="rounded-[16px] border border-line p-4">
        <div className="mb-3 text-xs font-medium text-ink-2">Açılış bakiyesi</div>
        <div className="grid items-end gap-3 sm:grid-cols-2">
          <Segmented
            label="Açılış bakiyesi yönü"
            size="sm"
            value={s.openingSide}
            onChange={(openingSide) => set({ openingSide })}
            options={[
              { value: 'they', label: 'Bize borçlu' },
              { value: 'we', label: 'Biz borçluyuz' },
            ]}
          />
          <MoneyInput aria-label="Açılış tutarı" value={s.opening} onValueChange={(opening) => set({ opening })} currency={s.currency} />
        </div>
      </div>
      <Field label="Adres" optional>
        {(p) => <TextInput {...p} value={s.address} onChange={(e) => set({ address: e.target.value })} />}
      </Field>
      <Field label="Not" optional>
        {(p) => <TextArea {...p} rows={2} value={s.notes} onChange={(e) => set({ notes: e.target.value })} />}
      </Field>
      <div className="sticky bottom-0 -mx-6 -mb-5 flex justify-end gap-2 border-t border-line bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-6 py-4 backdrop-blur">
        <Button variant="ghost" type="button" onClick={onDone}>
          Vazgeç
        </Button>
        <Button variant="primary" type="submit" loading={saving}>
          {contact ? 'Kaydet' : 'Cariyi ekle'}
        </Button>
      </div>
    </form>
  );
}
