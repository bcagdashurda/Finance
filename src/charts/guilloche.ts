/**
 * Guilloché (banknot gravürü) eğri üreticileri. Saf fonksiyonlar; SVG path döndürür.
 */

export interface RingSpec {
  radius: number;
  amplitude: number;
  lobes: number;
  phase: number;
  /** İkincil dalga (örgü dokusu) */
  ripple?: number;
  rippleLobes?: number;
  samples?: number;
}

export function ringPath(cx: number, cy: number, spec: RingSpec): string {
  const n = spec.samples ?? 360;
  const ripple = spec.ripple ?? 0;
  const rippleLobes = spec.rippleLobes ?? spec.lobes * 3;
  let d = '';
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const r =
      spec.radius +
      spec.amplitude * Math.sin(spec.lobes * t + spec.phase) +
      ripple * Math.sin(rippleLobes * t - spec.phase * 1.7);
    const x = cx + r * Math.cos(t);
    const y = cy + r * Math.sin(t);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

/** Hipotrokoid rozet (banknot köşe süsleri gibi). */
export function hypotrochoidPath(cx: number, cy: number, R: number, r: number, d: number, turns: number, samples = 1400): string {
  let path = '';
  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * Math.PI * 2 * turns;
    const x = cx + (R - r) * Math.cos(t) + d * Math.cos(((R - r) / r) * t);
    const y = cy + (R - r) * Math.sin(t) - d * Math.sin(((R - r) / r) * t);
    path += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }
  return path;
}

/** Yay (açık halka parçası) — hover isabet alanı için. */
export function arcBand(cx: number, cy: number, radius: number): string {
  return `M ${cx - radius} ${cy} a ${radius} ${radius} 0 1 0 ${radius * 2} 0 a ${radius} ${radius} 0 1 0 ${-radius * 2} 0`;
}
