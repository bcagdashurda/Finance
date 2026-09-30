import { useId, useMemo } from 'react';
import { motion } from 'motion/react';
import { scaleLinear } from 'd3-scale';
import { area, curveMonotoneX, line } from 'd3-shape';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  color?: string;
  delay?: number;
  fill?: boolean;
}

export function Sparkline({ values, width = 120, height = 32, color = 'var(--cobalt)', delay = 0, fill = true }: SparklineProps) {
  const uid = useId().replace(/:/g, '');
  const { d, a } = useMemo(() => {
    const x = scaleLinear().domain([0, Math.max(1, values.length - 1)]).range([1, width - 1]);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const y = scaleLinear().domain([lo, hi === lo ? lo + 1 : hi]).range([height - 2, 2]);
    return {
      d: line<number>().x((_, i) => x(i)).y((v) => y(v)).curve(curveMonotoneX)(values) ?? '',
      a: area<number>().x((_, i) => x(i)).y0(height).y1((v) => y(v)).curve(curveMonotoneX)(values) ?? '',
    };
  }, [values, width, height]);
  if (values.length < 2) return <svg width={width} height={height} aria-hidden />;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden className="overflow-visible">
      <defs>
        <linearGradient id={`${uid}-g`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.18} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {fill && <motion.path d={a} fill={`url(#${uid}-g)`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: delay + 0.6, duration: 0.6 }} />}
      <motion.path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ delay, duration: 1.2, ease: [0.65, 0, 0.35, 1] }}
      />
    </svg>
  );
}
