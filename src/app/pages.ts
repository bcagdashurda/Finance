/** Sayfa kodları (rota başına ayrı parça). Rotalar ve arka planda ön yükleme aynı listeyi kullanır. */
export type PageModule = () => Promise<{ default: React.ComponentType }>;

export const PAGES = {
  kokpit: () => import('@/features/kokpit/KokpitPage'),
  akis: () => import('@/features/akis/AkisPage'),
  takvim: () => import('@/features/takvim/TakvimPage'),
  islemler: () => import('@/features/islemler/IslemlerPage'),
  hesaplar: () => import('@/features/hesaplar/HesaplarPage'),
  hesapDetay: () => import('@/features/hesaplar/HesapDetayPage'),
  cariler: () => import('@/features/cariler/CarilerPage'),
  cariDetay: () => import('@/features/cariler/CariDetayPage'),
  cekler: () => import('@/features/cekler/CeklerPage'),
  raporlar: () => import('@/features/raporlar/RaporlarPage'),
  hikaye: () => import('@/features/hikaye/HikayePage'),
  ayarlar: () => import('@/features/ayarlar/AyarlarPage'),
} satisfies Record<string, PageModule>;

let prefetched = false;
/**
 * Boşta, sayfa kodlarını sırayla arka planda indirir: ilk ziyarette ağ beklenmez (yavaş telefonda 4G ile
 * ilk geçiş ~1,2 sn → ikinci ~0,8 sn ölçüldü). Veri tasarrufu açıksa yapılmaz.
 */
export function prefetchPages(): void {
  if (prefetched) return;
  prefetched = true;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  if (saveData) return;
  // requestIdleCallback eski Safari'de yok: yedeği zamanlayıcı
  // (bağlanmadan çağrılırsa tarayıcı "Illegal invocation" verir)
  const ric = (window as Partial<Pick<Window, 'requestIdleCallback'>>).requestIdleCallback?.bind(window);
  const idle = (cb: () => void) => (ric ? ric(cb, { timeout: 4000 }) : globalThis.setTimeout(cb, 1500));
  const queue: PageModule[] = Object.values(PAGES);
  const next = () => {
    const load = queue.shift();
    if (load) idle(() => void load().catch(() => undefined).finally(next));
  };
  idle(next);
}
