import { useEffect, useMemo, useState } from 'react';
import { Popover } from 'radix-ui';
import { useAi } from '@/ai/useAi';
import { useAiGate } from '@/features/ayarlar/TrialDialog';
import { Link, useNavigate } from 'react-router';
import { motion } from 'motion/react';
import {
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  Info,
  Warning,
  WarningOctagon,
  TrendUp,
  ChatCircleText,
  Sparkle,
} from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { useUI } from '@/app/ui-store';
import { Panel, PanelHeader } from '@/ui/Panel';
import { PageHeader } from '@/ui/PageHeader';
import { Odometer } from '@/ui/Odometer';
import { Money } from '@/ui/Money';
import { Badge, Monogram, Tip } from '@/ui/bits';
import { Button } from '@/ui/Button';
import { AccountIcon } from '@/ui/icons';
import { cn } from '@/ui/cn';
import { formatDate, formatDayMonth, formatMonth, formatWeekday, percent } from '@/ui/format';
import { Rosette } from '@/charts/Rosette';
import { ForecastChart } from '@/charts/ForecastChart';
import { FlowBars } from '@/charts/FlowBars';
import { TideTimeline } from '@/charts/TideTimeline';
import { Sparkline } from '@/charts/Sparkline';
import { monthlyFlows } from '@/domain/aggregate';
import { addDays, addMonths, diffDays, startOfMonth } from '@/domain/dates';
import { balanceSeries, balancesByAccount, totalInBase, amountInBase } from '@/domain/balances';
import { formatShort, CURRENCY_META } from '@/domain/money';
import { buildInsights, type Insight } from './insights';
import { GettingStarted, GettingStartedStrip, useGettingStarted } from './GettingStarted';

