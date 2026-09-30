import { ArrowsLeftRight, Tag } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { useUI } from '@/app/ui-store';
import { Badge } from '@/ui/bits';
import { Money } from '@/ui/Money';
import { CategoryIcon } from '@/ui/icons';
import { cn, slotColor } from '@/ui/cn';
import { transactionEffect } from '@/domain/balances';
import type { ID, Transaction } from '@/domain/types';

interface TransactionRowProps {
  t: Transaction;
  selected?: boolean;
  onToggle?: () => void;
  /** Hesap bağlamı: transferin bu hesaba etkisini işaretle göster, hesap kolonunu gizle */
  accountId?: ID;
}

export function TransactionRow({ t, selected, onToggle, accountId }: TransactionRowProps) {
  const f = useFinance();
  const openEntry = useUI((s) => s.openEntry);
  const cat = t.categoryId ? f.categoriesById.get(t.categoryId) : undefined;
  const contact = t.contactId ? f.contactsById.get(t.contactId) : undefined;
  const account = f.accountsById.get(t.accountId);
  const toAccount = t.toAccountId ? f.accountsById.get(t.toAccountId) : undefined;
  const contextual = accountId ? transactionEffect(t, accountId) : null;
  const value = contextual ?? (t.kind === 'income' ? t.amount : t.kind === 'expense' ? -t.amount : t.amount);
  const currency = accountId && t.toAccountId === accountId ? (toAccount?.currency ?? t.currency) : t.currency;
  const neutral = contextual === null && t.kind === 'transfer';
  // İleri tarihli işlem: bakiyede henüz yok, projeksiyonda vadesinde görünür
  const planned = t.date > f.today;
  return (
    <li
      className={cn(
        'group relative flex items-center gap-3 rounded-[12px] px-3 py-2.5 transition-colors hover:bg-surface-2',
        selected && 'bg-cobalt-soft/50 hover:bg-cobalt-soft/60',
      )}
    >
      {onToggle && (
        <input
          type="checkbox"
          checked={Boolean(selected)}
          onChange={onToggle}
          aria-label="İşlemi seç"
          className={cn('h-4 w-4 shrink-0 accent-[var(--cobalt)] transition-opacity', selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus:opacity-100')}
        />
      )}
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
        style={
          t.kind === 'transfer'
            ? { color: 'var(--ink-muted)', background: 'var(--surface-sunken)' }
            : { color: slotColor(cat?.color), background: `color-mix(in oklab, ${slotColor(cat?.color)} 12%, transparent)` }
        }
      >
        {t.kind === 'transfer' ? <ArrowsLeftRight size={16} /> : cat ? <CategoryIcon name={cat.icon} size={16} /> : <Tag size={16} />}
      </span>
      <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openEntry({ kind: t.kind === 'transfer' ? 'transfer' : 'expense', editTransactionId: t.id })}>
        <div className="truncate text-sm font-medium">{contact?.name ?? t.description}</div>
        <div className="truncate text-2xs text-muted">
          {t.kind === 'transfer' && accountId
            ? t.accountId === accountId
              ? `→ ${toAccount?.name ?? ''}`
              : `← ${account?.name ?? ''}`
            : contact
              ? t.description
              : (cat?.name ?? 'Kategorisiz')}
          {t.affectsLedger && <span className="text-cobalt-ink"> · cari</span>}
          {planned && <span className="text-saffron-text md:hidden"> · planlı</span>}
        </div>
      </button>
      {!accountId && (
        <div className="hidden w-44 shrink-0 truncate text-2xs text-muted md:block">
          {account?.name}
          {toAccount && ` → ${toAccount.name}`}
        </div>
      )}
      <div className="hidden w-28 shrink-0 md:block">
        {planned && (
          <Badge tone="warn" className="mr-1">
            Planlı
          </Badge>
        )}
        {t.source === 'instrument' && <Badge tone="muted">Çek/senet</Badge>}
        {t.source === 'recurring' && <Badge tone="muted">Tekrarlayan</Badge>}
        {t.source === 'import' && <Badge tone="muted">Ekstre</Badge>}
      </div>
      <Money
        value={value}
        currency={currency}
        tone={neutral ? 'muted' : 'auto'}
        sign={value > 0 && !neutral ? 'always' : 'auto'}
        split
        className="w-36 shrink-0 text-right text-sm font-semibold"
      />
    </li>
  );
}
