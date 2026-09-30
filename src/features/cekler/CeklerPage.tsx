import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { motion } from 'motion/react';
import { DropdownMenu } from 'radix-ui';
import { toast } from 'sonner';
import { DotsThreeVertical, Plus, ArrowDownLeft, ArrowUpRight } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { PageHeader } from '@/ui/PageHeader';
import { Panel, PanelHeader } from '@/ui/Panel';
import { Button, IconButton } from '@/ui/Button';
import { Badge, Tip } from '@/ui/bits';
import { Money } from '@/ui/Money';
import { Modal } from '@/ui/Overlay';
import { Select } from '@/ui/Field';
import { Segmented } from '@/ui/Segmented';
import { cn } from '@/ui/cn';
import { formatDateShort, formatDayMonth, relativeDay } from '@/ui/format';
import { addDays, diffDays, startOfWeek } from '@/domain/dates';
import { amountInBase } from '@/domain/balances';
import { planAllocation } from '@/domain/documents';
import { formatShort } from '@/domain/money';
import type { Instrument, InstrumentDirection, InstrumentStatus } from '@/domain/types';
import { transitionInstrument } from '@/data/repo';
import { InstrumentSheet } from './InstrumentSheet';

const STATUS: Record<InstrumentStatus, { label: string; tone: 'in' | 'out' | 'warn' | 'neutral' | 'muted' | 'cobalt' }> = {
  portfolio: { label: 'Portföyde', tone: 'cobalt' },
  deposited: { label: 'Tahsilde', tone: 'warn' },
  collected: { label: 'Tahsil edildi', tone: 'in' },
  endorsed: { label: 'Ciro edildi', tone: 'muted' },
  bounced: { label: 'Karşılıksız', tone: 'out' },
  returned: { label: 'İade edildi', tone: 'muted' },
  issued: { label: 'Ödenecek', tone: 'warn' },
  paid: { label: 'Ödendi', tone: 'in' },
  cancelled: { label: 'İptal', tone: 'muted' },
};

const LIVE: InstrumentStatus[] = ['portfolio', 'deposited', 'issued'];

