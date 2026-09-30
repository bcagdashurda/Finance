import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { CaretLeft, CaretRight, Plus, Repeat, CalendarCheck, PencilSimple, ClockCountdown } from '@phosphor-icons/react';
import { forecastInput, useFinance } from '@/app/finance';
import { useUI } from '@/app/ui-store';
import { PageHeader } from '@/ui/PageHeader';
import { Panel, PanelHeader } from '@/ui/Panel';
import { Button, IconButton } from '@/ui/Button';
import { Badge, Tip } from '@/ui/bits';
import { Money } from '@/ui/Money';
import { Stamp } from '@/ui/Stamp';
import { cn } from '@/ui/cn';
import { formatDateShort, formatDayMonth, formatDayMonthLong, formatMonthYear, formatWeekday } from '@/ui/format';
import { addDays, addMonths, diffDays, endOfMonth, isHoliday, isWeekend, monthKey, startOfWeek, type ISODate } from '@/domain/dates';
import { buildForecast, type ForecastItem } from '@/domain/forecast';
import { occurrences } from '@/domain/recurrence';
import { amountInBase } from '@/domain/balances';
import { formatShort } from '@/domain/money';
import type { RecurringRule } from '@/domain/types';
import { postRecurringOccurrence, transitionInstrument, updateDocument } from '@/data/repo';
import { RecurringSheet } from './RecurringSheet';
import { FREQUENCY_LABEL } from '@/features/akis/scenario-ui';

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

