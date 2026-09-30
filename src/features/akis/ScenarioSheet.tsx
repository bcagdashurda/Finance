import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';
import { Plus, Trash, ClockCounterClockwise, Prohibit, CurrencyCircleDollar, Repeat, Percent } from '@phosphor-icons/react';
import { useFinance, forecastInput } from '@/app/finance';
import { Sheet } from '@/ui/Overlay';
import { Button, IconButton } from '@/ui/Button';
import { DateInput, Field, MoneyInput, Select, TextInput } from '@/ui/Field';
import { Combobox, type ComboOption } from '@/ui/Combobox';
import { Segmented } from '@/ui/Segmented';
import { Money } from '@/ui/Money';
import { cn } from '@/ui/cn';
import { addDays, addMonths } from '@/domain/dates';
import { buildForecast } from '@/domain/forecast';
import { formatShort } from '@/domain/money';
import { formatDayMonth } from '@/ui/format';
import type { Adjustment, FlowDirection, Frequency, Scenario } from '@/domain/types';
import { createScenario, newId, updateScenario } from '@/data/repo';
import { describeAdjustment } from './scenario-ui';

type AdjType = Adjustment['type'];

const TYPES: Array<{ type: AdjType; label: string; icon: React.ReactNode; help: string }> = [
  { type: 'delay', label: 'Ertele', icon: <ClockCounterClockwise size={16} />, help: 'Bir tahsilatı ya da ödemeyi günlerce kaydırın' },
  { type: 'exclude', label: 'Çıkar', icon: <Prohibit size={16} />, help: 'Bir kalem hiç gerçekleşmezse' },
  { type: 'oneOff', label: 'Tek seferlik', icon: <CurrencyCircleDollar size={16} />, help: 'Yatırım, ikramiye, büyük sipariş' },
  { type: 'recurring', label: 'Tekrarlayan', icon: <Repeat size={16} />, help: 'Yeni personel, kira artışı, abonelik' },
  { type: 'scale', label: 'Oran', icon: <Percent size={16} />, help: 'Tüm girişler ya da çıkışlar yüzde değişirse' },
];

const COLORS = ['c7', 'c5', 'c6', 'c2', 'c4'];

export function ScenarioSheet({ open, onOpenChange, scenario, horizon }: { open: boolean; onOpenChange: (o: boolean) => void; scenario: Scenario | null; horizon: number }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={scenario ? 'Senaryoyu düzenle' : 'Yeni senaryo'} description="“Ya şöyle olursa?” sorusunu projeksiyon üzerinde deneyin." width={600}>
      {open && <ScenarioEditor key={scenario?.id ?? 'new'} scenario={scenario} horizon={horizon} onDone={() => onOpenChange(false)} />}
    </Sheet>
  );
}

