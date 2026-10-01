import type { ReactNode } from 'react';
import { Tooltip as RTooltip, Switch as RSwitch } from 'radix-ui';
import { cn } from './cn';

/** Kısayol değiştirici tuşu: Mac'te ⌘, diğerlerinde Ctrl */
export const MOD_KEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent) ? '⌘' : 'Ctrl';

type Tone = 'neutral' | 'in' | 'out' | 'warn' | 'cobalt' | 'muted';

const TONES: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-2',
  in: 'bg-inflow-soft text-inflow-text',
  out: 'bg-outflow-soft text-outflow-text',
  warn: 'bg-saffron-soft text-saffron-text',
  cobalt: 'bg-cobalt-soft text-cobalt-ink',
  muted: 'bg-transparent text-muted border border-line',
};

export function Badge({ tone = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 whitespace-nowrap rounded-full px-2 text-2xs font-medium', TONES[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center whitespace-nowrap rounded-[6px] border border-line-strong bg-surface px-1.5 align-middle font-sans text-[0.6875rem] font-medium text-muted',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

export function Tip({ content, children, side = 'top' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RTooltip.Root delayDuration={250}>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content
          side={side}
          sideOffset={8}
          className="z-[60] max-w-64 rounded-[10px] bg-ink px-2.5 py-1.5 text-2xs leading-snug text-inverse shadow-[var(--float-shadow)] data-[state=delayed-open]:animate-[tip-in_.18s_ease-out]"
        >
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  );
}

export function Toggle({ checked, onCheckedChange, label, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; label: string; id?: string }) {
  return (
    <RSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      aria-label={label}
      className="relative h-6 w-10 shrink-0 rounded-full bg-line-strong transition-colors data-[state=checked]:bg-cobalt"
    >
      <RSwitch.Thumb className="block h-5 w-5 translate-x-0.5 rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.25)] transition-transform duration-200 will-change-transform data-[state=checked]:translate-x-[18px]" />
    </RSwitch.Root>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('engrave-skeleton', className)} aria-hidden />;
}

/** Cari monogramı: baş harfler, isimden türetilen kararlı renk slotu. */
export function Monogram({ name, size = 36, className }: { name: string; size?: number; className?: string }) {
  const words = name.replace(/[^\p{L}\s]/gu, '').split(/\s+/).filter(Boolean);
  const initials = ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toLocaleUpperCase('tr-TR');
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const slot = (hash % 8) + 1;
  return (
    <span
      aria-hidden
      className={cn('display inline-flex shrink-0 items-center justify-center rounded-full font-semibold', className)}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        // Kategori rengi mürekkeple karıştırılır: hardal gibi açık tonlar zeminde 2,9:1 kalıyordu (AA için ≥4,5)
        color: `color-mix(in oklab, var(--cat-${slot}) 65%, var(--ink))`,
        background: `color-mix(in oklab, var(--cat-${slot}) 12%, var(--surface))`,
        boxShadow: `inset 0 0 0 1px color-mix(in oklab, var(--cat-${slot}) 28%, transparent)`,
      }}
    >
      {initials}
    </span>
  );
}

export function Dot({ color, className }: { color: string; className?: string }) {
  return <span aria-hidden className={cn('inline-block h-2 w-2 shrink-0 rounded-full', className)} style={{ background: color }} />;
}
