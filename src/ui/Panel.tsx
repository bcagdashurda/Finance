import { useRef, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from './cn';

interface PanelProps extends HTMLAttributes<HTMLElement> {
  /** Açılış sırası: clip-path perdesi bu sıraya göre gecikir */
  reveal?: number | false;
  as?: 'section' | 'div' | 'article' | 'aside';
  padded?: boolean;
}

/**
 * Ana yüzey. İmleci izleyen ışıklı kenar CSS değişkenleriyle (yeniden render yok);
 * açılışta üstten aşağı CSS clip-path perdesiyle belirir.
 */
export function Panel({ reveal = false, as: Comp = 'section', padded = true, className, children, style, ...rest }: PanelProps) {
  const ref = useRef<HTMLElement>(null);
  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || e.pointerType !== 'mouse') return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  };
  return (
    <Comp
      ref={ref as never}
      onPointerMove={onPointerMove}
      className={cn('panel', reveal !== false && 'reveal-panel', padded && 'p-5 sm:p-6', className)}
      style={reveal !== false ? ({ '--reveal-delay': `${0.12 + reveal * 0.08}s`, ...style } as CSSProperties) : style}
      {...rest}
    >
      {children}
    </Comp>
  );
}

interface PanelHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  id?: string;
}

export function PanelHeader({ title, description, actions, className, id }: PanelHeaderProps) {
  return (
    <header className={cn('mb-4 flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-base font-semibold tracking-[-0.01em] text-ink">
          {title}
        </h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  );
}
