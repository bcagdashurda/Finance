import { useId, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { scaleLinear } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';
import { diffDays, type ISODate } from '@/domain/dates';
import { formatCompact, formatMoney, type CurrencyCode, type Money } from '@/domain/money';
import { formatDayMonth, formatWeekday } from '@/ui/format';
import { useSize } from './useSize';

interface Point {
  date: ISODate;
  value: Money;
}

/** Gerçekleşmiş bakiye alanı: çizimle gelir, crosshair ile okunur. */
export function BalanceArea({ points, currency = 'TRY', height = 240, color = 'var(--cobalt)', minLine, label }: { points: Point[]; currency?: CurrencyCode; height?: number; color?: string; minLine?: Money; label: string }) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, '');
  const M = { top: 12, right: 8, bottom: 24, left: 54 };
  const w = Math.max(0, width - M.left - M.right);
  const h = height - M.top - M.bottom;
  const start = points[0]?.date ?? '';
  const total = Math.max(1, diffDays(points.at(-1)?.date ?? start, start));
  const x = (d: ISODate) => (diffDays(d, start) / total) * w;
  const y = useMemo(() => {
    const vals = [...points.map((p) => p.value), ...(minLine != null ? [minLine] : [])];
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo) * 0.1 || 1;
    return scaleLinear().domain([lo - pad, hi + pad]).range([h, 0]).nice(4);
  }, [points, minLine, h]);
  const linePath = line<Point>().x((p) => x(p.date)).y((p) => y(p.value)).curve(curveMonotoneX)(points) ?? '';
  const areaPath = area<Point>().x((p) => x(p.date)).y0(h).y1((p) => y(p.value)).curve(curveMonotoneX)(points) ?? '';
  const hovered = hover != null ? points[hover] : null;
  const ticks = points.filter((_, i) => i % Math.max(1, Math.round(points.length / 6)) === 0);

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && points.length > 1 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={label}
          onPointerMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            const idx = Math.round(((e.clientX - r.left - M.left) / w) * (points.length - 1));
            setHover(idx >= 0 && idx < points.length ? idx : null);
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`${uid}-g`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.2} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <g transform={`translate(${M.left},${M.top})`}>
            {y.ticks(4).map((t) => (
              <g key={t}>
                <line x1={0} x2={w} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
                <text x={-10} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-[var(--ink-faint)] text-[11px]">
                  {formatCompact(t, currency)}
                </text>
              </g>
            ))}
            {minLine != null && <line x1={0} x2={w} y1={y(minLine)} y2={y(minLine)} stroke="var(--saffron)" strokeDasharray="4 4" />}
            <motion.path d={areaPath} fill={`url(#${uid}-g)`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.8 }} />
            <motion.path d={linePath} fill="none" stroke={color} strokeWidth={2} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: [0.65, 0, 0.35, 1] }} />
            {ticks.map((p) => (
              <text key={p.date} x={x(p.date)} y={h + 18} textAnchor="middle" className="fill-[var(--ink-faint)] text-[11px]">
                {formatDayMonth(p.date)}
              </text>
            ))}
            {hovered && (
              <g>
                <line x1={x(hovered.date)} x2={x(hovered.date)} y1={0} y2={h} stroke="var(--ink-muted)" strokeOpacity={0.35} />
                <circle cx={x(hovered.date)} cy={y(hovered.value)} r={5} fill={color} stroke="var(--surface)" strokeWidth={2} />
              </g>
            )}
          </g>
        </svg>
      )}
      <AnimatePresence>
        {hovered && (
          <motion.div
            className="pointer-events-none absolute top-0 z-10 rounded-[12px] border border-line bg-surface/95 px-3 py-2 text-xs shadow-[var(--float-shadow)] backdrop-blur"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, left: Math.min(Math.max(0, M.left + x(hovered.date) + 12), Math.max(0, width - 190)) }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
          >
            <div className="text-muted">
              {formatDayMonth(hovered.date)} · {formatWeekday(hovered.date)}
            </div>
            <div className="display num-wide text-lg">{formatMoney(hovered.value, currency)}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
