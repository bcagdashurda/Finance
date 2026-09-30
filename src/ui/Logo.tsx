import { useMemo } from 'react';
import { hypotrochoidPath, ringPath } from '@/charts/guilloche';
import { cn } from './cn';

/** Gravür mühür: hipotrokoid rozet + çift halka. */
export function LogoMark({ size = 32, className, animate = false }: { size?: number; className?: string; animate?: boolean }) {
  const s = 64;
  const c = s / 2;
  const paths = useMemo(
    () => ({
      rose: hypotrochoidPath(c, c, 20, 20 / 3.5, 11, 7 / 2, 700),
      ring: ringPath(c, c, { radius: 28.5, amplitude: 0.9, lobes: 36, phase: 0, samples: 360 }),
      ring2: ringPath(c, c, { radius: 26, amplitude: 0.9, lobes: 36, phase: Math.PI, samples: 360 }),
    }),
    [c],
  );
  const draw = (delay: number) =>
    animate ? ({ className: 'draw-path', pathLength: 1, style: { '--len': 1, '--draw-delay': `${delay}s`, '--draw-duration': '1.6s' } as React.CSSProperties }) : {};
  return (
    <svg viewBox={`0 0 ${s} ${s}`} width={size} height={size} className={cn('shrink-0 text-cobalt', className)} aria-hidden>
      <path d={paths.ring} fill="none" stroke="currentColor" strokeWidth={1.1} {...draw(0)} />
      <path d={paths.ring2} fill="none" stroke="currentColor" strokeWidth={0.7} strokeOpacity={0.6} {...draw(0.15)} />
      <path d={paths.rose} fill="none" stroke="currentColor" strokeWidth={0.9} {...draw(0.3)} />
      <circle cx={c} cy={c} r={2.4} fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return <span className={cn('display text-[1.35rem] font-medium leading-none tracking-[-0.02em] text-ink', className)}>Mizan</span>;
}
