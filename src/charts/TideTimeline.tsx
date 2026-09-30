import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { ForecastItem } from '@/domain/forecast';
import { addDays, dayOfWeek, isBusinessDay, type ISODate } from '@/domain/dates';
import { formatShort, formatMoney } from '@/domain/money';
import { cn } from '@/ui/cn';
import { formatDayMonth, formatWeekdayShort } from '@/ui/format';
import { ChartEmpty } from './ChartEmpty';

interface TideTimelineProps {
  items: ForecastItem[];
  today: ISODate;
  days?: number;
  contactName: (id?: string) => string | undefined;
  onSelect?: (item: ForecastItem) => void;
  delay?: number;
}

/**
 * Gelgit çizelgesi: önümüzdeki N gün; su çizgisinin üstünde girişler, altında çıkışlar.
 * Damla yüksekliği tutarın kareköküyle ölçeklenir (büyük kalemler baskın ama küçükler kaybolmaz).
 */
export function TideTimeline({ items, today, days = 14, contactName, onSelect, delay = 0.4 }: TideTimelineProps) {
  const [hover, setHover] = useState<string | null>(null);
  const dates = useMemo(() => Array.from({ length: days }, (_, i) => addDays(today, i)), [today, days]);
  const byDay = useMemo(() => {
    const map = new Map<ISODate, { ins: ForecastItem[]; outs: ForecastItem[] }>();
    for (const d of dates) map.set(d, { ins: [], outs: [] });
    for (const it of items) {
      const slot = map.get(it.expected);
      if (!slot) continue;
      (it.direction === 'in' ? slot.ins : slot.outs).push(it);
    }
    for (const v of map.values()) {
      v.ins.sort((a, b) => b.expectedAmount - a.expectedAmount);
      v.outs.sort((a, b) => b.expectedAmount - a.expectedAmount);
    }
    return map;
  }, [items, dates]);

  const inRange = items.filter((i) => byDay.has(i.expected));
  const max = Math.max(1, ...inRange.map((i) => i.expectedAmount));
  const size = (amount: number) => 10 + Math.sqrt(amount / max) * 62;
  const hovered = items.find((i) => i.key === hover);

  if (!inRange.length) {
    return (
      <ChartEmpty
        height={200}
        title={`Önümüzdeki ${days} günde planlı giriş ya da çıkış yok`}
        body="Vadeli faturalar, çekler ve tekrarlayan ödemeler (kira, maaş, vergi) girildikçe gün gün burada belirir."
      />
    );
  }

  return (
    <div className="relative">
      <div className="scrollbar-thin -mx-2 overflow-x-auto px-2 pb-2">
        <div className="grid min-w-[760px] gap-1.5" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}>
          {dates.map((d, di) => {
            const slot = byDay.get(d)!;
            const weekend = !isBusinessDay(d);
            const isToday = d === today;
            const inTotal = slot.ins.reduce((s, i) => s + i.expectedAmount, 0);
            const outTotal = slot.outs.reduce((s, i) => s + i.expectedAmount, 0);
            return (
              <div key={d} className={cn('flex flex-col rounded-[14px] px-1 py-1.5', weekend && 'bg-sunken/60', isToday && 'bg-cobalt-soft/60')}>
                <div className="mb-1 text-center">
                  <div className={cn('text-2xs', isToday ? 'font-semibold text-cobalt-ink' : 'text-faint')}>{isToday ? 'Bugün' : formatWeekdayShort(d)}</div>
                  <div className={cn('num text-xs', dayOfWeek(d) === 1 ? 'text-ink' : 'text-muted')}>{formatDayMonth(d)}</div>
                </div>
                {/* Girişler — yukarı doğru büyür */}
                <div className="flex h-[132px] flex-col-reverse items-center gap-1">
                  {slot.ins.slice(0, 3).map((it, k) => (
                    <Drop key={it.key} item={it} height={size(it.expectedAmount)} dir="in" delay={delay + di * 0.035 + k * 0.05} active={hover === it.key} onHover={setHover} onSelect={onSelect} />
                  ))}
                  {slot.ins.length > 3 && <span className="text-[10px] text-muted">+{slot.ins.length - 3}</span>}
                </div>
                {/* Su çizgisi */}
                <div className="relative my-1 h-px bg-line-strong">
                  {(inTotal > 0 || outTotal > 0) && (
                    <span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cobalt" />
                  )}
                </div>
                <div className="flex h-[132px] flex-col items-center gap-1">
                  {slot.outs.slice(0, 3).map((it, k) => (
                    <Drop key={it.key} item={it} height={size(it.expectedAmount)} dir="out" delay={delay + 0.15 + di * 0.035 + k * 0.05} active={hover === it.key} onHover={setHover} onSelect={onSelect} />
                  ))}
                  {slot.outs.length > 3 && <span className="text-[10px] text-muted">+{slot.outs.length - 3}</span>}
                </div>
                <div className="mt-1 space-y-0.5 text-center">
                  {inTotal > 0 && <div className="num text-[10px] text-inflow-text">+{formatShort(inTotal)}</div>}
                  {outTotal > 0 && <div className="num text-[10px] text-outflow-text">−{formatShort(outTotal)}</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <AnimatePresence>
        {hovered && (
          <motion.div
            className="pointer-events-none absolute left-1/2 top-1/2 z-10 w-72 -translate-x-1/2 -translate-y-1/2 rounded-[16px] border border-line bg-surface/95 p-4 text-xs shadow-[var(--float-shadow)] backdrop-blur"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.15 }}
          >
            <div className="flex items-center justify-between gap-2 text-muted">
              <span>{sourceLabel(hovered)}</span>
              <span>{formatDayMonth(hovered.expected)}</span>
            </div>
            <div className="mt-1 font-medium text-ink">{contactName(hovered.contactId) ?? hovered.label}</div>
            {contactName(hovered.contactId) && <div className="truncate text-muted">{hovered.label}</div>}
            <div className={cn('display num-wide mt-2 text-2xl', hovered.direction === 'in' ? 'text-inflow-text' : 'text-outflow-text')}>
              {formatMoney(hovered.direction === 'in' ? hovered.expectedAmount : -hovered.expectedAmount, 'TRY', { sign: 'always', decimals: 0 })}
            </div>
            {hovered.expected !== hovered.dueDate && (
              <div className="mt-1 text-2xs text-saffron-text">
                Vadesi {formatDayMonth(hovered.dueDate)} · carinin ödeme alışkanlığına göre kaydırıldı
              </div>
            )}
            {hovered.probability < 1 && <div className="mt-1 text-2xs text-muted">%{Math.round(hovered.probability * 100)} olasılıkla ağırlıklandırıldı</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function sourceLabel(i: ForecastItem): string {
  if (i.source === 'document') return i.direction === 'in' ? 'Alacak' : 'Borç';
  if (i.source === 'instrument') return i.direction === 'in' ? 'Portföy çeki' : 'Verilen çek';
  if (i.source === 'recurring') return 'Tekrarlayan';
  if (i.source === 'vat') return 'Vergi tahmini';
  if (i.source === 'planned') return 'Planlı işlem';
  return 'Senaryo';
}

function Drop({
  item,
  height,
  dir,
  delay,
  active,
  onHover,
  onSelect,
}: {
  item: ForecastItem;
  height: number;
  dir: 'in' | 'out';
  delay: number;
  active: boolean;
  onHover: (key: string | null) => void;
  onSelect?: (item: ForecastItem) => void;
}) {
  return (
    <motion.button
      type="button"
      aria-label={`${item.label} ${formatMoney(item.expectedAmount)}`}
      onPointerEnter={() => onHover(item.key)}
      onPointerLeave={() => onHover(null)}
      onFocus={() => onHover(item.key)}
      onBlur={() => onHover(null)}
      onClick={() => onSelect?.(item)}
      initial={{ scaleY: 0, opacity: 0 }}
      animate={{ scaleY: 1, opacity: 1 }}
      whileHover={{ scale: 1.08 }}
      transition={{ delay, type: 'spring', stiffness: 220, damping: 18 }}
      style={{
        height: Math.min(height, 120),
        originY: dir === 'in' ? 1 : 0,
        background: dir === 'in' ? 'var(--inflow)' : 'var(--outflow)',
        opacity: item.source === 'recurring' || item.source === 'vat' ? 0.72 : 1,
        backgroundImage:
          item.probability < 1 || item.overdue
            ? 'repeating-linear-gradient(45deg, rgb(255 255 255 / .28) 0 2px, transparent 2px 6px)'
            : undefined,
      }}
      className={cn(
        'w-[62%] shrink-0 rounded-full outline-offset-2 transition-shadow',
        active && 'shadow-[0_0_0_3px_var(--surface),0_0_0_5px_var(--cobalt)]',
      )}
    />
  );
}
