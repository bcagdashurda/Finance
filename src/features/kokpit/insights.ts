import type { Finance } from '@/app/finance';
import { addDays } from '@/domain/dates';
import { formatShort } from '@/domain/money';
import { customerConcentration, daysSalesOutstanding, expenseAnomalies } from '@/domain/insights';
import { amountInBase } from '@/domain/balances';
import { formatDayMonth, formatDayMonthLong, formatMonthIn, percent } from '@/ui/format';

export interface Insight {
  id: string;
  tone: 'warn' | 'bad' | 'good' | 'info';
  title: string;
  body: string;
  action?: { label: string; to: string };
}

/** Deterministik tespitlerden okunabilir içgörü kartları (AI kapalıyken de çalışır). */
export function buildInsights(f: Finance): Insight[] {
  const out: Insight[] = [];
  const name = (id?: string) => (id ? f.contactsById.get(id)?.name : undefined);

  const alert = f.forecast.alerts.find((a) => a.kind === 'below-min' || a.kind === 'negative');
  if (alert) {
    const drivers = alert.drivers.map((d) => name(d.contactId) ?? d.label).slice(0, 2).join(' ve ');
    out.push({
      id: 'dip',
      tone: alert.kind === 'negative' ? 'bad' : 'warn',
      title: `${formatDayMonthLong(alert.date)} günü nakit ${formatShort(alert.value)} seviyesine iniyor`,
      body: `Minimum nakit eşiğiniz ${formatShort(f.settings.minCashBalance)}. Düşüşü en çok ${drivers || 'yaklaşan ödemeler'} tetikliyor.`,
      action: { label: 'Senaryo dene', to: '/akis' },
    });
  } else {
    const pes = f.forecast.alerts.find((a) => a.kind === 'pessimistic-below-min');
    if (pes) {
      out.push({
        id: 'pes',
        tone: 'warn',
        title: `Kötümser senaryoda ${formatDayMonth(pes.date)} günü eşiğin altı`,
        body: 'Baz projeksiyon güvende; ancak tahsilatlar geçmiş gecikmeleri kadar kayarsa sıkışma oluşuyor.',
        action: { label: 'Nakit akışına git', to: '/akis' },
      });
    }
  }

  // Gecikmiş alacaklar
  let overdueTotal = 0;
  const overdueBy = new Map<string, number>();
  for (const d of f.documents) {
    const st = f.docStates.get(d.id);
    if (d.direction !== 'receivable' || st?.status !== 'overdue') continue;
    const v = amountInBase(st.remaining, d.rateToBase);
    overdueTotal += v;
    if (d.contactId) overdueBy.set(d.contactId, (overdueBy.get(d.contactId) ?? 0) + v);
  }
  if (overdueTotal > 0) {
    const [topId, topAmount] = [...overdueBy].sort((a, b) => b[1] - a[1])[0] ?? [];
    const b = topId ? f.behavior.get(topId) : undefined;
    out.push({
      id: 'overdue',
      tone: 'bad',
      title: `${formatShort(overdueTotal)} alacağınız vadesini geçti`,
      body: topId
        ? `En büyük pay ${name(topId)} (${formatShort(topAmount ?? 0)}).${b ? ` Bu cari ortalama ${b.avgDelay} gün geç ödüyor.` : ''}`
        : 'Gecikmiş belgeleri takvimden takip edin.',
      action: topId ? { label: 'Cariyi aç', to: `/cariler/${topId}` } : { label: 'Takvim', to: '/takvim' },
    });
  }

  // Yoğunlaşma riski
  const conc = customerConcentration(f.transactions, f.today, 90);
  if (conc && conc.share >= 0.3) {
    out.push({
      id: 'concentration',
      tone: 'info',
      title: `Tahsilatların ${percent(conc.share)} tek müşteriden`,
      body: `Son 90 günde ${name(conc.contactId)} tahsilatlarınızın ${percent(conc.share)} kadarını oluşturdu. Bu müşterideki bir gecikme nakdi doğrudan etkiler.`,
      action: { label: 'Cariyi aç', to: `/cariler/${conc.contactId}` },
    });
  }

  // Gider anomalisi
  // Vergi/KDV gibi dönemsel yükümlülükler "sürpriz harcama" sayılmaz
  const periodic = f.categories.filter((c) => c.icon === 'receipt' || c.icon === 'scales').map((c) => c.id);
  const anomaly = expenseAnomalies(f.transactions, f.today, { excludeCategoryIds: periodic })[0];
  if (anomaly) {
    const cat = f.categoriesById.get(anomaly.categoryId);
    out.push({
      id: 'anomaly',
      tone: 'warn',
      title: `${cat?.name ?? 'Bir kategori'} gideri ${formatMonthIn(anomaly.month)} ${percent(anomaly.change)} arttı`,
      body: `${formatShort(anomaly.actual)} harcandı; önceki üç ayın ortalaması ${formatShort(anomaly.baseline)}.`,
      action: { label: 'İşlemleri gör', to: `/islemler?kategori=${anomaly.categoryId}` },
    });
  }

  // Çek vadeleri
  const horizon = addDays(f.today, 30);
  const chequesIn = f.instruments.filter((i) => i.direction === 'received' && (i.status === 'portfolio' || i.status === 'deposited') && i.dueDate <= horizon);
  const chequesOut = f.instruments.filter((i) => i.direction === 'issued' && i.status === 'issued' && i.dueDate <= horizon);
  if (chequesIn.length || chequesOut.length) {
    const inSum = chequesIn.reduce((s, i) => s + amountInBase(i.amount, i.rateToBase), 0);
    const outSum = chequesOut.reduce((s, i) => s + amountInBase(i.amount, i.rateToBase), 0);
    out.push({
      id: 'cheques',
      tone: 'info',
      title: `30 gün içinde ${chequesIn.length + chequesOut.length} çek/senet vadesi`,
      body: `Portföyden ${formatShort(inSum)} tahsil edilecek${outSum ? `, verilen çeklerden ${formatShort(outSum)} ödenecek` : ''}.`,
      action: { label: 'Portföye git', to: '/cekler' },
    });
  }

  // DSO
  const openRecv = f.documents
    .filter((d) => d.direction === 'receivable')
    .reduce((s, d) => {
      const st = f.docStates.get(d.id);
      return s + (st && st.remaining > 0 && d.issueDate <= f.today ? amountInBase(st.remaining, d.rateToBase) : 0);
    }, 0);
  const dso = daysSalesOutstanding(openRecv, f.transactions, f.today);
  if (dso != null) {
    out.push({
      id: 'dso',
      tone: dso > 60 ? 'warn' : 'good',
      title: `Alacak tahsil süresi ${dso} gün`,
      body: dso > 60 ? 'Sektör hedefi genellikle 30–45 gün. Vadeleri kısaltmak ya da erken ödeme iskontosu sunmak nakdi rahatlatır.' : 'Tahsilat hızınız sağlıklı görünüyor.',
    });
  }

  // Yedek hatırlatması: veriler yalnızca bu tarayıcıda
  const last = f.settings.lastBackupAt ? f.settings.lastBackupAt.slice(0, 10) : null;
  const stale = !last || addDays(last, 7) < f.today;
  if (stale && !f.settings.isDemo) {
    out.push({
      id: 'backup',
      tone: 'warn',
      title: last ? 'Son yedeğin üzerinden bir haftadan fazla geçti' : 'Henüz yedek almadınız',
      body: 'Verileriniz yalnızca bu tarayıcıda saklanıyor. Tek tıkla yedek alıp güvenli bir yere kaydedin.',
      action: { label: 'Yedek al', to: '/ayarlar#veri' },
    });
  }

  return out;
}
