import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Dialog as RDialog } from 'radix-ui';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowUp, Microphone, Sparkle, Stop, X, LockSimple, Wrench, GearSix, Gift } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useUI } from '@/app/ui-store';
import { useFinance } from '@/app/finance';
import { useAi } from '@/ai/useAi';
import { useRecorder } from '@/ai/useRecorder';
import { useAiGate } from '@/features/ayarlar/TrialDialog';
import type { AssistantTurn } from '@/ai/features';
import { IconButton, Button } from '@/ui/Button';
import { LogoMark } from '@/ui/Logo';
import { cn } from '@/ui/cn';
import { SUGGESTIONS } from './offline';

/** Çok küçük Markdown: **kalın**, madde (•, -, 1.), satır sonları. */
function RichText({ text }: { text: string }) {
  const lines = text.split('\n');
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => {
    if (list.length) out.push(<ul key={`l${out.length}`} className="my-1.5 space-y-1 pl-1">{list}</ul>);
    list = [];
  };
  const inline = (s: string) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((part, i) => (part.startsWith('**') ? <strong key={i} className="font-semibold text-ink">{part.slice(2, -2)}</strong> : part));
  lines.forEach((line, i) => {
    const m = line.match(/^\s*(?:[-•*]|\d+\.)\s+(.*)$/);
    if (m) {
      list.push(
        <li key={i} className="flex gap-2">
          <span className="mt-[0.55em] h-1 w-1 shrink-0 rounded-full bg-cobalt" />
          <span>{inline(m[1]!)}</span>
        </li>,
      );
    } else {
      flush();
      if (line.trim()) out.push(<p key={i} className="my-1">{inline(line)}</p>);
    }
  });
  flush();
  return <div className="text-[0.84rem] leading-relaxed text-ink-2">{out}</div>;
}

export function AssistantDrawer() {
  const open = useUI((s) => s.assistantOpen);
  const setOpen = useUI((s) => s.setAssistantOpen);
  return (
    <RDialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <RDialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-[2px] lg:bg-transparent lg:backdrop-blur-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </RDialog.Overlay>
            <RDialog.Content asChild forceMount>
              <motion.aside
                className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-surface shadow-[var(--float-shadow)] outline-none sm:inset-y-3 sm:right-3 sm:w-[440px] sm:rounded-[26px] sm:border"
                initial={{ x: '105%' }}
                animate={{ x: 0 }}
                exit={{ x: '105%' }}
                transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              >
                <RDialog.Title className="sr-only">Finans asistanı</RDialog.Title>
                <RDialog.Description className="sr-only">Verileriniz hakkında soru sorun.</RDialog.Description>
                <AssistantBody onClose={() => setOpen(false)} />
              </motion.aside>
            </RDialog.Content>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  );
}

