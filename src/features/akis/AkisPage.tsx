import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { Plus, PencilSimple, Trash, Warning, ArrowCounterClockwise, Eye, EyeSlash, Lightning } from '@phosphor-icons/react';
import { forecastInput, useFinance } from '@/app/finance';
import { PageHeader } from '@/ui/PageHeader';
import { Panel, PanelHeader } from '@/ui/Panel';
import { Segmented } from '@/ui/Segmented';
import { Button, IconButton } from '@/ui/Button';
import { Badge, Toggle, Tip } from '@/ui/bits';
import { Money } from '@/ui/Money';
import { cn, slotColor } from '@/ui/cn';
import { formatDayMonth, formatDayMonthLong, formatWeekdayShort, relativeDay } from '@/ui/format';
import { ForecastChart, type ForecastOverlay } from '@/charts/ForecastChart';
import { balanceSeries } from '@/domain/balances';
import { addDays, startOfWeek } from '@/domain/dates';
import { buildForecast, type ForecastItem } from '@/domain/forecast';
import { formatShort } from '@/domain/money';
import type { Adjustment, Scenario } from '@/domain/types';
import { deleteScenario, newId, setWorkspaceSetting, updateScenario } from '@/data/repo';
import { SETTINGS_KEYS } from '@/data/load';
import { ScenarioSheet, type ScenarioDraft } from './ScenarioSheet';
import { describeAdjustment } from './scenario-ui';

type Horizon = '30' | '90' | '180' | '365';

const SOURCE_LABEL: Record<ForecastItem['source'], string> = {
  document: 'Belge',
  recurring: 'Tekrarlayan',
  instrument: 'Çek/senet',
  vat: 'KDV tahmini',
  scenario: 'Senaryo',
  runrate: 'Tempo',
  planned: 'Planlı işlem',
};

/**
 * Uyarıdan çözüm taslağı: sıkışmayı en çok tetikleyen ertelenebilir ödemeyi (belge / çek / tekrarlayan)
 * 14 gün kaydırır. Kullanıcı etkisini anında görür, dilerse değiştirir.
 */
function solutionDraft(alert: { date: string; drivers: ForecastItem[] }): ScenarioDraft {
  const target = alert.drivers
    .filter((d) => d.direction === 'out' && d.refId && (d.source === 'document' || d.source === 'instrument' || d.source === 'recurring'))
    .sort((a, b) => b.expectedAmount - a.expectedAmount)[0];
  const name = `${formatDayMonth(alert.date)} sıkışmasına çözüm`;
  if (!target) return { name, adjustments: [] };
  const kind = target.source === 'document' ? 'document' : target.source === 'instrument' ? 'instrument' : 'recurring';
  return { name, adjustments: [{ id: newId(), type: 'delay', target: { kind, id: target.refId! }, days: 14 }] };
}

