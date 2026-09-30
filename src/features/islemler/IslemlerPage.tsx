import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { DownloadSimple, FunnelSimple, MagnifyingGlass, Plus, Trash, UploadSimple, X } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { useUI } from '@/app/ui-store';
import { useParamAction } from '@/app/useParamAction';
import { PageHeader } from '@/ui/PageHeader';
import { Panel } from '@/ui/Panel';
import { Segmented } from '@/ui/Segmented';
import { Button } from '@/ui/Button';
import { Money } from '@/ui/Money';
import { Select } from '@/ui/Field';
import { formatDate, formatDateShort, formatWeekday } from '@/ui/format';
import { addDays, addMonths, endOfMonth, startOfMonth, type ISODate } from '@/domain/dates';
import { amountInBase } from '@/domain/balances';
import { normalizeTr } from '@/domain/nlp';
import { formatNumber } from '@/domain/money';
import type { Transaction } from '@/domain/types';
import { deleteTransactions, restoreSnapshot, updateTransaction } from '@/data/repo';
import { download, minorToCell, toCSV } from '@/data/export';
import { ImportSheet } from './ImportSheet';
import { TransactionRow } from './TransactionRow';

type Period = 'month' | 'last' | '90' | 'year' | 'all';
type Kind = 'all' | 'in' | 'out' | 'transfer';

const PAGE = 120;