export default function TakvimPage() {
  const f = useFinance();
  const navigate = useNavigate();
  const openEntry = useUI((s) => s.openEntry);
  const [month, setMonth] = useState(monthKey(f.today));
  const [selected, setSelected] = useState<ISODate>(f.today);
  const [ruleSheet, setRuleSheet] = useState<{ open: boolean; rule: RecurringRule | null }>({ open: false, rule: null });
  const [stamp, setStamp] = useState<{ label: string; tone: 'in' | 'out' } | null>(null);

  const first = `${month}-01`;
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(endOfMonth(first)), 6);
  const days = useMemo(() => Array.from({ length: diffDays(gridEnd, gridStart) + 1 }, (_, i) => addDays(gridStart, i)), [gridStart, gridEnd]);

  const horizon = Math.min(400, Math.max(1, diffDays(gridEnd, f.today)));
  const forecast = useMemo(() => buildForecast(forecastInput(f, horizon)), [f, horizon]);
  const itemsByDay = useMemo(() => {
    const map = new Map<ISODate, ForecastItem[]>();
    for (const it of forecast.items) {
      if (it.source === 'runrate' || it.overdue) continue;
      const list = map.get(it.expected) ?? [];
      list.push(it);
      map.set(it.expected, list);
    }
    return map;
  }, [forecast.items]);
  const realized = useMemo(() => {
    const map = new Map<ISODate, { inflow: number; outflow: number; count: number }>();
    for (const t of f.transactions) {
      if (t.kind === 'transfer' || t.date < gridStart || t.date >= f.today) continue;
      const row = map.get(t.date) ?? { inflow: 0, outflow: 0, count: 0 };
      const v = amountInBase(t.amount, t.rateToBase);
      if (t.kind === 'income') row.inflow += v;
      else row.outflow += v;
      row.count += 1;
      map.set(t.date, row);
    }
    return map;
  }, [f.transactions, gridStart, f.today]);

  const dayNet = (d: ISODate) => {
    if (d < f.today) {
      const r = realized.get(d);
      return r ? r.inflow - r.outflow : 0;
    }
    return (itemsByDay.get(d) ?? []).reduce((s, i) => s + (i.direction === 'in' ? i.expectedAmount : -i.expectedAmount), 0);
  };
  const maxAbs = Math.max(1, ...days.map((d) => Math.abs(dayNet(d))));

  // Gecikmiş: vadesi geçmiş belgeler + işaretlenmemiş tekrarlar
  const overdueDocs = f.documents
    .map((d) => ({ d, st: f.docStates.get(d.id)! }))
    .filter((x) => x.st.status === 'overdue')
    .sort((a, b) => a.d.dueDate.localeCompare(b.d.dueDate));
  const unposted = f.recurring
    .filter((r) => r.active && !r.autoPost)
    .flatMap((r) => occurrences(r, addDays(f.today, -45), addDays(f.today, -1)).filter((o) => !f.postedOccurrences.has(`${r.id}:${o.nominal}`)).map((o) => ({ r, o })));

  const selectedItems = selected >= f.today ? (itemsByDay.get(selected) ?? []) : [];
  const selectedTxs = selected < f.today ? f.transactions.filter((t) => t.date === selected && t.kind !== 'transfer') : [];

  async function settle(it: ForecastItem) {
    if (it.source === 'document') {
      const d = f.documents.find((x) => x.id === it.refId);
      openEntry({ kind: it.direction === 'in' ? 'collect' : 'pay', contactId: d?.contactId, amount: f.docStates.get(it.refId!)?.remaining, currency: d?.currency });
    } else if (it.source === 'recurring') {
      const r = f.recurring.find((x) => x.id === it.refId)!;
      const nominal = it.key.split(':').at(-1)!;
      await postRecurringOccurrence(r, { nominal, date: f.today < it.expected ? f.today : it.expected });
      setStamp({ label: it.direction === 'in' ? 'TAHSİL EDİLDİ' : 'ÖDENDİ', tone: it.direction === 'in' ? 'in' : 'out' });
      window.setTimeout(() => setStamp(null), 1300);
    } else if (it.source === 'instrument') {
      const ins = f.instruments.find((x) => x.id === it.refId)!;
      const accountId = ins.accountId ?? f.accounts.find((a) => a.kind === 'bank' && a.currency === ins.currency)?.id;
      await transitionInstrument(ins, { status: ins.direction === 'received' ? 'collected' : 'paid', date: f.today, accountId });
      setStamp({ label: ins.direction === 'received' ? 'TAHSİL EDİLDİ' : 'ÖDENDİ', tone: ins.direction === 'received' ? 'in' : 'out' });
      window.setTimeout(() => setStamp(null), 1300);
    } else {
      toast('Tahmini kalem; gerçekleştiğinde işlem olarak girin.');
    }
  }

  async function postpone(it: ForecastItem, days: number) {
    if (it.source !== 'document' || !it.refId) return;
    const d = f.documents.find((x) => x.id === it.refId)!;
    await updateDocument(d.id, { dueDate: addDays(d.dueDate, days) });
    toast(`Vade ${days} gün ertelendi`, { action: { label: 'Geri al', onClick: () => void updateDocument(d.id, { dueDate: d.dueDate }) } });
  }

  const contactName = (id?: string) => (id ? f.contactsById.get(id)?.name : undefined);

  return (
    <div>
      <PageHeader
        kicker="Yaklaşan ödemeler, tahsilatlar, çek vadeleri ve vergiler tek takvimde"
        title="Ödeme takvimi"
        actions={
          <>
            <Button variant="secondary" icon={<Repeat size={16} />} onClick={() => setRuleSheet({ open: true, rule: null })}>
              Tekrarlayan kalem
            </Button>
            <Button variant="primary" magnetic icon={<Plus size={16} weight="bold" />} onClick={() => openEntry({ kind: 'payable' })}>
              Borç / alacak
            </Button>
          </>
        }
      />

      {(overdueDocs.length > 0 || unposted.length > 0) && (
        <Panel reveal={0} className="mb-5">
          <PanelHeader title="Bekleyenler" description="Vadesi geçmiş belgeler ve henüz işaretlenmemiş düzenli ödemeler" />
          <div className="grid gap-2 lg:grid-cols-2">
            {unposted.slice(0, 6).map(({ r, o }) => (
              <div key={`${r.id}:${o.nominal}`} className="flex items-center gap-3 rounded-[14px] border border-saffron/40 bg-saffron-soft/50 px-4 py-2.5">
                <ClockCountdown size={18} className="text-saffron-text" />
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate font-medium">{r.title}</div>
                  <div className="text-2xs text-muted">{formatDayMonthLong(o.date)} · işaretlenmedi</div>
                </div>
                <Money value={r.direction === 'in' ? r.amount : -r.amount} currency={r.currency} tone="auto" decimals={0} className="text-sm font-semibold" />
                <Button size="sm" variant="secondary" onClick={() => void postRecurringOccurrence(r, o).then(() => toast.success('İşaretlendi'))}>
                  {r.direction === 'in' ? 'Tahsil edildi' : 'Ödendi'}
                </Button>
              </div>
            ))}
            {overdueDocs.slice(0, 8).map(({ d, st }) => (
              <div key={d.id} className="flex items-center gap-3 rounded-[14px] border border-outflow/25 bg-outflow-soft/40 px-4 py-2.5">
                <div className="min-w-0 flex-1 text-sm">
                  <div className="truncate font-medium">{contactName(d.contactId) ?? d.title}</div>
                  <div className="text-2xs text-muted">
                    {d.number ?? d.title} · {st.daysOverdue} gün gecikmiş
                  </div>
                </div>
                <Money value={d.direction === 'receivable' ? st.remaining : -st.remaining} currency={d.currency} tone="auto" decimals={0} className="text-sm font-semibold" />
                <Button size="sm" variant="secondary" onClick={() => openEntry({ kind: d.direction === 'receivable' ? 'collect' : 'pay', contactId: d.contactId, amount: st.remaining, currency: d.currency })}>
                  {d.direction === 'receivable' ? 'Tahsil et' : 'Öde'}
                </Button>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <Panel reveal={1}>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="display text-2xl font-semibold capitalize">{formatMonthYear(month)}</h2>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={() => { setMonth(monthKey(f.today)); setSelected(f.today); }}>
                Bugün
              </Button>
              <IconButton label="Önceki ay" size="sm" onClick={() => setMonth(monthKey(addMonths(first, -1)))}>
                <CaretLeft size={16} />
              </IconButton>
              <IconButton label="Sonraki ay" size="sm" onClick={() => setMonth(monthKey(addMonths(first, 1)))}>
                <CaretRight size={16} />
              </IconButton>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5 text-center text-2xs text-muted">
            {WEEKDAYS.map((w) => (
              <div key={w} className="pb-1">
                {w}
              </div>
            ))}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={month}
              className="grid grid-cols-7 gap-1.5"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.25 }}
            >
              {days.map((d) => {
                const inMonth = monthKey(d) === month;
                const net = dayNet(d);
                const intensity = Math.round((Math.abs(net) / maxAbs) * 26);
                const items = d >= f.today ? (itemsByDay.get(d) ?? []) : [];
                const off = isWeekend(d) || isHoliday(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelected(d)}
                    className={cn(
                      'relative flex min-h-[92px] flex-col rounded-[14px] border p-2 text-left transition-[border-color,transform] hover:-translate-y-px',
                      selected === d ? 'border-cobalt shadow-[0_0_0_2px_var(--cobalt)]' : 'border-line',
                      !inMonth && 'opacity-40',
                      d < f.today && 'opacity-70',
                    )}
                    style={{
                      background: net
                        ? `color-mix(in oklab, ${net > 0 ? 'var(--inflow)' : 'var(--outflow)'} ${intensity}%, var(--surface))`
                        : off
                          ? 'var(--surface-sunken)'
                          : 'var(--surface)',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className={cn('num text-xs', d === f.today ? 'flex h-5 w-5 items-center justify-center rounded-full bg-cobalt font-semibold text-inverse' : off ? 'text-faint' : 'text-ink-2')}>
                        {Number(d.slice(8))}
                      </span>
                      {isHoliday(d) && <Tip content="Resmî tatil"><span className="h-1.5 w-1.5 rounded-full bg-saffron" /></Tip>}
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {items.slice(0, 2).map((it) => (
                        <div key={it.key} className={cn('truncate text-[10px] leading-tight', it.direction === 'in' ? 'text-inflow-text' : 'text-outflow-text')}>
                          {contactName(it.contactId)?.split(' ')[0] ?? it.label.split(' ')[0]} {formatShort(it.expectedAmount).replace('₺', '')}
                        </div>
                      ))}
                      {items.length > 2 && <div className="text-[10px] text-muted">+{items.length - 2} kalem</div>}
                    </div>
                    {net !== 0 && (
                      <div className={cn('num mt-auto text-right text-[10.5px] font-semibold', net > 0 ? 'text-inflow-text' : 'text-outflow-text')}>
                        {net > 0 ? '+' : ''}
                        {formatShort(net)}
                      </div>
                    )}
                  </button>
                );
              })}
            </motion.div>
          </AnimatePresence>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-2xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[4px] bg-[color-mix(in_oklab,var(--inflow)_22%,var(--surface))]" /> net giriş günü
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-[4px] bg-[color-mix(in_oklab,var(--outflow)_22%,var(--surface))]" /> net çıkış günü
            </span>
            <span>Geçmiş günler gerçekleşeni, gelecek günler projeksiyonu gösterir.</span>
          </div>
        </Panel>

        <Panel reveal={2} className="relative">
          <PanelHeader title={formatDayMonthLong(selected)} description={`${formatWeekday(selected)}${selected === f.today ? ' · bugün' : ''}`} />
          {selected >= f.today ? (
            <ul className="space-y-2">
              {selectedItems.map((it) => (
                <motion.li key={it.key} layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-[14px] border border-line p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{contactName(it.contactId) ?? it.label}</div>
                      <div className="truncate text-2xs text-muted">{contactName(it.contactId) ? it.label : ''}</div>
                    </div>
                    <Money value={it.direction === 'in' ? it.expectedAmount : -it.expectedAmount} tone="auto" sign="always" decimals={0} className="text-sm font-semibold" />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <Badge tone="muted">{it.source === 'document' ? (it.direction === 'in' ? 'Alacak' : 'Borç') : it.source === 'recurring' ? 'Tekrarlayan' : it.source === 'instrument' ? 'Çek/senet' : it.source === 'vat' ? 'KDV tahmini' : 'Senaryo'}</Badge>
                    {it.expected !== it.dueDate && <Badge tone="warn">vade {formatDayMonth(it.dueDate)}</Badge>}
                    <span className="ml-auto flex gap-1">
                      {it.source === 'document' && (
                        <>
                          <Button size="sm" variant="ghost" onClick={() => void postpone(it, 7)}>
                            +7 gün
                          </Button>
                          <IconButton label="Düzenle" size="sm" onClick={() => openEntry({ kind: it.direction === 'in' ? 'receivable' : 'payable', editDocumentId: it.refId })}>
                            <PencilSimple size={14} />
                          </IconButton>
                        </>
                      )}
                      {it.source !== 'vat' && (
                        <Button size="sm" variant="secondary" icon={<CalendarCheck size={14} />} onClick={() => void settle(it)}>
                          {it.direction === 'in' ? 'Tahsil et' : 'Öde'}
                        </Button>
                      )}
                    </span>
                  </div>
                </motion.li>
              ))}
              {!selectedItems.length && <li className="rounded-[14px] border border-dashed border-line-strong p-5 text-center text-xs text-muted">Bu gün için planlı kalem yok.</li>}
            </ul>
          ) : (
            <ul className="divide-y divide-line">
              {selectedTxs.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0 truncate">{contactName(t.contactId) ?? t.description}</span>
                  <Money value={t.kind === 'income' ? t.amount : -t.amount} currency={t.currency} tone="auto" sign="always" decimals={0} className="font-medium" />
                </li>
              ))}
              {!selectedTxs.length && <li className="py-6 text-center text-xs text-muted">Bu gün hareket yok.</li>}
            </ul>
          )}
          <AnimatePresence>
            {stamp && (
              <motion.div className="absolute inset-0 z-10 flex items-center justify-center rounded-[22px] bg-[color-mix(in_oklab,var(--surface)_70%,transparent)]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Stamp label={stamp.label} tone={stamp.tone} date={formatDateShort(f.today)} size={170} />
              </motion.div>
            )}
          </AnimatePresence>
        </Panel>
      </div>

      <Panel reveal={3} className="mt-5">
        <PanelHeader
          title="Tekrarlayan yükümlülükler"
          description="Kira, maaş, vergi, kredi… Projeksiyona otomatik girer."
          actions={
            <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => setRuleSheet({ open: true, rule: null })}>
              Ekle
            </Button>
          }
        />
        <ul className="divide-y divide-line">
          {f.recurring.map((r) => {
            const next = occurrences(r, f.today, addDays(f.today, 400))[0];
            return (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-3">
                <Repeat size={18} className={r.direction === 'in' ? 'text-inflow-text' : 'text-outflow-text'} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.title}</div>
                  <div className="text-2xs text-muted">
                    {FREQUENCY_LABEL[r.frequency]}
                    {next && ` · sonraki ${formatDayMonthLong(next.date)}`}
                    {r.autoPost && ' · otomatik'}
                    {r.endDate && ` · ${formatDateShort(r.endDate)} tarihine kadar`}
                  </div>
                </div>
                <Money value={r.direction === 'in' ? r.amount : -r.amount} currency={r.currency} tone="auto" decimals={0} className="text-sm font-semibold" />
                <IconButton label="Düzenle" size="sm" onClick={() => setRuleSheet({ open: true, rule: r })}>
                  <PencilSimple size={14} />
                </IconButton>
              </li>
            );
          })}
          {!f.recurring.length && <li className="py-6 text-center text-sm text-muted">Henüz tekrarlayan kalem yok. Kira, maaş ve vergi için şablonları deneyin.</li>}
        </ul>
        <p className="mt-3 text-2xs text-muted">
          KDV ödemesi belgelerinizden otomatik tahmin edilir (izleyen ayın 28’i). Beyan süresi uzatmalarını GİB duyurularından doğrulayın.{' '}
          <button type="button" className="underline" onClick={() => navigate('/raporlar?rapor=kdv', { viewTransition: true })}>
            KDV özeti
          </button>
        </p>
      </Panel>

      <RecurringSheet open={ruleSheet.open} rule={ruleSheet.rule} onOpenChange={(open) => setRuleSheet((s) => ({ ...s, open }))} />
    </div>
  );
}
