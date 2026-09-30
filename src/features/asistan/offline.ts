import type { Finance } from '@/app/finance';
import { runTool } from '@/ai/tools';
import { Masker } from '@/ai/masking';
import { startOfMonth } from '@/domain/dates';
import { formatDayMonthLong } from '@/ui/format';

export interface Suggestion {
  id: string;
  question: string;
  /** Yapay zekâ kapalıyken cihazda hesaplanan yanıt */
  offline: (f: Finance) => string;
}

const noMask = new Masker([], false);

export const SUGGESTIONS: Suggestion[] = [
  {
    id: 'dip',
    question: 'Önümüzdeki 90 günde nakit sıkışması yaşar mıyım?',
    offline: (f) => {
      const a = f.forecast.alerts[0];
      const min = f.forecast.min;
      if (!a) return `Baz projeksiyonda nakdiniz minimum eşiğin üstünde kalıyor. En düşük nokta ${formatDayMonthLong(min.date)}: ${fmt(min.value)}.`;
      const drivers = a.drivers.map((d) => (d.contactId ? f.contactsById.get(d.contactId)?.name : d.label)).join(', ');
      return `Evet. ${formatDayMonthLong(a.date)} günü nakit ${fmt(a.value)} seviyesine iniyor (eşik ${fmt(f.settings.minCashBalance)}).\n• Tetikleyenler: ${drivers || 'yaklaşan ödemeler'}\n• Öneri: gecikmiş alacakları bu tarihten önce tahsil edin ya da büyük bir ödemeyi birkaç gün kaydırın; etkisini Nakit akışı ekranında senaryo olarak deneyin.`;
    },
  },
  {
    id: 'overdue',
    question: 'Kim ödemesini geciktiriyor, önce kimi aramalıyım?',
    offline: (f) => {
      const rows = runTool('get_overdue', '{"direction":"receivable"}', f, noMask) as Array<{ cari: string; tutar: string; en_eski_gun: number; ort_gecikme_aliskanligi: number | null }>;
      if (!rows.length) return 'Vadesi geçmiş alacağınız yok.';
      return `Öncelik sırası (tutar ve gecikmeye göre):\n${rows
        .slice(0, 5)
        .map((r, i) => `${i + 1}. **${r.cari}** — ${r.tutar}, en eskisi ${r.en_eski_gun} gün gecikmiş${r.ort_gecikme_aliskanligi != null ? ` (genelde ${r.ort_gecikme_aliskanligi} gün geç öder)` : ''}`)
        .join('\n')}`;
    },
  },
  {
    id: 'spend',
    question: 'Bu ay en çok nereye harcadık?',
    offline: (f) => {
      const out = runTool('get_category_breakdown', JSON.stringify({ from: startOfMonth(f.today), to: f.today, kind: 'expense' }), f, noMask) as {
        toplam: string;
        kategoriler: Array<{ kategori: string; tutar: string; pay: string }>;
      };
      return `Bu ay toplam gider ${out.toplam}.\n${out.kategoriler.slice(0, 5).map((k) => `• ${k.kategori}: ${k.tutar} (${k.pay})`).join('\n')}`;
    },
  },
  {
    id: 'week',
    question: 'Bu hafta hangi ödemeler ve tahsilatlar var?',
    offline: (f) => {
      const rows = runTool('get_upcoming', '{"days":7,"direction":"all"}', f, noMask) as Array<{ tarih: string; yon: string; cari?: string; aciklama: string; tutar: string }>;
      if (!rows.length) return 'Önümüzdeki 7 günde planlı kalem yok.';
      return rows
        .slice(0, 10)
        .map((r) => `• ${formatDayMonthLong(r.tarih)} — ${r.yon === 'giris' ? '↑' : '↓'} ${r.cari ?? r.aciklama}: ${r.tutar}`)
        .join('\n');
    },
  },
];

function fmt(v: number) {
  return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(v / 100);
}
