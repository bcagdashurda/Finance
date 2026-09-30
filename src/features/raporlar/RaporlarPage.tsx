import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { motion } from 'motion/react';
import { toast } from 'sonner';
import { DownloadSimple, Printer, Sparkle, Receipt, CurrencyDollar, ChartBar, Table, Clock, Target, Wallet } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { useAi } from '@/ai/useAi';
import { PageHeader } from '@/ui/PageHeader';
import { Panel, PanelHeader } from '@/ui/Panel';
import { Segmented } from '@/ui/Segmented';
import { Button } from '@/ui/Button';
import { Badge, Monogram, Tip } from '@/ui/bits';
import { Money } from '@/ui/Money';
import { CategoryIcon } from '@/ui/icons';
import { cn, slotColor } from '@/ui/cn';
import { formatDate, formatMonthShort, formatMonthYear, percent } from '@/ui/format';
import { FlowBars } from '@/charts/FlowBars';
import { addMonths, endOfMonth, monthKey, startOfMonth, type ISODate } from '@/domain/dates';
import { balancesByAccount, totalInBase } from '@/domain/balances';
import { agingReport } from '@/domain/aging';
import { budgetVsActual, fxExposure, profitLoss, vatHistory, type Basis, type PnlReport } from '@/domain/reports';
import { formatMoney, formatShort, CURRENCY_META } from '@/domain/money';
import type { ID } from '@/domain/types';
import { downloadXlsx } from '@/data/export';

type ReportId = 'pnl' | 'cashflow' | 'category' | 'aging' | 'budget' | 'kdv' | 'fx';
type Period = 'ytd' | '12m' | 'last-year' | 'quarter';

const REPORTS: Array<{ id: ReportId; label: string; icon: React.ReactNode; desc: string }> = [
  { id: 'pnl', label: 'Gelir-gider tablosu', icon: <Table size={18} />, desc: 'Nakit ya da tahakkuk esasına göre aylık kâr/zarar' },
  { id: 'cashflow', label: 'Nakit akış tablosu', icon: <Wallet size={18} />, desc: 'Açılış, giriş, çıkış ve kapanış bakiyeleri' },
  { id: 'category', label: 'Kategori analizi', icon: <ChartBar size={18} />, desc: 'Paranın nereden gelip nereye gittiği' },
  { id: 'aging', label: 'Cari yaşlandırma', icon: <Clock size={18} />, desc: 'Alacak ve borçların vade aşımı' },
  { id: 'budget', label: 'Bütçe ve gerçekleşen', icon: <Target size={18} />, desc: 'Bu ay bütçe tüketimi ve ay sonu tahmini' },
  { id: 'kdv', label: 'KDV özeti', icon: <Receipt size={18} />, desc: 'Hesaplanan, indirilecek, devreden KDV' },
  { id: 'fx', label: 'Döviz pozisyonu', icon: <CurrencyDollar size={18} />, desc: 'Kur riskine açık net pozisyon' },
];

