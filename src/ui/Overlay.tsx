import type { ReactNode } from 'react';
import { Dialog as RDialog } from 'radix-ui';
import { AnimatePresence, motion } from 'motion/react';
import { X } from '@phosphor-icons/react';
import { cn } from './cn';
import { IconButton } from './Button';

const spring = { type: 'spring', stiffness: 380, damping: 34, mass: 0.9 } as const;

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}

function Overlay() {
  return (
    <RDialog.Overlay asChild forceMount>
      <motion.div
        className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-[3px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
      />
    </RDialog.Overlay>
  );
}

/** Sağdan kayan çekmece; mobilde alttan tam genişlik. */
export function Sheet({ open, onOpenChange, title, description, children, footer, className, width = 520 }: BaseProps & { width?: number }) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <Overlay />
            <RDialog.Content asChild forceMount aria-describedby={description ? undefined : undefined}>
              <motion.div
                className={cn(
                  'fixed z-50 flex flex-col bg-surface text-ink shadow-[var(--float-shadow)] outline-none',
                  'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-[26px] border-t border-line',
                  'sm:inset-y-3 sm:right-3 sm:left-auto sm:bottom-3 sm:max-h-none sm:rounded-[26px] sm:border',
                  className,
                )}
                style={{ width: typeof window !== 'undefined' && window.innerWidth >= 640 ? width : undefined }}
                initial={{ x: '104%', opacity: 0.6 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: '104%', opacity: 0.6 }}
                transition={spring}
              >
                <header className="flex items-start justify-between gap-4 border-b border-line px-6 pb-4 pt-5">
                  <div className="min-w-0">
                    <RDialog.Title className="display text-2xl leading-tight text-ink">{title}</RDialog.Title>
                    {description ? (
                      <RDialog.Description className="mt-1 text-xs text-muted">{description}</RDialog.Description>
                    ) : (
                      <RDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Panel'}</RDialog.Description>
                    )}
                  </div>
                  <RDialog.Close asChild>
                    <IconButton label="Kapat" size="sm">
                      <X size={16} />
                    </IconButton>
                  </RDialog.Close>
                </header>
                <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>
                {footer && <footer className="border-t border-line px-6 py-4">{footer}</footer>}
              </motion.div>
            </RDialog.Content>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  );
}

/** Ortada açılan diyalog. */
export function Modal({ open, onOpenChange, title, description, children, footer, className }: BaseProps) {
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <Overlay />
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
              <RDialog.Content asChild forceMount>
                <motion.div
                  className={cn(
                    'pointer-events-auto w-full max-w-md rounded-[24px] border border-line bg-surface p-6 text-ink shadow-[var(--float-shadow)] outline-none',
                    className,
                  )}
                  initial={{ opacity: 0, scale: 0.94, y: 12, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.97, y: 6, filter: 'blur(2px)' }}
                  transition={spring}
                >
                  <RDialog.Title className="display text-2xl leading-tight">{title}</RDialog.Title>
                  {description ? (
                    <RDialog.Description className="mt-1.5 text-sm text-muted">{description}</RDialog.Description>
                  ) : (
                    <RDialog.Description className="sr-only">{typeof title === 'string' ? title : 'Diyalog'}</RDialog.Description>
                  )}
                  <div className="mt-5">{children}</div>
                  {footer && <div className="mt-6 flex justify-end gap-2">{footer}</div>}
                </motion.div>
              </RDialog.Content>
            </div>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  );
}