export default function CeklerPage() {
  const f = useFinance();
  const [tab, setTab] = useState<'received' | 'issued' | 'history'>('received');
  const [sheet, setSheet] = useState<{ open: boolean; direction: InstrumentDirection }>({ open: false, direction: 'received' });
  const [endorse, setEndorse] = useState<Instrument | null>(null);

  const live = f.instruments.filter((i) => LIVE.includes(i.status));
  const received = live.filter((i) => i.direction === 'received');
  const issued = live.filter((i) => i.direction === 'issued');
  const bounced = f.instruments.filter((i) => i.status === 'bounced');
  const sum = (l: Instrument[]) => l.reduce((s, i) => s + amountInBase(i.amount, i.rateToBase), 0);
  const avgDays = received.length ? Math.round(received.reduce((s, i) => s + diffDays(i.dueDate, f.today) * i.amount, 0) / received.reduce((s, i) => s + i.amount, 0)) : 0;

  // Vade merdiveni: 12 hafta
  const ladder = useMemo(() => {
    const weeks = Array.from({ length: 12 }, (_, i) => addDays(startOfWeek(f.today), i * 7));
    return weeks.map((w) => {
      const end = addDays(w, 6);
      const inW = received.filter((i) => i.dueDate >= w && i.dueDate <= end);
      const outW = issued.filter((i) => i.dueDate >= w && i.dueDate <= end);
      return { week: w, inflow: sum(inW), outflow: sum(outW), count: inW.length + outW.length };
    });
  }, [received, issued, f.today]); // eslint-disable-line react-hooks/exhaustive-deps
  const maxLadder = Math.max(1, ...ladder.flatMap((l) => [l.inflow, l.outflow]));

  const rows = (tab === 'history' ? f.instruments.filter((i) => !LIVE.includes(i.status)) : tab === 'received' ? received : issued).sort((a, b) =>
    tab === 'history' ? b.dueDate.localeCompare(a.dueDate) : a.dueDate.localeCompare(b.dueDate),
  );

  async function move(ins: Instrument, status: InstrumentStatus) {
    const accountId = ins.accountId ?? f.accounts.find((a) => a.kind === 'bank' && a.currency === ins.currency && !a.archived)?.id;
    await transitionInstrument(ins, { status, date: f.today, accountId });
    toast.success(`${ins.kind === 'cheque' ? 'Çek' : 'Senet'} ${STATUS[status].label.toLocaleLowerCase('tr-TR')}`);
  }

  return (
    <div>
      <PageHeader
        kicker="Portföy, vade merdiveni ve ciro takibi"
        title="Çek ve senet"
        actions={
          <>
            <Button variant="secondary" icon={<ArrowUpRight size={16} />} onClick={() => setSheet({ open: true, direction: 'issued' })}>
              Verilen
            </Button>
            <Button variant="primary" magnetic icon={<Plus size={16} weight="bold" />} onClick={() => setSheet({ open: true, direction: 'received' })}>
              Alınan çek / senet
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label={`Portföyde · ${received.filter((i) => i.status === 'portfolio').length} adet`} value={sum(received.filter((i) => i.status === 'portfolio'))} tone="in" sub={`ortalama ${avgDays} gün vade`} index={0} />
        <Stat label={`Tahsilde · ${received.filter((i) => i.status === 'deposited').length} adet`} value={sum(received.filter((i) => i.status === 'deposited'))} tone="in" sub="bankaya verildi" index={1} />
        <Stat label={`Verilen · ${issued.length} adet`} value={sum(issued)} tone="out" sub="vadesinde hesaptan düşecek" index={2} />
        <Stat label={`Karşılıksız · ${bounced.length} adet`} value={sum(bounced)} tone={bounced.length ? 'out' : 'muted'} sub={bounced.length ? 'cari bakiyesine geri eklendi' : 'sorunlu evrak yok'} index={3} />
      </div>

      <Panel reveal={0} className="mb-5">
        <PanelHeader title="Vade merdiveni" description="Önümüzdeki 12 hafta · üst: tahsil edilecek, alt: ödenecek" />
        <div className="flex h-56 items-stretch gap-2">
          {ladder.map((l, i) => (
            <Tip key={l.week} content={`${formatDayMonth(l.week)} haftası · +${formatShort(l.inflow)} / −${formatShort(l.outflow)}`}>
              <div className="flex flex-1 flex-col">
                <div className="flex flex-1 items-end">
                  <motion.div className="w-full rounded-t-[6px] bg-inflow" initial={{ height: 0 }} animate={{ height: `${(l.inflow / maxLadder) * 100}%` }} transition={{ delay: 0.3 + i * 0.04, type: 'spring', stiffness: 150, damping: 20 }} />
                </div>
                <div className="h-px bg-line-strong" />
                <div className="flex flex-1 items-start">
                  <motion.div className="w-full rounded-b-[6px] bg-outflow" initial={{ height: 0 }} animate={{ height: `${(l.outflow / maxLadder) * 100}%` }} transition={{ delay: 0.4 + i * 0.04, type: 'spring', stiffness: 150, damping: 20 }} />
                </div>
                <div className="mt-1.5 text-center text-[10px] text-muted">{formatDayMonth(l.week)}</div>
              </div>
            </Tip>
          ))}
        </div>
      </Panel>

      <Panel reveal={1} padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5">
          <h2 className="text-base font-semibold">Evraklar</h2>
          <Segmented
            label="Liste"
            size="sm"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'received', label: `Alınan (${received.length})` },
              { value: 'issued', label: `Verilen (${issued.length})` },
              { value: 'history', label: 'Geçmiş' },
            ]}
          />
        </div>
        <ul className="mt-3 divide-y divide-line">
          {rows.map((i) => {
            const c = f.contactsById.get(i.contactId);
            const days = diffDays(i.dueDate, f.today);
            return (
              <li key={i.id} className="grid grid-cols-[1fr_auto] items-center gap-3 px-6 py-3 sm:grid-cols-[1fr_140px_140px_150px_40px]">
                <div className="flex min-w-0 items-center gap-3">
                  <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]', i.direction === 'received' ? 'bg-inflow-soft text-inflow-text' : 'bg-outflow-soft text-outflow-text')}>
                    {i.direction === 'received' ? <ArrowDownLeft size={16} /> : <ArrowUpRight size={16} />}
                  </span>
                  <div className="min-w-0">
                    <Link to={`/cariler/${i.contactId}`} viewTransition className="block truncate text-sm font-medium hover:underline">
                      {c?.name}
                    </Link>
                    <div className="truncate text-2xs text-muted">
                      {i.kind === 'cheque' ? 'Çek' : 'Senet'} · {i.serialNo}
                      {i.bank && ` · ${i.bank}`}
                      {i.endorsedToId && ` · ciro: ${f.contactsById.get(i.endorsedToId)?.name}`}
                    </div>
                  </div>
                </div>
                <div className="hidden sm:block">
                  <div className="num text-sm">{formatDateShort(i.dueDate)}</div>
                  <div className={cn('text-2xs', LIVE.includes(i.status) && days < 0 ? 'text-outflow-text' : days <= 7 && LIVE.includes(i.status) ? 'text-saffron-text' : 'text-muted')}>
                    {LIVE.includes(i.status) ? relativeDay(i.dueDate, f.today) : ''}
                  </div>
                </div>
                <div className="hidden sm:block">
                  <Badge tone={STATUS[i.status].tone}>{STATUS[i.status].label}</Badge>
                </div>
                <Money value={i.amount} currency={i.currency} split className="text-right text-sm font-semibold" />
                <div className="hidden justify-end sm:flex">
                  {LIVE.includes(i.status) && (
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <IconButton label="İşlemler" size="sm">
                          <DotsThreeVertical size={16} weight="bold" />
                        </IconButton>
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Portal>
                        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-48 rounded-[14px] border border-line bg-surface p-1.5 text-sm shadow-[var(--float-shadow)]">
                          {i.direction === 'received' ? (
                            <>
                              {i.status === 'portfolio' && <MenuItem onSelect={() => void move(i, 'deposited')}>Tahsile ver</MenuItem>}
                              <MenuItem onSelect={() => void move(i, 'collected')}>Tahsil edildi</MenuItem>
                              {i.status === 'portfolio' && <MenuItem onSelect={() => setEndorse(i)}>Tedarikçiye ciro et…</MenuItem>}
                              <DropdownMenu.Separator className="my-1 h-px bg-line" />
                              <MenuItem danger onSelect={() => void move(i, 'bounced')}>Karşılıksız çıktı</MenuItem>
                              <MenuItem onSelect={() => void move(i, 'returned')}>Müşteriye iade</MenuItem>
                            </>
                          ) : (
                            <>
                              <MenuItem onSelect={() => void move(i, 'paid')}>Ödendi (hesaptan düştü)</MenuItem>
                              <DropdownMenu.Separator className="my-1 h-px bg-line" />
                              <MenuItem danger onSelect={() => void move(i, 'bounced')}>Karşılıksız</MenuItem>
                              <MenuItem onSelect={() => void move(i, 'cancelled')}>İptal / geri alındı</MenuItem>
                            </>
                          )}
                        </DropdownMenu.Content>
                      </DropdownMenu.Portal>
                    </DropdownMenu.Root>
                  )}
                </div>
              </li>
            );
          })}
          {!rows.length && <li className="py-10 text-center text-sm text-muted">Bu listede evrak yok.</li>}
        </ul>
        <div className="h-3" />
      </Panel>

      <InstrumentSheet open={sheet.open} direction={sheet.direction} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} />
      {endorse && <EndorseModal ins={endorse} onClose={() => setEndorse(null)} />}
    </div>
  );
}