function ScenarioEditor({ scenario, horizon, onDone }: { scenario: Scenario | null; horizon: number; onDone: () => void }) {
  const f = useFinance();
  const [name, setName] = useState(scenario?.name ?? '');
  const [adjustments, setAdjustments] = useState<Adjustment[]>(scenario?.adjustments ?? []);
  const [adding, setAdding] = useState<AdjType | null>(adjustments.length ? null : 'delay');
  const [saving, setSaving] = useState(false);

  const base = useMemo(() => buildForecast(forecastInput(f, horizon)), [f, horizon]);
  const preview = useMemo(() => buildForecast(forecastInput(f, horizon, { adjustments })), [f, horizon, adjustments]);
  const minDelta = preview.min.value - base.min.value;
  const endDelta = preview.end.expected - base.end.expected;

  async function save() {
    if (!name.trim()) {
      toast.error('Senaryoya bir ad verin');
      return;
    }
    setSaving(true);
    try {
      if (scenario) await updateScenario(scenario.id, { name: name.trim(), adjustments });
      else {
        const used = new Set(f.scenarios.map((s) => s.color));
        await createScenario({ name: name.trim(), adjustments, active: true, color: COLORS.find((c) => !used.has(c)) ?? 'c7' });
      }
      toast.success('Senaryo kaydedildi');
      onDone();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Field label="Senaryo adı">
        {(p) => <TextInput {...p} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Kuzey Mobilya 30 gün geciktirirse" />}
      </Field>

      {/* Anlık etki */}
      <div className="grid grid-cols-2 gap-3">
        <Impact label="En düşük nakit" value={preview.min.value} delta={minDelta} sub={formatDayMonth(preview.min.date)} />
        <Impact label={`${horizon} gün sonra`} value={preview.end.expected} delta={endDelta} />
      </div>

      <div>
        <div className="mb-2 text-xs font-medium text-ink-2">Değişiklikler</div>
        <ul className="space-y-2">
          <AnimatePresence initial={false}>
            {adjustments.map((a) => (
              <motion.li
                key={a.id}
                layout
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="flex items-center gap-3 rounded-[14px] border border-line bg-surface-2 px-4 py-3 text-sm"
              >
                <span className="text-cobalt">{TYPES.find((t) => t.type === a.type)?.icon}</span>
                <span className="min-w-0 flex-1">{describeAdjustment(a, f)}</span>
                <IconButton label="Kaldır" size="sm" onClick={() => setAdjustments((list) => list.filter((x) => x.id !== a.id))}>
                  <Trash size={14} />
                </IconButton>
              </motion.li>
            ))}
          </AnimatePresence>
          {!adjustments.length && <li className="rounded-[14px] border border-dashed border-line-strong px-4 py-3 text-xs text-muted">Henüz değişiklik yok. Aşağıdan ekleyin.</li>}
        </ul>
      </div>

      <div className="rounded-[18px] border border-line p-4">
        <div className="mb-3 grid grid-cols-5 gap-1.5">
          {TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => setAdding(t.type)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-[12px] border px-2 py-2.5 text-2xs transition-colors',
                adding === t.type ? 'border-cobalt bg-cobalt-soft text-cobalt-ink' : 'border-line text-muted hover:text-ink',
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        {adding && (
          <>
            <p className="mb-3 text-xs text-muted">{TYPES.find((t) => t.type === adding)?.help}</p>
            <AdjustmentForm
              type={adding}
              items={base.items}
              onAdd={(a) => {
                setAdjustments((list) => [...list, a]);
                setAdding(null);
              }}
            />
          </>
        )}
      </div>

      <div className="sticky bottom-0 -mx-6 -mb-5 flex justify-end gap-2 border-t border-line bg-[color-mix(in_oklab,var(--surface)_92%,transparent)] px-6 py-4 backdrop-blur">
        <Button variant="ghost" onClick={onDone}>
          Vazgeç
        </Button>
        <Button variant="primary" magnetic loading={saving} onClick={save} disabled={!adjustments.length}>
          Senaryoyu kaydet
        </Button>
      </div>
    </div>
  );
}

function Impact({ label, value, delta, sub }: { label: string; value: number; delta: number; sub?: string }) {
  return (
    <div className="rounded-[16px] bg-sunken p-4">
      <div className="text-2xs text-muted">{label}</div>
      <Money value={value} decimals={0} className="display mt-1 block text-2xl" />
      <div className={cn('mt-0.5 text-2xs', delta > 0 ? 'text-inflow-text' : delta < 0 ? 'text-outflow-text' : 'text-muted')}>
        {delta === 0 ? 'Bazla aynı' : `Baza göre ${delta > 0 ? '+' : ''}${formatShort(delta)}`}
        {sub && ` · ${sub}`}
      </div>
    </div>
  );
}

function AdjustmentForm({ type, items, onAdd }: { type: AdjType; items: ReturnType<typeof buildForecast>['items']; onAdd: (a: Adjustment) => void }) {
  const f = useFinance();
  const [target, setTarget] = useState<string | undefined>();
  const [days, setDays] = useState(30);
  const [direction, setDirection] = useState<FlowDirection>('out');
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(addDays(f.today, 14));
  const [label, setLabel] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [end, setEnd] = useState(addMonths(f.today, 12));
  const [percent, setPercent] = useState(-10);

  const targetOptions: ComboOption[] = items
    .filter((i) => i.source === 'document' || i.source === 'instrument' || i.source === 'recurring')
    .filter((i, idx, arr) => i.source !== 'recurring' || arr.findIndex((x) => x.refId === i.refId) === idx)
    .map((i) => ({
      value: `${i.source}:${i.refId}`,
      label: `${i.contactId ? f.contactsById.get(i.contactId)?.name + ' · ' : ''}${i.label}`,
      hint: `${i.direction === 'in' ? '+' : '−'}${formatShort(i.expectedAmount)} · ${formatDayMonth(i.expected)}`,
      group: i.direction === 'in' ? 'Girişler' : 'Çıkışlar',
    }));

  const add = () => {
    const id = newId();
    if (type === 'delay' || type === 'exclude') {
      if (!target) return toast.error('Bir kalem seçin');
      const [kind, refId] = target.split(':') as ['document' | 'instrument' | 'recurring', string];
      onAdd(type === 'delay' ? { id, type, target: { kind, id: refId }, days } : { id, type, target: { kind, id: refId } });
    } else if (type === 'oneOff') {
      if (!amount || !label.trim()) return toast.error('Tutar ve açıklama girin');
      onAdd({ id, type, direction, amount, date, label: label.trim() });
    } else if (type === 'recurring') {
      if (!amount || !label.trim()) return toast.error('Tutar ve açıklama girin');
      onAdd({ id, type, direction, amount, frequency, start: date, end, label: label.trim() });
    } else {
      onAdd({ id, type, direction, percent });
    }
  };

  return (
    <div className="space-y-3">
      {(type === 'delay' || type === 'exclude') && (
        <Field label="Kalem">
          {(p) => <Combobox id={p.id} value={target} onChange={setTarget} options={targetOptions} placeholder="Projeksiyondaki bir kalemi seçin" searchPlaceholder="Cari ya da belge ara…" />}
        </Field>
      )}
      {type === 'delay' && (
        <Field label={`Kaydırma · ${days} gün`}>
          {(p) => <input {...p} type="range" min={-30} max={120} step={5} value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-full accent-[var(--cobalt)]" />}
        </Field>
      )}
      {(type === 'oneOff' || type === 'recurring' || type === 'scale') && (
        <Segmented
          label="Yön"
          value={direction}
          onChange={setDirection}
          options={[
            { value: 'out', label: type === 'scale' ? 'Çıkışlar' : 'Gider' },
            { value: 'in', label: type === 'scale' ? 'Girişler' : 'Gelir' },
          ]}
        />
      )}
      {(type === 'oneOff' || type === 'recurring') && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Tutar">{(p) => <MoneyInput {...p} value={amount} onValueChange={setAmount} />}</Field>
            <Field label={type === 'oneOff' ? 'Tarih' : 'Başlangıç'}>{(p) => <DateInput {...p} value={date} today={f.today} onValueChange={setDate} />}</Field>
          </div>
          <Field label="Açıklama">{(p) => <TextInput {...p} value={label} onChange={(e) => setLabel(e.target.value)} placeholder={type === 'oneOff' ? 'Yeni kalıp makinesi' : '2 yeni operatör'} />}</Field>
        </>
      )}
      {type === 'recurring' && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Sıklık">
            {(p) => (
              <Select {...p} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)}>
                <option value="weekly">Her hafta</option>
                <option value="monthly">Her ay</option>
                <option value="quarterly">Üç ayda bir</option>
                <option value="yearly">Her yıl</option>
              </Select>
            )}
          </Field>
          <Field label="Bitiş">{(p) => <DateInput {...p} value={end} today={f.today} onValueChange={setEnd} />}</Field>
        </div>
      )}
      {type === 'scale' && (
        <Field label={`Değişim · %${percent > 0 ? '+' : ''}${percent}`}>
          {(p) => <input {...p} type="range" min={-50} max={50} step={5} value={percent} onChange={(e) => setPercent(Number(e.target.value))} className="w-full accent-[var(--cobalt)]" />}
        </Field>
      )}
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" icon={<Plus size={14} weight="bold" />} onClick={add}>
          Değişikliği ekle
        </Button>
      </div>
    </div>
  );
}
