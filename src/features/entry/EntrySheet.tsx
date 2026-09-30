import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { ArrowRight, CheckCircle, Camera } from '@phosphor-icons/react';
import { useAi } from '@/ai/useAi';
import { Tip } from '@/ui/bits';
import { CATEGORY_KEYWORDS, normalizeTr } from '@/domain/nlp';
import { useFinance, type Finance } from '@/app/finance';
import { useUI, type EntryDraft, type EntryKind } from '@/app/ui-store';
import { Sheet } from '@/ui/Overlay';
import { Segmented } from '@/ui/Segmented';
import { DateInput, Field, MoneyInput, Select, TextArea, TextInput } from '@/ui/Field';
import { Combobox, type ComboOption } from '@/ui/Combobox';
import { Button } from '@/ui/Button';
import { Money } from '@/ui/Money';
import { Stamp } from '@/ui/Stamp';
import { Dot, Monogram } from '@/ui/bits';
import { CategoryIcon } from '@/ui/icons';
import { cn, slotColor } from '@/ui/cn';
import { formatDateShort, formatDayMonth, relativeDay } from '@/ui/format';
import { addDays, type ISODate } from '@/domain/dates';
import { convertMinor, formatShort, formatMoney, type CurrencyCode, type Money as MoneyValue } from '@/domain/money';
import { planAllocation } from '@/domain/documents';
import type { ContactKind, ID, VatRate } from '@/domain/types';
import {
  createContact,
  createDocument,
  createTransaction,
  deleteDocument,
  deleteTransactions,
  restoreSnapshot,
  updateDocument,
  updateTransaction,
} from '@/data/repo';

const KIND_OPTIONS: Array<{ value: EntryKind; label: string }> = [
  { value: 'collect', label: 'Tahsilat' },
  { value: 'pay', label: 'Ödeme' },
  { value: 'income', label: 'Gelir' },
  { value: 'expense', label: 'Gider' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'receivable', label: 'Alacak' },
  { value: 'payable', label: 'Borç' },
];

const KIND_HELP: Record<EntryKind, string> = {
  collect: 'Müşteriden gelen para. Açık faturalarına vade sırasıyla dağıtılır.',
  pay: 'Tedarikçiye giden para. Açık borçlarına vade sırasıyla dağıtılır.',
  income: 'Cariye bağlı olmayan gelir: peşin satış, faiz, iade.',
  expense: 'Cariye bağlı olmayan gider: yakıt, yemek, fatura, masraf.',
  transfer: 'Kendi hesaplarınız arasında para hareketi.',
  receivable: 'Kestiğiniz fatura ya da alacağınız. Vadesinde nakit projeksiyonuna girer.',
  payable: 'Gelen fatura ya da ödeyeceğiniz yükümlülük. Vadesinde projeksiyona girer.',
};

const isDocKind = (k: EntryKind) => k === 'receivable' || k === 'payable';
const isLedgerKind = (k: EntryKind) => k === 'collect' || k === 'pay';
const incomeSide = (k: EntryKind) => k === 'collect' || k === 'income' || k === 'receivable';

function defaultAccount(f: Finance, currency?: CurrencyCode): ID | undefined {
  const active = f.accounts.filter((a) => !a.archived);
  return (
    active.find((a) => a.kind === 'bank' && (!currency || a.currency === currency)) ??
    active.find((a) => !currency || a.currency === currency) ??
    active[0]
  )?.id;
}

interface FormState {
  kind: EntryKind;
  amount: MoneyValue | null;
  date: ISODate;
  dueDate: ISODate;
  dueTouched: boolean;
  contactId?: ID;
  categoryId?: ID;
  accountId?: ID;
  toAccountId?: ID;
  toAmount: MoneyValue | null;
  description: string;
  number: string;
  vatRate: VatRate;
  probability: number;
  docCurrency: CurrencyCode;
  allocations: Record<ID, MoneyValue>;
  allocTouched: boolean;
}