export default function KokpitPage() {
  const f = useFinance();
  const navigate = useNavigate();
  const introPlayed = useUI((s) => s.introPlayed);
  const markIntroPlayed = useUI((s) => s.markIntroPlayed);
  const openEntry = useUI((s) => s.openEntry);
  useEffect(() => {
    const t = window.setTimeout(markIntroPlayed, 2600);
    return () => window.clearTimeout(t);
  }, [markIntroPlayed]);
  const reveal = (n: number) => (introPlayed ? false : n);

  const activeAccounts = useMemo(() => f.accounts.filter((a) => !a.archived), [f.accounts]);

  const { history, monthAgo, young } = useMemo(() => {
    // Geçmiş çizgi en erken hesap açılışından önceye uzanmasın (yeni kullanıcıda uydurma düz çizgi olmasın)
    const earliest = activeAccounts.reduce<string>((m, a) => (a.openingDate < m ? a.openingDate : m), f.today);
    const young = earliest > addDays(f.today, -30);
    const from = young ? earliest : addDays(f.today, -30);
    const history = balanceSeries(activeAccounts, f.transactions, from, f.today, f.rates);
    // 30 günden genç işletmede kıyas noktası açılış bakiyeleri (açılış günü hareketlerinden önce);
    // yoksa açılış günü girilen tahsilatlar "değişim"den düşüyor ve hep ₺0 görünüyordu.
    const monthAgo = young ? totalInBase(activeAccounts, balancesByAccount(activeAccounts, f.transactions, addDays(earliest, -1)), f.rates) : (history[0]?.value ?? f.totalBase);
    return { history, monthAgo, young };
  }, [activeAccounts, f.transactions, f.today, f.rates, f.totalBase]);
  const delta = f.totalBase - monthAgo;

  const months = useMemo(
    () => monthlyFlows(f.transactions, startOfMonth(addMonths(f.today, -11)), f.today),
    [f.transactions, f.today],
  );
  const yearNet = months.reduce((s, m) => s + m.net, 0);

  // "Sıkışacak mıyım?" sorusunun cevabı: 90 gün içindeki en düşük nokta ve eşiğin ilk aşıldığı gün
  const lowest = useMemo(
    () => f.forecast.days.reduce((m, d) => (d.expected < m.expected ? d : m), f.forecast.days[0] ?? { date: f.today, expected: f.totalBase }),
    [f.forecast.days, f.today, f.totalBase],
  );
  const breach = f.forecast.alerts.find((a) => a.kind === 'below-min' || a.kind === 'negative');
  const openTotals = useMemo(() => {
    // Toplamlar cari bakiyelerinden (devir dahil) — Cariler sayfasıyla aynı kaynak
    let recv = 0;
    let pay = 0;
    for (const c of f.contacts) {
      const b = amountInBase(f.contactBalances.get(c.id) ?? 0, f.rates[c.currency]);
      if (b > 0) recv += b;
      else pay += -b;
    }
    let recvOverdue = 0;
    let payDue30 = 0;
    const limit = addDays(f.today, 30);
    for (const d of f.documents) {
      const st = f.docStates.get(d.id);
      if (!st || st.remaining <= 0 || d.issueDate > f.today) continue;
      const v = amountInBase(st.remaining, d.rateToBase);
      if (d.direction === 'receivable') {
        if (st.status === 'overdue') recvOverdue += v;
      } else if (d.dueDate <= limit) payDue30 += v;
    }
    return { recv, recvOverdue, pay, payDue30 };
  }, [f.contacts, f.contactBalances, f.rates, f.documents, f.docStates, f.today]);

  const insights = useMemo(() => buildInsights(f), [f]);
  const [showAllInsights, setShowAllInsights] = useState(false);

  const overdueByContact = useMemo(() => {
    const map = new Map<string, { amount: number; count: number; maxLate: number }>();
    for (const d of f.documents) {
      const st = f.docStates.get(d.id);
      if (d.direction !== 'receivable' || st?.status !== 'overdue' || !d.contactId) continue;
      const row = map.get(d.contactId) ?? { amount: 0, count: 0, maxLate: 0 };
      row.amount += amountInBase(st.remaining, d.rateToBase);
      row.count += 1;
      row.maxLate = Math.max(row.maxLate, st.daysOverdue);
      map.set(d.contactId, row);
    }
    return [...map.entries()].sort((a, b) => b[1].amount - a[1].amount).slice(0, 5);
  }, [f.documents, f.docStates]);

  const accountSeries = useMemo(
    () =>
      activeAccounts.map((a) => ({
        account: a,
        values: balanceSeries([a], f.transactions, addDays(f.today, -60), f.today, { ...f.rates, [a.currency]: 1 }).map((p) => p.value),
      })),
    [activeAccounts, f.transactions, f.today, f.rates],
  );

  const portfolio = useMemo(() => {
    const live = f.instruments.filter(
      (i) => (i.direction === 'received' && (i.status === 'portfolio' || i.status === 'deposited')) || (i.direction === 'issued' && i.status === 'issued'),
    );
    const received = live.filter((i) => i.direction === 'received');
    const issued = live.filter((i) => i.direction === 'issued');
    const sum = (list: typeof live) => list.reduce((s, i) => s + amountInBase(i.amount, i.rateToBase), 0);
    const avgDays = received.length
      ? Math.round(received.reduce((s, i) => s + diffDays(i.dueDate, f.today) * i.amount, 0) / received.reduce((s, i) => s + i.amount, 0))
      : 0;
    return { received, issued, receivedSum: sum(received), issuedSum: sum(issued), avgDays, next: [...live].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 4) };
  }, [f.instruments, f.today]);

  const contactName = (id?: string) => (id ? f.contactsById.get(id)?.name : undefined);
  const guide = useGettingStarted();

  if (guide.empty && !f.settings.isDemo) {
    return (
      <div>
        <PageHeader kicker={<span>{formatWeekday(f.today)}, {formatDate(f.today)} · {f.workspace.legalName ?? f.workspace.name}</span>} title="Kokpit" />
        <GettingStarted state={guide} />
        <EmptyPreview />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        kicker={
          <span>
            {formatWeekday(f.today)}, {formatDate(f.today)} · {f.workspace.legalName ?? f.workspace.name}
          </span>
        }
        title="Kokpit"
        actions={
          <>
            <Button variant="secondary" icon={<ChatCircleText size={16} />} onClick={() => useUI.getState().setAssistantOpen(true)}>
              Asistana sor
            </Button>
            <Button variant="secondary" onClick={() => navigate('/akis', { viewTransition: true })} trailing={<ArrowRight size={14} />}>
              Nakit akışı
            </Button>
          </>
        }
      />

      {guide.visible && (guide.requiredDone ? <GettingStartedStrip state={guide} className="mb-5" /> : <GettingStarted state={guide} className="mb-5" />)}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* HERO — Nakit pozisyonu */}
        <Panel reveal={reveal(0)} className="@container relative overflow-hidden lg:col-span-7" padded={false}>
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-2 text-sm text-muted">
              Nakit pozisyonu
              <Tip content="Tüm banka, kasa ve kart hesaplarınızın bugünkü toplamı; döviz hesapları güncel kurla TL'ye çevrilir.">
                <Info size={14} className="cursor-help" />
              </Tip>
            </div>
            {/* Boyut panel genişliğinden: rakam ≈ 4,85 em (8 hane için 5,5 em payı); 1024 px'te kesiliyordu */}
            <div className="display mt-3 text-[length:clamp(2.4rem,calc(18cqw_-_12px),6rem)] font-medium leading-none tracking-[-0.035em] text-ink">
              <Odometer
                value={f.totalBase}
                animateOnMount={!introPlayed}
                startDelay={350}
                symbolClassName="mr-1 text-[0.55em] align-top text-muted"
                fractionClassName="text-[0.34em] text-muted ml-0.5"
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge
                tone={delta > 0 ? 'in' : delta < 0 ? 'out' : 'neutral'}
                icon={delta > 0 ? <ArrowUpRight size={12} weight="bold" /> : delta < 0 ? <ArrowDownRight size={12} weight="bold" /> : undefined}
              >
                {formatShort(delta)} · {percent(monthAgo ? delta / Math.abs(monthAgo) : 0, 1)}
              </Badge>
              <span className="text-xs text-muted">{young ? 'açılıştan beri' : 'son 30 günde'}</span>
              <span className="mx-1 h-3 w-px bg-line-strong" />
              {[...f.byCurrency.entries()].map(([cur, v]) => (
                <span key={cur} className="num text-xs text-ink-2">
                  <span className="text-muted">{CURRENCY_META[cur].symbol}</span> {formatShort(v, cur).slice(1)}
                </span>
              ))}
            </div>
          </div>
          {/* Panel 36rem'den darsa (1024 px, telefon) göstergeler alt alta: üç sütunda tutarlar kesiliyordu */}
          <div className="grid grid-cols-1 border-t border-line @xl:grid-cols-3">
            <Kpi
              to="/akis"
              label="90 günde en düşük"
              value={lowest.expected}
              valueClassName={breach ? 'text-outflow-text' : undefined}
              sub={
                breach ? (
                  <span className="text-outflow-text">{formatDayMonth(breach.date)}’de eşiğin altına iniyor</span>
                ) : (
                  <span>
                    {formatDayMonth(lowest.date)} · eşiğin üstünde
                  </span>
                )
              }
              delay={0.6}
            />
            <Kpi
              to="/cariler"
              label="Açık alacak"
              value={openTotals.recv}
              sub={openTotals.recvOverdue > 0 ? <span className="text-outflow-text">{formatShort(openTotals.recvOverdue)} gecikmede</span> : 'Gecikme yok'}
              delay={0.7}
              className="border-t @xl:border-t-0 @xl:border-l"
            />
            <Kpi
              to="/takvim"
              label="Açık borç"
              value={openTotals.pay}
              sub={<span>{formatShort(openTotals.payDue30)} önümüzdeki 30 gün</span>}
              delay={0.8}
              className="border-t @xl:border-t-0 @xl:border-l"
            />
          </div>
        </Panel>

        {/* Nakit ritmi */}
        <Panel reveal={reveal(1)} className="flex flex-col items-center justify-center overflow-hidden lg:col-span-5">
          <div className="flex w-full items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Nakit ritmi</h2>
              <p className="mt-0.5 text-xs text-muted">Son 12 ay · her halka bir ay, içten dışa</p>
            </div>
            <div className="flex flex-col items-end gap-1 text-2xs text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-inflow" /> giriş fazlası
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 rounded bg-outflow" /> çıkış fazlası
              </span>
            </div>
          </div>
          <div className="mt-2 flex w-full justify-center">
            <Rosette
              months={months.map((m) => ({ ...m, label: formatMonth(m.key) }))}
              size={340}
              centerLabel="12 ay net"
              centerValue={yearNet}
              delay={introPlayed ? 0 : 0.35}
            />
          </div>
        </Panel>

        {/* 90 gün projeksiyon */}
        <Panel reveal={reveal(2)} className="flex flex-col lg:col-span-8">
          <PanelHeader
            title="Önümüzdeki 90 gün"
            description="Son 30 günün gerçekleşeni ve olasılıklı projeksiyon. Bant, iyimser ile kötümser senaryo arasındaki aralık."
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('/akis', { viewTransition: true })} trailing={<ArrowRight size={12} />}>
                Senaryolar
              </Button>
            }
          />
          <div className="min-h-0 flex-1">
            <ForecastChart
              label="90 günlük nakit projeksiyonu"
              days={f.forecast.days}
              history={history}
              minBalance={f.settings.minCashBalance}
              height={300}
              fill
              delay={introPlayed ? 0 : 0.6}
            />
          </div>
        </Panel>

        {/* İçgörüler */}
        <Panel reveal={reveal(3)} className="lg:col-span-4">
          <PanelHeader
            title="Dikkat edilmesi gerekenler"
            description={`${insights.length} tespit · verilerinizden hesaplandı`}
            actions={<Briefing insights={insights} />}
          />
          <ul className="space-y-2">
            {insights.slice(0, showAllInsights ? insights.length : 3).map((ins, i) => (
              <InsightRow key={ins.id} insight={ins} index={i} animate={!introPlayed} />
            ))}
            {!insights.length && (
              <li className="flex items-center gap-2 rounded-[14px] bg-inflow-soft px-4 py-3 text-sm text-inflow-text">
                <CheckCircle size={18} /> Her şey yolunda görünüyor.
              </li>
            )}
          </ul>
          {insights.length > 3 && (
            <button
              type="button"
              aria-expanded={showAllInsights}
              onClick={() => setShowAllInsights((v) => !v)}
              className="mt-2 w-full rounded-[12px] py-2 text-xs font-medium text-cobalt-ink transition-colors hover:bg-surface-2"
            >
              {showAllInsights ? 'Daha az göster' : `${insights.length - 3} tespit daha`}
            </button>
          )}
        </Panel>

        {/* 14 gün gelgit */}
        <Panel reveal={reveal(4)} className="lg:col-span-12">
          <PanelHeader
            title="Önümüzdeki 14 gün"
            description="Su çizgisinin üstü girişler, altı çıkışlar. Taralı damlalar olasılıklı ya da gecikmiş kalemlerdir."
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('/takvim', { viewTransition: true })} trailing={<ArrowRight size={12} />}>
                Takvim
              </Button>
            }
          />
          <TideTimeline
            items={f.forecast.items.filter((i) => i.source !== 'runrate')}
            today={f.today}
            contactName={contactName}
            delay={introPlayed ? 0 : 0.8}
            onSelect={(it) => {
              if (it.contactId) navigate(`/cariler/${it.contactId}`, { viewTransition: true });
              else navigate('/takvim', { viewTransition: true });
            }}
          />
        </Panel>

        {/* 12 ay gelir–gider */}
        <Panel reveal={reveal(5)} className="lg:col-span-7">
          <PanelHeader
            title="12 ay gelir ve gider"
            description="Gerçekleşen nakit hareketleri; transferler hariç."
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('/raporlar', { viewTransition: true })} trailing={<ArrowRight size={12} />}>
                Raporlar
              </Button>
            }
          />
          <FlowBars
            label="Son 12 ayın aylık giriş ve çıkışları"
            months={months}
            height={250}
            delay={introPlayed ? 0 : 0.9}
            emptyAction={
              <Button size="sm" variant="secondary" onClick={() => navigate('/islemler?ice-aktar=1', { viewTransition: true })}>
                Banka ekstresi içe aktar
              </Button>
            }
          />
        </Panel>

        {/* Hesaplar */}
        <Panel reveal={reveal(6)} className="lg:col-span-5">
          <PanelHeader
            title="Hesaplar"
            description={`${activeAccounts.length} hesap · son 60 gün`}
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('/hesaplar', { viewTransition: true })} trailing={<ArrowRight size={12} />}>
                Tümü
              </Button>
            }
          />
          <ul className="-mx-2 divide-y divide-line">
            {accountSeries.map(({ account: a, values }, i) => {
              const bal = f.balances.get(a.id) ?? 0;
              const low = a.minBalance != null && bal < a.minBalance;
              return (
                <li key={a.id}>
                  <Link
                    to={`/hesaplar/${a.id}`}
                    viewTransition
                    className="group flex items-center gap-3 rounded-[12px] px-2 py-3 transition-colors hover:bg-surface-2"
                  >
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
                      style={{ color: `var(--cat-${a.color.replace('c', '')})`, background: `color-mix(in oklab, var(--cat-${a.color.replace('c', '')}) 12%, transparent)`, viewTransitionName: `account-${a.id}` }}
                    >
                      <AccountIcon kind={a.kind} size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium" title={a.name}>{a.name}</div>
                      <div className="truncate text-2xs text-muted">{a.institution ?? (a.kind === 'cash' ? 'Kasa' : '')}</div>
                    </div>
                    <span className="hidden shrink-0 sm:block">
                      <Sparkline values={values} width={64} height={28} color={bal < 0 ? 'var(--outflow)' : 'var(--cobalt)'} delay={introPlayed ? 0 : 1 + i * 0.08} />
                    </span>
                    <div className="shrink-0 text-right">
                      <Money value={bal} currency={a.currency} split className={cn('text-sm font-semibold', bal < 0 && 'text-outflow-text')} />
                      {a.currency !== 'TRY' && <div className="num text-2xs text-muted">≈ {formatShort(amountInBase(bal, f.rates[a.currency]))}</div>}
                      {low && <div className="text-2xs text-saffron-text">minimumun altında</div>}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Panel>

        {/* Gecikmiş alacaklar */}
        <Panel reveal={reveal(7)} className="lg:col-span-7">
          <PanelHeader
            title="Gecikmiş alacaklar"
            description="Vadesi geçmiş, tahsil edilmemiş tutarlar; en büyükten küçüğe."
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('/cariler', { viewTransition: true })} trailing={<ArrowRight size={12} />}>
                Cariler
              </Button>
            }
          />
          {overdueByContact.length === 0 ? (
            <div className="flex items-center gap-2 rounded-[14px] bg-inflow-soft px-4 py-3 text-sm text-inflow-text">
              <CheckCircle size={18} /> Gecikmiş alacak yok.
            </div>
          ) : (
            <ul className="-mx-2 divide-y divide-line">
              {overdueByContact.map(([id, row], i) => {
                const c = f.contactsById.get(id)!;
                const b = f.behavior.get(id);
                return (
                  <motion.li
                    key={id}
                    initial={introPlayed ? false : { opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.1 + i * 0.07, duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
                    className="group flex items-center gap-3 rounded-[12px] px-2 py-3 hover:bg-surface-2"
                  >
                    <Monogram name={c.name} size={36} />
                    <Link to={`/cariler/${id}`} viewTransition className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{c.name}</div>
                      <div className="text-2xs text-muted">
                        {row.count} belge · en eskisi {row.maxLate} gün gecikmiş
                        {b && ` · ortalama ${b.avgDelay} gün geç öder`}
                      </div>
                    </Link>
                    <Money value={row.amount} className="text-sm font-semibold text-outflow-text" decimals={0} />
                    <Button
                      size="sm"
                      variant="secondary"
                      className="opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100"
                      onClick={() => openEntry({ kind: 'collect', contactId: id })}
                    >
                      Tahsil et
                    </Button>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Çek portföyü */}
        <Panel reveal={reveal(8)} className="lg:col-span-5">
          <PanelHeader
            title="Çek ve senet portföyü"
            actions={
              <Button size="sm" variant="ghost" onClick={() => navigate('/cekler', { viewTransition: true })} trailing={<ArrowRight size={12} />}>
                Portföy
              </Button>
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-[16px] bg-inflow-soft/60 p-4">
              <div className="text-2xs text-muted">Portföyde · {portfolio.received.length} adet</div>
              <Money value={portfolio.receivedSum} decimals={0} className="display mt-1 block text-2xl text-inflow-text" />
              <div className="mt-1 text-2xs text-muted">ort. {portfolio.avgDays} gün vade</div>
            </div>
            <div className="rounded-[16px] bg-outflow-soft/60 p-4">
              <div className="text-2xs text-muted">Verilen · {portfolio.issued.length} adet</div>
              <Money value={portfolio.issuedSum} decimals={0} className="display mt-1 block text-2xl text-outflow-text" />
              <div className="mt-1 text-2xs text-muted">ödenecek</div>
            </div>
          </div>
          <ul className="mt-4 space-y-1.5">
            {portfolio.next.map((i) => (
              <li key={i.id} className="flex items-center gap-3 text-xs">
                <span className={cn('h-1.5 w-1.5 rounded-full', i.direction === 'received' ? 'bg-inflow' : 'bg-outflow')} />
                <span className="num w-14 text-muted">{formatDayMonth(i.dueDate)}</span>
                <span className="min-w-0 flex-1 truncate">{contactName(i.contactId)}</span>
                <Money value={i.amount} currency={i.currency} decimals={0} className="font-medium" />
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

/** Veri yokken sıfırlarla dolu grafikler yerine: hesap eklenince burada neyin canlanacağı. */
function EmptyPreview() {
  const cards = [
    {
      title: 'Nakit pozisyonu',
      body: 'Tüm banka, kasa ve kart hesaplarınızın anlık toplamı; döviz hesapları güncel kurla.',
      art: (
        <svg viewBox="0 0 160 48" className="h-12 w-full" aria-hidden>
          <path d="M0 40 C20 36 30 30 45 32 S70 20 85 22 110 10 125 14 150 6 160 4" fill="none" stroke="var(--cobalt)" strokeWidth="2" strokeLinecap="round" />
          <path d="M0 40 C20 36 30 30 45 32 S70 20 85 22 110 10 125 14 150 6 160 4 V48 H0Z" fill="color-mix(in oklab, var(--cobalt) 10%, transparent)" />
        </svg>
      ),
    },
    {
      title: '13 haftalık projeksiyon',
      body: 'Açık faturalar, çekler ve tekrarlayan ödemeler; müşterilerinizin gerçek gecikmeleriyle.',
      art: (
        <svg viewBox="0 0 160 48" className="h-12 w-full" aria-hidden>
          <path d="M0 24 C30 20 50 30 80 26 S130 12 160 16 V34 C130 34 110 42 80 40 S30 30 0 30Z" fill="color-mix(in oklab, var(--inflow) 16%, transparent)" />
          <path d="M0 27 C30 25 50 35 80 33 S130 22 160 25" fill="none" stroke="var(--inflow)" strokeWidth="2" strokeLinecap="round" />
          <line x1="0" x2="160" y1="42" y2="42" stroke="var(--outflow)" strokeDasharray="3 4" strokeWidth="1.2" />
        </svg>
      ),
    },
    {
      title: 'Gecikme radarı',
      body: 'Kim ne kadar geç ödüyor, hangi tahsilat projeksiyonu en çok sarsıyor; hatırlatma tek tıkla.',
      art: (
        <svg viewBox="0 0 160 48" className="h-12 w-full" aria-hidden>
          {[34, 22, 40, 14, 28, 8, 18].map((h, i) => (
            <rect key={i} x={6 + i * 22} y={48 - h} width="12" height={h} rx="3" fill={i === 2 ? 'var(--outflow)' : 'color-mix(in oklab, var(--cobalt) 30%, transparent)'} />
          ))}
        </svg>
      ),
    },
  ];
  return (
    <section className="mt-5" aria-label="Hesap ekleyince Kokpit’te görecekleriniz">
      <p className="mb-3 text-xs font-medium text-muted">İlk hesabı ekledikten sonra burada canlanacaklar</p>
      <div className="grid gap-4 md:grid-cols-3">
        {cards.map((c, i) => (
          <Panel key={c.title} reveal={1 + i} className="flex flex-col gap-4">
            <div className="flex h-16 items-end opacity-70 [&>svg]:h-full">{c.art}</div>
            <div>
              <h3 className="text-sm font-semibold text-ink">{c.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">{c.body}</p>
            </div>
          </Panel>
        ))}
      </div>
    </section>
  );
}

function Kpi({
  label,
  value,
  sub,
  delay,
  className,
  to,
  valueClassName,
}: {
  label: string;
  value: number;
  sub: React.ReactNode;
  delay: number;
  className?: string;
  to: string;
  valueClassName?: string;
}) {
  return (
    <motion.div
      className={cn('border-line', className)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
    >
      {/* Dar panelde (alt alta) satır düzeni: etiket + açıklama solda, tutar sağda */}
      <Link
        to={to}
        viewTransition
        className="group flex h-full items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-surface-2 sm:px-8 @xl:block @xl:py-5"
      >
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2 text-xs text-muted">
            {label}
            <ArrowRight size={12} className="opacity-0 transition-[opacity,transform] group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100" />
          </div>
          <div className="mt-0.5 text-2xs text-muted @xl:hidden">{sub}</div>
        </div>
        <Money value={value} decimals={0} className={cn('display block shrink-0 text-[1.45rem] leading-tight text-ink @xl:mt-1 @xl:text-[1.7rem]', valueClassName)} />
        <div className="mt-0.5 hidden text-2xs text-muted @xl:block">{sub}</div>
      </Link>
    </motion.div>
  );
}

/** Yapay zekâ ile sabah brifingi: tespitleri öncelik sırasıyla 3 maddeye indirir. */
function Briefing({ insights }: { insights: Insight[] }) {
  const ai = useAi();
  const gate = useAiGate();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Yapay zekâ kapalıyken de görünür (deneme varsa): tıklayınca deneme penceresi açılır
  if (!insights.length || (!ai.enabled && !gate.trial)) return null;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button
          size="sm"
          variant="ghost"
          icon={<Sparkle size={14} weight="duotone" className="text-cobalt" />}
          loading={busy}
          onClick={async (e) => {
            if (!ai.enabled) {
              e.preventDefault();
              gate.open();
              return;
            }
            if (text) return;
            setBusy(true);
            try {
              setText(await ai.narrate(insights.map((i) => ({ title: i.title, body: i.body, tone: i.tone })), 'brifing'));
            } catch (e) {
              setText(`⚠️ ${e instanceof Error ? e.message : 'Brifing oluşturulamadı'}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          Brifing
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={8} className="z-50 w-80 rounded-[16px] border border-line bg-surface p-4 text-sm leading-relaxed text-ink-2 shadow-[var(--float-shadow)]">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-cobalt-ink">
            <Sparkle size={14} weight="fill" /> Sabah brifingi
          </div>
          <div className="whitespace-pre-line">{text ?? 'Hazırlanıyor…'}</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const TONE_ICON = {
  warn: <Warning size={18} weight="duotone" className="text-saffron-text" />,
  bad: <WarningOctagon size={18} weight="duotone" className="text-outflow-text" />,
  good: <TrendUp size={18} weight="duotone" className="text-inflow-text" />,
  info: <Info size={18} weight="duotone" className="text-cobalt" />,
};

function InsightRow({ insight, index, animate }: { insight: Insight; index: number; animate: boolean }) {
  return (
    <motion.li
      initial={animate ? { opacity: 0, y: 10, filter: 'blur(4px)' } : false}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ delay: 0.9 + index * 0.09, duration: 0.55, ease: [0.25, 1, 0.5, 1] }}
      className="group rounded-[14px] border border-line p-3.5 transition-colors hover:border-line-strong hover:bg-surface-2"
    >
      <div className="flex gap-3">
        <span className="mt-0.5 shrink-0">{TONE_ICON[insight.tone]}</span>
        <div className="min-w-0">
          <div className="text-[0.8125rem] font-semibold leading-snug text-ink">{insight.title}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted">{insight.body}</p>
          {insight.action && (
            <Link to={insight.action.to} viewTransition className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-cobalt-ink hover:underline">
              {insight.action.label} <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          )}
        </div>
      </div>
    </motion.li>
  );
}