function MenuItem({ children, onSelect, danger }: { children: React.ReactNode; onSelect: () => void; danger?: boolean }) {
  return (
    <DropdownMenu.Item onSelect={onSelect} className={cn('cursor-pointer rounded-[10px] px-3 py-2 outline-none data-[highlighted]:bg-sunken', danger && 'text-outflow-text')}>
      {children}
    </DropdownMenu.Item>
  );
}

function Stat({ label, value, tone, sub, index }: { label: string; value: number; tone: 'in' | 'out' | 'muted'; sub: string; index: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + index * 0.06 }} className="panel px-5 py-4">
      <div className="text-xs text-muted">{label}</div>
      <Money value={value} decimals={0} className={cn('display mt-1 block text-[1.75rem]', tone === 'in' ? 'text-inflow-text' : tone === 'out' ? 'text-outflow-text' : 'text-muted')} />
      <div className="text-2xs text-muted">{sub}</div>
    </motion.div>
  );
}

function EndorseModal({ ins, onClose }: { ins: Instrument; onClose: () => void }) {
  const f = useFinance();
  const suppliers = f.contacts.filter((c) => (c.kind === 'supplier' || c.kind === 'both') && !c.archived);
  const [to, setTo] = useState(suppliers[0]?.id ?? '');
  const open = f.documents
    .filter((d) => d.contactId === to && d.direction === 'payable' && !d.cancelled && d.currency === ins.currency)
    .map((d) => ({ id: d.id, dueDate: d.dueDate, remaining: f.docStates.get(d.id)?.remaining ?? 0 }))
    .filter((d) => d.remaining > 0);
  const plan = planAllocation(ins.amount, open);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title="Ciro et"
      description={`${ins.serialNo} numaralı çek (${formatShort(ins.amount)}) tedarikçiye verilecek.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            disabled={!to}
            onClick={async () => {
              await transitionInstrument(ins, { status: 'endorsed', date: f.today, endorsedToId: to, allocations: plan.allocations });
              toast.success('Çek ciro edildi', { description: `${plan.allocations.length} borç belgesi kapatıldı` });
              onClose();
            }}
          >
            Ciro et
          </Button>
        </>
      }
    >
      <Select aria-label="Tedarikçi" value={to} onChange={(e) => setTo(e.target.value)}>
        {suppliers.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <p className="mt-3 text-xs text-muted">
        {plan.allocations.length ? `Tedarikçinin ${plan.allocations.length} açık borcu vade sırasıyla kapanacak.` : 'Tedarikçinin açık borcu yok; tutar avans olarak işlenir.'}
        {plan.unallocated > 0 && plan.allocations.length > 0 && ` Kalan ${formatShort(plan.unallocated)} avans olur.`}
      </p>
    </Modal>
  );
}
