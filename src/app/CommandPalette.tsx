import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useAi } from '@/ai/useAi';
import { useRecorder } from '@/ai/useRecorder';
import type { ParsedEntry } from '@/domain/nlp';
import { useNavigate } from 'react-router';
import { Dialog as RDialog } from 'radix-ui';
import { Command } from 'cmdk';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  ArrowsLeftRight,
  FileArrowDown,
  FileArrowUp,
  MagnifyingGlass,
  MinusCircle,
  PlusCircle,
  Sparkle,
  Lightning,
  Microphone,
  Stop,
  type Icon,
} from '@phosphor-icons/react';
import { parseEntry } from '@/domain/nlp';
import { searchScore } from '@/domain/search';
import { formatMoney, formatShort } from '@/domain/money';
import { Kbd, MOD_KEY, Monogram } from '@/ui/bits';
import { AccountIcon } from '@/ui/icons';
import { formatDayMonth } from '@/ui/format';
import { useFinance } from './finance';
import { useEntryContext } from './entry-context';
import { ALL_NAV } from './nav';
import { useUI, type EntryKind } from './ui-store';

const CREATE: Array<{ kind: EntryKind; label: string; icon: Icon; hint: string }> = [
  { kind: 'collect', label: 'Tahsilat', icon: ArrowDownLeft, hint: 'Müşteriden para geldi' },
  { kind: 'pay', label: 'Ödeme', icon: ArrowUpRight, hint: 'Tedarikçiye para gitti' },
  { kind: 'income', label: 'Gelir', icon: PlusCircle, hint: 'Cariye bağlı olmayan' },
  { kind: 'expense', label: 'Gider', icon: MinusCircle, hint: 'Yakıt, yemek, masraf' },
  { kind: 'transfer', label: 'Transfer', icon: ArrowsLeftRight, hint: 'Hesaplar arası' },
  { kind: 'receivable', label: 'Alacak belgesi', icon: FileArrowUp, hint: 'Kestiğiniz fatura' },
  { kind: 'payable', label: 'Borç belgesi', icon: FileArrowDown, hint: 'Gelen fatura' },
];

const KIND_LABEL: Record<EntryKind, string> = {
  collect: 'Tahsilat',
  pay: 'Ödeme',
  income: 'Gelir',
  expense: 'Gider',
  transfer: 'Transfer',
  receivable: 'Alacak',
  payable: 'Borç',
};

const itemClass =
  'group flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5 text-sm text-ink-2 data-[selected=true]:bg-sunken data-[selected=true]:text-ink';
const groupClass =
  '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-faint';

