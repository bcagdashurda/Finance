/**
 * Service worker kaydı. Yeni sürüm hazır olduğunda kullanıcıyı bölmeden bir bildirim gösterir;
 * "Yenile" ile güncellenir. Geliştirme ortamında devre dışıdır.
 */
import { toast } from 'sonner';

export async function registerPwa(): Promise<void> {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const { registerSW } = await import('virtual:pwa-register');
  const update = registerSW({
    onNeedRefresh() {
      toast('Mizan’ın yeni sürümü hazır', {
        description: 'Verileriniz cihazınızda kalır; yenilemek birkaç saniye sürer.',
        duration: Infinity,
        action: { label: 'Yenile', onClick: () => void update(true) },
      });
    },
    onOfflineReady() {
      toast.success('Mizan artık çevrimdışı da açılır', { description: 'İnternet olmadan da kayıt girebilirsiniz.' });
    },
    onRegisteredSW(_url, registration) {
      // Uzun açık kalan sekmelerde saatte bir güncelleme kontrolü
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });
}
