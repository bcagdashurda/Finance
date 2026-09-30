import { useMemo, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { formatShort, formatMoney, type Money } from '@/domain/money';
import { isCoarsePointer } from '@/ui/cn';
import { arcBand, hypotrochoidPath, ringPath } from './guilloche';

export interface RosetteMonth {
  key: string;
  label: string;
  inflow: Money;
  outflow: Money;
  net: Money;
}

interface RosetteProps {
  months: RosetteMonth[];
  size?: number;
  /** Merkezdeki özet */
  centerLabel?: string;
  centerValue?: Money;
  /** Açılışta çizim gecikmesi (s) */
  delay?: number;
}

/**
 * Gravür Rozeti — son 12 ayın nakit ritmi. Her halka bir ay (içten dışa: eskiden yeniye).
 * Dalga genliği |net|, renk yönü (turkuaz giriş, mercan çıkış), lob sayısı gelir/gider oranını kodlar.
 */
export function Rosette({ months, size = 380, centerLabel, centerValue, delay = 0.2 }: RosetteProps) {
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotX = useSpring(useTransform(py, [-1, 1], [7, -7]), { stiffness: 120, damping: 18 });
  const rotY = useSpring(useTransform(px, [-1, 1], [-9, 9]), { stiffness: 120, damping: 18 });

  const c = size / 2;
  const inner = size * 0.2;
  const outer = size * 0.43;
  const gap = months.length > 1 ? (outer - inner) / (months.length - 1) : 0;
  const maxNet = Math.max(1, ...months.map((m) => Math.abs(m.net)));

  const rings = useMemo(
    () =>
      months.map((m, i) => {
        const radius = inner + i * gap;
        const magnitude = Math.abs(m.net) / maxNet;
        const ratio = m.outflow > 0 ? m.inflow / m.outflow : 2;
        const lobes = Math.round(18 + i * 2 + Math.min(10, ratio * 4));
        const amplitude = 1.2 + magnitude * gap * 0.62;
        const strands = [0, 1, 2].map((j) =>
          ringPath(c, c, {
            radius,
            amplitude,
            lobes,
            phase: (j * Math.PI * 2) / (3 * lobes) + i * 0.35,
            ripple: 0.5 + magnitude * 0.9,
            rippleLobes: lobes * 3 + 1,
            samples: 420,
          }),
        );
        return { m, i, radius, strands, positive: m.net >= 0, empty: !m.inflow && !m.outflow };
      }),
    [months, inner, gap, maxNet, c],
  );

  const frame = useMemo(() => ringPath(c, c, { radius: size * 0.475, amplitude: 1.6, lobes: 96, phase: 0, ripple: 0.8, rippleLobes: 193, samples: 900 }), [c, size]);
  const frame2 = useMemo(() => ringPath(c, c, { radius: size * 0.462, amplitude: 1.6, lobes: 96, phase: Math.PI, samples: 900 }), [c, size]);
  const heart = useMemo(() => hypotrochoidPath(c, c, inner * 0.82, inner * 0.82 / 7.3, inner * 0.52, 73 / 10, 1600), [c, inner]);

  const active = hover != null ? rings[hover] : null;

  return (
    <motion.div
      className="relative select-none"
      style={{ width: size, height: size, perspective: 900 }}
      onPointerMove={(e) => {
        if (isCoarsePointer() || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        px.set(((e.clientX - r.left) / r.width) * 2 - 1);
        py.set(((e.clientY - r.top) / r.height) * 2 - 1);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
        setHover(null);
      }}
    >
      <motion.svg
        ref={ref}
        viewBox={`0 0 ${size} ${size}`}
        width={size}
        height={size}
        role="img"
        aria-label="Son 12 ayın net nakit akışı rozeti"
        style={{ rotateX: rotX, rotateY: rotY, transformStyle: 'preserve-3d' }}
      >
        <g className="slow-spin-reverse" opacity={0.55}>
          <path d={frame} fill="none" stroke="var(--cobalt)" strokeWidth={0.6} className="draw-path" pathLength={1} style={{ '--len': 1, '--draw-delay': `${delay}s`, '--draw-duration': '2.4s' } as React.CSSProperties} />
          <path d={frame2} fill="none" stroke="var(--cobalt)" strokeWidth={0.45} className="draw-path" pathLength={1} style={{ '--len': 1, '--draw-delay': `${delay + 0.2}s`, '--draw-duration': '2.4s' } as React.CSSProperties} />
        </g>

        <g className="slow-spin">
          {rings.map(({ i, strands, positive, empty }) => {
            const dim = hover != null && hover !== i;
            return (
              <g key={i} style={{ transition: 'opacity .35s ease' }} opacity={dim ? 0.18 : 1}>
                {strands.map((d, j) => (
                  <path
                    key={j}
                    d={d}
                    fill="none"
                    pathLength={1}
                    stroke={j === 0 ? (empty ? 'var(--line-strong)' : positive ? 'var(--inflow)' : 'var(--outflow)') : 'var(--cobalt)'}
                    strokeOpacity={empty ? (j === 0 ? 0.6 : 0.16) : j === 0 ? 0.85 : 0.38}
                    strokeWidth={j === 0 ? 0.9 : 0.55}
                    className="draw-path"
                    style={{ '--len': 1, '--draw-delay': `${delay + 0.15 + i * 0.07 + j * 0.05}s`, '--draw-duration': '1.9s' } as React.CSSProperties}
                  />
                ))}
              </g>
            );
          })}
        </g>

        <path d={heart} fill="none" stroke="var(--cobalt)" strokeOpacity={0.3} strokeWidth={0.4} pathLength={1} className="draw-path" style={{ '--len': 1, '--draw-delay': `${delay + 0.9}s`, '--draw-duration': '2.6s' } as React.CSSProperties} />

        {/* İsabet alanları */}
        {rings.map(({ i, radius }) => (
          <path
            key={`hit-${i}`}
            d={arcBand(c, c, radius)}
            fill="none"
            stroke="transparent"
            strokeWidth={Math.max(8, gap)}
            onPointerEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            aria-label={`${rings[i]!.m.label}: net ${formatMoney(rings[i]!.m.net, 'TRY', { sign: 'always', decimals: 0 })}`}
            style={{ outline: 'none', cursor: 'crosshair' }}
          />
        ))}
      </motion.svg>

      {/* Merkez */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
        <div
          className="flex flex-col items-center rounded-full bg-[color-mix(in_oklab,var(--surface)_82%,transparent)] px-3 py-2 backdrop-blur-[2px]"
          style={{ minWidth: inner * 1.1 }}
        >
          <span className="text-2xs text-muted">{active ? active.m.label : centerLabel}</span>
          <span className={`display num-wide text-lg leading-tight ${active ? (active.positive ? 'text-inflow-text' : 'text-outflow-text') : 'text-ink'}`}>
            {active
              ? formatShort(active.m.net, 'TRY').replace(/^(?!−)/, '+')
              : centerValue != null
                ? formatShort(centerValue, 'TRY')
                : ''}
          </span>
          {active && (
            <span className="mt-0.5 text-[0.6875rem] leading-tight text-muted">
              <span className="text-inflow-text">↑ {formatShort(active.m.inflow)}</span>
              {'  '}
              <span className="text-outflow-text">↓ {formatShort(active.m.outflow)}</span>
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
