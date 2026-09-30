import { useId, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { scaleLinear } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';
import type { ForecastDay } from '@/domain/forecast';
import { formatCompact, formatShort, formatMoney, type Money } from '@/domain/money';
import { diffDays, type ISODate } from '@/domain/dates';
import { formatDayMonth, formatWeekday } from '@/ui/format';
import { useSize } from './useSize';

export interface ForecastOverlay {
  id: string;
  label: string;
  color: string;
  days: ForecastDay[];
}

interface ForecastChartProps {
  days: ForecastDay[];
  minBalance?: Money;
  height?: number;
  compact?: boolean;
  overlays?: ForecastOverlay[];
  /** Geçmiş bakiye serisi (sol tarafta, gerçekleşen) */
  history?: Array<{ date: ISODate; value: Money }>;
  showBand?: boolean;
  delay?: number;
  label: string;
  /** Kapsayıcının yüksekliğini doldurur (height en az yükseklik olur): yan sütun uzunsa boşluk kalmaz */
  fill?: boolean;
}

const M = { top: 16, right: 12, bottom: 28, left: 56 };

/** Nakit projeksiyonu: baz çizgi, iyimser–kötümser bant, eşik, en düşük nokta, crosshair. */
export function ForecastChart({
  days,
  minBalance,
  height: minHeight = 300,
  compact = false,
  overlays = [],
  history = [],
  showBand = true,
  delay = 0.3,
  label,
  fill = false,
}: ForecastChartProps) {
  const [ref, { width, height: measured }] = useSize<HTMLDivElement>();
  const height = fill ? Math.max(minHeight, measured) : minHeight;
  const boxStyle = fill ? { height: '100%', minHeight } : { height };
  const [hover, setHover] = useState<number | null>(null);
  const uid = useId().replace(/:/g, '');
  const margin = compact ? { top: 10, right: 6, bottom: 22, left: 6 } : M;
  const w = Math.max(0, width - margin.left - margin.right);
  const h = height - margin.top - margin.bottom;

  const all = [...history.map((d) => ({ date: d.date, v: d.value })), ...days.map((d) => ({ date: d.date, v: d.expected }))];
  const start = all[0]?.date ?? days[0]?.date ?? '';
  const totalDays = Math.max(1, diffDays(days.at(-1)?.date ?? start, start));
  const x = (d: ISODate) => (diffDays(d, start) / totalDays) * w;

  const { y, yTicks } = useMemo(() => {
    const values = [
      ...days.flatMap((d) => (showBand ? [d.optimistic, d.pessimistic, d.expected] : [d.expected])),
      ...history.map((d) => d.value),
      ...overlays.flatMap((o) => o.days.map((d) => d.expected)),
      ...(minBalance != null ? [minBalance] : []),
    ];
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = (hi - lo) * 0.08 || 1;
    const s = scaleLinear().domain([lo - pad, hi + pad]).range([h, 0]).nice(5);
    return { y: s, yTicks: s.ticks(compact ? 3 : 5) };
  }, [days, history, overlays, minBalance, h, showBand, compact]);

  const linePath = useMemo(
    () => line<ForecastDay>().x((d) => x(d.date)).y((d) => y(d.expected)).curve(curveMonotoneX)(days) ?? '',
    [days, y, w], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const bandPath = useMemo(
    () =>
      area<ForecastDay>()
        .x((d) => x(d.date))
        .y0((d) => y(d.pessimistic))
        .y1((d) => y(d.optimistic))
        .curve(curveMonotoneX)(days) ?? '',
    [days, y, w], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const fillPath = useMemo(
    () =>
      area<ForecastDay>()
        .x((d) => x(d.date))
        .y0(h)
        .y1((d) => y(d.expected))
        .curve(curveMonotoneX)(days) ?? '',
    [days, y, w, h], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const historyPath = useMemo(
    () =>
      history.length
        ? (line<{ date: ISODate; value: Money }>()
            .x((d) => x(d.date))
            .y((d) => y(d.value))
            .curve(curveMonotoneX)(history) ?? '')
        : '',
    [history, y, w], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const minPoint = useMemo(() => days.reduce((m, d) => (d.expected < m.expected ? d : m), days[0]!), [days]);
  const belowMin = minBalance != null && minPoint && minPoint.expected < minBalance;

  const xTicks = useMemo(() => {
    const count = compact ? 3 : Math.max(3, Math.min(8, Math.floor(w / 110)));
    const step = Math.max(1, Math.round(totalDays / count));
    const out: ISODate[] = [];
    for (let i = 0; i <= all.length - 1; i += step) out.push(all[i]!.date);
    return out;
  }, [all, totalDays, w, compact]);

  const hovered = hover != null ? days[hover] : null;

  if (!days.length) return <div ref={ref} style={boxStyle} />;

  return (
    <div ref={ref} className="relative w-full select-none" style={boxStyle}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={label}
          onPointerMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const px = e.clientX - r.left - margin.left;
            const dayOffset = Math.round((px / w) * totalDays);
            const idx = dayOffset - (history.length ? diffDays(days[0]!.date, start) : 0);
            setHover(idx >= 0 && idx < days.length ? idx : null);
          }}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id={`${uid}-fill`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--cobalt)" stopOpacity={0.16} />
              <stop offset="100%" stopColor="var(--cobalt)" stopOpacity={0} />
            </linearGradient>
            <clipPath id={`${uid}-reveal`}>
              <motion.rect
                x={-margin.left}
                y={-margin.top}
                height={height}
                initial={{ width: 0 }}
                animate={{ width: width + 20 }}
                transition={{ duration: 1.6, delay, ease: [0.65, 0, 0.35, 1] }}
              />
            </clipPath>
            <pattern id={`${uid}-danger`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <line x1="0" y1="0" x2="0" y2="6" stroke="var(--outflow)" strokeOpacity="0.18" strokeWidth="2" />
            </pattern>
          </defs>

          <g transform={`translate(${margin.left},${margin.top})`}>
            {/* Izgara */}
            {!compact &&
              yTicks.map((t) => (
                <g key={t}>
                  <line x1={0} x2={w} y1={y(t)} y2={y(t)} stroke="var(--grid)" />
                  <text x={-10} y={y(t)} dy="0.32em" textAnchor="end" className="num fill-[var(--ink-faint)] text-[11px]">
                    {formatCompact(t)}
                  </text>
                </g>
              ))}
            {y.domain()[0]! < 0 && <line x1={0} x2={w} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" />}

            {/* Eşik altı bölge */}
            {minBalance != null && (
              <>
                <rect x={0} y={y(minBalance)} width={w} height={Math.max(0, h - y(minBalance))} fill={`url(#${uid}-danger)`} />
                <line x1={0} x2={w} y1={y(minBalance)} y2={y(minBalance)} stroke="var(--saffron)" strokeDasharray="4 4" strokeWidth={1.2} />
                {!compact && (
                  <text x={6} y={y(minBalance) + 14} textAnchor="start" className="fill-[var(--saffron-text)] text-[11px] font-medium">
                    Minimum nakit {formatShort(minBalance)}
                  </text>
                )}
              </>
            )}

            <g clipPath={`url(#${uid}-reveal)`}>
              {historyPath && <path d={historyPath} fill="none" stroke="var(--ink-muted)" strokeWidth={1.6} strokeOpacity={0.7} />}
              {showBand && (
                <motion.path
                  initial={false}
                  animate={{ d: bandPath }}
                  transition={{ duration: 0.7, ease: [0.25, 1, 0.5, 1] }}
                  fill="var(--cobalt)"
                  fillOpacity={0.09}
                  stroke="var(--cobalt)"
                  strokeOpacity={0.18}
                  strokeWidth={1}
                  strokeDasharray="2 3"
                />
              )}
              <motion.path initial={false} animate={{ d: fillPath }} transition={{ duration: 0.7, ease: [0.25, 1, 0.5, 1] }} fill={`url(#${uid}-fill)`} />
              {overlays.map((o) => {
                const p = line<ForecastDay>().x((d) => x(d.date)).y((d) => y(d.expected)).curve(curveMonotoneX)(o.days) ?? '';
                return (
                  <motion.path
                    key={o.id}
                    initial={{ opacity: 0 }}
                    animate={{ d: p, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.7 }}
                    fill="none"
                    stroke={o.color}
                    strokeWidth={2}
                    strokeDasharray="6 4"
                  />
                );
              })}
              <motion.path
                initial={false}
                animate={{ d: linePath }}
                transition={{ duration: 0.7, ease: [0.25, 1, 0.5, 1] }}
                fill="none"
                stroke="var(--cobalt)"
                strokeWidth={2.2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </g>

            {/* Bugün */}
            {history.length > 0 && (
              <g>
                <line x1={x(days[0]!.date)} x2={x(days[0]!.date)} y1={0} y2={h} stroke="var(--line-strong)" strokeDasharray="2 3" />
                {!compact && (
                  <text x={x(days[0]!.date) + 6} y={10} className="fill-[var(--ink-muted)] text-[11px]">
                    Bugün
                  </text>
                )}
              </g>
            )}

            {/* En düşük nokta (bugünün kendisi en düşükse ve eşik aşılmıyorsa işaretlemek anlamsız) */}
            {minPoint && (minPoint !== days[0] || belowMin) && (
              <motion.g initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: delay + 1.5, type: 'spring', stiffness: 300, damping: 18 }}>
                {belowMin && <circle cx={x(minPoint.date)} cy={y(minPoint.expected)} r={9} fill="var(--outflow)" className="pulse-ring" />}
                <circle
                  cx={x(minPoint.date)}
                  cy={y(minPoint.expected)}
                  r={5}
                  fill="var(--surface)"
                  stroke={belowMin ? 'var(--outflow)' : 'var(--cobalt)'}
                  strokeWidth={2.2}
                />
                {!compact && (
                  <text
                    x={x(minPoint.date)}
                    y={y(minPoint.expected) + 22}
                    textAnchor="middle"
                    className={`text-[11px] font-medium ${belowMin ? 'fill-[var(--outflow-text)]' : 'fill-[var(--ink-muted)]'}`}
                  >
                    En düşük · {formatDayMonth(minPoint.date)}
                  </text>
                )}
              </motion.g>
            )}

            {/* X ekseni */}
            {xTicks.map((d) => (
              <text key={d} x={x(d)} y={h + (compact ? 16 : 20)} textAnchor="middle" className="fill-[var(--ink-faint)] text-[11px]">
                {formatDayMonth(d)}
              </text>
            ))}

            {/* Crosshair */}
            <AnimatePresence>
              {hovered && (
                <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }}>
                  {/* initial={false}: ilk karede de geçerli koordinat (aksi halde "x1: undefined" konsol hatası) */}
                  <motion.line
                    initial={false}
                    animate={{ x1: x(hovered.date), x2: x(hovered.date) }}
                    transition={{ type: 'spring', stiffness: 700, damping: 40 }}
                    y1={0}
                    y2={h}
                    stroke="var(--ink-muted)"
                    strokeOpacity={0.4}
                  />
                  <motion.circle
                    initial={false}
                    animate={{ cx: x(hovered.date), cy: y(hovered.expected) }}
                    transition={{ type: 'spring', stiffness: 700, damping: 40 }}
                    r={5}
                    fill="var(--cobalt)"
                    stroke="var(--surface)"
                    strokeWidth={2}
                  />
                </motion.g>
              )}
            </AnimatePresence>
          </g>
        </svg>
      )}

      {/* Tooltip */}
      <AnimatePresence>
        {hovered && (
          <motion.div
            className="pointer-events-none absolute top-2 z-10 w-56 rounded-[14px] border border-line bg-surface/95 p-3 text-xs shadow-[var(--float-shadow)] backdrop-blur"
            initial={{ opacity: 0, y: 4 }}
            animate={{
              opacity: 1,
              y: 0,
              left: Math.min(Math.max(0, margin.left + x(hovered.date) + 14), Math.max(0, width - 232)),
            }}
            exit={{ opacity: 0 }}
            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
          >
            <div className="text-muted">
              {formatDayMonth(hovered.date)} · {formatWeekday(hovered.date)}
            </div>
            <div className="display num-wide mt-0.5 text-xl text-ink">{formatMoney(hovered.expected, 'TRY', { decimals: 0 })}</div>
            {showBand && (
              <div className="mt-1 text-2xs text-muted">
                Aralık {formatShort(hovered.pessimistic)} – {formatShort(hovered.optimistic)}
              </div>
            )}
            {(hovered.inflow > 0 || hovered.outflow > 0) && (
              <div className="mt-2 flex gap-3 border-t border-line pt-2">
                {hovered.inflow > 0 && <span className="text-inflow-text">↑ {formatShort(hovered.inflow)}</span>}
                {hovered.outflow > 0 && <span className="text-outflow-text">↓ {formatShort(hovered.outflow)}</span>}
              </div>
            )}
            {overlays.map((o) => {
              const od = o.days[hover!];
              return od ? (
                <div key={o.id} className="mt-1 flex items-center justify-between gap-2 text-2xs">
                  <span className="truncate" style={{ color: o.color }}>
                    {o.label}
                  </span>
                  <span className="num">{formatShort(od.expected)}</span>
                </div>
              ) : null;
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
