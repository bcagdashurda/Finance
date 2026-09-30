import type { Adjustment, Frequency } from '@/domain/types';
import type { Finance } from '@/app/finance';
import { formatShort } from '@/domain/money';
import { formatDayMonth } from '@/ui/format';

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  weekly: 'her hafta',
  monthly: 'her ay',
  quarterly: 'üç ayda bir',
  yearly: 'her yıl',
};

/** Senaryo düzeltmesinin okunur açıklaması. */
export function describeAdjustment(a: Adjustment, f: Finance): string {
  const targetLabel = (t: { kind: string; id: string }) => {
    if (t.kind === 'document') {
      const d = f.documents.find((x) => x.id === t.id);
      const c = d?.contactId ? f.contactsById.get(d.contactId)?.name : undefined;
      return [c, d?.number ?? d?.title].filter(Boolean).join(' · ') || 'Belge';
    }
    if (t.kind === 'instrument') {
      const i = f.instruments.find((x) => x.id === t.id);
      return i ? `${i.kind === 'cheque' ? 'Çek' : 'Senet'} ${i.serialNo}` : 'Çek';
    }
    return f.recurring.find((r) => r.id === t.id)?.title ?? 'Tekrarlayan kalem';
  };
  switch (a.type) {
    case 'delay':
      return `${targetLabel(a.target)} ${a.days} gün ${a.days >= 0 ? 'gecikir' : 'erken gelir'}`;
    case 'exclude':
      return `${targetLabel(a.target)} hiç gerçekleşmez`;
    case 'oneOff':
      return `${formatDayMonth(a.date)}: ${a.label} (${a.direction === 'in' ? '+' : '−'}${formatShort(a.amount).replace('−', '')})`;
    case 'recurring':
      return `${a.label}: ${FREQUENCY_LABEL[a.frequency]} ${a.direction === 'in' ? '+' : '−'}${formatShort(a.amount)} (${formatDayMonth(a.start)}’den itibaren)`;
    case 'scale':
      return `Tüm ${a.direction === 'in' ? 'girişler' : 'çıkışlar'} %${a.percent > 0 ? '+' : ''}${a.percent}`;
  }
}
