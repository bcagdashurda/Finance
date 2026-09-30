import { useId } from 'react';
import { cn } from './cn';

interface StampProps {
  label: string;
  date: string;
  tone: 'in' | 'out' | 'cobalt';
  size?: number;
  className?: string;
}

/** Resmî kaşe estetiğinde onay mührü; basılırken ölçek + dönüş + mürekkep yayılması. */
export function Stamp({ label, date, tone, size = 168, className }: StampProps) {
  const id = useId().replace(/:/g, '');
  const color = tone === 'in' ? 'var(--inflow-text)' : tone === 'out' ? 'var(--outflow-text)' : 'var(--cobalt)';
  const ring = `${label} · ${date} · MİZAN · `;
  return (
    <div className={cn('stamp pointer-events-none', className)} style={{ width: size, height: size, color }} role="img" aria-label={`${label}, ${date}`}>
      <svg viewBox="0 0 200 200" width={size} height={size} aria-hidden>
        <defs>
          <path id={`${id}-circle`} d="M100,100 m-72,0 a72,72 0 1,1 144,0 a72,72 0 1,1 -144,0" />
          <filter id={`${id}-ink`}>
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
            <feDisplacementMap in="SourceGraphic" scale="2.2" />
          </filter>
        </defs>
        <g filter={`url(#${id}-ink)`} opacity={0.92}>
          <circle cx="100" cy="100" r="94" fill="none" stroke="currentColor" strokeWidth="4" />
          <circle cx="100" cy="100" r="86" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <circle cx="100" cy="100" r="56" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <text fontSize="13.5" fontWeight="700" letterSpacing="2.6" fill="currentColor" style={{ fontFamily: 'var(--font-sans)' }}>
            <textPath href={`#${id}-circle`} startOffset="0">
              {ring.repeat(2)}
            </textPath>
          </text>
          <path d="M76 101 l16 16 l33 -35" fill="none" stroke="currentColor" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  );
}
