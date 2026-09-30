import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useFinance } from '@/app/finance';
import { Sheet } from '@/ui/Overlay';
import { Button } from '@/ui/Button';
import { DateInput, Field, MoneyInput, Select, TextInput, focusFirstInvalid } from '@/ui/Field';
import { Combobox } from '@/ui/Combobox';
import { Segmented } from '@/ui/Segmented';
import { Monogram, Toggle } from '@/ui/bits';
import { formatDate } from '@/ui/format';
import { addDays } from '@/domain/dates';
import type { CurrencyCode } from '@/domain/money';
import { planAllocation } from '@/domain/documents';
import type { InstrumentDirection, InstrumentKind } from '@/domain/types';
import { createInstrument } from '@/data/repo';
import { TURKISH_BANKS } from '@/data/seed';
import { Money } from '@/ui/Money';

export function InstrumentSheet({ open, onOpenChange, direction }: { open: boolean; onOpenChange: (o: boolean) => void; direction: InstrumentDirection }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={direction === 'received' ? 'Alınan çek / senet' : 'Verilen çek / senet'} description="Vadesinde nakit projeksiyonuna girer; cari bakiyesi hemen kapanır." width={560}>
      {open && <InstrumentForm direction={direction} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function InstrumentForm({ direction, onDone }: { direction: InstrumentDirection; onDone: () => void }) {
  const f = useFinance();
  const banks = f.accounts.filter((a) => a.kind === 'bank' && !a.archived);
  const [kind, setKind] = useState<InstrumentKind>('cheque');
  const [contactId, setContactId] = useState<string | undefined>();
  const [serialNo, setSerialNo] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('TRY');
  // Verilen çek hangi hesaptan ödenecek: açıkça seçilir (banka adından tahmin edilmez)
  const [accountId, setAccountId] = useState(banks[0]?.id ?? '');
  const [bank, setBank] = useState(direction === 'issued' ? (banks[0]?.institution ?? '') : '');
  const [drawer, setDrawer] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [issueDate, setIssueDate] = useState(f.today);
  const [dueDate, setDueDate] = useState(addDays(f.today, 60));
  const [allocate, setAllocate] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const openDocs = useMemo(
    () =>
      contactId
        ? f.documents
            .filter((d) => d.contactId === contactId && d.direction === (direction === 'received' ? 'receivable' : 'payable') && d.currency === currency && !d.cancelled)
            .map((d) => ({ id: d.id, dueDate: d.dueDate, remaining: f.docStates.get(d.id)?.remaining ?? 0 }))
            .filter((d) => d.remaining > 0)
        : [],
    [contactId, f.documents, f.docStates, direction, currency],
  );
  const plan = planAllocation(amount ?? 0, openDocs);

  async function save() {
    const e: Record<string, string> = {};
    if (!contactId) e.contact = direction === 'received' ? 'Evrakı kimden aldığınızı seçin' : 'Evrakı kime verdiğinizi seçin';
    if (!serialNo.trim()) e.serial = kind === 'cheque' ? 'Çekin seri numarasını yazın' : 'Senet numarasını yazın';
    if (!amount || amount <= 0) e.amount = 'Tutarı yazın';
    if (dueDate < issueDate) e.due = 'Vade, alış/veriliş tarihinden önce olamaz';
    setErrors(e);
    if (Object.keys(e).length) return focusFirstInvalid();
    setSaving(true);
    try {
      await createInstrument(
        {
          kind,
          direction,
          serialNo: serialNo.trim(),
          bank: bank || undefined,
          drawer: drawer || f.contactsById.get(contactId!)?.name,
          contactId: contactId!,
          amount: amount!,
          currency,
          rateToBase: f.rates[currency] ?? 1,
          issueDate,
          dueDate,
          status: direction === 'received' ? 'portfolio' : 'issued',
          history: [{ status: direction === 'received' ? 'portfolio' : 'issued', date: issueDate }],
          accountId: direction === 'issued' ? accountId || undefined : undefined,
        },
        allocate ? plan.allocations : [],
      );
      toast.success(`${kind === 'cheque' ? 'Çek' : 'Senet'} kaydedildi`, { description: `Vade ${formatDate(dueDate)}` });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  const bankOptions = [...new Set([...(bank ? [bank] : []), ...TURKISH_BANKS])].map((b) => ({ value: b, label: b }));

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <Segmented label="Tür" value={kind} onChange={setKind} options={[{ value: 'cheque', label: 'Çek' }, { value: 'note', label: 'Senet' }]} />
      <Field label={direction === 'received' ? 'Kimden alındı' : 'Kime verildi'} error={errors.contact}>
        {(p) => (
          <Combobox
            id={p.id}
            invalid={p['aria-invalid']}
            value={contactId}
            onChange={setContactId}
            options={f.contacts.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name, icon: <Monogram name={c.name} size={22} /> }))}
            placeholder="Cari seçin"
            searchPlaceholder="Cari ara…"
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={kind === 'cheque' ? 'Seri no' : 'Senet no'} error={errors.serial}>
          {(p) => <TextInput {...p} autoComplete="off" value={serialNo} onChange={(e) => setSerialNo(e.target.value)} className="num" placeholder={kind === 'cheque' ? '0012345' : 'S-2026/14'} />}
        </Field>
        <Field label="Tutar" error={errors.amount}>
          {(p) => (
            <div className="flex gap-2">
              <div className="min-w-0 flex-1">
                <MoneyInput {...p} value={amount} currency={currency} onValueChange={setAmount} />
              </div>
              <Select aria-label="Para birimi" value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)} className="w-[5.5rem]">
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
              </Select>
            </div>
          )}
        </Field>
        {kind === 'cheque' && direction === 'received' && (
          <Field label="Çekin bankası" optional>
            {(p) => (
              <Combobox
                id={p.id}
                value={bank || undefined}
                onChange={(v) => setBank(v ?? '')}
                options={bankOptions}
                placeholder="Seçin ya da yazın"
                searchPlaceholder="Banka ara…"
                onCreate={(q) => setBank(q)}
                createLabel={(q) => `“${q}” kullan`}
                allowClear
              />
            )}
          </Field>
        )}
        {direction === 'issued' && (
          <Field label="Ödeneceği hesap" hint="Vadesinde bu hesaptan düşer">
            {(p) => (
              <Select
                {...p}
                value={accountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  setBank(f.accountsById.get(e.target.value)?.institution ?? '');
                }}
              >
                {!banks.length && <option value="">Önce bir banka hesabı ekleyin</option>}
                {banks.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
        {direction === 'received' && (
          <Field label="Keşideci" optional hint="Boşsa cari adı kullanılır">
            {(p) => <TextInput {...p} value={drawer} onChange={(e) => setDrawer(e.target.value)} />}
          </Field>
        )}
        <Field label={direction === 'received' ? 'Alış tarihi' : 'Veriliş tarihi'}>{(p) => <DateInput {...p} value={issueDate} today={f.today} onValueChange={setIssueDate} />}</Field>
        <Field label="Vade" error={errors.due}>
          {(p) => (
            <DateInput
              {...p}
              value={dueDate}
              today={issueDate}
              onValueChange={setDueDate}
              presets={[
                { label: '30 gün', days: 30 },
                { label: '60', days: 60 },
                { label: '90', days: 90 },
                { label: '120', days: 120 },
              ]}
            />
          )}
        </Field>
      </div>
      {openDocs.length > 0 && (
        <label className="flex items-start justify-between gap-3 rounded-[14px] border border-line px-4 py-3 text-sm">
          <span>
            Açık {direction === 'received' ? 'faturalarını' : 'borçlarını'} kapat
            <span className="block text-2xs text-muted">
              {plan.allocations.length} belgeye vade sırasıyla dağıtılır
              {plan.unallocated > 0 && (
                <>
                  ; kalan <Money value={plan.unallocated} currency={currency} /> cari bakiyesinden düşülür
                </>
              )}
              .
            </span>
          </span>
          <Toggle checked={allocate} onCheckedChange={setAllocate} label="Dağıt" />
        </label>
      )}
      <div className="sticky -bottom-5 -mx-6 -mb-5 flex justify-end gap-2 border-t border-line bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-6 py-4 backdrop-blur">
        <Button variant="ghost" type="button" onClick={onDone}>
          Vazgeç
        </Button>
        <Button variant="primary" type="submit" loading={saving}>
          Kaydet
        </Button>
      </div>
    </form>
  );
}