export default function RaporlarPage() {
  const f = useFinance();
  const [params, setParams] = useSearchParams();
  const report = (params.get('rapor') as ReportId) || 'pnl';
  const [period, setPeriod] = useState<Period>('12m');
  const [basis, setBasis] = useState<Basis>('cash');

  const [from, to]: [ISODate, ISODate] = useMemo(() => {
    const t = f.today;
    if (period === 'ytd') return [`${t.slice(0, 4)}-01-01`, t];
    if (period === 'last-year') {
      const y = Number(t.slice(0, 4)) - 1;
      return [`${y}-01-01`, `${y}-12-31`];
    }
    if (period === 'quarter') {
      const q = Math.floor((Number(t.slice(5, 7)) - 1) / 3) * 3 + 1;
      return [`${t.slice(0, 4)}-${String(q).padStart(2, '0')}-01`, t];
    }
    return [startOfMonth(addMonths(t, -11)), t];
  }, [period, f.today]);

  const pnl = useMemo(
    () => profitLoss({ transactions: f.transactions, documents: f.documents, allocationIndex: f.allocationIndex, categories: f.categories }, from, to, report === 'cashflow' ? 'cash' : basis),
    [f.transactions, f.documents, f.allocationIndex, f.categories, from, to, basis, report],
  );
  const catName = (id: ID | null) => (id ? (f.categoriesById.get(id)?.name ?? 'Silinmiş kategori') : 'Kategorisiz');
  const current = REPORTS.find((r) => r.id === report)!;

  async function exportExcel() {
    const header = ['Kalem', ...pnl.months.map((m) => formatMonthYear(m)), 'Toplam'];
    const toRow = (label: string, values: number[], total: number) => [label, ...values.map((v) => v / 100), total / 100];
    const rows: Array<Array<string | number | null>> = [
      header,
      ['GELİRLER'],
      ...pnl.income.map((r) => toRow(catName(r.categoryId), r.values, r.total)),
      toRow('Toplam gelir', pnl.totals.income, pnl.totals.income.reduce((a, b) => a + b, 0)),
      [],
      ['GİDERLER'],
      ...pnl.expense.map((r) => toRow(catName(r.categoryId), r.values, r.total)),
      toRow('Toplam gider', pnl.totals.expense, pnl.totals.expense.reduce((a, b) => a + b, 0)),
      [],
      toRow('NET', pnl.totals.net, pnl.totals.net.reduce((a, b) => a + b, 0)),
    ];
    await downloadXlsx(`mizan-${report}-${f.today}.xlsx`, [{ name: current.label, rows }]);
    toast.success('Excel dosyası indirildi');
  }

  return (
    <div>
      <PageHeader
        kicker={`${f.workspace.legalName ?? f.workspace.name} · ${formatDate(from)} – ${formatDate(to)}`}
        title="Raporlar"
        actions={
          <div className="no-print flex flex-wrap gap-2">
            <Segmented
              label="Dönem"
              value={period}
              onChange={setPeriod}
              options={[
                { value: '12m', label: 'Son 12 ay' },
                { value: 'ytd', label: 'Bu yıl' },
                { value: 'quarter', label: 'Bu çeyrek' },
                { value: 'last-year', label: 'Geçen yıl' },
              ]}
            />
            <Button variant="secondary" icon={<DownloadSimple size={16} />} onClick={exportExcel}>
              Excel
            </Button>
            <Button variant="secondary" icon={<Printer size={16} />} onClick={() => window.print()}>
              Yazdır / PDF
            </Button>
          </div>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <nav className="no-print space-y-1" aria-label="Raporlar">
          {REPORTS.map((r, i) => (
            <motion.button
              key={r.id}
              type="button"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i }}
              onClick={() => setParams({ rapor: r.id }, { replace: true })}
              className={cn(
                'relative flex w-full items-start gap-3 rounded-[14px] px-3.5 py-3 text-left transition-colors',
                report === r.id ? 'bg-surface text-ink shadow-[0_0_0_1px_var(--line)]' : 'text-muted hover:bg-surface/60 hover:text-ink',
              )}
            >
              {report === r.id && <motion.span layoutId="report-tick" className="absolute left-0 top-3 h-6 w-[3px] rounded-full bg-cobalt" />}
              <span className={cn('mt-0.5', report === r.id && 'text-cobalt')}>{r.icon}</span>
              <span>
                <span className="block text-sm font-medium">{r.label}</span>
                <span className="block text-2xs text-muted">{r.desc}</span>
              </span>
            </motion.button>
          ))}
        </nav>

        <div key={report} className="min-w-0 space-y-5">
          {(report === 'pnl' || report === 'cashflow') && <PnlView pnl={pnl} basis={basis} setBasis={setBasis} cashflow={report === 'cashflow'} from={from} to={to} catName={catName} />}
          {report === 'category' && <CategoryView pnl={pnl} catName={catName} />}
          {report === 'aging' && <AgingView />}
          {report === 'budget' && <BudgetView />}
          {report === 'kdv' && <KdvView from={from} to={to} />}
          {report === 'fx' && <FxView />}
        </div>
      </div>
    </div>
  );
}

