import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { motion } from 'motion/react';
import { ArrowRight, Bank, Check, FileArrowUp, Receipt, Sparkle, UsersThree, X } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { useUI } from '@/app/ui-store';
import { useAi } from '@/ai/useAi';
import { Panel } from '@/ui/Panel';
import { IconButton } from '@/ui/Button';
import { MOD_KEY, Kbd } from '@/ui/bits';
import { cn } from '@/ui/cn';

interface Step {
  key: string;
  title: string;
  body: string;
  time: string;
  icon: ReactNode;
  done: boolean;
  optional?: boolean;
  run: () => void;
}

const hiddenKey = (ws: string) => `mizan:rehber-gizli:${ws}`;

function readHidden(ws: string): boolean {
  try {
    return localStorage.getItem(hiddenKey(ws)) === '1';
  } catch {
    return false;
  }
}

/** Yeni işletme için ilk adımlar. Her adım gerçek veriden "tamamlandı" sayılır; hepsi bitince kendiliğinden çekilir. */
export function useGettingStarted() {
  const f = useFinance();
  const navigate = useNavigate();
  const openEntry = useUI((s) => s.openEntry);
  const ai = useAi();
  const go = (to: string) => navigate(to, { viewTransition: true });
  const steps: Step[] = [
    {
      key: 'hesap',
      title: 'Banka ve kasa hesaplarınızı ekleyin',
      body: 'Bugünkü bakiyeleriyle. Toplam nakdiniz ve döviz dağılımı buradan hesaplanır.',
      time: '1 dk',
      icon: <Bank size={20} weight="duotone" />,
      done: f.accounts.length > 0,
      run: () => go('/hesaplar?yeni=1'),
    },
    {
      key: 'cari',
      title: 'Müşteri ve tedarikçilerinizi ekleyin',
      body: 'Tek tek ya da muhasebe programınızdan Excel ile toplu. Bakiyeler, gecikme takibi ve ödeme alışkanlıkları için.',
      time: '2 dk',
      icon: <UsersThree size={20} weight="duotone" />,
      done: f.contacts.length > 0,
      run: () => go('/cariler?yeni=1'),
    },
    {
      key: 'acik',
      title: 'Açık fatura ve yaklaşan ödemeleri girin',
      body: 'Kestiğiniz ve aldığınız faturaların vadeleri; 13 haftalık projeksiyonun omurgası.',
      time: '3 dk',
      icon: <Receipt size={20} weight="duotone" />,
      done: f.documents.length > 0 || f.recurring.length > 0 || f.instruments.length > 0,
      run: () => openEntry({ kind: 'receivable' }),
    },
    {
      key: 'ekstre',
      title: 'Banka ekstrenizi içe aktarın',
      body: 'Excel ya da CSV. Kategoriler otomatik önerilir; raporlar ve harcama temposu bununla oluşur.',
      time: '2 dk',
      icon: <FileArrowUp size={20} weight="duotone" />,
      done: f.transactions.length > 0,
      optional: true,
      run: () => go('/islemler?ice-aktar=1'),
    },
    {
      key: 'ai',
      title: 'Yapay zekâyı açın',
      body: 'Ücretsiz Groq anahtarıyla yazarak ya da konuşarak kayıt, fiş okuma ve finans asistanı.',
      time: '2 dk',
      icon: <Sparkle size={20} weight="duotone" />,
      done: ai.enabled,
      optional: true,
      run: () => go('/ayarlar#yapay-zeka'),
    },
  ];
  const required = steps.filter((s) => !s.optional);
  const doneCount = steps.filter((s) => s.done).length;
  const allDone = steps.every((s) => s.done);
  const [hidden, setHidden] = useState(() => readHidden(f.workspace.id));
  const hide = () => {
    try {
      localStorage.setItem(hiddenKey(f.workspace.id), '1');
    } catch {
      /* depolama kapalı olabilir */
    }
    setHidden(true);
  };
  const visible = !f.settings.isDemo && !allDone && !hidden;
  return { steps, doneCount, total: steps.length, requiredDone: required.every((s) => s.done), visible, hide, empty: f.accounts.length === 0 };
}

