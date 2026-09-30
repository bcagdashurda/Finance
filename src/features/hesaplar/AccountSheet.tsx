import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { useFinance } from '@/app/finance';
import { Sheet } from '@/ui/Overlay';
import { Button } from '@/ui/Button';
import { DateInput, Field, MoneyInput, Select, TextInput, focusFirstInvalid } from '@/ui/Field';
import { Combobox } from '@/ui/Combobox';
import { AccountIcon, ACCOUNT_KIND_LABEL } from '@/ui/icons';
import { cn } from '@/ui/cn';
import type { Account, AccountKind } from '@/domain/types';
import type { CurrencyCode } from '@/domain/money';
import { bankFromIban, formatIban, isValidIban, normalizeIban } from '@/domain/validators';
import { createAccount, updateAccount } from '@/data/repo';
import { ACCOUNT_COLORS, TURKISH_BANKS } from '@/data/seed';

const NAME_HINT: Record<AccountKind, string> = {
  bank: 'Garanti BBVA Ticari',
  cash: 'Merkez kasa',
  card: 'Şirket kredi kartı',
  pos: 'Mağaza POS',
  investment: 'Yatırım hesabı',
  other: 'Ortak cari hesabı',
};

export function AccountSheet({ open, onOpenChange, account }: { open: boolean; onOpenChange: (o: boolean) => void; account?: Account | null }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={account ? 'Hesabı düzenle' : 'Yeni hesap'} width={540}>
      {open && <AccountForm key={account?.id ?? 'new'} account={account ?? null} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function AccountForm({ account, onDone }: { account: Account | null; onDone: () => void }) {
  const f = useFinance();
  const navigate = useNavigate();
  const [s, setS] = useState({
    name: account?.name ?? '',
    kind: (account?.kind ?? 'bank') as AccountKind,
    institution: account?.institution ?? '',
    iban: account?.iban ? formatIban(account.iban) : '',
    currency: (account?.currency ?? 'TRY') as CurrencyCode,
    opening: account?.openingBalance ?? 0,
    openingDate: account?.openingDate ?? f.today,
    minBalance: account?.minBalance ?? null,
    creditLimit: account?.creditLimit ?? null,
    color: account?.color ?? ACCOUNT_COLORS[f.accounts.length % ACCOUNT_COLORS.length]!,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<typeof s>) => setS((prev) => ({ ...prev, ...p }));

  async function save() {
    const e: Record<string, string> = {};
    if (!s.name.trim()) e.name = 'Hesaba bir ad verin';
    if (s.iban && !isValidIban(s.iban)) e.iban = 'IBAN doğrulanamadı';
    setErrors(e);
    if (Object.keys(e).length) return focusFirstInvalid();
    setSaving(true);
    const payload = {
      name: s.name.trim(),
      kind: s.kind,
      institution: s.institution || undefined,
      iban: s.iban ? normalizeIban(s.iban) : undefined,
      currency: s.currency,
      openingBalance: s.opening ?? 0,
      openingDate: s.openingDate,
      minBalance: s.minBalance ?? undefined,
      creditLimit: s.kind === 'card' ? (s.creditLimit ?? undefined) : undefined,
      color: s.color,
    };
    try {
      if (account) {
        await updateAccount(account.id, payload);
        toast.success('Hesap güncellendi');
      } else {
        await createAccount({ ...payload, archived: false, sortOrder: f.accounts.length + 1 });
        const first = f.accounts.length === 0 && !f.settings.isDemo;
        toast.success(
          `“${payload.name}” eklendi`,
          first
            ? {
                description: 'Kokpit artık nakdinizi gösteriyor. Sıradaki adım: müşteri ve tedarikçileriniz.',
                action: { label: 'Cari ekle', onClick: () => navigate('/cariler?yeni=1', { viewTransition: true }) },
                duration: 8000,
              }
            : undefined,
        );
      }
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6" role="group" aria-label="Hesap türü">
        {(Object.keys(ACCOUNT_KIND_LABEL) as AccountKind[]).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={s.kind === k}
            onClick={() => set({ kind: k })}
            className={cn('flex flex-col items-center gap-1.5 rounded-[12px] border px-1 py-2.5 text-xs transition-colors', s.kind === k ? 'border-cobalt bg-cobalt-soft text-cobalt-ink' : 'border-line text-muted hover:text-ink')}
          >
            <AccountIcon kind={k} size={18} />
            {ACCOUNT_KIND_LABEL[k].split(' ')[0]}
          </button>
        ))}
      </div>
      <Field label="Hesap adı" error={errors.name}>
        {(p) => <TextInput {...p} autoFocus value={s.name} onChange={(e) => set({ name: e.target.value })} placeholder={NAME_HINT[s.kind]} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        {s.kind !== 'cash' && s.kind !== 'other' && (
          <Field label="Banka / kurum" optional>
            {(p) => (
              <Combobox
                id={p.id}
                value={s.institution || undefined}
                onChange={(v) => set({ institution: v ?? '' })}
                options={[...new Set([...(s.institution ? [s.institution] : []), ...TURKISH_BANKS])].map((b) => ({ value: b, label: b }))}
                placeholder="Seçin ya da yazın"
                searchPlaceholder="Banka ya da kurum ara…"
                emptyText="Listede yok; adını yazıp ekleyebilirsiniz"
                onCreate={(q) => set({ institution: q })}
                createLabel={(q) => `“${q}” kullan`}
                allowClear
              />
            )}
          </Field>
        )}
        <Field label="Para birimi" hint={account ? 'Kayıtlı hesabın para birimi değiştirilemez' : undefined}>
          {(p) => (
            <Select {...p} value={s.currency} onChange={(e) => set({ currency: e.target.value as CurrencyCode })} disabled={Boolean(account)}>
              <option value="TRY">TRY · Türk lirası</option>
              <option value="USD">USD · ABD doları</option>
              <option value="EUR">EUR · Euro</option>
              <option value="GBP">GBP · Sterlin</option>
            </Select>
          )}
        </Field>
      </div>
      {s.kind === 'bank' && (
        <Field
          label="IBAN"
          optional
          error={errors.iban}
          hint={!errors.iban && bankFromIban(s.iban) ? `${bankFromIban(s.iban)} hesabı olarak tanındı` : undefined}
        >
          {(p) => (
            <TextInput
              {...p}
              className="num"
              inputMode="text"
              autoComplete="off"
              value={s.iban}
              onChange={(e) => {
                const iban = formatIban(e.target.value).slice(0, 32);
                const bank = bankFromIban(iban);
                set(bank && !s.institution ? { iban, institution: bank } : { iban });
              }}
              placeholder="TR00 0000 0000 0000 0000 0000 00"
            />
          )}
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Başlangıç bakiyesi" hint={s.kind === 'card' ? 'Kart borcu için eksi girin' : 'Seçtiğiniz tarihteki bakiye; öncesini girmeniz gerekmez'}>
          {(p) => <MoneyInput {...p} value={s.opening} currency={s.currency} onValueChange={(v) => set({ opening: v ?? 0 })} />}
        </Field>
        <Field label="Bakiye tarihi">{(p) => <DateInput {...p} value={s.openingDate} today={f.today} onValueChange={(openingDate) => set({ openingDate })} />}</Field>
        {s.kind === 'card' ? (
          <Field label="Kart limiti" optional>
            {(p) => <MoneyInput {...p} value={s.creditLimit} currency={s.currency} onValueChange={(creditLimit) => set({ creditLimit })} />}
          </Field>
        ) : (
          <Field label="Minimum bakiye uyarısı" optional>
            {(p) => <MoneyInput {...p} value={s.minBalance} currency={s.currency} onValueChange={(minBalance) => set({ minBalance })} />}
          </Field>
        )}
      </div>
      <div>
        <div className="mb-2 text-xs font-medium text-ink-2">Renk</div>
        <div className="flex gap-2">
          {ACCOUNT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Renk ${c}`}
              onClick={() => set({ color: c })}
              className={cn('h-8 w-8 rounded-full transition-transform', s.color === c && 'scale-110 ring-2 ring-[var(--cobalt)] ring-offset-2 ring-offset-[var(--surface)]')}
              style={{ background: `var(--cat-${c.slice(1)})` }}
            />
          ))}
        </div>
      </div>
      <div className="sticky -bottom-5 -mx-6 -mb-5 flex justify-end gap-2 border-t border-line bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-6 py-4 backdrop-blur">
        <Button variant="ghost" type="button" onClick={onDone}>
          Vazgeç
        </Button>
        <Button variant="primary" type="submit" loading={saving}>
          {account ? 'Kaydet' : 'Hesabı ekle'}
        </Button>
      </div>
    </form>
  );
}