export default function IslemlerPage() {
  const f = useFinance();
  const openEntry = useUI((s) => s.openEntry);
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [period, setPeriod] = useState<Period>('90');
  const [kind, setKind] = useState<Kind>('all');
  const [accountId, setAccountId] = useState('');
  const categoryId = params.get('kategori') ?? '';
  const contactId = params.get('cari') ?? '';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(PAGE);
  const [importOpen, setImportOpen] = useState(false);
  useParamAction('ice-aktar', () => setImportOpen(true));
  const sentinel = useRef<HTMLDivElement>(null);

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };

  // Bugünde biten dönemler ileri tarihli (planlı) kayıtları da gösterir: girilen kayıt listede kaybolmasın
  const range: [ISODate, ISODate] = useMemo(() => {
    const t = f.today;
    const future = '9999-12-31';
    switch (period) {
      case 'month':
        return [startOfMonth(t), future];
      case 'last':
        return [startOfMonth(addMonths(t, -1)), endOfMonth(addMonths(t, -1))];
      case '90':
        return [addDays(t, -90), future];
      case 'year':
        return [`${t.slice(0, 4)}-01-01`, future];
      default:
        return ['0000-01-01', '9999-12-31'];
    }
  }, [period, f.today]);

  const rows = useMemo(() => {
    const q = normalizeTr(query.trim());
    const amountQuery = query.replace(/[^\d,]/g, '');
    return f.transactionsDesc.filter((t) => {
      if (t.date < range[0] || t.date > range[1]) return false;
      if (kind === 'in' && t.kind !== 'income') return false;
      if (kind === 'out' && t.kind !== 'expense') return false;
      if (kind === 'transfer' && t.kind !== 'transfer') return false;
      if (accountId && t.accountId !== accountId && t.toAccountId !== accountId) return false;
      if (categoryId && t.categoryId !== categoryId) return false;
      if (contactId && t.contactId !== contactId) return false;
      if (q) {
        const hay = normalizeTr(
          [t.description, t.contactId && f.contactsById.get(t.contactId)?.name, t.categoryId && f.categoriesById.get(t.categoryId)?.name, t.reference].filter(Boolean).join(' '),
        );
        const amountHit = amountQuery.length >= 3 && formatNumber(t.amount).replace(/\./g, '').includes(amountQuery);
        if (!hay.includes(q) && !amountHit) return false;
      }
      return true;
    });
  }, [f.transactionsDesc, f.contactsById, f.categoriesById, range, kind, accountId, categoryId, contactId, query]);

  useEffect(() => setLimit(PAGE), [rows]);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) setLimit((l) => l + PAGE);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [rows.length]);

  const totals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const t of rows) {
      if (t.date > f.today) continue; // planlı kayıtlar gerçekleşmiş toplamlara girmez
      if (t.kind === 'income') inflow += amountInBase(t.amount, t.rateToBase);
      else if (t.kind === 'expense') outflow += amountInBase(t.amount, t.rateToBase);
    }
    return { inflow, outflow, net: inflow - outflow };
  }, [rows, f.today]);

  const groups = useMemo(() => {
    const out: Array<{ date: ISODate; items: Transaction[]; net: number }> = [];
    for (const t of rows.slice(0, limit)) {
      let g = out.at(-1);
      if (!g || g.date !== t.date) {
        g = { date: t.date, items: [], net: 0 };
        out.push(g);
      }
      g.items.push(t);
      if (t.kind !== 'transfer') g.net += (t.kind === 'income' ? 1 : -1) * amountInBase(t.amount, t.rateToBase);
    }
    return out;
  }, [rows, limit]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function bulkDelete() {
    const ids = [...selected];
    const snap = await deleteTransactions(ids);
    setSelected(new Set());
    toast(`${ids.length} işlem silindi`, { action: { label: 'Geri al', onClick: () => void restoreSnapshot(snap) } });
  }

  async function bulkCategorize(catId: string) {
    const ids = [...selected];
    for (const id of ids) await updateTransaction(id, { categoryId: catId });
    setSelected(new Set());
    toast.success(`${ids.length} işlemin kategorisi güncellendi`);
  }

  function exportCsv() {
    const csv = toCSV(rows, [
      { header: 'Tarih', value: (t) => formatDateShort(t.date) },
      { header: 'Tür', value: (t) => (t.kind === 'income' ? (t.affectsLedger ? 'Tahsilat' : 'Gelir') : t.kind === 'expense' ? (t.affectsLedger ? 'Ödeme' : 'Gider') : 'Transfer') },
      { header: 'Açıklama', value: (t) => t.description },
      { header: 'Cari', value: (t) => (t.contactId ? f.contactsById.get(t.contactId)?.name : '') },
      { header: 'Kategori', value: (t) => (t.categoryId ? f.categoriesById.get(t.categoryId)?.name : '') },
      { header: 'Hesap', value: (t) => f.accountsById.get(t.accountId)?.name },
      { header: 'Hedef hesap', value: (t) => (t.toAccountId ? f.accountsById.get(t.toAccountId)?.name : '') },
      { header: 'Para birimi', value: (t) => t.currency },
      { header: 'Tutar', value: (t) => minorToCell(t.kind === 'expense' ? -t.amount : t.amount) },
      { header: 'TL karşılığı', value: (t) => minorToCell((t.kind === 'expense' ? -1 : 1) * amountInBase(t.amount, t.rateToBase)) },
    ]);
    download(`mizan-islemler-${f.today}.csv`, csv);
    toast.success(`${rows.length} işlem dışa aktarıldı`, { description: 'Excel ile açabilirsiniz.' });
  }

  const activeFilters = [
    categoryId && { key: 'kategori', label: f.categoriesById.get(categoryId)?.name ?? 'Kategori' },
    contactId && { key: 'cari', label: f.contactsById.get(contactId)?.name ?? 'Cari' },
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  return (
    <div>
      <PageHeader
        kicker={`${f.transactions.length.toLocaleString('tr-TR')} işlem · ${f.accounts.filter((a) => !a.archived).length} hesap`}
        title="İşlemler"
        actions={
          <>
            <Button variant="secondary" icon={<UploadSimple size={16} />} onClick={() => setImportOpen(true)}>
              Ekstre içe aktar
            </Button>
            <Button variant="secondary" icon={<DownloadSimple size={16} />} onClick={exportCsv}>
              Excel'e aktar
            </Button>
            <Button variant="primary" magnetic icon={<Plus size={16} weight="bold" />} onClick={() => openEntry({ kind: 'expense' })}>
              Kayıt
            </Button>
          </>
        }
      />

      <Panel reveal={0} padded={false}>
        {/* Filtre çubuğu */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 sm:p-5">
          <div className="relative min-w-56 flex-1">
            <MagnifyingGlass size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Açıklama, cari, kategori ya da tutar ara"
              aria-label="İşlem ara"
              className="h-10 w-full rounded-[12px] border border-line-strong bg-surface pl-10 pr-3 text-sm outline-none transition-[border-color,box-shadow] focus:border-cobalt focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--cobalt)_18%,transparent)]"
            />
          </div>
          <Segmented
            label="Dönem"
            size="sm"
            value={period}
            onChange={setPeriod}
            options={[
              { value: 'month', label: 'Bu ay' },
              { value: 'last', label: 'Geçen ay' },
              { value: '90', label: '90 gün' },
              { value: 'year', label: 'Bu yıl' },
              { value: 'all', label: 'Tümü' },
            ]}
          />
          <Segmented
            label="Tür"
            size="sm"
            value={kind}
            onChange={setKind}
            options={[
              { value: 'all', label: 'Tümü' },
              { value: 'in', label: 'Giriş' },
              { value: 'out', label: 'Çıkış' },
              { value: 'transfer', label: 'Transfer' },
            ]}
          />
          <div className="w-48">
            <Select aria-label="Hesap" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="h-9 text-xs">
              <option value="">Tüm hesaplar</option>
              {f.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-52">
            <Select aria-label="Kategori" value={categoryId} onChange={(e) => setParam('kategori', e.target.value)} className="h-9 text-xs">
              <option value="">Tüm kategoriler</option>
              <optgroup label="Gelir">
                {f.categories.filter((c) => c.kind === 'income').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Gider">
                {f.categories.filter((c) => c.kind === 'expense').map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            </Select>
          </div>
        </div>

        {/* Özet */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-b border-line px-5 py-3.5 text-xs">
          <span className="flex items-center gap-1.5 text-muted">
            <FunnelSimple size={14} /> {rows.length.toLocaleString('tr-TR')} işlem
          </span>
          <span className="text-muted">
            Giriş <Money value={totals.inflow} tone="in" decimals={0} className="font-semibold" />
          </span>
          <span className="text-muted">
            Çıkış <Money value={-totals.outflow} tone="out" decimals={0} className="font-semibold" />
          </span>
          <span className="text-muted">
            Net <Money value={totals.net} tone="auto" sign="always" decimals={0} className="font-semibold" />
          </span>
          {activeFilters.map((a) => (
            <button key={a.key} type="button" onClick={() => setParam(a.key, '')} className="inline-flex items-center gap-1 rounded-full bg-cobalt-soft px-2.5 py-1 text-2xs text-cobalt-ink">
              {a.label} <X size={11} weight="bold" />
            </button>
          ))}
        </div>

        {/* Liste */}
        <div className="px-2 pb-4 sm:px-3">
          {groups.map((g) => (
            <section key={g.date}>
              <div className="sticky top-16 z-[1] flex items-baseline justify-between bg-[color-mix(in_oklab,var(--surface)_94%,transparent)] px-3 pb-2 pt-4 backdrop-blur">
                <h3 className="text-xs font-semibold text-ink-2">
                  {formatDate(g.date)} <span className="font-normal text-muted">· {formatWeekday(g.date)}</span>
                </h3>
                <Money value={g.net} tone="auto" sign="always" decimals={0} className="text-2xs font-medium" />
              </div>
              <ul>
                {g.items.map((t) => (
                  <TransactionRow key={t.id} t={t} selected={selected.has(t.id)} onToggle={() => toggle(t.id)} />
                ))}
              </ul>
            </section>
          ))}
          {!rows.length && (
            <div className="py-16 text-center">
              <p className="text-sm text-muted">Bu filtrelerle eşleşen işlem yok.</p>
              <Button className="mt-4" variant="secondary" size="sm" onClick={() => { setQuery(''); setPeriod('all'); setKind('all'); setAccountId(''); setParams({}, { replace: true }); }}>
                Filtreleri temizle
              </Button>
            </div>
          )}
          <div ref={sentinel} className="h-8" />
        </div>
      </Panel>

      {/* Toplu işlem çubuğu */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            className="fixed bottom-24 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-[18px] border border-line bg-surface px-4 py-3 shadow-[var(--float-shadow)] lg:bottom-8"
          >
            <span className="mr-2 text-sm font-medium">{selected.size} seçili</span>
            <div className="w-52">
              <Select aria-label="Kategori ata" defaultValue="" onChange={(e) => e.target.value && void bulkCategorize(e.target.value)} className="h-9 text-xs">
                <option value="">Kategori ata…</option>
                {f.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button size="sm" variant="danger" icon={<Trash size={14} />} onClick={bulkDelete}>
              Sil
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Vazgeç
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <ImportSheet open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}
