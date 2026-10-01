import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { CheckCircle, Copy, DownloadSimple, FileArrowUp, WarningCircle } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { Sheet } from '@/ui/Overlay';
import { Button } from '@/ui/Button';
import { Field, Select } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { Badge } from '@/ui/bits';
import { Money } from '@/ui/Money';
import { cn } from '@/ui/cn';
import type { Cell } from '@/domain/statement';
import type { ContactKind } from '@/domain/types';
import { findContactHeader, guessContactMapping, normalizeContactRows, type ContactMapping } from '@/domain/contact-import';
import { readSpreadsheet } from '@/data/spreadsheet';
import { download } from '@/data/export';
import { importContacts } from '@/data/repo';

const TEMPLATE =
  'Ünvan;Tür;VKN/TCKN;Vergi dairesi;Telefon;E-posta;IBAN;Adres;Vade (gün);Bakiye\n' +
  'Yıldız Gıda A.Ş.;Müşteri;;Kadıköy;0532 000 00 00;muhasebe@ornek.com;;İstanbul;30;12.500,00 B\n' +
  'Demir Kumaş Ltd. Şti.;Tedarikçi;;;;;;;45;8.000,00 A\n';

const FIELDS: Array<[keyof ContactMapping, string]> = [
  ['name', 'Ünvan / ad'],
  ['kind', 'Tür (müşteri/tedarikçi)'],
  ['taxId', 'VKN / TCKN'],
  ['taxOffice', 'Vergi dairesi'],
  ['phone', 'Telefon'],
  ['email', 'E-posta'],
  ['iban', 'IBAN'],
  ['address', 'Adres'],
  ['termDays', 'Vade (gün)'],
  ['balance', 'Bakiye (+/− ya da B/A)'],
  ['debit', 'Borç (bize borçlu)'],
  ['credit', 'Alacak (biz borçluyuz)'],
];