function initialState(f: Finance, d: EntryDraft): FormState {
  const date = d.date ?? f.today;
  const contact = d.contactId ? f.contactsById.get(d.contactId) : undefined;
  const term = contact?.paymentTermDays ?? 30;
  return {
    kind: d.kind,
    amount: d.amount ?? null,
    date,
    dueDate: d.dueDate ?? addDays(date, term),
    dueTouched: Boolean(d.dueDate),
    contactId: d.contactId,
    categoryId: d.categoryId,
    accountId: d.accountId ?? defaultAccount(f, d.currency),
    toAccountId: d.toAccountId,
    toAmount: null,
    description: d.description ?? '',
    number: '',
    vatRate: 20,
    probability: 100,
    docCurrency: d.currency ?? 'TRY',
    allocations: {},
    allocTouched: false,
  };
}

function fromExisting(f: Finance, d: EntryDraft): FormState | null {
  if (d.editTransactionId) {
    const t = f.transactions.find((x) => x.id === d.editTransactionId);
    if (!t) return null;
    const kind: EntryKind =
      t.kind === 'transfer' ? 'transfer' : t.affectsLedger ? (t.kind === 'income' ? 'collect' : 'pay') : t.kind;
    const allocations: Record<ID, MoneyValue> = {};
    for (const a of f.allocations) if (a.transactionId === t.id) allocations[a.documentId] = a.amount;
    return {
      ...initialState(f, { kind }),
      kind,
      amount: t.amount,
      date: t.date,
      contactId: t.contactId,
      categoryId: t.categoryId,
      accountId: t.accountId,
      toAccountId: t.toAccountId,
      toAmount: t.toAmount ?? null,
      description: t.description,
      allocations,
      allocTouched: true,
    };
  }
  if (d.editDocumentId) {
    const doc = f.documents.find((x) => x.id === d.editDocumentId);
    if (!doc) return null;
    return {
      ...initialState(f, { kind: doc.direction }),
      kind: doc.direction,
      amount: doc.amount,
      date: doc.issueDate,
      dueDate: doc.dueDate,
      dueTouched: true,
      contactId: doc.contactId,
      categoryId: doc.categoryId,
      accountId: doc.expectedAccountId ?? defaultAccount(f, doc.currency),
      description: doc.title,
      number: doc.number ?? '',
      vatRate: doc.vatRate ?? 20,
      probability: doc.probability ?? 100,
      docCurrency: doc.currency,
    };
  }
  return null;
}

export function EntrySheet() {
  const entry = useUI((s) => s.entry);
  const close = useUI((s) => s.closeEntry);
  const editing = Boolean(entry?.editDocumentId || entry?.editTransactionId);
  return (
    <Sheet
      open={Boolean(entry)}
      onOpenChange={(o) => !o && close()}
      title={editing ? 'Kaydı düzenle' : 'Yeni kayıt'}
      description={editing ? undefined : 'Tutarı, “45 bin” ya da “1,5 milyon” gibi de yazabilirsiniz.'}
      width={580}
    >
      {entry && <EntryForm key={JSON.stringify(entry)} draft={entry} onDone={close} />}
    </Sheet>
  );
}

