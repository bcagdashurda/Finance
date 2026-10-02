import { CaretDown, ShieldCheck } from '@phosphor-icons/react';
import { cn } from '@/ui/cn';

const SERVICE = { groq: { name: 'Groq', to: 'Groq’a', console: 'console.groq.com' }, gemini: { name: 'Google', to: 'Google’a', console: 'aistudio.google.com' } } as const;

/**
 * "Anahtarım güvende mi?" — anahtarın nerede durduğu, nereye gittiği ve en kötü durumda ne yapılacağı.
 * Yalnızca doğru olanı söyler: hesap eşitlemesi kurulu değilse hesap satırı gösterilmez.
 */
export function KeySafety({ provider, accountSync, className }: { provider: 'groq' | 'gemini'; accountSync: boolean; className?: string }) {
  const s = SERVICE[provider];
  return (
    <details className={cn('group rounded-[14px] border border-line px-4 py-3 text-sm', className)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-ink [&::-webkit-details-marker]:hidden">
        <ShieldCheck size={16} weight="duotone" className="shrink-0 text-cobalt" />
        Anahtarım güvende mi?
        <CaretDown size={14} className="ml-auto shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="mt-3 space-y-2 text-xs leading-relaxed text-ink-2">
        <li>
          <strong className="text-ink">Bir kez girersiniz.</strong> Anahtar bu tarayıcının kendi deposunda saklanır; uygulamayı her açtığınızda yeniden sorulmaz.
        </li>
        <li>
          <strong className="text-ink">Yalnızca {s.to} gider.</strong> Bir yapay zekâ özelliğini kullandığınızda, tarayıcınızdan doğrudan {s.name} servisine gönderilir.
          Arada Mizan’a ait bir sunucu yoktur; anahtar başka hiçbir adrese gönderilmez.
        </li>
        <li>
          <strong className="text-ink">Yedeklere girmez.</strong> Yedek dosyanızı biriyle paylaşsanız bile anahtarınız paylaşılmaz.
        </li>
        {accountSync && (
          <li>
            <strong className="text-ink">Başka cihazda tekrar girmezsiniz.</strong> Hesabınızla giriş yaptığınızda anahtar hesabınıza da kaydedilir. Veritabanı kuralı gereği bu kaydı
            yalnızca siz, kendi oturumunuzla okuyabilirsiniz; diğer kullanıcılar göremez. Kaldırdığınızda hesaptaki kopya da silinir.
          </li>
        )}
        <li>
          <strong className="text-ink">Sayfaya dışarıdan kod giremez.</strong> Uygulamanın güvenlik politikası başka sitelerden kod yüklenmesini engeller. Yine de tarayıcınıza
          kurduğunuz eklentiler ve bilgisayarı sizin oturumunuzla kullanan biri tarayıcı verilerine erişebilir: ortak bir bilgisayardaysanız işiniz bitince “Kaldır”a basın.
        </li>
        <li>
          <strong className="text-ink">En kötü durumda bile zarar küçüktür.</strong> Ücretsiz anahtar bir ödeme yöntemine bağlı değilse kötüye kullanılması size ücret çıkaramaz.
          Şüphelenirseniz burada “Kaldır”a basın, ardından {s.console} sayfasında anahtarı silip yenisini oluşturun; eski anahtar anında geçersiz olur.
        </li>
      </ul>
    </details>
  );
}
