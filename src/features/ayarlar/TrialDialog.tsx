import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router';
import { Gift } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { Modal } from '@/ui/Overlay';
import { Button } from '@/ui/Button';
import { startTrial, trialAvailable, useTrial } from '@/ai/trial';

/** Deneme nedir, sınırları neler: onay penceresinde ve Ayarlar'da aynı metin. */
export function TrialFacts({ className }: { className?: string }) {
  return (
    <ul className={className ?? 'space-y-2 text-sm leading-relaxed text-ink-2'}>
      <li>
        • <strong className="text-ink">Anahtar ve hesap gerekmez.</strong> Mizan’ın ortak yapay zekâsıdır; anahtarı sunucuda durur, size hiç gelmez. Demo işletmede
        kendiliğinden açıktır; kendi işletmenizde bir kez “aç” demeniz yeter.
      </li>
      <li>
        • <strong className="text-ink">Süre ve kişi başı sınır yok.</strong> Ancak ücretsiz ortak bir kotadır (günde yaklaşık 1.000 istek, dakikada sınırlı) ve herkesle
        paylaşılır: yoğun anlarda “biraz bekleyin” diyebilir, kota dolarsa o gün durur ve ertesi gün yenilenir. Mizan denemeyi değiştirebilir ya da kaldırabilir.
      </li>
      <li>
        • <strong className="text-ink">Gönderilen:</strong> sorunuz ve yanıt için gereken özet bilgiler, Mizan’ın sunucusu üzerinden Groq’a. Defterinizin tamamı,
        IBAN’larınız ve dosyalarınız gönderilmez. Groq verileri model eğitiminde kullanmadığını belirtir.
      </li>
      <li>
        • <strong className="text-ink">Denemede olmayan:</strong> fiş ve fatura fotoğrafı okuma (Gemini anahtarı gerekir).
      </li>
      <li>
        • <strong className="text-ink">Kesintisiz kullanım için:</strong> Ayarlar › Yapay zekâ’dan kendi ücretsiz anahtarınızı bağlayın (3 dakika). Bağladığınız anda o
        kullanılır ve ortak kotadan etkilenmezsiniz.
      </li>
    </ul>
  );
}

/** Uygulamanın her yerinden açılan deneme onayı (AppShell'de bir kez). */
export function TrialDialog() {
  const f = useFinance();
  const open = useTrial((s) => s.dialogOpen);
  const setOpen = useTrial((s) => s.setDialogOpen);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      title="Yapay zekâyı ücretsiz deneyin"
      footer={
        <>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Vazgeç
          </Button>
          <Button
            variant="primary"
            loading={busy}
            icon={<Gift size={16} />}
            onClick={async () => {
              setBusy(true);
              try {
                await startTrial(f.settings.ai);
                setOpen(false);
                toast.success('Ücretsiz deneme açıldı', { description: 'Yapay zekâ özelliklerini şimdi kullanabilirsiniz.' });
              } catch (e) {
                toast.error('Deneme açılamadı', { description: e instanceof Error ? e.message : String(e) });
              } finally {
                setBusy(false);
              }
            }}
          >
            Denemeyi aç
          </Button>
        </>
      }
    >
      <TrialFacts />
    </Modal>
  );
}

/**
 * Yapay zekâ kapalıyken kısayol: deneme sunucusu kuruluysa onay penceresi ("Ücretsiz dene"),
 * değilse Ayarlar › Yapay zekâ ("Ayarlar").
 */
export function useAiGate() {
  const available = useTrial((s) => s.available);
  const navigate = useNavigate();
  useEffect(() => useTrial.getState().check(), []);
  // Sayfa yeni açılmışken hızlı tıklamada yoklama henüz dönmemiş olabilir: cevabı bekle
  const resolve = async (): Promise<boolean> => {
    const known = useTrial.getState().available;
    if (known !== null) return known;
    const a = await trialAvailable();
    useTrial.setState({ available: a });
    return a;
  };
  const open = async () => ((await resolve()) ? useTrial.getState().setDialogOpen(true) : navigate('/ayarlar#yapay-zeka'));
  /** Yapay zekâ kapalıyken bilgi notu; düğmesi deneme varsa "Ücretsiz dene", yoksa "Ayarlar". */
  const notify = async (title: string, beforeOpen?: () => void) => {
    const trial = await resolve();
    toast(title, {
      description: trial ? 'Anahtar almadan ücretsiz deneyebilirsiniz.' : 'Ayarlar › Yapay zekâ’dan ücretsiz bir anahtar bağlayın.',
      action: {
        label: trial ? 'Ücretsiz dene' : 'Ayarlar',
        onClick: () => {
          beforeOpen?.();
          void open();
        },
      },
    });
  };
  return { trial: available === true, open, notify };
}
