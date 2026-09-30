import { useCallback, useEffect, useReducer, useRef, useState, type ReactNode } from 'react';
import { motion, useAnimationControls } from 'motion/react';
import { Backspace, LockSimple } from '@phosphor-icons/react';
import { useMaybeFinance } from './finance';
import { LogoMark, Wordmark } from '@/ui/Logo';
import { cn } from '@/ui/cn';

const SESSION_KEY = 'mizan:unlocked';
const IDLE_MS = 15 * 60_000;

export async function hashPin(pin: string, salt: string): Promise<string> {
  const data = new TextEncoder().encode(`${salt}:${pin}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newSalt(): string {
  return [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const readSession = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return false;
  }
};
const writeSession = (v: boolean) => {
  try {
    if (v) sessionStorage.setItem(SESSION_KEY, '1');
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* gizli pencere */
  }
};

const LOCK_EVENT = 'mizan:lock';

/** Masadan kalkarken: 15 dakikayı beklemeden hemen kilitle. */
export function lockNow(): void {
  writeSession(false);
  window.dispatchEvent(new Event(LOCK_EVENT));
}

/**
 * Uygulama kilidi: PIN tanımlıysa açılışta ve 15 dk hareketsizlikten sonra kilit ekranı.
 * Not: gizlilik kilididir; veriler tarayıcıda şifrelenmez.
 */
export function LockGate({ children }: { children: ReactNode }) {
  const f = useMaybeFinance();
  const lock = f?.settings.lock ?? null;
  // Tek doğruluk kaynağı oturum bayrağı; değişince zorla yeniden çiz. (Ayrı bir boolean state,
  // Ayarlar'da PIN kurulunca bayrakla ayrışıyor ve "Şimdi kilitle" hiç kilitlemiyordu.)
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const unlocked = readSession();

  const relock = useCallback(() => {
    writeSession(false);
    rerender();
  }, []);

  useEffect(() => {
    window.addEventListener(LOCK_EVENT, relock);
    return () => window.removeEventListener(LOCK_EVENT, relock);
  }, [relock]);

  useEffect(() => {
    if (!lock || !unlocked) return;
    let timer = window.setTimeout(relock, IDLE_MS);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(relock, IDLE_MS);
    };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    events.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [lock, unlocked, relock]);

  if (!lock || unlocked) return <>{children}</>;
  return (
    <LockScreen
      length={lock.length}
      verify={async (pin) => (await hashPin(pin, lock.salt)) === lock.pinHash}
      onUnlock={() => {
        writeSession(true);
        rerender();
      }}
    />
  );
}

/**
 * length biliniyorsa (yeni kilitler) tam o hanede doğrulanır ve yanlışsa hemen uyarılır.
 * Bilinmiyorsa (eski kilit) 4–6 hanede denenir. Girdi ref'te tutulur: hızlı yazımda rakam kaybolmaz.
 */
function LockScreen({ verify, onUnlock, length }: { verify: (pin: string) => Promise<boolean>; onUnlock: () => void; length?: number }) {
  const [pin, setPinState] = useState('');
  const pinRef = useRef('');
  const busy = useRef(false);
  const [error, setError] = useState(false);
  const controls = useAnimationControls();
  const max = length ?? 6;
  const setPin = (v: string) => {
    pinRef.current = v;
    setPinState(v);
  };

  const press = useCallback(
    async (d: string) => {
      if (busy.current || pinRef.current.length >= max) return;
      const next = pinRef.current + d;
      setPin(next);
      setError(false);
      const complete = length ? next.length === length : next.length >= 4;
      if (!complete) return;
      busy.current = true;
      const ok = await verify(next);
      if (ok) {
        busy.current = false;
        onUnlock();
        return;
      }
      if (length || next.length === 6) {
        setError(true);
        await controls.start({ x: [0, -14, 12, -8, 6, 0], transition: { duration: 0.45 } });
        setPin('');
      }
      busy.current = false;
    },
    [max, length, verify, onUnlock, controls],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) void press(e.key);
      else if (e.key === 'Backspace') setPin(pinRef.current.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [press]);

  return (
    <div className="grain flex min-h-dvh flex-col items-center justify-center bg-ground px-6">
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center">
        <LogoMark size={64} animate />
        <Wordmark className="mt-4 text-3xl" />
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted">
          <LockSimple size={14} weight="bold" /> Devam etmek için PIN girin
        </p>
        <motion.div animate={controls} className="mt-8 flex gap-3" aria-live="polite">
          {Array.from({ length: max }, (_, i) => (
            <span key={i} className={cn('h-3.5 w-3.5 rounded-full border-2 transition-colors', i < pin.length ? (error ? 'border-outflow bg-outflow' : 'border-cobalt bg-cobalt') : 'border-line-strong')} />
          ))}
        </motion.div>
        <p className={cn('mt-3 h-5 text-xs', error ? 'text-outflow-text' : 'text-transparent')}>PIN hatalı, tekrar deneyin.</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((k, i) =>
            k === '' ? (
              <span key={i} />
            ) : (
              <motion.button
                key={i}
                type="button"
                whileTap={{ scale: 0.9 }}
                onClick={() => (k === '⌫' ? setPin(pinRef.current.slice(0, -1)) : void press(k))}
                aria-label={k === '⌫' ? 'Sil' : k}
                className="flex h-16 w-16 items-center justify-center rounded-full border border-line bg-surface text-xl font-medium text-ink transition-colors hover:border-cobalt/40"
              >
                {k === '⌫' ? <Backspace size={20} /> : k}
              </motion.button>
            ),
          )}
        </div>
        <details className="mt-8 max-w-xs text-center text-xs text-muted">
          <summary className="cursor-pointer list-none underline-offset-2 hover:text-ink hover:underline">PIN’imi unuttum</summary>
          <p className="mt-2 text-pretty">
            PIN yalnızca bu cihazda saklanır, sıfırlanamaz. Bu sitenin tarayıcı verilerini silmek kilidi kaldırır ama cihazdaki kayıtları da siler; ardından
            yedek dosyanızı ya da bulut hesabınızı kullanarak verilerinizi geri yükleyebilirsiniz.
          </p>
        </details>
      </motion.div>
    </div>
  );
}
