import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { FileArrowUp, CheckCircle, WarningCircle, Sparkle, Copy } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { buildEntryContext } from '@/app/entry-context';
import { Sheet } from '@/ui/Overlay';
import { Button } from '@/ui/Button';
import { Field, Select } from '@/ui/Field';
import { Badge, Tip } from '@/ui/bits';
import { Money } from '@/ui/Money';
import { cn } from '@/ui/cn';
import { formatDateShort } from '@/ui/format';
import {
  descriptionPattern,
  guessMapping,
  importHash,
  normalizeRows,
  suggestCategory,
  type Cell,
  type Mapping,
  type StatementItem,
  type Suggestion,
} from '@/domain/statement';
import { planAllocation } from '@/domain/documents';
import type { ID } from '@/domain/types';
import { importTransactions, learnRule, type ImportRow } from '@/data/repo';
import { useAi } from '@/ai/useAi';
import { findHeaderRow, readSpreadsheet } from '@/data/spreadsheet';

const readFile = readSpreadsheet;

/** Başlık satırını bul: bankalar üstte birkaç başlık satırı koyar. */
const findHeader = (rows: Cell[][]) =>
  findHeaderRow(rows, (cells) => cells.some((c) => c.includes('tarih')) && cells.some((c) => /tutar|borc|alacak|miktar/.test(c)));

interface ReviewRow extends StatementItem {
  include: boolean;
  duplicate: boolean;
  suggestion: Suggestion;
  categoryId?: ID;
  contactId?: ID;
  edited: boolean;
}

