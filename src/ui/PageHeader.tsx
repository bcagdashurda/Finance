import type { CSSProperties, ReactNode } from 'react';
import { cn } from './cn';

interface PageHeaderProps {
  title: string;
  kicker?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/** Büyük başlık, maskeli satır açılışıyla (metin alttan kayarak gelir). */
export function PageHeader({ title, kicker, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pb-7 pt-3', className)}>
      <div className="min-w-0">
        {kicker && <div className="reveal-fade mb-2 text-xs text-muted">{kicker}</div>}
        <h1 className="display overflow-hidden pb-1 text-[2.6rem] font-semibold leading-[1.02] tracking-[-0.025em] text-ink sm:text-5xl">
          <span className="reveal-rise">{title}</span>
        </h1>
        {description && (
          <p className="reveal-fade mt-2 max-w-2xl text-sm text-muted" style={{ '--reveal-delay': '0.25s' } as CSSProperties}>
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="reveal-fade flex flex-wrap items-center gap-2" style={{ '--reveal-delay': '0.2s' } as CSSProperties}>
          {actions}
        </div>
      )}
    </header>
  );
}