function EntryForm({ draft, onDone }: { draft: EntryDraft; onDone: () => void }) {
  const f = useFinance();
  const editing = Boolean(draft.editDocumentId || draft.editTransactionId);
  const [s, setS] = useState<FormState>(() => fromExisting(f, draft) ?? initialState(f, draft));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [stamp, setStamp] = useState<null | { label: string; tone: 'in' | 'out' | 'cobalt' }>(null);
  const set = (patch: Partial<FormState>) => setS((prev) => ({ ...prev, ...patch }));

  const account = s.accountId ? f.accountsById.get(s.accountId) : undefined;
  const toAccount = s.toAccountId ? f.accountsById.get(s.toAccountId) : undefined;
  const currency: CurrencyCode = isDocKind(s.kind) ? s.docCurrency : (account?.currency ?? 'TRY');
  const contact = s.contactId ? f.contactsById.get(s.contactId) : undefined;

  // Vade: cari değişince ödeme vadesine göre öner
  useEffect(() => {
    if (!isDocKind(s.kind) || s.dueTouched) return;
    const term = contact?.paymentTermDays ?? 30;
    set({ dueDate: addDays(s.date, term) });
  }, [contact?.id, s.date, s.kind]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tahsilat/ödeme: açık belgeler
  const openDocs = useMemo(() => {
    if (!isLedgerKind(s.kind) || !s.contactId) return [];
    const dir = s.kind === 'collect' ? 'receivable' : 'payable';
    return f.documents
      .filter((d) => d.contactId === s.contactId && d.direction === dir && !d.cancelled)
      .map((d) => {
        const st = f.docStates.get(d.id)!;
        const own = s.allocations[d.id] ?? 0;
        // düzenlemede kendi tahsisini geri ekle
        const editingOwn = draft.editTransactionId
          ? (f.allocationIndex.get(d.id) ?? []).filter((a) => a.transactionId === draft.editTransactionId).reduce((x, a) => x + a.amount, 0)
          : 0;
        return { doc: d, remaining: st.remaining + editingOwn, status: st.status, own };
      })
      .filter((x) => x.remaining > 0 || x.own > 0)
      .sort((a, b) => a.doc.dueDate.localeCompare(b.doc.dueDate));
  }, [s.kind, s.contactId, f.documents, f.docStates, f.allocationIndex, s.allocations, draft.editTransactionId]);

  // Otomatik FIFO dağıtım
  useEffect(() => {
    if (!isLedgerKind(s.kind) || s.allocTouched) return;
    const plan = planAllocation(
      s.amount ?? 0,
      openDocs.filter((o) => o.doc.currency === currency).map((o) => ({ id: o.doc.id, dueDate: o.doc.dueDate, remaining: o.remaining })),
    );
    const next: Record<ID, MoneyValue> = {};
    for (const a of plan.allocations) next[a.documentId] = a.amount;
    set({ allocations: next });
  }, [s.amount, s.contactId, s.kind, currency, openDocs.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const allocated = Object.values(s.allocations).reduce((a, b) => a + b, 0);
  const advance = (s.amount ?? 0) - allocated;

  // Transfer: karşı tutar
  const suggestedToAmount =
    s.kind === 'transfer' && account && toAccount && s.amount
      ? convertMinor(s.amount, f.rates[account.currency], f.rates[toAccount.currency])
      : null;

  const contactOptions: ComboOption[] = f.contacts
    .filter((c) => !c.archived)
    .map((c) => {
      const bal = f.contactBalances.get(c.id) ?? 0;
      return {
        value: c.id,
        label: c.name,
        group: c.kind === 'supplier' ? 'Tedarikçiler' : c.kind === 'customer' ? 'Müşteriler' : 'Diğer',
        icon: <Monogram name={c.name} size={22} />,
        hint: bal !== 0 ? <span className={bal > 0 ? 'text-inflow-text' : 'text-outflow-text'}>{formatShort(bal, c.currency)}</span> : undefined,
      };
    });

  const categoryKind = incomeSide(s.kind) ? 'income' : 'expense';
  const categoryOptions: ComboOption[] = f.categories
    .filter((c) => !c.archived && c.kind === categoryKind)
    .map((c) => ({
      value: c.id,
      label: c.name,
      icon: <span className="inline-flex h-6 w-6 items-center justify-center rounded-[8px]" style={{ color: slotColor(c.color), background: `color-mix(in oklab, ${slotColor(c.color)} 12%, transparent)` }}><CategoryIcon name={c.icon} size={14} /></span>,
    }));

  const accountOptions = f.accounts.filter((a) => !a.archived);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!s.amount || s.amount <= 0) e.amount = 'Tutar girin';
    if (s.kind !== 'receivable' && s.kind !== 'payable' && !s.accountId) e.account = 'Hesap seçin';
    if (isLedgerKind(s.kind) && !s.contactId) e.contact = s.kind === 'collect' ? 'Tahsilatın geldiği cariyi seçin' : 'Ödemenin yapıldığı cariyi seçin';
    if (s.kind === 'transfer') {
      if (!s.toAccountId) e.toAccount = 'Hedef hesabı seçin';
      else if (s.toAccountId === s.accountId) e.toAccount = 'Kaynak ve hedef aynı olamaz';
    }
    if (isDocKind(s.kind) && !s.description.trim()) e.description = 'Belgeye bir başlık verin';
    if (isDocKind(s.kind) && s.dueDate < s.date) e.dueDate = 'Vade, belge tarihinden önce olamaz';
    if (isLedgerKind(s.kind) && advance < 0) e.allocations = 'Dağıtılan tutar ödemeyi aşıyor';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function onCreateContact(name: string) {
    const kind: ContactKind =
      s.kind === 'income' || s.kind === 'expense' ? 'other' : incomeSide(s.kind) ? 'customer' : 'supplier';
    const c = await createContact({ name, kind, currency: 'TRY', openingBalance: 0, tags: [], archived: false });
    set({ contactId: c.id });
    toast.success(`“${name}” carisi oluşturuldu`);
  }

  async function save() {
    if (!validate()) return;
    setSaving(true);
    try {
      const amount = s.amount!;
      const rate = f.rates[currency] ?? 1;
      const allocList = Object.entries(s.allocations)
        .filter(([, v]) => v > 0)
        .map(([documentId, value]) => ({ documentId, amount: value }));

      if (isDocKind(s.kind)) {
        const vatAmount = s.vatRate ? Math.round((amount * s.vatRate) / (100 + s.vatRate)) : 0;
        const payload = {
          direction: s.kind as 'receivable' | 'payable',
          contactId: s.contactId,
          categoryId: s.categoryId,
          title: s.description.trim(),
          number: s.number.trim() || undefined,
          issueDate: s.date,
          dueDate: s.dueDate,
          amount,
          currency,
          rateToBase: rate,
          vatRate: s.vatRate,
          vatAmount,
          expectedAccountId: s.accountId,
          probability: s.kind === 'receivable' && s.probability < 100 ? s.probability : undefined,
          cancelled: false,
        };
        if (draft.editDocumentId) {
          await updateDocument(draft.editDocumentId, payload);
          toast.success('Belge güncellendi');
        } else {
          const doc = await createDocument(payload);
          toast.success(s.kind === 'receivable' ? 'Alacak kaydedildi' : 'Borç kaydedildi', {
            description: `${formatMoney(amount, currency)} · vade ${formatDateShort(s.dueDate)}`,
            action: { label: 'Geri al', onClick: () => void deleteDocument(doc.id) },
          });
        }
      } else {
        const categoryFromDocs =
          s.categoryId ??
          (allocList.length
            ? f.documents.find((d) => d.id === [...allocList].sort((a, b) => b.amount - a.amount)[0]!.documentId)?.categoryId
            : undefined);
        const payload = {
          kind: s.kind === 'transfer' ? ('transfer' as const) : incomeSide(s.kind) ? ('income' as const) : ('expense' as const),
          date: s.date,
          accountId: s.accountId!,
          amount,
          currency,
          rateToBase: rate,
          toAccountId: s.kind === 'transfer' ? s.toAccountId : undefined,
          toAmount: s.kind === 'transfer' ? (s.toAmount ?? suggestedToAmount ?? amount) : undefined,
          categoryId: s.kind === 'transfer' ? undefined : categoryFromDocs,
          contactId: s.kind === 'transfer' ? undefined : s.contactId,
          affectsLedger: isLedgerKind(s.kind),
          description:
            s.description.trim() ||
            (isLedgerKind(s.kind) ? `${s.kind === 'collect' ? 'Tahsilat' : 'Ödeme'} · ${contact?.name ?? ''}` : s.kind === 'transfer' ? 'Hesaplar arası transfer' : ''),
          tags: [],
          source: 'manual' as const,
        };
        if (draft.editTransactionId) {
          await updateTransaction(draft.editTransactionId, payload, isLedgerKind(s.kind) ? allocList : []);
          toast.success('İşlem güncellendi');
        } else {
          const t = await createTransaction(payload, isLedgerKind(s.kind) ? allocList : []);
          const label = { collect: 'Tahsilat', pay: 'Ödeme', income: 'Gelir', expense: 'Gider', transfer: 'Transfer' }[s.kind as 'collect'];
          toast.success(`${label} kaydedildi`, {
            description: formatMoney(amount, currency),
            action: {
              label: 'Geri al',
              onClick: async () => {
                const snap = await deleteTransactions([t.id]);
                toast('Kayıt geri alındı', { action: { label: 'Yinele', onClick: () => void restoreSnapshot(snap) } });
              },
            },
          });
        }
      }

      if (!editing && isLedgerKind(s.kind)) {
        setStamp({ label: s.kind === 'collect' ? 'TAHSİL EDİLDİ' : 'ÖDENDİ', tone: s.kind === 'collect' ? 'in' : 'out' });
        window.setTimeout(onDone, 1100);
      } else {
        onDone();
      }
    } catch (err) {
      toast.error('Kaydedilemedi', { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="relative flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {!editing && (
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <Segmented
            label="Kayıt türü"
            size="sm"
            value={s.kind}
            onChange={(kind) => {
              set({ kind, categoryId: undefined, allocations: {}, allocTouched: false, accountId: s.accountId ?? defaultAccount(f) });
              setErrors({});
            }}
            options={KIND_OPTIONS}
          />
        </div>
      )}
      <div className="-mt-2 flex items-start justify-between gap-3">
        <p className="text-xs text-muted">{KIND_HELP[s.kind]}</p>
        {!editing && <ReceiptButton onRead={(patch) => set(patch)} />}
      </div>

      {/* Tutar — büyük, Bodoni */}
      <div className="rounded-[18px] border border-line bg-surface-2 p-4">
        <Field label={isDocKind(s.kind) ? 'Belge tutarı (KDV dahil)' : s.kind === 'transfer' ? 'Gönderilen tutar' : 'Tutar'} error={errors.amount}>
          {(p) => (
            <MoneyInput
              {...p}
              autoFocus
              value={s.amount}
              currency={currency}
              onValueChange={(amount) => set({ amount })}
              className="display h-14 border-transparent bg-transparent text-right text-4xl font-medium shadow-none focus:shadow-none"
              placeholder="0,00"
            />
          )}
        </Field>
        {isDocKind(s.kind) && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <Segmented
              label="Para birimi"
              size="sm"
              value={s.docCurrency}
              onChange={(docCurrency) => set({ docCurrency })}
              options={(['TRY', 'USD', 'EUR', 'GBP'] as const).map((c) => ({ value: c, label: c }))}
            />
            <Segmented
              label="KDV oranı"
              size="sm"
              value={String(s.vatRate) as '0' | '1' | '10' | '20'}
              onChange={(v) => set({ vatRate: Number(v) as VatRate })}
              options={[
                { value: '0', label: 'KDV yok' },
                { value: '1', label: '%1' },
                { value: '10', label: '%10' },
                { value: '20', label: '%20' },
              ]}
            />
            {s.amount && s.vatRate > 0 && (
              <span className="text-2xs text-muted">
                KDV <Money value={Math.round((s.amount * s.vatRate) / (100 + s.vatRate))} currency={currency} />
              </span>
            )}
          </div>
        )}
      </div>

      {/* Cari */}
      {s.kind !== 'transfer' && (
        <Field
          label={s.kind === 'collect' ? 'Kimden' : s.kind === 'pay' ? 'Kime' : 'Cari'}
          optional={!isLedgerKind(s.kind)}
          error={errors.contact}
        >
          {(p) => (
            <Combobox
              id={p.id}
              invalid={p['aria-invalid']}
              value={s.contactId}
              onChange={(contactId) => set({ contactId, allocTouched: false })}
              options={contactOptions}
              placeholder="Cari seçin ya da yazın"
              searchPlaceholder="Cari ara…"
              onCreate={onCreateContact}
              createLabel={(q) => `“${q}” adlı cari oluştur`}
              allowClear
            />
          )}
        </Field>
      )}

      {/* Açık belgelere dağıtım */}
      {isLedgerKind(s.kind) && s.contactId && (
        <AllocationList
          docs={openDocs}
          currency={currency}
          allocations={s.allocations}
          onChange={(allocations) => set({ allocations, allocTouched: true })}
          advance={advance}
          error={errors.allocations}
          today={f.today}
          kind={s.kind}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={isDocKind(s.kind) ? 'Belge tarihi' : 'Tarih'}>
          {(p) => (
            <DateInput
              {...p}
              value={s.date}
              today={f.today}
              onValueChange={(date) => set({ date })}
              presets={[
                { label: 'Dün', days: -1 },
                { label: 'Bugün', days: 0 },
                { label: 'Yarın', days: 1 },
              ]}
            />
          )}
        </Field>
        {isDocKind(s.kind) ? (
          <Field label="Vade" error={errors.dueDate} hint={relativeDay(s.dueDate, f.today)}>
            {(p) => (
              <DateInput
                {...p}
                value={s.dueDate}
                today={s.date}
                onValueChange={(dueDate) => set({ dueDate, dueTouched: true })}
                presets={[
                  { label: '15 gün', days: 15 },
                  { label: '30', days: 30 },
                  { label: '60', days: 60 },
                  { label: '90', days: 90 },
                ]}
              />
            )}
          </Field>
        ) : (
          <Field label={s.kind === 'transfer' ? 'Kaynak hesap' : 'Hesap'} error={errors.account}>
            {(p) => (
              <Select {...p} value={s.accountId ?? ''} onChange={(e) => set({ accountId: e.target.value || undefined, allocTouched: false })}>
                <option value="">Hesap seçin</option>
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {formatShort(f.balances.get(a.id) ?? 0, a.currency)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        )}
      </div>

      {s.kind === 'transfer' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Hedef hesap" error={errors.toAccount}>
            {(p) => (
              <Select {...p} value={s.toAccountId ?? ''} onChange={(e) => set({ toAccountId: e.target.value || undefined })}>
                <option value="">Hesap seçin</option>
                {accountOptions
                  .filter((a) => a.id !== s.accountId)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} · {a.currency}
                    </option>
                  ))}
              </Select>
            )}
          </Field>
          {toAccount && account && toAccount.currency !== account.currency && (
            <Field label={`Hedefe geçen (${toAccount.currency})`} hint={`Güncel kurla önerilen: ${suggestedToAmount != null ? formatMoney(suggestedToAmount, toAccount.currency) : '—'}`}>
              {(p) => <MoneyInput {...p} value={s.toAmount ?? suggestedToAmount} currency={toAccount.currency} onValueChange={(toAmount) => set({ toAmount })} />}
            </Field>
          )}
        </div>
      )}

      {s.kind !== 'transfer' && (
        <Field label="Kategori" optional={isLedgerKind(s.kind)} hint={isLedgerKind(s.kind) ? 'Boş bırakırsanız faturanın kategorisi kullanılır' : undefined}>
          {(p) => (
            <Combobox id={p.id} value={s.categoryId} onChange={(categoryId) => set({ categoryId })} options={categoryOptions} placeholder="Kategori seçin" searchPlaceholder="Kategori ara…" allowClear />
          )}
        </Field>
      )}

      {isDocKind(s.kind) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Belge no" optional>
            {(p) => <TextInput {...p} value={s.number} onChange={(e) => set({ number: e.target.value })} placeholder="DNZ2026000123" />}
          </Field>
          <Field label="Beklenen hesap" optional>
            {(p) => (
              <Select {...p} value={s.accountId ?? ''} onChange={(e) => set({ accountId: e.target.value || undefined })}>
                <option value="">—</option>
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      )}

      {s.kind === 'receivable' && (
        <Field label={`Tahsil olasılığı · %${s.probability}`} hint="Teyit bekleyen siparişler için düşürün; projeksiyon bu oranla ağırlıklandırır.">
          {(p) => (
            <input
              {...p}
              type="range"
              min={10}
              max={100}
              step={10}
              value={s.probability}
              onChange={(e) => set({ probability: Number(e.target.value) })}
              className="accent-[var(--cobalt)]"
            />
          )}
        </Field>
      )}

      <Field label={isDocKind(s.kind) ? 'Başlık' : 'Açıklama'} optional={!isDocKind(s.kind)} error={errors.description}>
        {(p) =>
          isDocKind(s.kind) ? (
            <TextInput {...p} value={s.description} onChange={(e) => set({ description: e.target.value })} placeholder={s.kind === 'receivable' ? 'Satış faturası' : 'Alış faturası'} />
          ) : (
            <TextArea {...p} rows={2} value={s.description} onChange={(e) => set({ description: e.target.value })} placeholder="Not ekleyin" />
          )
        }
      </Field>

      <div className="sticky bottom-0 -mx-6 -mb-5 mt-2 flex items-center justify-between gap-3 border-t border-line bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-6 py-4 backdrop-blur">
        <SummaryLine s={s} currency={currency} contactName={contact?.name} accountName={account?.name} />
        <Button type="submit" variant="primary" size="lg" magnetic loading={saving} trailing={<ArrowRight size={16} weight="bold" />}>
          {editing ? 'Değişiklikleri kaydet' : 'Kaydet'}
        </Button>
      </div>

      <AnimatePresence>
        {stamp && (
          <motion.div
            className="absolute inset-0 z-10 flex items-center justify-center bg-[color-mix(in_oklab,var(--surface)_70%,transparent)] backdrop-blur-[1px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Stamp label={stamp.label} tone={stamp.tone} date={formatDateShort(s.date)} size={190} />
          </motion.div>
        )}
      </AnimatePresence>
    </form>
  );
}

/** Fiş/fatura fotoğrafından alanları doldurur (Gemini bağlıysa). */
function ReceiptButton({ onRead }: { onRead: (patch: Partial<FormState>) => void }) {
  const f = useFinance();
  const ai = useAi();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  if (!ai.receipt) {
    return (
      <Tip content="Ayarlar › Yapay zekâ bölümünden Gemini bağlayınca fiş ve fatura fotoğraflarını okuyabilirim.">
        <span className="inline-flex shrink-0 items-center gap-1 text-2xs text-faint">
          <Camera size={14} /> Fiş okut
        </span>
      </Tip>
    );
  }
  return (
    <>
      <Button size="sm" variant="secondary" icon={<Camera size={14} />} loading={busy} onClick={() => input.current?.click()} className="shrink-0">
        Fiş okut
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="sr-only"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file || !ai.receipt) return;
          setBusy(true);
          try {
            const r = await ai.receipt(file);
            const kind: EntryKind = r.kind === 'sales_invoice' ? 'receivable' : r.kind === 'purchase_invoice' ? 'payable' : 'expense';
            const vendor = r.vendor ? normalizeTr(r.vendor) : '';
            const contact = vendor ? f.contacts.find((c) => vendor.includes(normalizeTr(c.name).split(' ')[0]!) || normalizeTr(c.name).includes(vendor.split(' ')[0]!)) : undefined;
            const hint = r.category_hint ? normalizeTr(r.category_hint) : '';
            const category = hint ? f.categories.find((c) => c.kind === 'expense' && (normalizeTr(c.name).includes(hint) || (CATEGORY_KEYWORDS[c.icon] ?? []).some((k) => hint.includes(normalizeTr(k))))) : undefined;
            const vat = r.vat_rate === 1 || r.vat_rate === 10 || r.vat_rate === 20 || r.vat_rate === 0 ? (r.vat_rate as VatRate) : 20;
            onRead({
              kind,
              amount: r.total != null ? Math.round(r.total * 100) : null,
              date: r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date) ? r.date : f.today,
              description: r.vendor ?? '',
              number: r.document_no ?? '',
              vatRate: vat,
              contactId: contact?.id,
              categoryId: category?.id,
              docCurrency: r.currency === 'USD' || r.currency === 'EUR' || r.currency === 'GBP' ? r.currency : 'TRY',
            });
            toast.success('Fiş okundu', { description: 'Alanları kontrol edip kaydedin.' });
          } catch (err) {
            toast.error('Fiş okunamadı', { description: err instanceof Error ? err.message : '' });
          } finally {
            setBusy(false);
          }
        }}
      />
    </>
  );
}