function ExecSummary({ facts }: { facts: Array<{ title: string; body: string }> }) {
  const ai = useAi();
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="no-print rounded-[18px] border border-cobalt/20 bg-cobalt-soft/40 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-medium text-cobalt-ink">
          <Sparkle size={16} weight="duotone" /> Yönetici özeti
        </div>
        <Tip content={ai.enabled ? 'Rakamlar cihazda hesaplandı; yapay zekâ yalnızca yorumlar' : 'Ayarlar’dan yapay zekâyı açın'}>
          <span>
            <Button
              size="sm"
              variant="secondary"
              loading={busy}
              disabled={!ai.enabled}
              onClick={async () => {
                setBusy(true);
                try {
                  setText(await ai.narrate(facts));
                } catch (e) {
                  toast.error('Özet oluşturulamadı', { description: e instanceof Error ? e.message : '' });
                } finally {
                  setBusy(false);
                }
              }}
            >
              {text ? 'Yeniden yaz' : 'Özetle'}
            </Button>
          </span>
        </Tip>
      </div>
      <div className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-2">{text ?? facts.map((x) => `• ${x.title}: ${x.body}`).join('\n')}</div>
    </div>
  );
}

function PnlView({
  pnl,
  basis,
  setBasis,
  cashflow,
  from,
  to,
  catName,
}: {
  pnl: PnlReport;
  basis: Basis;
  setBasis: (b: Basis) => void;
  cashflow: boolean;
  from: ISODate;
  to: ISODate;
  catName: (id: ID | null) => string;
}) {
  const f = useFinance();
  const totalIn = pnl.totals.income.reduce((a, b) => a + b, 0);
  const totalOut = pnl.totals.expense.reduce((a, b) => a + b, 0);
  const net = totalIn - totalOut;
  const bestIdx = pnl.totals.net.indexOf(Math.max(...pnl.totals.net));
  const worstIdx = pnl.totals.net.indexOf(Math.min(...pnl.totals.net));
  const active = f.accounts.filter((a) => !a.archived);
  const openings = cashflow
    ? pnl.months.map((m) => totalInBase(active, balancesByAccount(active, f.transactions, addMonths(`${m}-01`, 0) > from ? previousDay(`${m}-01`) : previousDay(from)), f.rates))
    : [];
  const closings = cashflow ? pnl.months.map((m) => totalInBase(active, balancesByAccount(active, f.transactions, endOfMonth(`${m}-01`) < to ? endOfMonth(`${m}-01`) : to), f.rates)) : [];

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Card label={cashflow ? 'Toplam giriş' : 'Toplam gelir'} value={totalIn} tone="in" />
        <Card label={cashflow ? 'Toplam çıkış' : 'Toplam gider'} value={totalOut} tone="out" />
        <Card label={cashflow ? 'Net nakit akışı' : basis === 'accrual' ? 'Faaliyet sonucu (KDV hariç)' : 'Net nakit sonucu'} value={net} tone={net >= 0 ? 'in' : 'out'} sub={totalIn ? `marj ${percent(net / totalIn, 1)}` : undefined} />
      </div>
      <ExecSummary
        facts={[
          { title: 'Dönem', body: `${formatDate(from)} – ${formatDate(to)}, ${basis === 'accrual' && !cashflow ? 'tahakkuk' : 'nakit'} esası` },
          { title: 'Toplam', body: `gelir ${formatShort(totalIn)}, gider ${formatShort(totalOut)}, net ${formatShort(net)}` },
          { title: 'En iyi ay', body: `${formatMonthYear(pnl.months[bestIdx]!)} (${formatShort(pnl.totals.net[bestIdx]!)})` },
          { title: 'En zayıf ay', body: `${formatMonthYear(pnl.months[worstIdx]!)} (${formatShort(pnl.totals.net[worstIdx]!)})` },
          { title: 'En büyük gider', body: pnl.expense[0] ? `${catName(pnl.expense[0].categoryId)} ${formatShort(pnl.expense[0].total)}` : '—' },
        ]}
      />
      <Panel reveal={0}>
        <PanelHeader
          title={cashflow ? 'Aylık nakit akışı' : 'Aylık sonuç'}
          actions={
            !cashflow && (
              <Tip content="Nakit: para ne zaman girdi/çıktı. Tahakkuk: fatura ne zaman kesildi (KDV hariç).">
                <span>
                  <Segmented label="Esas" size="sm" value={basis} onChange={setBasis} options={[{ value: 'cash', label: 'Nakit esası' }, { value: 'accrual', label: 'Tahakkuk esası' }]} />
                </span>
              </Tip>
            )
          }
        />
        <FlowBars label="Aylık gelir ve gider" months={pnl.months.map((m, i) => ({ key: m, inflow: pnl.totals.income[i]!, outflow: pnl.totals.expense[i]!, net: pnl.totals.net[i]! }))} height={230} />
      </Panel>
      <Panel reveal={1} padded={false}>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead>
              <tr className="border-b border-line text-muted">
                <th className="sticky left-0 z-[1] bg-surface px-5 py-3 text-left font-medium">Kalem</th>
                {pnl.months.map((m) => (
                  <th key={m} className="px-2 py-3 text-right font-medium capitalize">
                    {formatMonthShort(m)}
                  </th>
                ))}
                <th className="px-5 py-3 text-right font-semibold text-ink">Toplam</th>
              </tr>
            </thead>
            <tbody>
              {cashflow && (
                <Row label="Açılış bakiyesi" values={openings} total={openings[0] ?? 0} muted />
              )}
              <Section label={cashflow ? 'Girişler' : 'Gelirler'} />
              {pnl.income.map((r) => (
                <Row key={`i${r.categoryId}`} label={catName(r.categoryId)} categoryId={r.categoryId} values={r.values} total={r.total} />
              ))}
              <Row label={cashflow ? 'Toplam giriş' : 'Toplam gelir'} values={pnl.totals.income} total={totalIn} strong tone="in" />
              <Section label={cashflow ? 'Çıkışlar' : 'Giderler'} />
              {pnl.expense.map((r) => (
                <Row key={`e${r.categoryId}`} label={catName(r.categoryId)} categoryId={r.categoryId} values={r.values} total={r.total} />
              ))}
              <Row label={cashflow ? 'Toplam çıkış' : 'Toplam gider'} values={pnl.totals.expense} total={totalOut} strong tone="out" />
              <Row label="Net" values={pnl.totals.net} total={net} strong tone={net >= 0 ? 'in' : 'out'} big />
              {cashflow && <Row label="Kapanış bakiyesi" values={closings} total={closings.at(-1) ?? 0} muted />}
            </tbody>
          </table>
        </div>
      </Panel>
    </>
  );
}

