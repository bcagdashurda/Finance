import type { ReactNode } from 'react';

/** Veri yokken boş eksen yerine: ne olacağını anlatan sakin bir alan (+ isteğe bağlı eylem). */
export function ChartEmpty({ height, title, body, action }: { height: number; title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div
      className="relative flex flex-col items-center justify-center gap-2 overflow-hidden rounded-[16px] border border-dashed border-line-strong px-6 text-center"
      style={{ minHeight: Math.min(height, 220) }}
    >
      <svg aria-hidden viewBox="0 0 200 60" className="absolute inset-x-0 bottom-0 h-16 w-full opacity-[0.35]" preserveAspectRatio="none">
        <path d="M0 44 C30 40 45 30 70 34 S115 18 140 24 175 12 200 16" fill="none" stroke="var(--line-strong)" strokeWidth="1.5" strokeDasharray="4 5" />
      </svg>
      <div className="relative text-sm font-semibold text-ink">{title}</div>
      {body && <p className="relative max-w-sm text-xs leading-relaxed text-muted">{body}</p>}
      {action && <div className="relative mt-1">{action}</div>}
    </div>
  );
}
