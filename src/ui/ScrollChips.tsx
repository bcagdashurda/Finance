import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { cn } from './cn';

/**
 * Yana kayan kapsayıcının kenar durumunu data-more-start / data-more-end olarak işaretler
 * (CSS bununla soluk kenar ya da sabit sütun gölgesi çizer).
 */
export function useScrollEdges(ref: RefObject<HTMLElement | null>, deps: unknown[] = []) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const mark = () => {
      el.toggleAttribute('data-more-start', el.scrollLeft > 2);
      el.toggleAttribute('data-more-end', el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
    };
    mark();
    el.addEventListener('scroll', mark, { passive: true });
    const ro = new ResizeObserver(mark);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', mark);
      ro.disconnect();
    };
    // deps: kapsayıcı sonradan beliriyorsa (ör. boş durumdan veriye geçiş) yeniden bağlan
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps]);
}

/**
 * Dar ekranda yana kayan seçenek şeridi (ör. kayıt türleri, rapor sekmeleri). Kaydırma çubuğu gizlidir;
 * taşan kenar solar, seçili öğe her değişimde görünür alana kaydırılır.
 */
export function ScrollChips({ children, activeKey, className }: { children: ReactNode; activeKey: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollEdges(ref);

  useEffect(() => {
    const el = ref.current;
    const active = el?.querySelector<HTMLElement>('[aria-checked="true"], [aria-current="true"]');
    if (!el || !active) return;
    // scrollIntoView sayfayı dikeyde de kaydırabileceği için yalnızca yatay konum hesaplanır
    const left = active.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
    if (left < el.scrollLeft + 24 || left + active.offsetWidth > el.scrollLeft + el.clientWidth - 24) {
      el.scrollTo({ left: Math.max(0, left - (el.clientWidth - active.offsetWidth) / 2), behavior: 'smooth' });
    }
  }, [activeKey]);

  return (
    <div ref={ref} className={cn('scroll-chips overflow-x-auto', className)}>
      {children}
    </div>
  );
}