function SummaryLine({ s, currency, contactName, accountName }: { s: FormState; currency: CurrencyCode; contactName?: string; accountName?: string }) {
  if (!s.amount) return <span className="text-xs text-faint">Tutar bekleniyor</span>;
  const dir = incomeSide(s.kind) ? 'in' : s.kind === 'transfer' ? 'muted' : 'out';
  return (
    <div className="min-w-0 text-xs text-muted">
      <Money value={s.amount} currency={currency} tone={dir === 'muted' ? 'neutral' : dir} className="text-sm font-semibold" sign={dir === 'in' ? 'always' : 'auto'} />
      <div className="truncate">
        {[contactName, accountName, isDocKind(s.kind) ? `vade ${formatDayMonth(s.dueDate)}` : formatDayMonth(s.date)].filter(Boolean).join(' · ')}
      </div>
    </div>
  );
}

interface AllocationListProps {
  docs: Array<{ doc: Finance['documents'][number]; remaining: MoneyValue; status: string }>;
  currency: CurrencyCode;
  allocations: Record<ID, MoneyValue>;
  onChange: (next: Record<ID, MoneyValue>) => void;
  advance: MoneyValue;
  error?: string;
  today: ISODate;
  kind: EntryKind;
}

function AllocationList({ docs, currency, allocations, onChange, advance, error, today, kind }: AllocationListProps) {
  if (!docs.length) {
    return (
      <div className="flex items-center gap-2 rounded-[14px] border border-dashed border-line-strong px-4 py-3 text-xs text-muted">
        <CheckCircle size={16} className="text-inflow-text" />
        Bu carinin açık {kind === 'collect' ? 'alacağı' : 'borcu'} yok. Tutar avans olarak cari hesaba işlenir.
      </div>
    );
  }
  return (
    <div className="rounded-[16px] border border-line">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <span className="text-xs font-medium text-ink-2">Açık {kind === 'collect' ? 'faturalar' : 'borçlar'} · vade sırasıyla</span>
        <span className={cn('text-2xs', advance > 0 ? 'text-saffron-text' : 'text-muted')}>
          {advance > 0 ? <>Avans: <Money value={advance} currency={currency} /></> : 'Tamamı dağıtıldı'}
        </span>
      </div>
      <ul className="scrollbar-thin max-h-56 divide-y divide-line overflow-y-auto">
        {docs.map(({ doc, remaining, status }) => {
          const value = allocations[doc.id] ?? 0;
          const checked = value > 0;
          const sameCurrency = doc.currency === currency;
          return (
            <li key={doc.id} className={cn('flex items-center gap-3 px-4 py-2.5', !sameCurrency && 'opacity-50')}>
              <input
                type="checkbox"
                aria-label={`${doc.number ?? doc.title} dağıt`}
                disabled={!sameCurrency}
                checked={checked}
                onChange={(e) => onChange({ ...allocations, [doc.id]: e.target.checked ? remaining : 0 })}
                className="h-4 w-4 accent-[var(--cobalt)]"
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{doc.number ?? doc.title}</div>
                <div className={cn('text-2xs', status === 'overdue' ? 'text-outflow-text' : 'text-muted')}>
                  vade {formatDayMonth(doc.dueDate)} · {relativeDay(doc.dueDate, today)}
                </div>
              </div>
              <div className="text-right">
                <Money value={checked ? value : remaining} currency={doc.currency} className={cn('text-xs', checked ? 'font-semibold text-ink' : 'text-muted')} />
                {checked && value < remaining && <div className="text-2xs text-muted">kalan <Money value={remaining - value} currency={doc.currency} /></div>}
              </div>
            </li>
          );
        })}
      </ul>
      {error && <p className="border-t border-line px-4 py-2 text-2xs text-outflow-text">{error}</p>}
      {!docs.every((d) => d.doc.currency === currency) && (
        <p className="flex items-center gap-1.5 border-t border-line px-4 py-2 text-2xs text-muted">
          <Dot color="var(--saffron)" /> Farklı para birimindeki belgeler bu işlemle kapatılamaz.
        </p>
      )}
    </div>
  );
}
