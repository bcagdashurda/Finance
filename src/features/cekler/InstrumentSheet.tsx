import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useFinance } from '@/app/finance';
import { Sheet } from '@/ui/Overlay';
import { Button } from '@/ui/Button';
import { DateInput, Field, MoneyInput, TextInput } from '@/ui/Field';
import { Combobox } from '@/ui/Combobox';
import { Segmented } from '@/ui/Segmented';
import { Monogram, Toggle } from '@/ui/bits';
import { addDays } from '@/domain/dates';
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
  const [kind, setKind] = useState<InstrumentKind>('cheque');
  const [contactId, setContactId] = useState<string | undefined>();
  const [serialNo, setSerialNo] = useState('');
  const [bank, setBank] = useState(direction === 'issued' ? (f.accounts.find((a) => a.kind === 'bank')?.institution ?? '') : '');
  const [drawer, setDrawer] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [issueDate, setIssueDate] = useState(f.today);
  const [dueDate, setDueDate] = useState(addDays(f.today, 60));
  const [allocate, setAllocate] = useState(true);
  const [saving, setSaving] = useState(false);

  const openDocs = useMemo(
    () =>
      contactId
        ? f.documents
            .filter((d) => d.contactId === contactId && d.direction === (direction === 'received' ? 'receivable' : 'payable') && d.currency === 'TRY' && !d.cancelled)
            .map((d) => ({ id: d.id, dueDate: d.dueDate, remaining: f.docStates.get(d.id)?.remaining ?? 0 }))
            .filter((d) => d.remaining > 0)
        : [],
    [contactId, f.documents, f.docStates, direction],
  );
  const plan = planAllocation(amount ?? 0, openDocs);

  async function save() {
    if (!contactId || !amount || !serialNo.trim()) {
      toast.error('Cari, seri no ve tutar gerekli');
      return;
    }
    setSaving(true);
    try {
      await createInstrument(
        {
          kind,
          direction,
          serialNo: serialNo.trim(),
          bank: bank || undefined,
          drawer: drawer || f.contactsById.get(contactId)?.name,
          contactId,
          amount,
          currency: 'TRY',
          rateToBase: 1,
          issueDate,
          dueDate,
          status: direction === 'received' ? 'portfolio' : 'issued',
          history: [{ status: direction === 'received' ? 'portfolio' : 'issued', date: issueDate }],
          accountId: direction === 'issued' ? f.accounts.find((a) => a.kind === 'bank' && a.institution === bank)?.id : undefined,
        },
        allocate ? plan.allocations : [],
      );
      toast.success(`${kind === 'cheque' ? 'Çek' : 'Senet'} kaydedildi`, { description: `Vade ${dueDate}` });
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <Segmented label="Tür" value={kind} onChange={setKind} options={[{ value: 'cheque', label: 'Çek' }, { value: 'note', label: 'Senet' }]} />
      <Field label={direction === 'received' ? 'Kimden alındı' : 'Kime verildi'}>
        {(p) => (
          <Combobox
            id={p.id}
            value={contactId}
            onChange={setContactId}
            options={f.contacts.filter((c) => !c.archived).map((c) => ({ value: c.id, label: c.name, icon: <Monogram name={c.name} size={22} /> }))}
            placeholder="Cari seçin"
          />
        )}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Seri / senet no">{(p) => <TextInput {...p} value={serialNo} onChange={(e) => setSerialNo(e.target.value)} className="num" />}</Field>
        <Field label="Tutar">{(p) => <MoneyInput {...p} value={amount} onValueChange={setAmount} />}</Field>
        {kind === 'cheque' && (
          <Field label="Banka" optional>
            {(p) => (
              <>
                <TextInput {...p} list="cheque-banks" value={bank} onChange={(e) => setBank(e.target.value)} />
                <datalist id="cheque-banks">
                  {TURKISH_BANKS.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
        )}
        {direction === 'received' && (
          <Field label="Keşideci" optional hint="Boşsa cari adı kullanılır">
            {(p) => <TextInput {...p} value={drawer} onChange={(e) => setDrawer(e.target.value)} />}
          </Field>
        )}
        <Field label={direction === 'received' ? 'Alış tarihi' : 'Veriliş tarihi'}>{(p) => <DateInput {...p} value={issueDate} today={f.today} onValueChange={setIssueDate} />}</Field>
        <Field label="Vade">
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
                  ; kalan <Money value={plan.unallocated} /> avans olur
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
