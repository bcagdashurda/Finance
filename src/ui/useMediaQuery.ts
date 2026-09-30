import { useSyncExternalStore } from 'react';

/** CSS medya sorgusunu canlı izler (pencere boyutu değişince yeniden çizer). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