export function ContactImportSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Carileri içe aktar"
      description="Muhasebe programınızdan ya da Excel'den aldığınız cari listesini yükleyin."
      width={860}
    >
      {open && <Wizard onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function Wizard({ onDone }: { onDone: () => void }) {
  const f = useFinance();
  const [fileName, setFileName] = useState('');
  const [raw, setRaw] = useState<Cell[][] | null>(null);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<ContactMapping | null>(null);
  const [defaultKind, setDefaultKind] = useState<ContactKind>('customer');
  const [includeDup, setIncludeDup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  const headers = raw ? raw[headerRow]!.map((c) => String(c ?? '')) : [];
  const dataRows = useMemo(
    () => (raw ? raw.slice(headerRow + 1).filter((r) => r.some((c) => String(c ?? '').trim() !== '')) : []),
    [raw, headerRow],
  );
  const result = useMemo(
    () => (mapping ? normalizeContactRows(dataRows, mapping, defaultKind, f.contacts) : null),
    [mapping, dataRows, defaultKind, f.contacts],
  );

  async function onFile(file: File) {
    try {
      const rows = await readSpreadsheet(file);
      if (!rows.length) throw new Error('Dosya boş görünüyor');
      const h = findContactHeader(rows);
      const m = guessContactMapping(rows[h]!.map((c) => String(c ?? '')));
      setFileName(file.name);
      setRaw(rows);
      setHeaderRow(h);
      setMapping(m ?? { name: 0 });
    } catch (e) {
      toast.error('Dosya okunamadı', { description: e instanceof Error ? e.message : String(e) });
    }
  }

  async function run() {
    if (!result) return;
    const chosen = result.items.filter((i) => includeDup || !i.duplicate);
    if (!chosen.length) return;
    setBusy(true);
    try {
      const n = await importContacts(
        chosen.map((i) => ({
          name: i.name,
          kind: i.kind,
          taxId: i.taxId,
          taxOffice: i.taxOffice,
          phone: i.phone,
          email: i.email,
          iban: i.iban,
          address: i.address,
          paymentTermDays: i.paymentTermDays ?? 30,
          currency: 'TRY',
          openingBalance: i.openingBalance,
          // Devir bugüne ait: sonradan içe aktarılan eski hareketler bakiyeyi iki kez değiştirmez
          openingDate: i.openingBalance ? f.today : undefined,
          tags: [],
          archived: false,
        })),
      );
      toast.success(`${n} cari eklendi`, { description: 'Devir bakiyeleri bugünün tarihiyle kaydedildi.' });
      onDone();
    } catch (e) {
      toast.error('Aktarım tamamlanamadı', { description: e instanceof Error ? e.message : String(e) });
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
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-[22px] border-2 border-dashed px-6 py-14 text-center transition-colors focus-within:border-cobalt focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--cobalt)_22%,transparent)]',
            drag ? 'border-cobalt bg-cobalt-soft/50' : 'border-line-strong hover:border-cobalt/60 hover:bg-surface-2',
          )}
        >
          <motion.span animate={drag ? { scale: 1.15, y: -4 } : { scale: 1, y: 0 }} className="text-cobalt">
            <FileArrowUp size={40} weight="duotone" />
          </motion.span>
          <span className="text-sm font-semibold">Cari listesini buraya bırakın ya da seçin</span>
          <span className="max-w-md text-xs text-muted">
            Logo, Mikro, Luca, Paraşüt gibi programların Excel/CSV cari listeleri ya da kendi tablonuz. Kolonlar otomatik tanınır;
            “12.500,00 B / A” biçimindeki bakiyeler de anlaşılır.
          </span>
          <input type="file" accept=".csv,.xlsx,.xls,.txt" className="sr-only" onChange={(e) => e.target.files?.[0] && void onFile(e.target.files[0])} />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 text-2xs text-muted">
          <span>Dosya bu cihazdan çıkmaz; tamamen tarayıcınızda işlenir.</span>
          <Button size="sm" variant="ghost" icon={<DownloadSimple size={14} />} onClick={() => download('mizan-cari-sablonu.csv', '﻿' + TEMPLATE)}>
            Örnek şablonu indir
          </Button>
        </div>
      </div>
    );
  }

  const items = result?.items ?? [];
  const dupCount = items.filter((i) => i.duplicate).length;
  const problemCount = items.filter((i) => i.problems.length).length;
  const chosen = items.filter((i) => includeDup || !i.duplicate);
  const recv = chosen.reduce((s, i) => s + Math.max(0, i.openingBalance), 0);
  const pay = chosen.reduce((s, i) => s + Math.max(0, -i.openingBalance), 0);
  const setMap = (key: keyof ContactMapping, v: string) =>
    setMapping((m) => {
      const next = { ...(m ?? { name: 0 }) } as ContactMapping;
      if (v === '' && key !== 'name') delete next[key];
      else (next as unknown as Record<string, number>)[key] = Number(v);
      return next;
    });

  // ---- 2. Eşleme + kontrol (tek ekran: değişiklik önizlemeye anında yansır)
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] bg-sunken px-4 py-3 text-xs">
        <span>
          <strong>{fileName}</strong> · {dataRows.length} satır
        </span>
        <Button size="sm" variant="ghost" onClick={() => setRaw(null)}>
          Başka dosya
        </Button>
      </div>

      <details className="group rounded-[16px] border border-line" open={!mapping || mapping.name === undefined}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
          Kolon eşleştirme
          <span className="text-2xs font-normal text-muted group-open:hidden">
            {FIELDS.filter(([k]) => mapping?.[k] !== undefined).length} kolon tanındı · düzenlemek için açın
          </span>
        </summary>
        <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Başlık satırı">
            {(p) => (
              <Select
                {...p}
                value={headerRow}
                onChange={(e) => {
                  const h = Number(e.target.value);
                  setHeaderRow(h);
                  setMapping(guessContactMapping(raw[h]!.map((c) => String(c ?? ''))) ?? { name: 0 });
                }}
              >
                {raw.slice(0, 25).map((r, i) => (
                  <option key={i} value={i}>
                    {i + 1}. satır · {r.slice(0, 3).map((c) => String(c ?? '')).join(' | ').slice(0, 36)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          {FIELDS.map(([key, label]) => (
            <Field key={key} label={label} optional={key !== 'name'}>
              {(p) => (
                <Select {...p} value={mapping?.[key] ?? ''} onChange={(e) => setMap(key, e.target.value)}>
                  {key !== 'name' && <option value="">—</option>}
                  {headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Kolon ${i + 1}`}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          ))}
        </div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-muted">Türü belirtilmeyenler:</span>
        <Segmented
          label="Varsayılan cari türü"
          size="sm"
          value={defaultKind}
          onChange={setDefaultKind}
          options={[
            { value: 'customer', label: 'Müşteri' },
            { value: 'supplier', label: 'Tedarikçi' },
            { value: 'both', label: 'İkisi de' },
          ]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge tone="cobalt">{chosen.length} cari eklenecek</Badge>
        {recv > 0 && (
          <Badge tone="in">
            Alacak devri <Money value={recv} decimals={0} className="ml-1" />
          </Badge>
        )}
        {pay > 0 && (
          <Badge tone="out">
            Borç devri <Money value={pay} decimals={0} className="ml-1" />
          </Badge>
        )}
        {problemCount > 0 && <Badge tone="warn" icon={<WarningCircle size={12} />}>{problemCount} satırda düzeltme</Badge>}
        {dupCount > 0 && (
          <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-muted">
            <input type="checkbox" checked={includeDup} onChange={(e) => setIncludeDup(e.target.checked)} className="h-4 w-4 accent-[var(--cobalt)]" />
            <Copy size={12} /> {dupCount} mükerrer/kayıtlı cariyi de ekle
          </label>
        )}
        {!problemCount && !dupCount && items.length > 0 && <Badge tone="in" icon={<CheckCircle size={12} />}>Sorun yok</Badge>}
      </div>

      <div className="overflow-hidden rounded-[16px] border border-line">
        <ul className="scrollbar-thin max-h-[48vh] divide-y divide-line overflow-y-auto">
          {items.map((i) => (
            <li key={i.row} className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-xs', i.duplicate && !includeDup && 'opacity-50')}>
              <div className="min-w-0 flex-1 basis-48">
                <div className="truncate text-sm font-medium">{i.name}</div>
                <div className="truncate text-2xs text-muted">
                  {[i.kind === 'customer' ? 'Müşteri' : i.kind === 'supplier' ? 'Tedarikçi' : i.kind === 'both' ? 'Müşteri + tedarikçi' : 'Diğer', i.taxId, i.phone, i.email]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
                {i.duplicate && <div className="text-2xs text-saffron-text">{i.duplicate === 'existing' ? 'Zaten kayıtlı' : 'Dosyada tekrar ediyor'}</div>}
                {i.problems.map((p) => (
                  <div key={p} className="text-2xs text-saffron-text">
                    {p}
                  </div>
                ))}
              </div>
              <div className="ml-auto text-right">
                {i.openingBalance ? (
                  <>
                    <Money value={Math.abs(i.openingBalance)} decimals={0} className={cn('text-sm font-semibold', i.openingBalance > 0 ? 'text-inflow-text' : 'text-outflow-text')} />
                    <div className="text-2xs text-muted">{i.openingBalance > 0 ? 'bize borçlu' : 'biz borçluyuz'}</div>
                  </>
                ) : (
                  <span className="text-2xs text-faint">bakiye yok</span>
                )}
              </div>
            </li>
          ))}
          {!items.length && <li className="px-4 py-8 text-center text-sm text-muted">Okunabilir satır bulunamadı. Başlık satırını ve ünvan kolonunu kontrol edin.</li>}
        </ul>
      </div>

      <div className="sticky -bottom-5 -mx-6 -mb-5 flex items-center justify-between gap-3 border-t border-line bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-6 py-4 backdrop-blur">
        <Button variant="ghost" onClick={onDone}>
          Vazgeç
        </Button>
        <Button variant="primary" magnetic loading={busy} onClick={run} disabled={!chosen.length}>
          {chosen.length} cariyi ekle
        </Button>
      </div>
    </div>
  );
}