function previousDay(iso: ISODate): ISODate {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function Section({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={99} className="sticky left-0 bg-surface-2 px-5 pb-1.5 pt-4 text-2xs font-semibold text-muted">
        {label}
      </td>
    </tr>
  );
}

function Row({ label, values, total, strong, tone, big, muted, categoryId }: { label: string; values: number[]; total: number; strong?: boolean; tone?: 'in' | 'out'; big?: boolean; muted?: boolean; categoryId?: ID | null }) {
  const f = useFinance();
  const cat = categoryId ? f.categoriesById.get(categoryId) : undefined;
  return (
    <tr className={cn('border-b border-line transition-colors hover:bg-surface-2', strong && 'bg-surface-2/60', big && 'text-sm')}>
      <td className={cn('sticky left-0 z-[1] bg-inherit px-5 py-2', strong ? 'font-semibold' : 'text-ink-2', muted && 'text-muted')}>
        <span className="flex items-center gap-2">
          {cat && <CategoryIcon name={cat.icon} size={13} className="shrink-0" />}
          <span className="truncate">{label}</span>
        </span>
      </td>
      {values.map((v, i) => (
        <td key={i} className={cn('num px-2 py-2 text-right', !v && 'text-faint', muted && 'text-muted')}>
          {v ? formatMoney(v, 'TRY', { decimals: 0 }).replace('₺', '') : '—'}
        </td>
      ))}
      <td className={cn('num px-5 py-2 text-right font-semibold', tone === 'in' && 'text-inflow-text', tone === 'out' && 'text-outflow-text')}>{formatMoney(total, 'TRY', { decimals: 0 })}</td>
    </tr>
  );
}

function Card({ label, value, tone, sub }: { label: string; value: number; tone: 'in' | 'out'; sub?: string }) {
  return (
    <div className="panel px-5 py-4">
      <div className="text-xs text-muted">{label}</div>
      <Money value={value} decimals={0} className={cn('display mt-1 block text-[1.8rem]', tone === 'in' ? 'text-inflow-text' : 'text-outflow-text')} />
      {sub && <div className="text-2xs text-muted">{sub}</div>}
    </div>
  );
}

function CategoryView({ pnl, catName }: { pnl: PnlReport; catName: (id: ID | null) => string }) {
  const f = useFinance();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const rows = kind === 'expense' ? pnl.expense : pnl.income;
  const total = rows.reduce((s, r) => s + r.total, 0);
  const max = Math.max(1, ...rows.map((r) => r.total));
  return (
    <Panel reveal={0}>
      <PanelHeader
        title={kind === 'expense' ? 'Giderler nereye gidiyor?' : 'Gelirler nereden geliyor?'}
        description={`Toplam ${formatShort(total)} · nakit esası`}
        actions={<Segmented label="Tür" size="sm" value={kind} onChange={setKind} options={[{ value: 'expense', label: 'Gider' }, { value: 'income', label: 'Gelir' }]} />}
      />
      <ul className="space-y-3">
        {rows.map((r, i) => {
          const cat = r.categoryId ? f.categoriesById.get(r.categoryId) : undefined;
          const color = slotColor(cat?.color);
          return (
            <li key={String(r.categoryId)} className="grid grid-cols-[minmax(0,220px)_1fr_120px_56px] items-center gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]" style={{ color, background: `color-mix(in oklab, ${color} 12%, transparent)` }}>
                  {cat ? <CategoryIcon name={cat.icon} size={14} /> : null}
                </span>
                <span className="truncate">{catName(r.categoryId)}</span>
              </span>
              <div className="h-3 overflow-hidden rounded-full bg-sunken">
                <motion.div className="h-full rounded-full" style={{ background: color }} initial={{ width: 0 }} animate={{ width: `${(r.total / max) * 100}%` }} transition={{ delay: 0.2 + i * 0.05, duration: 0.8, ease: [0.25, 1, 0.5, 1] }} />
              </div>
              <Money value={r.total} decimals={0} className="text-right font-medium" />
              <span className="text-right text-2xs text-muted">{percent(total ? r.total / total : 0)}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

function AgingView() {
  const f = useFinance();
  const [dir, setDir] = useState<'receivable' | 'payable'>('receivable');
  const report = useMemo(() => agingReport(f.documents.filter((d) => d.issueDate <= f.today), f.allocations, f.today, dir), [f.documents, f.allocations, f.today, dir]);
  const buckets = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90p'] as const;
  const labels = ['Vadesi gelmemiş', '1–30 gün', '31–60 gün', '61–90 gün', '90+ gün'];
  // Sıralı (ordinal) kova rengi: tek ton, artan koyuluk
  const shades = ['color-mix(in oklab, var(--inflow) 70%, var(--surface))', 'color-mix(in oklab, var(--saffron) 55%, var(--surface))', 'color-mix(in oklab, var(--outflow) 45%, var(--surface))', 'color-mix(in oklab, var(--outflow) 70%, var(--surface))', 'var(--outflow)'];
  const rows = [...report.byContact.entries()].sort((a, b) => b[1].total - a[1].total);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {buckets.map((b, i) => (
          <div key={b} className="panel px-4 py-3">
            <div className="flex items-center gap-1.5 text-2xs text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: shades[i] }} />
              {labels[i]}
            </div>
            <Money value={report.total[b]} decimals={0} className="display mt-1 block text-xl" />
            <div className="text-2xs text-muted">{percent(report.total.total ? report.total[b] / report.total.total : 0)}</div>
          </div>
        ))}
      </div>
      <Panel reveal={0}>
        <PanelHeader
          title={dir === 'receivable' ? 'Alacak yaşlandırma' : 'Borç yaşlandırma'}
          description={`Toplam açık ${formatShort(report.total.total)}`}
          actions={<Segmented label="Yön" size="sm" value={dir} onChange={setDir} options={[{ value: 'receivable', label: 'Alacaklar' }, { value: 'payable', label: 'Borçlar' }]} />}
        />
        <ul className="space-y-3">
          {rows.map(([id, b], i) => (
            <li key={id} className="grid grid-cols-[minmax(0,240px)_1fr_120px] items-center gap-3 text-sm">
              <Link to={`/cariler/${id}`} viewTransition className="flex min-w-0 items-center gap-2 hover:underline">
                <Monogram name={f.contactsById.get(id)?.name ?? '—'} size={26} />
                <span className="truncate">{f.contactsById.get(id)?.name ?? 'Carisiz'}</span>
              </Link>
              <div className="flex h-4 overflow-hidden rounded-full bg-sunken">
                {buckets.map((k, j) =>
                  b[k] ? (
                    <Tip key={k} content={`${labels[j]}: ${formatMoney(b[k], 'TRY', { decimals: 0 })}`}>
                      <motion.div style={{ background: shades[j] }} className="h-full border-r-2 border-surface last:border-r-0" initial={{ width: 0 }} animate={{ width: `${(b[k] / b.total) * 100}%` }} transition={{ delay: 0.2 + i * 0.04, duration: 0.7 }} />
                    </Tip>
                  ) : null,
                )}
              </div>
              <Money value={b.total} decimals={0} className="text-right font-semibold" />
            </li>
          ))}
          {!rows.length && <li className="py-8 text-center text-muted">Açık belge yok.</li>}
        </ul>
      </Panel>
    </>
  );
}

function BudgetView() {
  const f = useFinance();
  const rows = budgetVsActual(f.transactions, f.categories, f.today);
  return (
    <Panel reveal={0}>
      <PanelHeader title={`${formatMonthYear(monthKey(f.today))} bütçesi`} description="Bütçeyi Ayarlar › Kategoriler’den tanımlayın. Çizgi: bütçe · koyu çubuk: harcanan · açık: ay sonu tahmini." />
      <ul className="space-y-5">
        {rows.map((r, i) => {
          const cat = f.categoriesById.get(r.categoryId)!;
          const scale = Math.max(r.budget, r.projected, r.actual) * 1.1;
          const over = r.projected > r.budget;
          return (
            <li key={r.categoryId}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <CategoryIcon name={cat.icon} size={15} /> {cat.name}
                </span>
                <span className="text-xs">
                  <Money value={r.actual} decimals={0} className="font-semibold" /> <span className="text-muted">/ {formatMoney(r.budget, 'TRY', { decimals: 0 })}</span>
                  {over ? <Badge tone="out" className="ml-2">Aşım riski</Badge> : <Badge tone="in" className="ml-2">Yolunda</Badge>}
                </span>
              </div>
              <div className="relative h-5 rounded-[6px] bg-sunken">
                <motion.div className={cn('absolute inset-y-0 left-0 rounded-[6px]', over ? 'bg-outflow/25' : 'bg-cobalt/20')} initial={{ width: 0 }} animate={{ width: `${(r.projected / scale) * 100}%` }} transition={{ delay: 0.2 + i * 0.06, duration: 0.8 }} />
                <motion.div className={cn('absolute inset-y-1 left-0 rounded-[4px]', over ? 'bg-outflow' : 'bg-cobalt')} initial={{ width: 0 }} animate={{ width: `${(r.actual / scale) * 100}%` }} transition={{ delay: 0.3 + i * 0.06, duration: 0.8 }} />
                <div className="absolute inset-y-[-3px] w-0.5 rounded bg-ink" style={{ left: `${(r.budget / scale) * 100}%` }} />
              </div>
              <div className="mt-1 text-2xs text-muted">Ay sonu tahmini {formatMoney(r.projected, 'TRY', { decimals: 0 })} · bütçenin {percent(r.ratio)} kadarı kullanıldı</div>
            </li>
          );
        })}
        {!rows.length && <li className="py-8 text-center text-sm text-muted">Bütçe tanımlı kategori yok.</li>}
      </ul>
    </Panel>
  );
}

function KdvView({ from, to }: { from: ISODate; to: ISODate }) {
  const f = useFinance();
  const rows = vatHistory(f.documents, monthKey(from), monthKey(to));
  return (
    <Panel reveal={0} padded={false}>
      <div className="px-6 pt-5">
        <PanelHeader title="KDV özeti" description="Belgelerdeki KDV tutarlarından hesaplanır; beyanname yerine geçmez, mali müşavirinizle doğrulayın." />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-y border-line text-2xs text-muted">
              <th className="px-6 py-2.5 text-left font-medium">Dönem</th>
              <th className="px-3 py-2.5 text-right font-medium">Hesaplanan</th>
              <th className="px-3 py-2.5 text-right font-medium">İndirilecek</th>
              <th className="px-3 py-2.5 text-right font-medium">Devreden (giriş)</th>
              <th className="px-3 py-2.5 text-right font-medium">Ödenecek</th>
              <th className="px-3 py-2.5 text-right font-medium">Sonraki aya devir</th>
              <th className="px-6 py-2.5 text-right font-medium">Son gün</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.period} className="hover:bg-surface-2">
                <td className="px-6 py-2.5 capitalize">{formatMonthYear(r.period)}</td>
                <td className="num px-3 py-2.5 text-right">{formatMoney(r.output, 'TRY', { decimals: 0 })}</td>
                <td className="num px-3 py-2.5 text-right">{formatMoney(r.input, 'TRY', { decimals: 0 })}</td>
                <td className="num px-3 py-2.5 text-right text-muted">{r.carriedIn ? formatMoney(r.carriedIn, 'TRY', { decimals: 0 }) : '—'}</td>
                <td className="num px-3 py-2.5 text-right font-semibold text-outflow-text">{r.payable ? formatMoney(r.payable, 'TRY', { decimals: 0 }) : '—'}</td>
                <td className="num px-3 py-2.5 text-right text-inflow-text">{r.carriedOut ? formatMoney(r.carriedOut, 'TRY', { decimals: 0 }) : '—'}</td>
                <td className={cn('num px-6 py-2.5 text-right', r.dueDate >= f.today ? 'text-saffron-text' : 'text-muted')}>{r.dueDate.split('-').reverse().join('.')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="h-4" />
    </Panel>
  );
}

function FxView() {
  const f = useFinance();
  const rows = fxExposure(f.accounts, f.balances, f.documents, f.allocationIndex, f.rates, f.today);
  return (
    <Panel reveal={0}>
      <PanelHeader title="Döviz pozisyonu" description={`Kurlar ${f.ratesDate ? formatDate(f.ratesDate) : '—'} · TL %10 değer kaybederse net pozisyonun TL karşılığındaki değişim`} />
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((r) => (
          <div key={r.currency} className="rounded-[18px] border border-line p-5">
            <div className="flex items-center justify-between">
              <span className="display text-2xl font-semibold">{r.currency}</span>
              <Badge tone={r.net >= 0 ? 'in' : 'out'}>{r.net >= 0 ? 'Uzun pozisyon' : 'Kısa pozisyon'}</Badge>
            </div>
            <dl className="mt-4 space-y-1.5 text-sm">
              <Line label="Döviz hesapları" v={formatMoney(r.cash, r.currency, { decimals: 0 })} />
              <Line label="+ Döviz alacakları" v={formatMoney(r.receivable, r.currency, { decimals: 0 })} />
              <Line label="− Döviz borçları" v={formatMoney(r.payable, r.currency, { decimals: 0 })} />
              <Line label="Net pozisyon" v={formatMoney(r.net, r.currency, { decimals: 0 })} strong />
              <Line label={`TL karşılığı (${CURRENCY_META[r.currency].symbol}1 = ₺${f.rates[r.currency].toLocaleString('tr-TR')})`} v={formatMoney(r.netBase, 'TRY', { decimals: 0 })} />
            </dl>
            <div className={cn('mt-4 rounded-[12px] px-3 py-2 text-xs', r.shock10 >= 0 ? 'bg-inflow-soft text-inflow-text' : 'bg-outflow-soft text-outflow-text')}>
              TL %10 değer kaybederse: {r.shock10 >= 0 ? '+' : ''}
              {formatMoney(r.shock10, 'TRY', { decimals: 0 })}
            </div>
          </div>
        ))}
        {!rows.length && <p className="text-sm text-muted">Döviz hesabı ya da döviz cinsinden açık belge yok.</p>}
      </div>
    </Panel>
  );
}

function Line({ label, v, strong }: { label: string; v: string; strong?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3', strong && 'border-t border-line pt-1.5 font-semibold')}>
      <dt className="text-muted">{label}</dt>
      <dd className="num">{v}</dd>
    </div>
  );
}
