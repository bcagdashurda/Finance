import { forwardRef, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';
import { cn, isCoarsePointer } from './cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'quiet';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-cobalt text-inverse hover:bg-cobalt-hover shadow-[inset_0_1px_0_rgb(255_255_255/0.18),0_6px_16px_-8px_var(--cobalt)]',
  secondary: 'bg-surface text-ink border border-line-strong hover:border-cobalt/50 hover:bg-surface-2',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
  quiet: 'text-muted hover:text-ink',
  danger: 'bg-outflow text-white hover:brightness-110',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-[10px]',
  md: 'h-10 px-4 text-sm gap-2 rounded-[var(--radius-control)]',
  lg: 'h-12 px-5 text-[0.95rem] gap-2.5 rounded-[14px]',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: ReactNode;
  trailing?: ReactNode;
  /** İmlece doğru hafifçe çekilir */
  magnetic?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', icon, trailing, magnetic, loading, className, children, disabled, ...rest },
  ref,
) {
  const classes = cn(
    'relative inline-flex select-none items-center justify-center whitespace-nowrap font-medium',
    'transition-[background-color,border-color,color,box-shadow,filter] duration-200',
    'disabled:opacity-50 active:translate-y-px',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
  const content = (
    <>
      {loading ? <Spinner /> : icon && <span className="-ml-0.5 inline-flex shrink-0">{icon}</span>}
      {children}
      {trailing && <span className="-mr-0.5 inline-flex shrink-0 opacity-70">{trailing}</span>}
    </>
  );
  if (magnetic) {
    return (
      <Magnetic>
        <button ref={ref} className={classes} disabled={disabled || loading} {...rest}>
          {content}
        </button>
      </Magnetic>
    );
  }
  return (
    <button ref={ref} className={classes} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  );
});

export const IconButton = forwardRef<HTMLButtonElement, ButtonProps & { label: string }>(function IconButton(
  { label, size = 'md', variant = 'ghost', className, children, ...rest },
  ref,
) {
  const dims = size === 'sm' ? 'h-8 w-8 rounded-[10px]' : size === 'lg' ? 'h-12 w-12 rounded-[14px]' : 'h-10 w-10 rounded-[var(--radius-control)]';
  return (
    <Button ref={ref} aria-label={label} title={label} variant={variant} size={size} className={cn('px-0', dims, className)} {...rest}>
      {children}
    </Button>
  );
});

/** Çocuğunu imlece doğru yaylı şekilde çeker (yalnızca ince imleçlerde). */
export function Magnetic({ children, strength = 0.28 }: { children: ReactNode; strength?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 260, damping: 18, mass: 0.4 });
  const sy = useSpring(y, { stiffness: 260, damping: 18, mass: 0.4 });
  const coarse = isCoarsePointer();
  return (
    <motion.span
      ref={ref}
      className="inline-flex"
      style={{ x: sx, y: sy }}
      onPointerMove={(e) => {
        if (coarse || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        x.set((e.clientX - (r.left + r.width / 2)) * strength);
        y.set((e.clientY - (r.top + r.height / 2)) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('h-4 w-4 animate-spin', className)} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