/** Zorunlu adımlar bitince: yalnızca isteğe bağlı adımlar kaldığında Kokpit'in ilk ekranını kaplamayan tek satır. */
export function GettingStartedStrip({ state, className }: { state: ReturnType<typeof useGettingStarted>; className?: string }) {
  const rest = state.steps.filter((s) => !s.done);
  return (
    <Panel reveal={0} padded={false} className={cn('flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-5', className)} aria-label="Kurulum">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-inflow-soft text-inflow-text">
        <Check size={15} weight="bold" />
      </span>
      <div className="min-w-0 flex-1 text-sm">
        <span className="font-semibold text-ink">Temel kurulum tamam</span>
        <span className="text-muted"> · isteğe bağlı: </span>
        {rest.map((s, i) => (
          <span key={s.key}>
            {i > 0 && <span className="text-muted">, </span>}
            <button type="button" onClick={s.run} className="font-medium text-cobalt-ink underline-offset-2 hover:underline">
              {s.title.replace(/^./, (c) => c.toLocaleLowerCase('tr'))}
            </button>
          </span>
        ))}
      </div>
      <IconButton label="Rehberi gizle" size="sm" onClick={state.hide}>
        <X size={14} />
      </IconButton>
    </Panel>
  );
}

export function GettingStarted({ state, className }: { state: ReturnType<typeof useGettingStarted>; className?: string }) {
  const { steps, doneCount, total, hide, empty } = state;
  const next = steps.find((s) => !s.done);
  return (
    <Panel reveal={0} padded={false} className={cn('relative overflow-hidden', className)} aria-labelledby="rehber-baslik">
      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="relative flex flex-col justify-between gap-8 border-b border-line p-6 sm:p-8 lg:border-b-0 lg:border-r">
          <div
            aria-hidden
            className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full opacity-60 blur-3xl"
            style={{ background: 'radial-gradient(closest-side, color-mix(in oklab, var(--cobalt) 22%, transparent), transparent)' }}
          />
          <div className="relative">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-cobalt-ink">Başlangıç · {doneCount}/{total}</span>
              {!empty && (
                <IconButton label="Rehberi gizle" size="sm" onClick={hide}>
                  <X size={14} />
                </IconButton>
              )}
            </div>
            <h2 id="rehber-baslik" className="display mt-3 text-[2rem] leading-[1.05] tracking-[-0.03em] text-ink sm:text-[2.4rem]">
              {empty ? 'Mizan’ı birkaç dakikada hazırlayın.' : 'Kurulumu tamamlayın.'}
            </h2>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
              Her adım Kokpit’i biraz daha isabetli yapar. Hesaplar bugünkü nakdi, cariler ödeme alışkanlıklarını, açık kalemler önümüzdeki 13 haftayı besler.
            </p>
          </div>
          <div className="relative">
            <div className="flex gap-1.5" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={doneCount} aria-label="Kurulum ilerlemesi">
              {steps.map((s, i) => (
                <span key={s.key} className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken">
                  <motion.span
                    className="block h-full rounded-full bg-cobalt"
                    initial={{ width: 0 }}
                    animate={{ width: s.done ? '100%' : '0%' }}
                    transition={{ delay: 0.3 + i * 0.08, duration: 0.6, ease: [0.25, 1, 0.5, 1] }}
                  />
                </span>
              ))}
            </div>
            <p className="mt-3 text-2xs leading-relaxed text-muted">
              İpucu: her yerden <Kbd>{MOD_KEY} K</Kbd> ile arayın ya da “Yıldız’dan 45 bin tahsilat” gibi yazarak kayıt girin.
            </p>
          </div>
        </div>
        <ol className="divide-y divide-line">
          {steps.map((s, i) => {
            const isNext = s === next;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={s.run}
                  className={cn(
                    'group flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2 sm:px-8',
                    isNext && 'bg-[color-mix(in_oklab,var(--cobalt)_4%,transparent)]',
                  )}
                >
                  <span
                    className={cn(
                      'relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] transition-colors',
                      s.done ? 'bg-inflow-soft text-inflow-text' : isNext ? 'bg-cobalt text-inverse shadow-[0_8px_20px_-10px_var(--cobalt)]' : 'bg-sunken text-muted',
                    )}
                  >
                    {s.done ? <Check size={18} weight="bold" /> : s.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={cn('text-sm font-semibold', s.done ? 'text-muted line-through decoration-line-strong' : 'text-ink')}>
                        <span className="sr-only">Adım {i + 1}: </span>
                        {s.title}
                      </span>
                      {s.optional && !s.done && <span className="rounded-full border border-line px-1.5 text-2xs text-faint">isteğe bağlı</span>}
                      {s.done && <span className="sr-only">(tamamlandı)</span>}
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-muted">{s.body}</span>
                  </span>
                  <span className="hidden shrink-0 text-2xs text-faint sm:block">{s.done ? 'Tamam' : s.time}</span>
                  <ArrowRight size={16} className={cn('shrink-0 text-muted transition-transform group-hover:translate-x-0.5', isNext && 'text-cobalt')} />
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </Panel>
  );
}