export function CommandPalette() {
  const open = useUI((s) => s.paletteOpen);
  const setOpen = useUI((s) => s.setPaletteOpen);
  return (
    <RDialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <RDialog.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-[var(--overlay)] backdrop-blur-[4px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </RDialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center px-3 pt-[12vh]">
              <RDialog.Content asChild forceMount>
                <motion.div
                  className="pointer-events-auto w-full max-w-2xl overflow-hidden rounded-[22px] border border-line bg-surface shadow-[var(--float-shadow)]"
                  initial={{ opacity: 0, scale: 0.96, y: -10, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                  exit={{ opacity: 0, scale: 0.98, y: -6, filter: 'blur(3px)' }}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                >
                  <RDialog.Title className="sr-only">Komut paleti</RDialog.Title>
                  <RDialog.Description className="sr-only">Sayfalara gidin, cari arayın ya da doğal dille kayıt girin.</RDialog.Description>
                  <PaletteBody onClose={() => setOpen(false)} />
                </motion.div>
              </RDialog.Content>
            </div>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const f = useFinance();
  const ctx = useEntryContext(f);
  const navigate = useNavigate();
  const openEntry = useUI((s) => s.openEntry);
  const setAssistantOpen = useUI((s) => s.setAssistantOpen);
  const [query, setQuery] = useState('');
  const ai = useAi();
  const rec = useRecorder();
  const [aiParsed, setAiParsed] = useState<{ q: string; entry: ParsedEntry } | null>(null);
  const [aiBusy, setAiBusy] = useState(false);

  const ruleParsed = useMemo(() => (query.trim().length > 2 ? parseEntry(query, ctx) : null), [query, ctx]);
  // Yapay zekâ açıksa, yazmaya ara verildiğinde kural tabanlı sonucu iyileştir
  useEffect(() => {
    if (!ai.enabled || query.trim().length < 8 || !/\d/.test(query)) return;
    const q = query;
    const t = window.setTimeout(async () => {
      setAiBusy(true);
      try {
        const entry = await ai.parseEntry(q);
        setAiParsed({ q, entry });
      } catch {
        /* kural tabanlı sonuç yeterli */
      } finally {
        setAiBusy(false);
      }
    }, 650);
    return () => window.clearTimeout(t);
  }, [query, ai]);
  const parsed = aiParsed && aiParsed.q === query ? aiParsed.entry : ruleParsed;
  const byAi = Boolean(aiParsed && aiParsed.q === query);
  const showDraft = parsed && parsed.amount && parsed.confidence >= 0.5;

  const go = (to: string) => {
    onClose();
    navigate(to, { viewTransition: true });
  };

  async function toggleMic() {
    if (!ai.enabled) {
      toast('Sesle kayıt için Ayarlar › Yapay zekâ’dan ücretsiz bir anahtar bağlayın');
      return;
    }
    try {
      if (!rec.recording) await rec.start();
      else {
        const blob = await rec.stop();
        setAiBusy(true);
        const text = await ai.transcribe(blob);
        setQuery(text);
      }
    } catch (e) {
      toast.error('Ses alınamadı', { description: e instanceof Error ? e.message : 'Mikrofon izni gerekli' });
    } finally {
      setAiBusy(false);
    }
  }

  return (
    <Command
      loop
      className="flex max-h-[70vh] flex-col"
      shouldFilter
      // Türkçe, kelime başı öncelikli arama; "kayda çevir" satırı her zaman en üstte
      filter={(value, search, keywords) => (value.startsWith('__draft__') ? 2 : searchScore(value, search, keywords))}
    >
      <div className="flex items-center gap-3 border-b border-line px-5">
        <MagnifyingGlass size={18} className="shrink-0 text-muted" />
        {rec.recording ? (
          <div className="flex h-14 flex-1 items-center gap-[3px]">
            {Array.from({ length: 36 }, (_, i) => (
              <motion.span key={i} className="w-[3px] rounded-full bg-cobalt" animate={{ height: 4 + rec.level * 30 * (0.35 + Math.abs(Math.sin(i * 1.7))) }} transition={{ duration: 0.1 }} />
            ))}
            <span className="ml-3 text-xs text-muted">Söyleyin: “Yıldız’dan 45 bin tahsilat, yarın”</span>
          </div>
        ) : (
          <Command.Input
            value={query}
            onValueChange={setQuery}
            placeholder="Ara, git ya da yaz: “Ege Kâğıt’a 120 bin ödeme”"
            className="h-14 flex-1 bg-transparent text-[0.95rem] outline-none placeholder:text-faint"
          />
        )}
        {aiBusy && <Sparkle size={16} weight="fill" className="animate-pulse text-cobalt" />}
        <button
          type="button"
          onClick={toggleMic}
          aria-label={rec.recording ? 'Kaydı bitir' : 'Sesle kayıt'}
          className={`flex h-8 w-8 items-center justify-center rounded-full transition-colors ${rec.recording ? 'bg-outflow text-white' : 'text-muted hover:bg-sunken hover:text-ink'}`}
        >
          {rec.recording ? <Stop size={14} weight="fill" /> : <Microphone size={16} />}
        </button>
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className="scrollbar-thin min-h-0 flex-1 overflow-y-auto p-2">
        {/* Kayda çevirme önerisi varken "eşleşen yok" demek çelişkili olur */}
        {!(showDraft && parsed) && (
          <Command.Empty className="px-4 py-10 text-center text-sm text-muted">
            Eşleşen bir şey yok. Tutar içeren bir cümle yazarsanız kayda çeviririm.
          </Command.Empty>
        )}

        {showDraft && parsed && (
          <Command.Group heading="Kayda çevir" className={groupClass} forceMount>
            <Command.Item
              value={`__draft__ ${query}`}
              forceMount
              onSelect={() =>
                openEntry({
                  // Yapay zekâ da "kira ödemesi"ni cari olmadan 'pay' diyebilir: cari yoksa gelir/gider
                  kind: parsed.contactId ? parsed.kind : parsed.kind === 'pay' ? 'expense' : parsed.kind === 'collect' ? 'income' : parsed.kind,
                  amount: parsed.amount,
                  currency: parsed.currency,
                  date: parsed.date,
                  dueDate: parsed.dueDate,
                  contactId: parsed.contactId,
                  categoryId: parsed.categoryId,
                  accountId: parsed.accountId,
                  description: parsed.description,
                })
              }
              className="flex cursor-pointer flex-col gap-2 rounded-[14px] border border-cobalt/30 bg-cobalt-soft/50 px-4 py-3 data-[selected=true]:border-cobalt data-[selected=true]:bg-cobalt-soft"
            >
              <div className="flex w-full items-center gap-2 text-xs text-cobalt-ink">
                {byAi ? <Sparkle size={14} weight="fill" /> : <Lightning size={14} weight="fill" />}
                Enter ile kaydı hazırla{byAi && ' · yapay zekâ ile'}
                <span className="ml-auto text-2xs text-muted">güven %{Math.round(parsed.confidence * 100)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Chip strong>{KIND_LABEL[parsed.kind]}</Chip>
                <Chip strong>{formatMoney(parsed.amount!, parsed.currency)}</Chip>
                {parsed.contactId && <Chip>{f.contactsById.get(parsed.contactId)?.name}</Chip>}
                {parsed.categoryId && <Chip>{f.categoriesById.get(parsed.categoryId)?.name}</Chip>}
                {parsed.accountId && <Chip>{f.accountsById.get(parsed.accountId)?.name}</Chip>}
                <Chip>{formatDayMonth(parsed.date)}</Chip>
                {parsed.dueDate && <Chip>vade {formatDayMonth(parsed.dueDate)}</Chip>}
                {parsed.description && <Chip muted>“{parsed.description}”</Chip>}
              </div>
            </Command.Item>
          </Command.Group>
        )}

        <Command.Group heading="Oluştur" className={groupClass}>
          {CREATE.map((c) => {
            const I = c.icon;
            return (
              <Command.Item key={c.kind} value={`oluştur ${c.label} ${c.hint}`} onSelect={() => openEntry({ kind: c.kind })} className={itemClass}>
                <I size={18} className="text-cobalt" />
                <span className="font-medium">{c.label}</span>
                <span className="text-xs text-muted">{c.hint}</span>
              </Command.Item>
            );
          })}
        </Command.Group>

        <Command.Group heading="Git" className={groupClass}>
          {ALL_NAV.map((n) => {
            const I = n.icon;
            return (
              <Command.Item key={n.to} value={`git ${n.label}`} onSelect={() => go(n.to)} className={itemClass}>
                <I size={18} className="text-muted group-data-[selected=true]:text-ink" />
                {n.label}
                {n.shortcut && <span className="ml-auto flex gap-1">{n.shortcut.split(' ').map((k) => <Kbd key={k}>{k}</Kbd>)}</span>}
              </Command.Item>
            );
          })}
          <Command.Item
            value="asistan yapay zeka sor"
            onSelect={() => {
              onClose();
              setAssistantOpen(true);
            }}
            className={itemClass}
          >
            <Sparkle size={18} weight="duotone" className="text-cobalt" />
            Asistana sor
            <span className="ml-auto">
              <Kbd>{MOD_KEY} J</Kbd>
            </span>
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Cariler" className={groupClass}>
          {f.contacts
            .filter((c) => !c.archived)
            .map((c) => {
              const bal = f.contactBalances.get(c.id) ?? 0;
              return (
                <Command.Item key={c.id} value={`cari ${c.name} ${c.taxId ?? ''}`} onSelect={() => go(`/cariler/${c.id}`)} className={itemClass}>
                  <Monogram name={c.name} size={24} />
                  <span className="truncate">{c.name}</span>
                  <span className={`num ml-auto text-xs ${bal > 0 ? 'text-inflow-text' : bal < 0 ? 'text-outflow-text' : 'text-muted'}`}>
                    {formatShort(bal, c.currency)}
                  </span>
                </Command.Item>
              );
            })}
        </Command.Group>

        <Command.Group heading="Hesaplar" className={groupClass}>
          {f.accounts
            .filter((a) => !a.archived)
            .map((a) => (
              <Command.Item key={a.id} value={`hesap ${a.name} ${a.institution ?? ''}`} onSelect={() => go(`/hesaplar/${a.id}`)} className={itemClass}>
                <AccountIcon kind={a.kind} size={18} className="text-muted" />
                <span className="truncate">{a.name}</span>
                <span className="num ml-auto text-xs text-muted">{formatMoney(f.balances.get(a.id) ?? 0, a.currency, { decimals: 0 })}</span>
              </Command.Item>
            ))}
        </Command.Group>
      </Command.List>
      <div className="flex items-center gap-4 border-t border-line px-5 py-2.5 text-2xs text-muted">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> gezin
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>↵</Kbd> seç
        </span>
        <span className="ml-auto">Örn. “dün kasadan 2.350 TL yakıt” · “Kuzey’e 180 bin fatura kestim vade 60 gün sonra”</span>
      </div>
    </Command>
  );
}

function Chip({ children, strong, muted }: { children: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <span
      className={`inline-flex h-7 items-center rounded-full px-2.5 text-xs ${
        strong ? 'bg-surface font-semibold text-ink shadow-[0_0_0_1px_var(--line-strong)]' : muted ? 'text-muted' : 'bg-surface/70 text-ink-2 shadow-[0_0_0_1px_var(--line)]'
      }`}
    >
      {children}
    </span>
  );
}
