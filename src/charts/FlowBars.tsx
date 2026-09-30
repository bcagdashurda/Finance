import { useMemo, useState, type ReactNode } from 'react';
import { ChartEmpty } from './ChartEmpty';
import { motion, AnimatePresence } from 'motion/react';
import { scaleBand, scaleLinear } from 'd3-scale';
import type { MonthFlow } from '@/domain/aggregate';
import { formatCompact, formatMoney } from '@/domain/money';
import { formatMonthShort, formatMonthYear } from '@/ui/format';
import { useSize } from './useSize';

interface FlowBarsProps {
  months: MonthFlow[];
  height?: number;
  delay?: number;
  label: string;
  /** Hiç hareket yokken gösterilecek eylem (ör. içe aktar) */
  emptyAction?: ReactNode;
}

const M = { top: 12, right: 8, bottom: 26, left: 52 };

/** Ayna çubuklar: girişler yukarı (turkuaz), çıkışlar aşağı (mercan), net kobalt çentik. */
export function FlowBars(props: FlowBarsProps) {
  if (props.months.every((m) => !m.inflow && !m.outflow)) {
    return (
      <ChartEmpty
        height={props.height ?? 260}
        title="Henüz nakit hareketi yok"
        body="Tahsilat, ödeme ya da banka ekstresi girdikçe aylık giriş ve çıkışlarınız burada çubuklar halinde belirir."
        action={props.emptyAction}
      />
    );
  }
  return <FlowBarsChart {...props} />;
}

function FlowBarsChart({ months, height = 260, delay = 0.2, label }: FlowBarsProps) {
  const [ref, { width }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const w = Math.max(0, width - M.left - M.right);
  const h = height - M.top - M.bottom;

  const { x, y } = useMemo(() => {
    const maxIn = Math.max(1, ...months.map((m) => m.inflow));
    const maxOut = Math.max(1, ...months.map((m) => m.outflow));
    return {
      x: scaleBand<string>().domain(months.map((m) => m.key)).range([0, w]).paddingInner(0.34).paddingOuter(0.1),
      y: scaleLinear().domain([-maxOut * 1.05, maxIn * 1.05]).range([h, 0]).nice(4),
    };
  }, [months, w, h]);

  const bw = x.bandwidth();
  const zero = y(0);
  const r = Math.min(4, bw / 2);
  const hovered = hover != null ? months[hover] : null;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={label}>
          <g transform={`translate(${M.left},${M.top})`}>
            {y.ticks(4).map((t) => (
              <g key={t}>
                <line x1={0} x2={w} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--line-strong)' : 'var(--grid)'} />
                <text x={-10} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-[var(--ink-faint)] text-[11px]">
                  {t === 0 ? '0' : formatCompact(Math.abs(t))}
                </text>
              </g>
            ))}
            {months.map((m, i) => {
              const cx = x(m.key)!;
              const inH = zero - y(m.inflow);
              const outH = y(-m.outflow) - zero;
              const dim = hover != null && hover !== i;
              return (
                <g key={m.key} style={{ transition: 'opacity .2s' }} opacity={dim ? 0.35 : 1}>
                  {/* Giriş: tabandan yukarı */}
                  {inH > r + 1 && <motion.path
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: delay + i * 0.045, type: 'spring', stiffness: 160, damping: 20 }}
                    style={{ originY: `${zero}px`, transformBox: 'view-box' }}
                    d={`M${cx},${zero - 1} v${-(inH - r - 1)} a${r},${r} 0 0 1 ${r},${-r} h${bw - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${inH - r - 1} z`}
                    fill="var(--inflow)"
                  />}
                  {/* Çıkış: tabandan aşağı */}
                  {outH > r + 1 && <motion.path
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ delay: delay + 0.1 + i * 0.045, type: 'spring', stiffness: 160, damping: 20 }}
                    style={{ originY: `${zero}px`, transformBox: 'view-box' }}
                    d={`M${cx},${zero + 1} v${outH - r - 1} a${r},${r} 0 0 0 ${r},${r} h${bw - 2 * r} a${r},${r} 0 0 0 ${r},${-r} v${-(outH - r - 1)} z`}
                    fill="var(--outflow)"
                  />}
                  {/* Net çentik */}
                  <motion.line
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: delay + 0.6 + i * 0.045 }}
                    x1={cx - 3}
                    x2={cx + bw + 3}
                    y1={y(m.net)}
                    y2={y(m.net)}
                    stroke="var(--ink)"
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                  <text x={cx + bw / 2} y={h + 18} textAnchor="middle" className="fill-[var(--ink-faint)] text-[11px] capitalize">
                    {formatMonthShort(m.key)}
                  </text>
                  <rect
                    x={cx - (x.step() - bw) / 2}
                    y={0}
                    width={x.step()}
                    height={h}
                    fill="transparent"
                    onPointerEnter={() => setHover(i)}
                    onPointerLeave={() => setHover(null)}
                  />
                </g>
              );
            })}
          </g>
        </svg>
      )}
      <AnimatePresence>
        {hovered && hover != null && (
          <motion.div
            className="pointer-events-none absolute top-0 z-10 w-52 rounded-[14px] border border-line bg-surface/95 p-3 text-xs shadow-[var(--float-shadow)] backdrop-blur"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0, left: Math.min(Math.max(0, M.left + (x(hovered.key) ?? 0) + bw + 10), Math.max(0, width - 216)) }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
          >
            <div className="capitalize text-muted">{formatMonthYear(hovered.key)}</div>
            <div className="mt-1.5 space-y-1">
              <Row label="Giriş" value={hovered.inflow} tone="in" />
              <Row label="Çıkış" value={-hovered.outflow} tone="out" />
              <div className="border-t border-line pt-1">
                <Row label="Net" value={hovered.net} tone={hovered.net >= 0 ? 'in' : 'out'} strong />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="mt-1 flex items-center gap-4 pl-[52px] text-2xs text-muted">
        <Legend color="var(--inflow)" label="Giriş" />
        <Legend color="var(--outflow)" label="Çıkış" />
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded bg-ink" /> Net
        </span>
      </div>
    </div>
  );
}

function Row({ label, value, tone, strong }: { label: string; value: number; tone: 'in' | 'out'; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted">{label}</span>
      <span className={`num ${strong ? 'font-semibold' : ''} ${tone === 'in' ? 'text-inflow-text' : 'text-outflow-text'}`}>
        {formatMoney(value, 'TRY', { sign: 'always', decimals: 0 })}
      </span>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: color }} />
      {label}
    </span>
  );
}
