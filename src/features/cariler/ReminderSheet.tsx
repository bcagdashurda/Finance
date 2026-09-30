import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Copy, EnvelopeSimple, WhatsappLogo, Sparkle } from '@phosphor-icons/react';
import { useFinance } from '@/app/finance';
import { Sheet } from '@/ui/Overlay';
import { Button } from '@/ui/Button';
import { Segmented } from '@/ui/Segmented';
import { Field, TextArea, TextInput } from '@/ui/Field';
import { Tip } from '@/ui/bits';
import { addDays } from '@/domain/dates';
import type { Contact } from '@/domain/types';
import { mailtoLink, reminderText, whatsappLink, type ReminderTone } from './reminder';
import { useAi } from '@/ai/useAi';

export function ReminderSheet({ open, onOpenChange, contact }: { open: boolean; onOpenChange: (o: boolean) => void; contact: Contact }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Tahsilat hatırlatması" description={contact.name} width={600}>
      {open && <ReminderComposer contact={contact} />}
    </Sheet>
  );
}

function ReminderComposer({ contact }: { contact: Contact }) {
  const f = useFinance();
  const ai = useAi();
  const [tone, setTone] = useState<ReminderTone>('nazik');
  const overdue = useMemo(
    () =>
      f.documents
        .filter((d) => d.contactId === contact.id && d.direction === 'receivable')
        .map((d) => ({ d, st: f.docStates.get(d.id)! }))
        .filter(({ st }) => st.status === 'overdue')
        .sort((a, b) => a.d.dueDate.localeCompare(b.d.dueDate)),
    [f.documents, f.docStates, contact.id],
  );
  const mainAccount = f.accounts.find((a) => a.kind === 'bank' && a.iban && a.currency === contact.currency && !a.archived);
  const input = {
    ourCompany: f.workspace.legalName ?? f.workspace.name,
    contactName: contact.name,
    currency: contact.currency,
    total: overdue.reduce((s, x) => s + x.st.remaining, 0),
    maxDaysLate: Math.max(0, ...overdue.map((x) => x.st.daysOverdue)),
    documents: overdue.map((x) => ({ number: x.d.number, title: x.d.title, dueDate: x.d.dueDate, remaining: x.st.remaining })),
    iban: mainAccount?.iban,
    payBy: addDays(f.today, tone === 'kararli' ? 5 : 7),
  };
  const template = reminderText(tone, input);
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [lastTone, setLastTone] = useState(tone);
  const [rewriting, setRewriting] = useState(false);
  if (lastTone !== tone) {
    setLastTone(tone);
    setSubject(template.subject);
    setBody(template.body);
  }

  async function rewrite() {
    setRewriting(true);
    try {
      const text = await ai.draftReminder({ tone, contactName: contact.name, ourCompany: input.ourCompany, draft: body });
      if (text) setBody(text);
    } catch (e) {
      toast.error('Yapay zekâ yanıt veremedi', { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setRewriting(false);
    }
  }

  if (!overdue.length) {
    return <p className="text-sm text-muted">Bu carinin vadesi geçmiş alacağı yok.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Ton"
          value={tone}
          onChange={setTone}
          options={[
            { value: 'nazik', label: 'Nazik' },
            { value: 'resmi', label: 'Resmî' },
            { value: 'kararli', label: 'Kararlı' },
          ]}
        />
        <Tip content={ai.enabled ? 'Mesajı carinin durumuna göre yeniden yazar' : 'Ayarlar’dan yapay zekâyı açtığınızda kullanılabilir'}>
          <span>
            <Button size="sm" variant="secondary" icon={<Sparkle size={14} weight="duotone" />} onClick={rewrite} loading={rewriting} disabled={!ai.enabled}>
              Yapay zekâ ile yeniden yaz
            </Button>
          </span>
        </Tip>
      </div>
      <Field label="Konu">{(p) => <TextInput {...p} value={subject} onChange={(e) => setSubject(e.target.value)} />}</Field>
      <Field label="Mesaj">{(p) => <TextArea {...p} rows={14} value={body} onChange={(e) => setBody(e.target.value)} className="text-[0.8125rem] leading-relaxed" />}</Field>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          variant="secondary"
          icon={<Copy size={16} />}
          onClick={async () => {
            await navigator.clipboard.writeText(body);
            toast.success('Mesaj panoya kopyalandı');
          }}
        >
          Kopyala
        </Button>
        <Button variant="secondary" icon={<EnvelopeSimple size={16} />} onClick={() => window.open(mailtoLink(contact.email, subject, body), '_blank')}>
          E-posta
        </Button>
        <Button variant="primary" icon={<WhatsappLogo size={16} weight="fill" />} onClick={() => window.open(whatsappLink(contact.phone, body), '_blank')} disabled={!contact.phone}>
          WhatsApp
        </Button>
      </div>
      {!contact.phone && <p className="text-right text-2xs text-muted">WhatsApp için carinin telefon numarasını ekleyin.</p>}
    </div>
  );
}