export default function AkisPage() {
  const f = useFinance();
  const navigate = useNavigate();
  const [horizon, setHorizon] = useState<Horizon>('90');
  const [showBand, setShowBand] = useState(true);
  const [sheet, setSheet] = useState<{ open: boolean; scenario: Scenario | null; draft?: ScenarioDraft | null }>({ open: false, scenario: null });
  const [quick, setQuick] = useState<Adjustment[]>([]);
  const [filter, setFilter] = useState<'all' | 'in' | 'out'>('all');
  const [showTempo, setShowTempo] = useState(false);
  const [allWeeks, setAllWeeks] = useState(false);
  const days = Number(horizon);

  const base = useMemo(() => buildForecast(forecastInput(f, days, quick.length ? { adjustments: quick } : undefined)), [f, days, quick]);
  const activeScenarios = f.scenarios.filter((s) => s.active);
  const overlays: ForecastOverlay[] = useMemo(
    () =>
      activeScenarios.map((s) => ({
        id: s.id,
        label: s.name,
        color: slotColor(s.color),
        days: buildForecast(forecastInput(f, days, { adjustments: [...quick, ...s.adjustments] })).days,
      })),
    [activeScenarios, f, days, quick], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const history = useMemo(
    () => balanceSeries(f.accounts.filter((a) => !a.archived), f.transactions, addDays(f.today, -Math.min(60, Math.round(days / 3))), f.today, f.rates),
    [f.accounts, f.transactions, f.today, f.rates, days],
  );

  const alert = base.alerts[0];
  const items = base.items
    .filter((i) => (filter === 'all' ? true : i.direction === filter))
    .filter((i) => showTempo || i.source !== 'runrate');
  const weeks = useMemo(() => {
    const map = new Map<string, ForecastItem[]>();
    for (const it of items) {
      const w = startOfWeek(it.expected);
      const list = map.get(w) ?? [];
      list.push(it);
      map.set(w, list);
    }
    return [...map.entries()];
  }, [items]);

  const toggleTempo = (v: boolean) => void setWorkspaceSetting(SETTINGS_KEYS.tempo, v);

  const excludeQuick = (it: ForecastItem) => {
    if (it.source === 'runrate' || it.source === 'vat' || it.source === 'scenario' || it.source === 'planned' || !it.refId) {
      toast('Bu kalem hızlı senaryoyla çıkarılamaz');
      return;
    }
    const kind = it.source === 'document' ? 'document' : it.source === 'instrument' ? 'instrument' : 'recurring';
    setQuick((q) => [...q, { id: newId(), type: 'exclude', target: { kind, id: it.refId! } }]);
  };

  return (
    <div>
      <PageHeader
        kicker="Olasılıklı projeksiyon · müşterilerinizin gerçek ödeme alışkanlıklarıyla"
        title="Nakit akışı"
        actions={
          <>
            <Segmented
              label="Ufuk"
              value={horizon}
              onChange={setHorizon}
              options={[
                { value: '30', label: '30 gün' },
                { value: '90', label: '13 hafta' },
                { value: '180', label: '6 ay' },
                { value: '365', label: '1 yıl' },
              ]}
            />
            <Button variant="primary" magnetic icon={<Plus size={16} weight="bold" />} onClick={() => setSheet({ open: true, scenario: null })}>
              Senaryo
            </Button>
          </>
        }
      />

      {/* Özet şerit */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Bugün" value={f.totalBase} index={0} />
        <Stat label={`${days} gün sonra`} value={base.end.expected} sub={<Delta v={base.end.expected - f.totalBase} />} index={1} />
        <Stat
          label="En düşük nokta"
          value={base.min.value}
          sub={<span className={base.min.value < f.settings.minCashBalance ? 'text-outflow-text' : 'text-muted'}>{formatDayMonthLong(base.min.date)}</span>}
          index={2}
          danger={base.min.value < f.settings.minCashBalance}
        />
        <Stat
          label="Beklenen giriş / çıkış"
          value={base.totals.inflow - base.totals.outflow}
          sub={
            <span>
              <span className="text-inflow-text">+{formatShort(base.totals.inflow)}</span> · <span className="text-outflow-text">−{formatShort(base.totals.outflow)}</span>
            </span>
          }
          index={3}
        />
      </div>

      <AnimatePresence>
        {alert && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className={cn(
              'mb-5 flex flex-wrap items-center gap-3 rounded-[18px] border px-5 py-4',
              alert.kind === 'pessimistic-below-min' ? 'border-saffron/40 bg-saffron-soft' : 'border-outflow/30 bg-outflow-soft',
            )}
          >
            <Warning size={22} weight="duotone" className={alert.kind === 'pessimistic-below-min' ? 'text-saffron-text' : 'text-outflow-text'} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">
                {alert.kind === 'pessimistic-below-min' ? 'Kötümser senaryoda ' : ''}
                {formatDayMonthLong(alert.date)} ({relativeDay(alert.date, f.today).toLocaleLowerCase('tr-TR')}) nakit {formatShort(alert.value)} seviyesine iniyor
              </div>
              <div className="text-xs text-muted">
                Minimum eşik {formatShort(f.settings.minCashBalance)}.
                {alert.drivers.length > 0 && ` Tetikleyenler: ${alert.drivers.map((d) => (d.contactId ? f.contactsById.get(d.contactId)?.name : d.label)).join(', ')}.`}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => setSheet({ open: true, scenario: null, draft: solutionDraft(alert) })}>
              Çözüm senaryosu kur
            </Button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
        <Panel reveal={0}>
          <PanelHeader
            title="Projeksiyon"
            description="Düz çizgi baz tahmin; bant iyimser–kötümser aralığı; kesikli çizgiler senaryolar."
            actions={
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <Toggle checked={showBand} onCheckedChange={setShowBand} label="Bandı göster" />
                  Bant
                </label>
                <Tip content="Son 3 ayın satış ve alış temposuna göre henüz kesilmemiş faturaları ve belgesiz rutin akışları (enerji, kart harcamaları, peşin satışlar) öngörür.">
                  <label className="flex items-center gap-2 text-xs text-muted">
                    <Toggle checked={f.settings.tempo} onCheckedChange={toggleTempo} label="Tempo tahmini" />
                    Tempo
                  </label>
                </Tip>
              </div>
            }
          />
          <ForecastChart label="Nakit projeksiyonu" days={base.days} history={history} minBalance={f.settings.minCashBalance} overlays={overlays} showBand={showBand} height={420} delay={0.3} />
          {quick.length > 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[14px] bg-cobalt-soft/60 px-4 py-2.5 text-xs">
              <Lightning size={14} weight="fill" className="text-cobalt" />
              <span className="font-medium text-cobalt-ink">Hızlı senaryo:</span>
              {quick.map((q) => (
                <Badge key={q.id} tone="cobalt">{describeAdjustment(q, f)}</Badge>
              ))}
              <Button size="sm" variant="ghost" icon={<ArrowCounterClockwise size={14} />} className="ml-auto" onClick={() => setQuick([])}>
                Sıfırla
              </Button>
            </div>
          )}
          {f.runRate && f.settings.tempo && (
            <p className="mt-3 text-2xs text-muted">
              Tempo: ayda {formatShort(f.runRate.salesMonthly)} yeni satış (tahsilat ~{f.runRate.salesLag} gün sonra), {formatShort(f.runRate.purchasesMonthly)} yeni alış ve günde{' '}
              {formatShort(f.runRate.dailyOut)} rutin gider varsayıldı.
            </p>
          )}
        </Panel>

        {/* Senaryolar */}
        <Panel reveal={1}>
          <PanelHeader title="Senaryolar" description="Açık olanlar grafikte bazla karşılaştırılır." />
          <ul className="space-y-2">
            {f.scenarios.map((s) => {
              const r = buildForecast(forecastInput(f, days, { adjustments: s.adjustments }));
              const delta = r.min.value - base.min.value;
              const belowOf = (x: typeof r) => x.days.filter((d) => d.expected < f.settings.minCashBalance).length;
              const belowS = belowOf(r);
              const belowB = belowOf(base);
              return (
                <li key={s.id} className={cn('rounded-[16px] border p-3.5 transition-colors', s.active ? 'border-line-strong bg-surface-2' : 'border-line')}>
                  <div className="flex items-start gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: slotColor(s.color) }} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium leading-snug">{s.name}</div>
                      <div className="mt-1 text-2xs text-muted">{s.adjustments.map((a) => describeAdjustment(a, f)).join(' · ')}</div>
                      <div className={cn('mt-1.5 text-2xs font-medium', delta < 0 ? 'text-outflow-text' : delta > 0 ? 'text-inflow-text' : 'text-muted')}>
                        {/* "En düşük nokta −₺96 bin" eksi bakiye sanılıyordu: fark olduğu açıkça yazılır */}
                        {delta === 0
                          ? 'En düşük nokta değişmez'
                          : `En düşük nokta ${formatShort(Math.abs(delta))} ${delta > 0 ? 'yükselir' : 'düşer'}`}{' '}
                        · {formatShort(r.min.value)}, {formatDayMonth(r.min.date)}
                      </div>
                      {(belowS > 0 || belowB > 0) && (
                        <div className={cn('mt-0.5 text-2xs', belowS < belowB ? 'text-inflow-text' : belowS > belowB ? 'text-outflow-text' : 'text-muted')}>
                          Eşiğin altında {belowS} gün {belowS !== belowB && `(bazda ${belowB})`}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-end gap-1">
                    <Tip content={s.active ? 'Grafikten gizle' : 'Grafikte göster'}>
                      <IconButton label={s.active ? 'Gizle' : 'Göster'} size="sm" onClick={() => void updateScenario(s.id, { active: !s.active })}>
                        {s.active ? <Eye size={15} /> : <EyeSlash size={15} />}
                      </IconButton>
                    </Tip>
                    <IconButton label="Düzenle" size="sm" onClick={() => setSheet({ open: true, scenario: s })}>
                      <PencilSimple size={15} />
                    </IconButton>
                    <IconButton
                      label="Sil"
                      size="sm"
                      onClick={async () => {
                        await deleteScenario(s.id);
                        toast('Senaryo silindi');
                      }}
                    >
                      <Trash size={15} />
                    </IconButton>
                  </div>
                </li>
              );
            })}
            {!f.scenarios.length && (
              <li className="rounded-[16px] border border-dashed border-line-strong p-4 text-xs text-muted">
                Henüz senaryo yok. “Ya büyük müşterim ödemeyi 30 gün geciktirirse?” gibi bir soruyu deneyin.
              </li>
            )}
          </ul>
        </Panel>
      </div>

      {/* Kalemler */}
      <Panel reveal={2} className="mt-5">
        <PanelHeader
          title="Projeksiyondaki kalemler"
          description="Hafta hafta; bir kalemin üzerine gelip “hariç tut” diyerek anında etkisini görün."
          actions={
            <div className="flex items-center gap-3">
              <label className="hidden items-center gap-2 text-xs text-muted sm:flex">
                <Toggle checked={showTempo} onCheckedChange={setShowTempo} label="Tempo kalemlerini göster" />
                Tempo kalemleri
              </label>
              <Segmented
                label="Yön"
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'Tümü' },
                  { value: 'in', label: 'Girişler' },
                  { value: 'out', label: 'Çıkışlar' },
                ]}
              />
            </div>
          }
        />
        <div className="space-y-6">
          {(allWeeks ? weeks : weeks.slice(0, 4)).map(([week, list]) => {
            const net = list.reduce((s, i) => s + (i.direction === 'in' ? i.expectedAmount : -i.expectedAmount), 0);
            const day = base.days.find((d) => d.date === addDays(week, 6)) ?? base.days.find((d) => d.date >= week);
            return (
              <section key={week}>
                <div className="mb-2 flex items-baseline justify-between border-b border-line pb-2">
                  <h3 className="text-xs font-semibold text-ink-2">
                    {formatDayMonth(week < f.today ? f.today : week)} – {formatDayMonth(addDays(week, 6))} haftası
                  </h3>
                  <div className="flex items-center gap-4 text-2xs text-muted">
                    <span>
                      Net <Money value={net} tone="auto" sign="always" decimals={0} className="font-semibold" />
                    </span>
                    {day && (
                      <span>
                        Hafta sonu bakiye <Money value={day.expected} decimals={0} className="font-semibold text-ink" />
                      </span>
                    )}
                  </div>
                </div>
                <ul className="divide-y divide-line">
                  {list.map((it) => {
                    const c = it.contactId ? f.contactsById.get(it.contactId) : undefined;
                    const shifted = it.expected !== it.dueDate && it.source === 'document';
                    return (
                      <li key={it.key} className="group grid grid-cols-[64px_1fr_auto] items-center gap-3 py-2.5 text-sm sm:grid-cols-[84px_1fr_120px_140px_auto]">
                        <div className="num text-xs text-muted">
                          {formatDayMonth(it.expected)} <span className="hidden sm:inline">· {formatWeekdayShort(it.expected)}</span>
                        </div>
                        <button
                          type="button"
                          className="min-w-0 text-left"
                          onClick={() => it.contactId && navigate(`/cariler/${it.contactId}`, { viewTransition: true })}
                        >
                          <div className="truncate font-medium">{c?.name ?? it.label}</div>
                          <div className="truncate text-2xs text-muted">
                            {c ? it.label : ''}
                            {shifted && <span className="text-saffron-text"> · vadesi {formatDayMonth(it.dueDate)}, alışkanlığa göre kaydırıldı</span>}
                            {it.overdue && <span className="text-outflow-text"> · vadesi geçmiş</span>}
                            {it.probability < 1 && <span> · %{Math.round(it.probability * 100)} olasılık</span>}
                          </div>
                        </button>
                        <div className="hidden sm:block">
                          <Badge tone={it.source === 'runrate' || it.source === 'vat' ? 'muted' : 'neutral'}>{SOURCE_LABEL[it.source]}</Badge>
                        </div>
                        <Money
                          value={it.direction === 'in' ? it.expectedAmount : -it.expectedAmount}
                          tone="auto"
                          sign="always"
                          decimals={0}
                          className="text-right text-sm font-semibold"
                        />
                        <button
                          type="button"
                          onClick={() => excludeQuick(it)}
                          className="hidden rounded-[8px] px-2 py-1 text-2xs text-muted opacity-0 transition-opacity hover:bg-sunken hover:text-ink group-hover:opacity-100 sm:block"
                        >
                          Hariç tut
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        {weeks.length > 4 && (
          <div className="mt-5 flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => setAllWeeks((v) => !v)}>
              {allWeeks ? 'İlk 4 haftayı göster' : `Kalan ${weeks.length - 4} haftayı göster`}
            </Button>
          </div>
        )}
      </Panel>

      <ScenarioSheet open={sheet.open} scenario={sheet.scenario} draft={sheet.draft} horizon={days} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} />
    </div>
  );
}

function Stat({ label, value, sub, index, danger }: { label: string; value: number; sub?: React.ReactNode; index: number; danger?: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.06, duration: 0.5, ease: [0.25, 1, 0.5, 1] }}
      className={cn('panel px-5 py-4', danger && 'border-outflow/30')}
    >
      <div className="text-xs text-muted">{label}</div>
      <Money value={value} decimals={0} className={cn('display mt-1 block text-2xl sm:text-[1.75rem]', danger && 'text-outflow-text')} />
      {sub && <div className="mt-0.5 text-2xs">{sub}</div>}
    </motion.div>
  );
}

function Delta({ v }: { v: number }) {
  return <span className={v >= 0 ? 'text-inflow-text' : 'text-outflow-text'}>{v >= 0 ? '+' : ''}{formatShort(v)} bugüne göre</span>;
}
