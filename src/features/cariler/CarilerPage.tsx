import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { Archive, MagnifyingGlass, Plus, UploadSimple } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { useParamAction } from '@/app/useParamAction';
import { PageHeader } from '@/ui/PageHeader';
import { Panel } from '@/ui/Panel';
import { Segmented } from '@/ui/Segmented';
import { Button } from '@/ui/Button';
import { Badge, Monogram, Tip } from '@/ui/bits';
import { Money } from '@/ui/Money';
import { cn } from '@/ui/cn';
import { percent } from '@/ui/format';
import { amountInBase } from '@/domain/balances';
import { normalizeTr } from '@/domain/nlp';
import type { ID } from '@/domain/types';
import { ContactSheet } from './ContactSheet';
import { ContactImportSheet } from './ContactImportSheet';

type Tab = 'all' | 'customer' | 'supplier';
type Sort = 'balance' | 'overdue' | 'name' | 'delay';

export default function CarilerPage() {
  const f = useFinance();
  const [tab, setTab] = useState<Tab>('all');
  const [sort, setSort] = useState<Sort>('balance');
  const [q, setQ] = useState('');
  const [sheet, setSheet] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  useParamAction('yeni', () => setSheet(true));
  useParamAction('ice-aktar', () => setImportOpen(true));

  const overdueBy = useMemo(() => {
    const map = new Map<ID, number>();
    for (const d of f.documents) {
      const st = f.docStates.get(d.id);
      if (!d.contactId || st?.status !== 'overdue') continue;
      const v = amountInBase(st.remaining, d.rateToBase) * (d.direction === 'receivable' ? 1 : -1);
      map.set(d.contactId, (map.get(d.contactId) ?? 0) + v);
    }
    return map;
  }, [f.documents, f.docStates]);

  const rows = useMemo(() => {
    const nq = normalizeTr(q);
    const list = f.contacts
      .filter((c) => showArchived || !c.archived)
      .filter((c) => (tab === 'all' ? true : tab === 'customer' ? c.kind === 'customer' || c.kind === 'both' : c.kind === 'supplier' || c.kind === 'both'))
      .filter((c) => !nq || normalizeTr(`${c.name} ${c.taxId ?? ''} ${c.phone ?? ''}`).includes(nq))
      .map((c) => {
        const bal = f.contactBalances.get(c.id) ?? 0;
        return { c, bal, balBase: amountInBase(bal, f.rates[c.currency]), overdue: overdueBy.get(c.id) ?? 0, behavior: f.behavior.get(c.id) };
      });
    const cmp: Record<Sort, (a: (typeof list)[number], b: (typeof list)[number]) => number> = {
      balance: (a, b) => Math.abs(b.balBase) - Math.abs(a.balBase),
      overdue: (a, b) => Math.abs(b.overdue) - Math.abs(a.overdue),
      name: (a, b) => a.c.name.localeCompare(b.c.name, 'tr'),
      delay: (a, b) => (b.behavior?.avgDelay ?? -99) - (a.behavior?.avgDelay ?? -99),
    };
    return list.sort(cmp[sort]);
  }, [f.contacts, f.contactBalances, f.rates, f.behavior, overdueBy, tab, sort, q, showArchived]);

  const totals = useMemo(() => {
    let recv = 0;
    let pay = 0;
    for (const c of f.contacts) {
      const b = amountInBase(f.contactBalances.get(c.id) ?? 0, f.rates[c.currency]);
      if (b > 0) recv += b;
      else pay += -b;
    }
    return { recv, pay };
  }, [f.contacts, f.contactBalances, f.rates]);

  return (
    <div>
      <PageHeader
        kicker={`${f.contacts.filter((c) => !c.archived).length} cari`}
        title="Cariler"
        actions={
          <>
            {f.contacts.some((c) => c.archived) && (
              <Button variant="ghost" icon={<Archive size={16} />} onClick={() => setShowArchived((v) => !v)}>
                {showArchived ? 'Arşivi gizle' : 'Arşivi göster'}
              </Button>
            )}
            <Button variant="secondary" icon={<UploadSimple size={16} />} onClick={() => setImportOpen(true)}>
              Excel'den aktar
            </Button>
            <Button variant="primary" magnetic icon={<Plus size={16} weight="bold" />} onClick={() => setSheet(true)}>
              Cari
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <SummaryCard label="Toplam alacak" value={totals.recv} tone="in" index={0} />
        <SummaryCard label="Toplam borç" value={totals.pay} tone="out" index={1} />
        <SummaryCard label="Net cari pozisyon" value={totals.recv - totals.pay} tone={totals.recv >= totals.pay ? 'in' : 'out'} index={2} />
      </div>

      <Panel reveal={0} padded={false}>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4 sm:p-5">
          <div className="relative min-w-56 flex-1">
            <MagnifyingGlass size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Ad, vergi no ya da telefon ara"
              aria-label="Cari ara"
              className="h-10 w-full rounded-[12px] border border-line-strong bg-surface pl-10 pr-3 text-sm outline-none focus:border-cobalt focus:shadow-[0_0_0_3px_color-mix(in_oklab,var(--cobalt)_18%,transparent)]"
            />
          </div>
          <Segmented label="Tür" size="sm" value={tab} onChange={setTab} options={[{ value: 'all', label: 'Tümü' }, { value: 'customer', label: 'Müşteriler' }, { value: 'supplier', label: 'Tedarikçiler' }]} />
          <Segmented
            label="Sırala"
            size="sm"
            value={sort}
            onChange={setSort}
            options={[
              { value: 'balance', label: 'Bakiye' },
              { value: 'overdue', label: 'Gecikme' },
              { value: 'delay', label: 'Ödeme alışkanlığı' },
              { value: 'name', label: 'Ad' },
            ]}
          />
        </div>

        {/* 1024–1279: risk limiti sütunu yok (cari detayında var); 5 sütun cari adını ~10 px'e sıkıştırıyordu */}
        <div className="hidden gap-4 border-b border-line px-6 py-2.5 text-2xs font-medium text-muted lg:grid lg:grid-cols-[minmax(200px,1fr)_140px_150px_150px] xl:grid-cols-[minmax(220px,1fr)_140px_170px_150px_150px]">
          <span>Cari</span>
          <span>Ödeme alışkanlığı</span>
          <span className="hidden xl:block">Risk limiti</span>
          <span className="text-right">Gecikmiş</span>
          <span className="text-right">Bakiye</span>
        </div>
        <ul className="divide-y divide-line">
          {rows.map(({ c, bal, overdue, behavior }, i) => {
            const usage = c.riskLimit ? Math.max(0, bal) / c.riskLimit : null;
            return (
              <motion.li key={c.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 12) * 0.025 }}>
                <Link
                  to={`/cariler/${c.id}`}
                  viewTransition
                  className={cn(
                    'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3.5 transition-colors hover:bg-surface-2 sm:px-6 lg:grid-cols-[minmax(200px,1fr)_140px_150px_150px] xl:grid-cols-[minmax(220px,1fr)_140px_170px_150px_150px]',
                    c.archived && 'opacity-60',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span style={{ viewTransitionName: `contact-${c.id}` }}>
                      <Monogram name={c.name} size={38} />
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{c.name}</div>
                      <div className="flex items-center gap-1.5 text-2xs text-muted">
                        {c.kind === 'customer' ? 'Müşteri' : c.kind === 'supplier' ? 'Tedarikçi' : c.kind === 'both' ? 'Müşteri ve tedarikçi' : 'Diğer'}
                        {c.paymentTermDays ? ` · ${c.paymentTermDays} gün vade` : ''}
                        {c.currency !== 'TRY' && <Badge tone="muted" className="h-5">{c.currency}</Badge>}
                        {c.archived && <Badge tone="muted" className="h-5">Arşiv</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="hidden lg:block">
                    {behavior ? <DelayMeter delay={behavior.avgDelay} onTime={behavior.onTimeRate} /> : <span className="text-2xs text-faint">Veri yok</span>}
                  </div>
                  <div className="hidden xl:block">
                    {usage != null ? (
                      <Tip content={`Limitin ${percent(usage)} kadarı kullanılıyor`}>
                        <div>
                          <div className="h-1.5 overflow-hidden rounded-full bg-sunken">
                            <motion.div
                              className={cn('h-full rounded-full', usage > 1 ? 'bg-outflow' : usage > 0.8 ? 'bg-saffron' : 'bg-cobalt')}
                              initial={{ width: 0 }}
                              animate={{ width: `${Math.min(1, usage) * 100}%` }}
                              transition={{ delay: 0.3 + i * 0.03, duration: 0.8, ease: [0.25, 1, 0.5, 1] }}
                            />
                          </div>
                          <div className="mt-1 text-2xs text-muted">{percent(usage)} · <Money value={c.riskLimit!} decimals={0} /></div>
                        </div>
                      </Tip>
                    ) : (
                      <span className="text-2xs text-faint">Limit yok</span>
                    )}
                  </div>
                  {/* Gecikme her yönde risktir: yeşil ("iyi") görünmesin */}
                  <div className="hidden text-right lg:block">
                    {overdue ? <Money value={Math.abs(overdue)} decimals={0} className="text-sm font-medium text-outflow-text" /> : <span className="text-2xs text-faint">—</span>}
                  </div>
                  <div className="text-right">
                    <Money value={bal} currency={c.currency} tone="auto" decimals={0} className="text-sm font-semibold" />
                    <div className="text-2xs text-muted">{bal > 0 ? 'bize borçlu' : bal < 0 ? 'borçluyuz' : 'kapalı'}</div>
                  </div>
                </Link>
              </motion.li>
            );
          })}
        </ul>
        {!rows.length &&
          (f.contacts.length ? (
            <p className="py-14 text-center text-sm text-muted">Aramanızla eşleşen cari yok.</p>
          ) : (
            <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
              <p className="text-sm font-semibold text-ink">Henüz cari yok</p>
              <p className="max-w-sm text-xs leading-relaxed text-muted">
                Müşteri ve tedarikçilerinizi tek tek ekleyebilir ya da muhasebe programınızdan aldığınız listeyi bir kerede aktarabilirsiniz.
              </p>
              <div className="mt-1 flex flex-wrap justify-center gap-2">
                <Button variant="secondary" icon={<UploadSimple size={16} />} onClick={() => setImportOpen(true)}>
                  Excel'den aktar
                </Button>
                <Button variant="primary" icon={<Plus size={16} weight="bold" />} onClick={() => setSheet(true)}>
                  Cari ekle
                </Button>
              </div>
            </div>
          ))}
      </Panel>

      <ContactSheet open={sheet} onOpenChange={setSheet} />
      <ContactImportSheet open={importOpen} onOpenChange={setImportOpen} />
    </div>
  );
}

function SummaryCard({ label, value, tone, index }: { label: string; value: number; tone: 'in' | 'out'; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.06, duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
      className="panel px-5 py-4"
    >
      <div className="text-xs text-muted">{label}</div>
      <Money value={value} decimals={0} className={cn('display mt-1 block text-[1.75rem]', tone === 'in' ? 'text-inflow-text' : 'text-outflow-text')} />
    </motion.div>
  );
}

/** Ödeme alışkanlığı: ortalama gecikme gün + zamanında ödeme oranı. */
export function DelayMeter({ delay, onTime }: { delay: number; onTime: number }) {
  const tone = delay <= 3 ? 'text-inflow-text' : delay <= 15 ? 'text-saffron-text' : 'text-outflow-text';
  const bar = delay <= 3 ? 'bg-inflow' : delay <= 15 ? 'bg-saffron' : 'bg-outflow';
  return (
    <div>
      <div className={cn('text-xs font-medium', tone)}>{delay <= 0 ? 'Zamanında' : `ort. ${delay} gün geç`}</div>
      <div className="mt-1 flex gap-0.5" aria-hidden>
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={cn('h-1 flex-1 rounded-full', i < Math.round(onTime * 10) ? bar : 'bg-sunken')} />
        ))}
      </div>
      <div className="mt-0.5 text-[10px] text-muted">{percent(onTime)} zamanında</div>
    </div>
  );
}
