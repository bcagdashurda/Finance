import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Kategori/hesap renk slotunu CSS değişkenine çevirir ("c3" → var(--cat-3)). */
export function slotColor(slot: string | undefined): string {
  if (!slot || slot === 'other') return 'var(--cat-other)';
  const n = slot.replace(/^c/, '');
  return `var(--cat-${n})`;
}

export const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const isCoarsePointer = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
