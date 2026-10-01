import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import {
  Archive,
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  BellRinging,
  DownloadSimple,
  FilePlus,
  PencilSimple,
  Phone,
  EnvelopeSimple,
  Bank,
  XCircle,
} from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { useUI } from '@/app/ui-store';
import { Panel, PanelHeader } from '@/ui/Panel';
import { Button, IconButton } from '@/ui/Button';
import { Badge, Monogram, Tip } from '@/ui/bits';
import { Money } from '@/ui/Money';
import { Segmented } from '@/ui/Segmented';
import { cn } from '@/ui/cn';
import { formatDateShort, formatDayMonth, percent, relativeDay } from '@/ui/format';
import { contactStatement } from '@/domain/ledger';
import { agingReport } from '@/domain/aging';
import { diffDays } from '@/domain/dates';
import { formatIban } from '@/domain/validators';
import { deleteOrArchiveContact, updateContact, updateDocument } from '@/data/repo';
import { Modal } from '@/ui/Overlay';
import { download, minorToCell, toCSV } from '@/data/export';
import { ContactSheet } from './ContactSheet';
import { ReminderSheet } from './ReminderSheet';
import { DelayMeter } from './CarilerPage';

type Tab = 'statement' | 'open' | 'history';

const STATUS: Record<string, { label: string; tone: 'in' | 'out' | 'warn' | 'neutral' | 'muted' }> = {
  open: { label: 'Açık', tone: 'neutral' },
  partial: { label: 'Kısmi', tone: 'warn' },
  overdue: { label: 'Gecikmiş', tone: 'out' },
  paid: { label: 'Kapandı', tone: 'in' },
  cancelled: { label: 'İptal', tone: 'muted' },
};