function AssistantBody({ onClose }: { onClose: () => void }) {
  const f = useFinance();
  const ai = useAi();
  const navigate = useNavigate();
  const [turns, setTurns] = useState<AssistantTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const rec = useRecorder();
  const gate = useAiGate();
  // Deneme penceresi asistanın üstünde değil, asistan kapanınca açılsın
  const openGate = () => {
    onClose();
    gate.open();
  };
  const scroller = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [turns, busy]);
  useEffect(() => () => abort.current?.abort(), []);

  async function send(question: string, offlineAnswer?: string) {
    const q = question.trim();
    if (!q || busy) return;
    setInput('');
    const history = turns;
    setTurns((t) => [...t, { role: 'user', content: q }]);
    if (!ai.enabled) {
      const need = gate.trial
        ? 'Serbest soruları yanıtlayabilmem için yapay zekâ gerekli. “Ücretsiz dene” ile anahtar almadan hemen açabilirsiniz. Hazır sorular cihazınızda yanıtlanır.'
        : 'Serbest soruları yanıtlayabilmem için Ayarlar › Yapay zekâ’dan ücretsiz bir Groq ya da Gemini anahtarı bağlamanız gerekiyor. Hazır sorular cihazınızda yanıtlanır.';
      setTurns((t) => [...t, { role: 'assistant', content: offlineAnswer ?? need, tools: offlineAnswer ? ['Cihazda hesaplandı'] : [] }]);
      if (!offlineAnswer) void gate.notify('Serbest soru yapay zekâyla yanıtlanır', onClose);
      return;
    }
    setBusy(true);
    abort.current = new AbortController();
    try {
      const turn = await ai.ask(history, q, abort.current.signal);
      setTurns((t) => [...t, turn]);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setTurns((t) => [...t, { role: 'assistant', content: `⚠️ ${e instanceof Error ? e.message : 'Bir hata oluştu.'}` }]);
    } finally {
      setBusy(false);
    }
  }

  async function toggleMic() {
    if (!ai.enabled) {
      void gate.notify('Sesle soru yapay zekâyla çalışır', onClose);
      return;
    }
    try {
      if (!rec.recording) await rec.start();
      else {
        const blob = await rec.stop();
        setBusy(true);
        const text = await ai.transcribe(blob);
        setBusy(false);
        if (text) void send(text);
        else toast('Ses anlaşılamadı', { description: 'Mikrofona yakın ve net konuşup tekrar deneyin.' });
      }
    } catch (e) {
      setBusy(false);
      toast.error('Ses kaydı başlatılamadı', { description: e instanceof Error ? e.message : 'Mikrofon izni gerekli' });
    }
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="relative flex h-9 w-9 items-center justify-center rounded-full bg-cobalt-soft">
          <Sparkle size={18} weight="duotone" className="text-cobalt" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="display text-lg leading-tight">Finans asistanı</div>
          <div className="flex items-center gap-1 text-2xs text-muted">
            <LockSimple size={11} weight="bold" className="text-inflow-text" />
            {ai.enabled ? `Rakamlar cihazınızda hesaplanır · ${ai.config.model.replace('openai/', '')}` : 'Çevrimdışı mod · hazır sorular'}
          </div>
        </div>
        <IconButton label="Kapat" size="sm" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </header>

      <div ref={scroller} className="scrollbar-thin flex-1 space-y-4 overflow-y-auto px-5 py-5">
        {turns.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="pt-2">
            <div className="flex justify-center">
              <LogoMark size={54} animate />
            </div>
            <p className="mx-auto mt-4 max-w-xs text-center text-sm text-muted">
              Nakdiniz, carileriniz ve giderleriniz hakkında Türkçe sorun. {ai.enabled ? 'Sesle de sorabilirsiniz.' : ''}
            </p>
            <div className="mt-6 space-y-2">
              {SUGGESTIONS.map((s, i) => (
                <motion.button
                  key={s.id}
                  type="button"
                  initial={{ opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.07 }}
                  onClick={() => void send(s.question, s.offline(f))}
                  className="w-full rounded-[14px] border border-line px-4 py-3 text-left text-sm text-ink-2 transition-colors hover:border-cobalt/50 hover:bg-cobalt-soft/40 hover:text-ink"
                >
                  {s.question}
                </motion.button>
              ))}
            </div>
            {!ai.enabled && (
              <div className="mt-6 rounded-[16px] bg-sunken p-4 text-xs text-muted">
                Serbest soru, sesle soru ve senaryo yorumu için yapay zekâyı açın.{gate.trial && ' Anahtar almadan hemen deneyebilirsiniz.'}
                {gate.trial && (
                  <Button size="sm" variant="primary" className="mt-3 w-full" icon={<Gift size={14} />} onClick={openGate}>
                    Ücretsiz dene
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  className={gate.trial ? 'mt-2 w-full' : 'mt-3 w-full'}
                  icon={<GearSix size={14} />}
                  onClick={() => {
                    onClose();
                    navigate('/ayarlar#yapay-zeka', { viewTransition: true });
                  }}
                >
                  Yapay zekâ ayarları
                </Button>
              </div>
            )}
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {turns.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={cn('flex', t.role === 'user' ? 'justify-end' : 'justify-start')}
            >
              {t.role === 'user' ? (
                <div className="max-w-[85%] rounded-[18px] rounded-br-[6px] bg-cobalt px-4 py-2.5 text-sm text-inverse">{t.content}</div>
              ) : (
                <div className="max-w-[92%]">
                  <div className="rounded-[18px] rounded-bl-[6px] border border-line bg-surface-2 px-4 py-3">
                    <RichText text={t.content} />
                  </div>
                  {t.tools && t.tools.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1 pl-1 text-[10px] text-muted">
                      <Wrench size={11} />
                      {t.tools.join(' · ')}
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        {busy && (
          <div className="flex items-center gap-2 pl-1 text-xs text-muted">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-cobalt" animate={{ opacity: [0.2, 1, 0.2], y: [0, -3, 0] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
              ))}
            </span>
            Verileriniz hesaplanıyor…
          </div>
        )}
      </div>

      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <div className="flex items-end gap-2 rounded-[18px] border border-line-strong bg-surface px-3 py-2 focus-within:border-cobalt focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--cobalt)_16%,transparent)]">
          {rec.recording ? (
            <div className="flex h-9 flex-1 items-center gap-[3px]" aria-live="polite">
              {Array.from({ length: 28 }, (_, i) => (
                <motion.span
                  key={i}
                  className="w-[3px] rounded-full bg-cobalt"
                  animate={{ height: 4 + rec.level * 28 * (0.4 + Math.abs(Math.sin(i * 1.3 + Date.now() / 300))) }}
                  transition={{ duration: 0.12 }}
                />
              ))}
              <span className="ml-2 text-2xs text-muted">Dinliyorum…</span>
            </div>
          ) : (
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              placeholder={ai.enabled ? 'Bir soru yazın…' : 'Serbest soru için yapay zekâyı açın'}
              aria-label="Soru"
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent py-2 text-sm outline-none placeholder:text-faint"
            />
          )}
          <IconButton type="button" label={rec.recording ? 'Kaydı bitir' : 'Sesle sor'} size="sm" onClick={toggleMic} className={cn(rec.recording && 'text-outflow-text')}>
            {rec.recording ? <Stop size={16} weight="fill" /> : <Microphone size={16} />}
          </IconButton>
          <IconButton type="submit" label="Gönder" size="sm" variant="primary" disabled={!input.trim() || busy}>
            <ArrowUp size={16} weight="bold" />
          </IconButton>
        </div>
      </form>
    </>
  );
}
