import { useState } from 'react';
import { ArrowRight, Flask } from '@phosphor-icons/react';
import { exitDemo } from '@/data/load';
import { Button } from '@/ui/Button';
import { Modal } from '@/ui/Overlay';
import { useFinance } from './finance';

/** Demo işletmede olduğunu hatırlatır ve kendi işletmesine geçişi tek adımda sunar. */
export function DemoBanner() {
  const f = useFinance();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!f.settings.isDemo) return null;
  return (
    <>
      {/* Mobilde: üst satırda başlık + düğme, açıklama alt satırda tam genişlik */}
      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-[16px] border border-[color-mix(in_oklab,var(--cobalt)_22%,var(--line))] bg-[color-mix(in_oklab,var(--cobalt)_6%,var(--surface))] px-4 py-2.5 text-sm">
        <span className="inline-flex items-center gap-2 font-medium text-cobalt-ink">
          <Flask size={16} weight="duotone" /> Demo işletme
        </span>
        <span className="order-last w-full text-xs text-muted md:order-none md:w-auto md:min-w-0 md:flex-1">
          Tüm rakamlar örnektir; istediğiniz gibi kurcalayın. Hazır olduğunuzda kendi işletmenizi kurun.
        </span>
        <Button size="sm" variant="primary" className="ml-auto md:ml-0" onClick={() => setOpen(true)} trailing={<ArrowRight size={12} weight="bold" />}>
          Kendi işletmemi kur
        </Button>
      </div>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Kendi işletmenize geçin"
        description="Demo verileri bu cihazdan silinir ve kendi işletmenizi boş bir sayfayla kurarsınız. Yapay zekâ ve bulut ayarlarınız korunur."
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Vazgeç
            </Button>
            <Button
              variant="primary"
              loading={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  sessionStorage.setItem('mizan:kurulum', '1');
                } catch {
                  /* depolama kapalı olabilir */
                }
                await exitDemo();
                window.history.replaceState(null, '', '/');
              }}
            >
              Devam et
            </Button>
          </>
        }
      >
        <span />
      </Modal>
    </>
  );
}