export default function CariDetayPage() {
  const { id = '' } = useParams();
  const f = useFinance();
  const openEntry = useUI((s) => s.openEntry);
  const [tab, setTab] = useState<Tab>('statement');
  const [editOpen, setEditOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const navigate = useNavigate();
  const c = f.contactsById.get(id);
  /** Bağlı kayıt varsa silinmez, arşivlenir (deleteOrArchiveContact ile aynı ölçüt). */
  const linked =
    f.transactions.some((t) => t.contactId === id) ||
    f.documents.some((d) => d.contactId === id) ||
    f.instruments.some((i) => i.contactId === id || i.endorsedToId === id) ||
    f.recurring.some((r) => r.contactId === id);

  const statement = useMemo(() => (c ? contactStatement(c, f.documents, f.transactions, f.instruments, f.rates) : []), [c, f.documents, f.transactions, f.instruments, f.rates]);
  const docs = useMemo(
    () =>
      f.documents
        .filter((d) => d.contactId === id)
        .map((d) => ({ d, st: f.docStates.get(d.id)! }))
        .sort((a, b) => b.d.dueDate.localeCompare(a.d.dueDate)),
    [f.documents, f.docStates, id],
  );
  const aging = useMemo(() => agingReport(f.documents.filter((d) => d.contactId === id), f.allocations, f.today, c?.kind === 'supplier' ? 'payable' : 'receivable'), [f.documents, f.allocations, f.today, id, c?.kind]);

  if (!c) {
    return (
      <div className="py-24 text-center">
        <p className="text-sm text-muted">Cari bulunamadı.</p>
        <Link to="/cariler" className="mt-4 inline-block text-sm text-cobalt-ink underline">
          Carilere dön
        </Link>
      </div>
    );
  }

  const bal = f.contactBalances.get(c.id) ?? 0;
  const behavior = f.behavior.get(c.id);
  const overdue = docs.filter((x) => x.st.status === 'overdue');
  const overdueSum = overdue.reduce((s, x) => s + x.st.remaining * (x.d.direction === 'receivable' ? 1 : -1), 0);
  const openDocs = docs.filter((x) => x.st.remaining > 0 && !x.d.cancelled);
  const isSupplier = c.kind === 'supplier';
  const history = docs
    .filter((x) => x.st.status === 'paid' && x.st.paidDate && x.d.direction === 'receivable')
    .map((x) => ({ due: x.d.dueDate, delay: diffDays(x.st.paidDate!, x.d.dueDate), amount: x.d.amount, no: x.d.number ?? x.d.title }))
    .sort((a, b) => a.due.localeCompare(b.due))
    .slice(-24);

  function exportStatement() {
    const csv = toCSV(statement, [
      { header: 'Tarih', value: (r) => (r.date ? formatDateShort(r.date) : '') },
      { header: 'Açıklama', value: (r) => r.description },
      { header: 'Borç', value: (r) => (r.debit ? minorToCell(r.debit) : '') },
      { header: 'Alacak', value: (r) => (r.credit ? minorToCell(r.credit) : '') },
      { header: 'Bakiye', value: (r) => minorToCell(r.balance) },
    ]);
    download(`ekstre-${c!.name.replace(/[^\p{L}\d]+/gu, '-')}-${f.today}.csv`, csv);
  }

  return (
    <div>
      <Link to="/cariler" viewTransition className="mb-4 inline-flex items-center gap-1.5 pt-3 text-xs text-muted hover:text-ink">
        <ArrowLeft size={14} /> Cariler
      </Link>

      <header className="mb-7 flex flex-wrap items-start justify-between gap-5">
        <div className="flex items-center gap-4">
          <span style={{ viewTransitionName: `contact-${c.id}` }}>
            <Monogram name={c.name} size={64} />
          </span>
          <div className="min-w-0">
            <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} className="display text-3xl font-semibold leading-tight sm:text-4xl">
              {c.name}
            </motion.h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <Badge tone="cobalt">{c.kind === 'customer' ? 'Müşteri' : c.kind === 'supplier' ? 'Tedarikçi' : c.kind === 'both' ? 'Müşteri + tedarikçi' : 'Diğer'}</Badge>
              {c.archived && <Badge tone="muted">Arşiv</Badge>}
              {c.taxId && <span>VKN {c.taxId}</span>}
              {c.phone && (
                <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-ink">
                  <Phone size={12} /> {c.phone}
                </a>
              )}
              {c.email && (
                <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:text-ink">
                  <EnvelopeSimple size={12} /> {c.email}
                </a>
              )}
              {c.iban && (
                <Tip content="Kopyala">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(c.iban!);
                      toast.success('IBAN kopyalandı');
                    }}
                    className="num inline-flex items-center gap-1 hover:text-ink"
                  >
                    <Bank size={12} /> {formatIban(c.iban)}
                  </button>
                </Tip>
              )}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {!isSupplier && overdue.length > 0 && (
            <Button variant="secondary" icon={<BellRinging size={16} />} onClick={() => setRemindOpen(true)}>
              Hatırlat
            </Button>
          )}
          <Button variant="secondary" icon={<FilePlus size={16} />} onClick={() => openEntry({ kind: isSupplier ? 'payable' : 'receivable', contactId: c.id })}>
            {isSupplier ? 'Gelen fatura' : 'Fatura / alacak'}
          </Button>
          <Button
            variant="primary"
            magnetic
            icon={isSupplier ? <ArrowUpRight size={16} weight="bold" /> : <ArrowDownLeft size={16} weight="bold" />}
            onClick={() => openEntry({ kind: isSupplier ? 'pay' : 'collect', contactId: c.id })}
          >
            {isSupplier ? 'Ödeme yap' : 'Tahsilat al'}
          </Button>
          <IconButton label="Cariyi düzenle" variant="secondary" onClick={() => setEditOpen(true)}>
            <PencilSimple size={16} />
          </IconButton>
          <IconButton
            label={c.archived ? 'Arşivden çıkar' : 'Arşivle ya da sil'}
            variant="secondary"
            onClick={async () => {
              if (!c.archived) return setRemoveOpen(true);
              await updateContact(c.id, { archived: false });
              toast.success('Cari yeniden etkin');
            }}
          >
            {c.archived ? <ArrowCounterClockwise size={16} /> : <Archive size={16} />}
          </IconButton>
        </div>
      </header>

      <Modal
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        title={linked ? 'Cari arşivlensin mi?' : 'Cari silinsin mi?'}
        description={
          linked
            ? 'Bu carinin kayıtları olduğu için silinmez, arşivlenir: listelerden ve seçimlerden kalkar, geçmiş kayıtlar ve raporlar korunur. İstediğiniz zaman arşivden çıkarabilirsiniz.'
            : 'Bu cariye bağlı hiçbir kayıt yok; kalıcı olarak silinir.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoveOpen(false)}>
              Vazgeç
            </Button>
            <Button
              variant={linked ? 'primary' : 'danger'}
              onClick={async () => {
                const r = await deleteOrArchiveContact(c.id);
                setRemoveOpen(false);
                if (r === 'deleted') {
                  toast.success('Cari silindi');
                  navigate('/cariler', { viewTransition: true });
                } else toast.success('Cari arşivlendi', { description: 'Carilerde “Arşivi göster” ile görebilirsiniz.' });
              }}
            >
              {linked ? 'Arşivle' : 'Evet, sil'}
            </Button>
          </>
        }
      >
        <span />
      </Modal>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label={bal >= 0 ? 'Bize borcu' : 'Bizim borcumuz'} index={0}>
          <Money value={Math.abs(bal)} currency={c.currency} decimals={0} className={cn('display text-[1.9rem]', bal > 0 ? 'text-inflow-text' : bal < 0 ? 'text-outflow-text' : '')} />
        </Kpi>
        <Kpi label="Vadesi geçmiş" index={1}>
          <Money value={Math.abs(overdueSum)} currency={c.currency} decimals={0} className={cn('display text-[1.9rem]', overdueSum !== 0 && 'text-outflow-text')} />
          <div className="text-2xs text-muted">{overdue.length ? `${overdue.length} belge · en eskisi ${Math.max(...overdue.map((x) => x.st.daysOverdue))} gün` : 'Gecikme yok'}</div>
        </Kpi>
        <Kpi label="Ödeme alışkanlığı" index={2}>
          {behavior ? <DelayMeter delay={behavior.avgDelay} onTime={behavior.onTimeRate} /> : <span className="text-sm text-muted">Yeterli geçmiş yok</span>}
          {behavior && <div className="mt-1 text-2xs text-muted">P80: {behavior.p80Delay} gün · {behavior.samples} kapanmış fatura</div>}
        </Kpi>
        <Kpi label="Risk limiti" index={3}>
          {c.riskLimit ? (
            <>
              <div className="display text-[1.9rem]">{percent(Math.max(0, bal) / c.riskLimit)}</div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                <motion.div className={cn('h-full rounded-full', bal > c.riskLimit ? 'bg-outflow' : bal > c.riskLimit * 0.8 ? 'bg-saffron' : 'bg-cobalt')} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (Math.max(0, bal) / c.riskLimit) * 100)}%` }} transition={{ duration: 0.9, delay: 0.4 }} />
              </div>
              <div className="mt-1 text-2xs text-muted">
                Limit <Money value={c.riskLimit} currency={c.currency} decimals={0} />
              </div>
            </>
          ) : (
            <span className="text-sm text-muted">Tanımlı değil</span>
          )}
        </Kpi>
      </div>

      <Panel reveal={0}>
        <PanelHeader
          title={tab === 'statement' ? 'Hesap ekstresi' : tab === 'open' ? 'Açık belgeler' : 'Ödeme geçmişi'}
          description={tab === 'statement' ? 'Borç: carinin borcunu artırır · Alacak: azaltır' : tab === 'open' ? `${openDocs.length} belge` : 'Kapanan faturaların vadeye göre gecikmesi'}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {tab === 'statement' && (
                <Button size="sm" variant="ghost" icon={<DownloadSimple size={14} />} onClick={exportStatement}>
                  Excel
                </Button>
              )}
              <Segmented
                label="Görünüm"
                size="sm"
                value={tab}
                onChange={setTab}
                options={[
                  { value: 'statement', label: 'Ekstre' },
                  { value: 'open', label: 'Açık belgeler' },
                  { value: 'history', label: 'Ödeme geçmişi' },
                ]}
              />
            </div>
          }
        />

        {/* Ekstre telefonda yana kayar: klavyeyle odaklanıp ok tuşlarıyla kaydırılabilsin (WCAG 2.1.1) */}
        {tab === 'statement' && (
          <div tabIndex={0} role="region" aria-label="Cari hesap ekstresi" className="-mx-2 overflow-x-auto rounded-[12px] outline-none focus-visible:shadow-[inset_0_0_0_2px_var(--cobalt)]">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-2xs text-muted">
                  <th className="px-2 pb-2 font-medium">Tarih</th>
                  <th className="px-2 pb-2 font-medium">Açıklama</th>
                  <th className="px-2 pb-2 text-right font-medium">Borç</th>
                  <th className="px-2 pb-2 text-right font-medium">Alacak</th>
                  <th className="px-2 pb-2 text-right font-medium">Bakiye</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {[...statement].reverse().slice(0, 200).map((r, i) => {
                  // İleri tarihli satır (ör. teyit bekleyen sipariş) bugünkü "Bize borcu"na dahil değildir
                  const planned = Boolean(r.date && r.date > f.today);
                  return (
                    <tr key={i} className={cn('transition-colors hover:bg-surface-2', planned && 'text-muted')}>
                      <td className="num whitespace-nowrap px-2 py-2.5 text-xs text-muted">{r.date ? formatDateShort(r.date) : '—'}</td>
                      <td className="px-2 py-2.5">
                        <span className="line-clamp-1">
                          {planned && (
                            <Badge tone="warn" className="mr-1.5 align-middle">
                              Planlı
                            </Badge>
                          )}
                          {r.description}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right">{r.debit ? <Money value={r.debit} currency={c.currency} className={planned ? 'text-muted' : 'text-ink-2'} /> : ''}</td>
                      <td className="px-2 py-2.5 text-right">{r.credit ? <Money value={r.credit} currency={c.currency} className={planned ? 'text-muted' : 'text-ink-2'} /> : ''}</td>
                      <td className="px-2 py-2.5 text-right">
                        <Money value={r.balance} currency={c.currency} className={planned ? 'text-muted' : 'font-semibold'} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'open' && (
          <>
            <div className="mb-4 grid grid-cols-5 gap-2 text-center text-2xs">
              {(
                [
                  ['Vadesi gelmemiş', aging.total.current],
                  ['1–30 gün', aging.total.d1_30],
                  ['31–60 gün', aging.total.d31_60],
                  ['61–90 gün', aging.total.d61_90],
                  ['90+ gün', aging.total.d90p],
                ] as const
              ).map(([label, v], i) => (
                <div key={label} className={cn('rounded-[12px] px-2 py-2.5', v ? (i === 0 ? 'bg-inflow-soft/60' : i >= 3 ? 'bg-outflow-soft' : 'bg-saffron-soft') : 'bg-sunken')}>
                  <div className="text-muted">{label}</div>
                  <Money value={v} decimals={0} className="mt-0.5 block text-xs font-semibold" />
                </div>
              ))}
            </div>
            <ul className="divide-y divide-line">
              {openDocs.map(({ d, st }) => (
                <li key={d.id} className="group flex flex-wrap items-center gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      {d.number ?? d.title}
                      <Badge tone={STATUS[st.status]!.tone}>{STATUS[st.status]!.label}</Badge>
                      {d.probability != null && d.probability < 100 && <Badge tone="muted">%{d.probability} olasılık</Badge>}
                    </div>
                    <div className="text-2xs text-muted">
                      {d.title} · düzenleme {formatDayMonth(d.issueDate)} · vade {formatDayMonth(d.dueDate)} ({relativeDay(d.dueDate, f.today).toLocaleLowerCase('tr-TR')})
                    </div>
                  </div>
                  <div className="text-right">
                    <Money value={st.remaining} currency={d.currency} className="font-semibold" />
                    {st.allocated > 0 && (
                      <div className="text-2xs text-muted">
                        / <Money value={d.amount} currency={d.currency} decimals={0} />
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="secondary" onClick={() => openEntry({ kind: d.direction === 'receivable' ? 'collect' : 'pay', contactId: c.id, amount: st.remaining, currency: d.currency })}>
                      {d.direction === 'receivable' ? 'Tahsil et' : 'Öde'}
                    </Button>
                    <IconButton label="Belgeyi düzenle" size="sm" onClick={() => openEntry({ kind: d.direction, editDocumentId: d.id })}>
                      <PencilSimple size={14} />
                    </IconButton>
                    <IconButton
                      label="İptal et"
                      size="sm"
                      onClick={async () => {
                        await updateDocument(d.id, { cancelled: true });
                        toast('Belge iptal edildi', { action: { label: 'Geri al', onClick: () => void updateDocument(d.id, { cancelled: false }) } });
                      }}
                    >
                      <XCircle size={14} />
                    </IconButton>
                  </div>
                </li>
              ))}
              {!openDocs.length && <li className="py-8 text-center text-sm text-muted">Açık belge yok.</li>}
            </ul>
          </>
        )}

        {tab === 'history' && <DelayHistory rows={history} />}
      </Panel>

      <ContactSheet open={editOpen} onOpenChange={setEditOpen} contact={c} />
      <ReminderSheet open={remindOpen} onOpenChange={setRemindOpen} contact={c} />
    </div>
  );
}

function Kpi({ label, index, children }: { label: string; index: number; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 + index * 0.06, duration: 0.5 }} className="panel px-5 py-4">
      <div className="mb-1 text-xs text-muted">{label}</div>
      {children}
    </motion.div>
  );
}

function DelayHistory({ rows }: { rows: Array<{ due: string; delay: number; amount: number; no: string }> }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted">Henüz kapanmış fatura yok.</p>;
  const max = Math.max(10, ...rows.map((r) => Math.abs(r.delay)));
  return (
    <div>
      <div className="flex h-56 items-center gap-1.5 border-b border-line">
        {rows.map((r, i) => {
          const h = (Math.abs(r.delay) / max) * 100;
          return (
            <Tip key={i} content={`${r.no} · vade ${formatDayMonth(r.due)} · ${r.delay > 0 ? `${r.delay} gün geç` : r.delay < 0 ? `${-r.delay} gün erken` : 'tam vadesinde'}`}>
              <div className="relative flex h-full flex-1 flex-col justify-center">
                <div className="flex h-1/2 items-end">
                  {r.delay > 0 && (
                    <motion.div className="w-full rounded-t-[4px] bg-outflow" initial={{ height: 0 }} animate={{ height: `${h}%` }} transition={{ delay: i * 0.03, type: 'spring', stiffness: 160, damping: 20 }} />
                  )}
                </div>
                <div className="h-px bg-line-strong" />
                <div className="flex h-1/2 items-start">
                  {r.delay <= 0 && (
                    <motion.div className="w-full rounded-b-[4px] bg-inflow" initial={{ height: 0 }} animate={{ height: `${Math.max(3, h)}%` }} transition={{ delay: i * 0.03, type: 'spring', stiffness: 160, damping: 20 }} />
                  )}
                </div>
              </div>
            </Tip>
          );
        })}
      </div>
      <div className="mt-2 flex justify-between text-2xs text-muted">
        <span>{formatDayMonth(rows[0]!.due)}</span>
        <span>Üst: geç ödenen gün · Alt: vadesinde ya da erken</span>
        <span>{formatDayMonth(rows.at(-1)!.due)}</span>
      </div>
    </div>
  );
}