export function ImportSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Ekstre içe aktar" description="Bankanızdan indirdiğiniz Excel (.xlsx) ya da CSV ekstresini yükleyin." width={820}>
      {open && <ImportWizard onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function ImportWizard({ onDone }: { onDone: () => void }) {
  const f = useFinance();
  const ai = useAi();
  const [aiBusy, setAiBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const [raw, setRaw] = useState<Cell[][] | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Mapping | null>(null);
  const [accountId, setAccountId] = useState(f.accounts.find((a) => a.kind === 'bank' && !a.archived)?.id ?? '');
  const [review, setReview] = useState<ReviewRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const headers = raw ? raw[headerRow]!.map((c) => String(c ?? '')) : [];
  const dataRows = raw ? raw.slice(headerRow + 1).filter((r) => r.some((c) => String(c ?? '').trim() !== '')) : [];

  async function onFile(file: File) {
    try {
      const rows = await readFile(file);
      if (!rows.length) throw new Error('Dosya boş görünüyor');
      const h = findHeader(rows);
      setFileName(file.name);
      setRaw(rows);
      setHeaderRow(h);
      setMapping(guessMapping(rows[h]!.map((c) => String(c ?? ''))));
      setReview(null);
    } catch (e) {
      toast.error('Dosya okunamadı', { description: e instanceof Error ? e.message : String(e) });
    }
  }

  const parsed = useMemo(() => (mapping ? normalizeRows(dataRows, mapping) : null), [mapping, dataRows]); // eslint-disable-line react-hooks/exhaustive-deps

  function buildReview() {
    if (!parsed || !accountId) return;
    const ctx = buildEntryContext(f);
    const existing = new Set(f.transactions.filter((t) => t.importHash).map((t) => t.importHash!));
    // Aynı hesapta aynı gün + tutarlı işlem de olası mükerrer sayılır
    const sameDayAmount = new Set(f.transactions.filter((t) => t.accountId === accountId).map((t) => `${t.date}|${t.kind === 'expense' ? -t.amount : t.amount}`));
    const sctx = {
      categories: ctx.categories,
      contacts: ctx.contacts,
      rules: f.rules.map((r) => ({ pattern: r.pattern, categoryId: r.categoryId, contactId: r.contactId })),
    };
    setReview(
      parsed.items.map((it) => {
        const hash = importHash(accountId, it.date, it.amount, it.description);
        const duplicate = existing.has(hash) || sameDayAmount.has(`${it.date}|${it.amount}`);
        const suggestion = suggestCategory(it.description, it.amount, sctx);
        return { ...it, include: !duplicate, duplicate, suggestion, categoryId: suggestion.categoryId, contactId: suggestion.contactId, edited: false };
      }),
    );
  }

  async function runImport() {
    if (!review) return;
    const account = f.accountsById.get(accountId);
    if (!account) return;
    setBusy(true);
    try {
      const rate = f.rates[account.currency] ?? 1;
      // Cari eşleşmelerinde açık belgelere FIFO dağıtım (satır sırasıyla, kalanlar güncellenerek)
      const remaining = new Map<ID, number>();
      for (const d of f.documents) remaining.set(d.id, f.docStates.get(d.id)?.remaining ?? 0);
      const rows: ImportRow[] = [];
      const chosen = review.filter((r) => r.include).sort((a, b) => a.date.localeCompare(b.date));
      for (const r of chosen) {
        const inflow = r.amount > 0;
        const amount = Math.abs(r.amount);
        let allocations: ImportRow['allocations'] = [];
        const contact = r.contactId ? f.contactsById.get(r.contactId) : undefined;
        // Devirden önceki ödeme devire zaten dahil: faturaya dağıtılmaz. Ödeme, kendisinden sonra kesilen faturayı kapatamaz.
        if (r.contactId && !(contact?.openingDate && r.date < contact.openingDate)) {
          const open = f.documents
            .filter((d) => d.contactId === r.contactId && d.direction === (inflow ? 'receivable' : 'payable') && d.currency === account.currency && !d.cancelled && d.issueDate <= r.date)
            .map((d) => ({ id: d.id, dueDate: d.dueDate, remaining: remaining.get(d.id) ?? 0 }))
            .filter((d) => d.remaining > 0);
          allocations = planAllocation(amount, open).allocations;
          for (const a of allocations) remaining.set(a.documentId, (remaining.get(a.documentId) ?? 0) - a.amount);
        }
        const catFromDoc = allocations[0] ? f.documents.find((d) => d.id === allocations[0]!.documentId)?.categoryId : undefined;
        rows.push({
          transaction: {
            kind: inflow ? 'income' : 'expense',
            date: r.date,
            accountId,
            amount,
            currency: account.currency,
            rateToBase: rate,
            categoryId: r.categoryId ?? catFromDoc,
            contactId: r.contactId,
            affectsLedger: Boolean(r.contactId),
            description: r.description,
            tags: [],
            source: 'import',
            importHash: importHash(accountId, r.date, r.amount, r.description),
          },
          allocations,
        });
      }
      await importTransactions(rows);
      // Kullanıcının düzelttiği eşleşmeleri öğren
      for (const r of chosen.filter((x) => x.edited && (x.categoryId || x.contactId))) {
        const pattern = descriptionPattern(r.description);
        if (pattern) await learnRule(pattern, { categoryId: r.categoryId, contactId: r.contactId }, 'user');
      }
      const matched = rows.filter((r) => r.allocations.length).length;
      toast.success(`${rows.length} işlem içe aktarıldı`, { description: matched ? `${matched} tanesi açık faturalarla otomatik eşleşti.` : undefined });
      onDone();
    } catch (e) {
      toast.error('İçe aktarma tamamlanamadı', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  }

  // ---- 1. Dosya
  if (!raw) {
    return (
      <div className="space-y-5">
        <label
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDrag(false);
            const file = e.dataTransfer.files[0];
            if (file) void onFile(file);
          }}
          className={cn(
            // focus-within: gizli dosya girişine Tab ile gelindiğinde odak görünsün (WCAG 2.4.7)
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-dashed px-6 py-16 text-center transition-colors focus-within:border-cobalt focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--cobalt)_22%,transparent)]',
            drag ? 'border-cobalt bg-cobalt-soft/50' : 'border-line-strong hover:border-cobalt/60 hover:bg-surface-2',
          )}
        >
          <motion.span animate={drag ? { scale: 1.15, y: -4 } : { scale: 1, y: 0 }} className="text-cobalt">
            <FileArrowUp size={40} weight="duotone" />
          </motion.span>
          <span className="text-sm font-semibold">Ekstre dosyasını buraya bırakın ya da seçin</span>
          <span className="max-w-md text-xs text-muted">
            Garanti BBVA, İş Bankası, Ziraat, Akbank, Yapı Kredi ve diğer bankaların Excel/CSV ekstreleri desteklenir. Kolonlar otomatik tanınır; gerekirse siz düzeltirsiniz.
          </span>
          <input type="file" accept=".csv,.xlsx,.xls,.txt" className="sr-only" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        </label>
        <p className="text-2xs text-muted">Dosya bu cihazdan çıkmaz; tamamen tarayıcınızda işlenir.</p>
      </div>
    );
  }

  // ---- 2. Eşleme
  if (!review) {
    const colOptions = headers.map((h, i) => (
      <option key={i} value={i}>
        {h || `Kolon ${i + 1}`}
      </option>
    ));
    const setMap = (key: keyof Mapping, v: string) =>
      setMapping((m) => {
        const next = { ...m! } as Mapping;
        if (v === '') delete next[key];
        else (next as unknown as Record<string, number>)[key] = Number(v);
        return next;
      });
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 rounded-[14px] bg-sunken px-4 py-3 text-xs">
          <span>
            <strong>{fileName}</strong> · {dataRows.length} satır
          </span>
          <Button size="sm" variant="ghost" onClick={() => setRaw(null)}>
            Başka dosya
          </Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Hedef hesap">
            {(p) => (
              <Select {...p} value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {f.accounts.filter((a) => !a.archived).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Başlık satırı">
            {(p) => (
              <Select {...p} value={headerRow} onChange={(e) => { const h = Number(e.target.value); setHeaderRow(h); setMapping(guessMapping(raw[h]!.map((c) => String(c ?? '')))); }}>
                {raw.slice(0, 25).map((r, i) => (
                  <option key={i} value={i}>
                    {i + 1}. satır · {r.slice(0, 3).map((c) => String(c ?? '')).join(' | ').slice(0, 40)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Tarih kolonu">
            {(p) => <Select {...p} value={mapping?.date ?? ''} onChange={(e) => setMap('date', e.target.value)}>{colOptions}</Select>}
          </Field>
          <Field label="Açıklama kolonu">
            {(p) => <Select {...p} value={mapping?.description ?? ''} onChange={(e) => setMap('description', e.target.value)}>{colOptions}</Select>}
          </Field>
          <Field label="Tutar (işaretli)" optional>
            {(p) => (
              <Select {...p} value={mapping?.amount ?? ''} onChange={(e) => setMap('amount', e.target.value)}>
                <option value="">—</option>
                {colOptions}
              </Select>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Borç" optional>
              {(p) => (
                <Select {...p} value={mapping?.debit ?? ''} onChange={(e) => setMap('debit', e.target.value)}>
                  <option value="">—</option>
                  {colOptions}
                </Select>
              )}
            </Field>
            <Field label="Alacak" optional>
              {(p) => (
                <Select {...p} value={mapping?.credit ?? ''} onChange={(e) => setMap('credit', e.target.value)}>
                  <option value="">—</option>
                  {colOptions}
                </Select>
              )}
            </Field>
          </div>
        </div>

        {parsed && (
          <div className="rounded-[16px] border border-line">
            <div className="flex items-center justify-between border-b border-line px-4 py-2.5 text-xs">
              <span className="font-medium">Önizleme</span>
              <span className="text-muted">
                {parsed.items.length} okunabilir satır{parsed.errors.length ? ` · ${parsed.errors.length} atlanacak` : ''}
              </span>
            </div>
            <ul className="divide-y divide-line text-xs">
              {parsed.items.slice(0, 6).map((it) => (
                <li key={it.row} className="grid grid-cols-[90px_1fr_130px] gap-3 px-4 py-2">
                  <span className="num text-muted">{formatDateShort(it.date)}</span>
                  <span className="truncate">{it.description}</span>
                  <Money value={it.amount} tone="auto" sign="always" className="text-right font-medium" />
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="flex justify-end">
          <Button variant="primary" onClick={buildReview} disabled={!parsed?.items.length || !accountId}>
            Devam: eşleştir ve kontrol et
          </Button>
        </div>
      </div>
    );
  }

  // ---- 3. Kontrol
  const included = review.filter((r) => r.include);
  const target = f.accountsById.get(accountId);
  const beforeOpening = target ? included.filter((r) => r.date < target.openingDate).length : 0;
  const dupCount = review.filter((r) => r.duplicate).length;
  const unmatched = included.filter((r) => !r.categoryId && !r.contactId).length;
  const update = (row: number, patch: Partial<ReviewRow>) => setReview((list) => list!.map((r) => (r.row === row ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="cobalt">{included.length} aktarılacak</Badge>
        {dupCount > 0 && <Badge tone="warn" icon={<Copy size={12} />}>{dupCount} olası mükerrer atlandı</Badge>}
        {unmatched > 0 ? <Badge tone="muted" icon={<WarningCircle size={12} />}>{unmatched} satır kategorisiz</Badge> : <Badge tone="in" icon={<CheckCircle size={12} />}>Hepsi eşleşti</Badge>}
        <Tip content={ai.enabled ? 'Eşleşmeyen satırları Groq ile sınıflandırır; açıklamalar ve tutarlar gönderilir' : 'Ayarlar’dan yapay zekâyı açtığınızda kullanılabilir'}>
          <span className="ml-auto">
            <Button
              size="sm"
              variant="secondary"
              icon={<Sparkle size={14} weight="duotone" />}
              disabled={!ai.enabled || unmatched === 0}
              loading={aiBusy}
              onClick={async () => {
                const lines = review.filter((r) => r.include && !r.categoryId && !r.contactId).map((r) => ({ id: r.row, description: r.description, amount: r.amount }));
                setAiBusy(true);
                try {
                  const result = await ai.categorize(lines);
                  setReview((list) =>
                    list!.map((r) => {
                      const hit = result.get(r.row);
                      return hit ? { ...r, ...hit, edited: true, suggestion: { ...hit, confidence: 0.8, source: 'ai' as const } } : r;
                    }),
                  );
                  toast.success(`${result.size} satır sınıflandırıldı`, { description: 'Kontrol edip onaylayın; onayladıklarınız kural olarak öğrenilir.' });
                } catch (e) {
                  toast.error('Sınıflandırma başarısız', { description: e instanceof Error ? e.message : '' });
                } finally {
                  setAiBusy(false);
                }
              }}
            >
              Yapay zekâ ile sınıflandır
            </Button>
          </span>
        </Tip>
      </div>
      {beforeOpening > 0 && target && (
        <p className="flex items-start gap-2 rounded-[12px] bg-cobalt-soft/60 px-3 py-2 text-xs text-cobalt-ink">
          <WarningCircle size={14} className="mt-0.5 shrink-0" />
          <span>
            {beforeOpening} satır, “{target.name}” hesabının başlangıç tarihinden ({formatDateShort(target.openingDate)}) önce. Raporlarda ve geçmişte görünür;
            başlangıç bakiyesine zaten dahil olduğu için bugünkü bakiyeyi değiştirmez.
          </span>
        </p>
      )}
      <div className="rounded-[16px] border border-line">
        <ul className="scrollbar-thin max-h-[55vh] divide-y divide-line overflow-y-auto">
          {review.map((r) => (
            // Telefonda iki satır: [✓ açıklama tutar] / [kategori seçimi]; geniş ekranda tek satırlık tablo
            <li
              key={r.row}
              className={cn(
                'grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-2.5 text-xs sm:grid-cols-[24px_80px_minmax(0,1fr)_200px_120px] sm:py-2',
                !r.include && 'opacity-50',
              )}
            >
              <input type="checkbox" checked={r.include} onChange={(e) => update(r.row, { include: e.target.checked })} aria-label="Aktar" className="h-4 w-4 accent-[var(--cobalt)]" />
              <span className="num hidden text-muted sm:block">{formatDateShort(r.date)}</span>
              <div className="min-w-0">
                <div className="truncate">{r.description}</div>
                <div className="text-2xs text-muted">
                  <span className="num sm:hidden">{formatDateShort(r.date)} · </span>
                  {r.duplicate && <span className="text-saffron-text">Mükerrer olabilir · </span>}
                  {r.suggestion.source === 'rule' && 'Öğrenilmiş kural'}
                  {r.suggestion.source === 'contact' && 'Cari adı eşleşti · açık faturalara dağıtılacak'}
                  {r.suggestion.source === 'keyword' && 'Anahtar kelime'}
                  {r.suggestion.source === 'ai' && <span className="text-cobalt-ink">Yapay zekâ önerisi</span>}
                </div>
              </div>
              <div className="order-last col-span-2 col-start-2 min-w-0 sm:order-none sm:col-span-1 sm:col-start-auto">
                <Select
                  aria-label="Kategori ya da cari"
                  value={r.contactId ? `c:${r.contactId}` : r.categoryId ? `k:${r.categoryId}` : ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    update(r.row, { edited: true, contactId: v.startsWith('c:') ? v.slice(2) : undefined, categoryId: v.startsWith('k:') ? v.slice(2) : undefined });
                  }}
                  className="h-9 text-xs sm:h-8 sm:text-2xs"
                >
                  <option value="">Seçin…</option>
                  <optgroup label="Cariler">
                    {f.contacts.filter((c) => !c.archived).map((c) => (
                      <option key={c.id} value={`c:${c.id}`}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label={r.amount > 0 ? 'Gelir kategorileri' : 'Gider kategorileri'}>
                    {f.categories.filter((c) => c.kind === (r.amount > 0 ? 'income' : 'expense')).map((c) => (
                      <option key={c.id} value={`k:${c.id}`}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                </Select>
              </div>
              <Money value={r.amount} tone="auto" sign="always" className="text-right font-semibold" />
            </li>
          ))}
        </ul>
      </div>
      <div className="sticky -bottom-5 -mx-6 -mb-5 flex items-center justify-between gap-3 border-t border-line bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-6 py-4 backdrop-blur">
        <Button variant="ghost" onClick={() => setReview(null)}>
          Geri
        </Button>
        {included.length === 0 && dupCount > 0 ? (
          <span className="text-sm text-muted">Bu ekstredeki hareketlerin hepsi zaten kayıtlı; aktarılacak yeni hareket yok.</span>
        ) : (
          <Button variant="primary" magnetic loading={busy} onClick={runImport} disabled={!included.length}>
            {included.length} işlemi aktar
          </Button>
        )}
      </div>
    </div>
  );
}
