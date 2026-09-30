/**
 * Asistanın çağırabileceği yerel fonksiyonlar. Rakamlar burada, deterministik olarak
 * hesaplanır; model yalnızca soruyu yorumlar ve sonucu anlatır.
 */
import type { Finance } from '@/app/finance';
import { forecastInput } from '@/app/finance';
import { amountInBase } from '@/domain/balances';
import { addDays, addMonths, startOfMonth, type ISODate } from '@/domain/dates';
import { buildForecast } from '@/domain/forecast';
import { categoryTotals, monthlyFlows } from '@/domain/aggregate';
import { formatMoney, type Money } from '@/domain/money';
import { normalizeTr } from '@/domain/nlp';
import { newId } from '@/data/repo';
import type { Adjustment } from '@/domain/types';
import type { ToolDef } from './client';
import type { Masker } from './masking';

const tl = (v: Money) => formatMoney(v, 'TRY', { decimals: 0 });

export const TOOLS: ToolDef[] = [
  {
    type: 'function',
    function: {
      name: 'get_overview',
      description: 'Bugünkü nakit pozisyonu, döviz dağılımı, son 30 gün değişimi, açık alacak/borç ve gecikmeler, projeksiyon uyarıları.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_forecast',
      description: 'Belirtilen gün sayısı için nakit projeksiyonu: en düşük nokta, dönem sonu, uyarılar ve haftalık bakiye özetleri.',
      parameters: { type: 'object', properties: { days: { type: 'integer', minimum: 7, maximum: 365 } }, required: ['days'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_upcoming',
      description: 'Önümüzdeki N gündeki beklenen tahsilat ve ödemeler (tarih, cari, tutar).',
      parameters: {
        type: 'object',
        properties: { days: { type: 'integer', minimum: 1, maximum: 120 }, direction: { type: 'string', enum: ['in', 'out', 'all'] } },
        required: ['days', 'direction'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_overdue',
      description: 'Vadesi geçmiş alacaklar ya da borçlar, cari bazında.',
      parameters: { type: 'object', properties: { direction: { type: 'string', enum: ['receivable', 'payable'] } }, required: ['direction'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_category_breakdown',
      description: 'Tarih aralığında kategori bazında gelir ya da gider toplamları (en büyükten).',
      parameters: {
        type: 'object',
        properties: { from: { type: 'string', description: 'YYYY-AA-GG' }, to: { type: 'string', description: 'YYYY-AA-GG' }, kind: { type: 'string', enum: ['income', 'expense'] } },
        required: ['from', 'to', 'kind'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_monthly_summary',
      description: 'Son N ayın aylık giriş, çıkış ve net nakit akışı.',
      parameters: { type: 'object', properties: { months: { type: 'integer', minimum: 1, maximum: 24 } }, required: ['months'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_transactions',
      description: 'Açıklama, cari ya da kategori adına göre işlem arar.',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 30 } },
        required: ['query'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_contact',
      description: 'Bir cari hakkında bakiye, ödeme alışkanlığı, açık belgeler ve son hareketler.',
      parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'simulate',
      description: 'Ya şöyle olursa? Bir carinin tahsilatlarını geciktir, tek seferlik ya da aylık gelir/gider ekle; projeksiyona etkisini döndürür.',
      parameters: {
        type: 'object',
        properties: {
          days: { type: 'integer', minimum: 7, maximum: 365 },
          delays: { type: 'array', items: { type: 'object', properties: { contact: { type: 'string' }, days: { type: 'integer' } }, required: ['contact', 'days'], additionalProperties: false } },
          one_offs: {
            type: 'array',
            items: {
              type: 'object',
              properties: { direction: { type: 'string', enum: ['in', 'out'] }, amount_try: { type: 'number' }, date: { type: 'string' }, label: { type: 'string' } },
              required: ['direction', 'amount_try', 'date', 'label'],
              additionalProperties: false,
            },
          },
          monthly: {
            type: 'array',
            items: {
              type: 'object',
              properties: { direction: { type: 'string', enum: ['in', 'out'] }, amount_try: { type: 'number' }, start: { type: 'string' }, label: { type: 'string' } },
              required: ['direction', 'amount_try', 'start', 'label'],
              additionalProperties: false,
            },
          },
        },
        required: ['days'],
        additionalProperties: false,
      },
    },
  },
];

function findContact(f: Finance, name: string, m: Masker) {
  const n = normalizeTr(m.unmask(name));
  let best: { id: string; score: number } | null = null;
  for (const c of f.contacts) {
    const cn = normalizeTr(c.name);
    const score = cn === n ? 100 : cn.includes(n) || n.includes(cn.split(' ')[0]!) ? 50 : n.split(/\s+/).filter((w) => w.length > 2 && cn.includes(w)).length * 10;
    if (score > 0 && (!best || score > best.score)) best = { id: c.id, score };
  }
  return best ? f.contactsById.get(best.id) : undefined;
}

export function runTool(name: string, argsJson: string, f: Finance, m: Masker): unknown {
  let args: Record<string, unknown> = {};
  try {
    args = argsJson ? JSON.parse(argsJson) : {};
  } catch {
    return { error: 'Argümanlar okunamadı' };
  }
  const cname = (id?: string) => (id ? m.name(f.contactsById.get(id)?.name) : undefined);

  switch (name) {
    case 'get_overview': {
      const month = f.transactions.filter((t) => t.date > addDays(f.today, -30));
      let recv = 0;
      let recvOverdue = 0;
      let pay = 0;
      for (const d of f.documents) {
        const st = f.docStates.get(d.id);
        if (!st || st.remaining <= 0 || d.issueDate > f.today) continue;
        const v = amountInBase(st.remaining, d.rateToBase);
        if (d.direction === 'receivable') {
          recv += v;
          if (st.status === 'overdue') recvOverdue += v;
        } else pay += v;
      }
      const inflow = month.filter((t) => t.kind === 'income').reduce((s, t) => s + amountInBase(t.amount, t.rateToBase), 0);
      const outflow = month.filter((t) => t.kind === 'expense').reduce((s, t) => s + amountInBase(t.amount, t.rateToBase), 0);
      return {
        bugun: f.today,
        isletme: f.workspace.name,
        nakit_toplam: tl(f.totalBase),
        doviz: Object.fromEntries([...f.byCurrency].map(([c, v]) => [c, formatMoney(v, c, { decimals: 0 })])),
        son_30_gun: { giris: tl(inflow), cikis: tl(outflow), net: tl(inflow - outflow) },
        acik_alacak: tl(recv),
        gecikmis_alacak: tl(recvOverdue),
        acik_borc: tl(pay),
        minimum_nakit_esigi: tl(f.settings.minCashBalance),
        projeksiyon_90_gun: {
          en_dusuk: { tarih: f.forecast.min.date, tutar: tl(f.forecast.min.value) },
          donem_sonu: tl(f.forecast.end.expected),
          uyarilar: f.forecast.alerts.map((a) => ({ tur: a.kind, tarih: a.date, tutar: tl(a.value), tetikleyenler: a.drivers.map((d) => cname(d.contactId) ?? d.label) })),
        },
      };
    }
    case 'get_forecast': {
      const days = Math.min(365, Math.max(7, Number(args.days) || 90));
      const r = buildForecast(forecastInput(f, days));
      return {
        gun: days,
        baslangic: tl(f.totalBase),
        en_dusuk: { tarih: r.min.date, tutar: tl(r.min.value) },
        donem_sonu: { beklenen: tl(r.end.expected), iyimser: tl(r.end.optimistic), kotumser: tl(r.end.pessimistic) },
        toplam_giris: tl(r.totals.inflow),
        toplam_cikis: tl(r.totals.outflow),
        haftalik: r.days.filter((_, i) => i % 7 === 0).map((d) => ({ tarih: d.date, bakiye: tl(d.expected) })),
        uyarilar: r.alerts.map((a) => ({ tur: a.kind, tarih: a.date, tutar: tl(a.value) })),
        not: 'Beklenen: carilerin geçmiş gecikmeleri dikkate alındı. Kötümser: gecikmeler P80 ve yeni satış yok.',
      };
    }
    case 'get_upcoming': {
      const days = Math.min(120, Math.max(1, Number(args.days) || 14));
      const dir = String(args.direction ?? 'all');
      const to = addDays(f.today, days);
      const r = buildForecast(forecastInput(f, days));
      return r.items
        .filter((i) => i.source !== 'runrate' && i.expected <= to && (dir === 'all' || i.direction === dir))
        .slice(0, 25)
        .map((i) => ({ tarih: i.expected, vade: i.dueDate, yon: i.direction === 'in' ? 'giris' : 'cikis', cari: cname(i.contactId), aciklama: i.label, tutar: tl(i.expectedAmount), kaynak: i.source }));
    }
    case 'get_overdue': {
      const dir = args.direction === 'payable' ? 'payable' : 'receivable';
      const by = new Map<string, { tutar: number; adet: number; en_eski_gun: number }>();
      for (const d of f.documents) {
        const st = f.docStates.get(d.id);
        if (d.direction !== dir || st?.status !== 'overdue') continue;
        const key = d.contactId ?? '—';
        const row = by.get(key) ?? { tutar: 0, adet: 0, en_eski_gun: 0 };
        row.tutar += amountInBase(st.remaining, d.rateToBase);
        row.adet += 1;
        row.en_eski_gun = Math.max(row.en_eski_gun, st.daysOverdue);
        by.set(key, row);
      }
      return [...by.entries()]
        .sort((a, b) => b[1].tutar - a[1].tutar)
        .map(([id, r]) => ({ cari: cname(id) ?? 'Carisiz', tutar: tl(r.tutar), adet: r.adet, en_eski_gun: r.en_eski_gun, ort_gecikme_aliskanligi: f.behavior.get(id)?.avgDelay ?? null }));
    }
    case 'get_category_breakdown': {
      const from = String(args.from ?? startOfMonth(f.today)) as ISODate;
      const to = String(args.to ?? f.today) as ISODate;
      const kind = args.kind === 'income' ? 'income' : 'expense';
      const rows = categoryTotals(f.transactions, kind, from, to);
      const total = rows.reduce((s, r) => s + r.total, 0);
      return {
        aralik: `${from} – ${to}`,
        toplam: tl(total),
        kategoriler: rows.slice(0, 12).map((r) => ({
          kategori: r.categoryId ? f.categoriesById.get(r.categoryId)?.name : 'Kategorisiz',
          tutar: tl(r.total),
          pay: total ? `%${Math.round((r.total / total) * 100)}` : '%0',
          adet: r.count,
        })),
      };
    }
    case 'get_monthly_summary': {
      const months = Math.min(24, Math.max(1, Number(args.months) || 6));
      return monthlyFlows(f.transactions, startOfMonth(addMonths(f.today, -(months - 1))), f.today).map((m) => ({ ay: m.key, giris: tl(m.inflow), cikis: tl(m.outflow), net: tl(m.net) }));
    }
    case 'search_transactions': {
      const q = normalizeTr(m.unmask(String(args.query ?? '')));
      const from = String(args.from ?? '0000');
      const to = String(args.to ?? '9999');
      const limit = Math.min(30, Number(args.limit) || 15);
      const hits = f.transactionsDesc.filter((t) => {
        if (t.date < from || t.date > to) return false;
        const hay = normalizeTr([t.description, t.contactId && f.contactsById.get(t.contactId)?.name, t.categoryId && f.categoriesById.get(t.categoryId)?.name].filter(Boolean).join(' '));
        return q.split(/\s+/).every((w) => hay.includes(w));
      });
      return {
        bulunan: hits.length,
        toplam: tl(hits.reduce((s, t) => s + (t.kind === 'expense' ? -1 : t.kind === 'income' ? 1 : 0) * amountInBase(t.amount, t.rateToBase), 0)),
        islemler: hits.slice(0, limit).map((t) => ({
          tarih: t.date,
          tur: t.kind,
          aciklama: m.mask(t.description),
          cari: cname(t.contactId),
          kategori: t.categoryId ? f.categoriesById.get(t.categoryId)?.name : undefined,
          tutar: formatMoney(t.kind === 'expense' ? -t.amount : t.amount, t.currency, { decimals: 0 }),
        })),
      };
    }
    case 'get_contact': {
      const c = findContact(f, String(args.name ?? ''), m);
      if (!c) return { hata: 'Cari bulunamadı', cariler: f.contacts.slice(0, 20).map((x) => m.name(x.name)) };
      const b = f.behavior.get(c.id);
      const open = f.documents
        .filter((d) => d.contactId === c.id)
        .map((d) => ({ d, st: f.docStates.get(d.id)! }))
        .filter((x) => x.st.remaining > 0 && x.d.issueDate <= f.today);
      const last = f.transactionsDesc.filter((t) => t.contactId === c.id).slice(0, 5);
      return {
        cari: m.name(c.name),
        tur: c.kind,
        bakiye: formatMoney(f.contactBalances.get(c.id) ?? 0, c.currency, { decimals: 0 }),
        bakiye_anlami: 'pozitif: bize borçlu, negatif: biz borçluyuz',
        vade_gun: c.paymentTermDays ?? null,
        risk_limiti: c.riskLimit ? formatMoney(c.riskLimit, c.currency, { decimals: 0 }) : null,
        odeme_aliskanligi: b ? { ortalama_gecikme_gun: b.avgDelay, p80_gecikme_gun: b.p80Delay, zamaninda_oran: `%${Math.round(b.onTimeRate * 100)}`, ornek: b.samples } : null,
        acik_belgeler: open.slice(0, 10).map(({ d, st }) => ({ no: d.number ?? d.title, yon: d.direction, vade: d.dueDate, kalan: formatMoney(st.remaining, d.currency, { decimals: 0 }), durum: st.status, gecikme_gun: st.daysOverdue })),
        son_hareketler: last.map((t) => ({ tarih: t.date, tur: t.kind, tutar: formatMoney(t.amount, t.currency, { decimals: 0 }) })),
      };
    }
    case 'simulate': {
      const days = Math.min(365, Math.max(7, Number(args.days) || 90));
      const adjustments: Adjustment[] = [];
      const notFound: string[] = [];
      for (const d of (args.delays as Array<{ contact: string; days: number }> | undefined) ?? []) {
        const c = findContact(f, d.contact, m);
        if (!c) {
          notFound.push(d.contact);
          continue;
        }
        for (const doc of f.documents.filter((x) => x.contactId === c.id && (f.docStates.get(x.id)?.remaining ?? 0) > 0)) {
          adjustments.push({ id: newId(), type: 'delay', target: { kind: 'document', id: doc.id }, days: Number(d.days) || 0 });
        }
      }
      for (const o of (args.one_offs as Array<{ direction: 'in' | 'out'; amount_try: number; date: string; label: string }> | undefined) ?? []) {
        adjustments.push({ id: newId(), type: 'oneOff', direction: o.direction, amount: Math.round(o.amount_try * 100), date: o.date, label: o.label });
      }
      for (const o of (args.monthly as Array<{ direction: 'in' | 'out'; amount_try: number; start: string; label: string }> | undefined) ?? []) {
        adjustments.push({ id: newId(), type: 'recurring', direction: o.direction, amount: Math.round(o.amount_try * 100), frequency: 'monthly', start: o.start, label: o.label });
      }
      const base = buildForecast(forecastInput(f, days));
      const sim = buildForecast(forecastInput(f, days, { adjustments }));
      return {
        uygulanan_degisiklik: adjustments.length,
        bulunamayan_cariler: notFound,
        baz: { en_dusuk: { tarih: base.min.date, tutar: tl(base.min.value) }, donem_sonu: tl(base.end.expected) },
        senaryo: { en_dusuk: { tarih: sim.min.date, tutar: tl(sim.min.value) }, donem_sonu: tl(sim.end.expected) },
        fark: { en_dusuk: tl(sim.min.value - base.min.value), donem_sonu: tl(sim.end.expected - base.end.expected) },
        esik: tl(f.settings.minCashBalance),
        esik_alti_ilk_gun: sim.alerts.find((a) => a.kind === 'below-min')?.date ?? null,
      };
    }
    default:
      return { error: `Bilinmeyen araç: ${name}` };
  }
}
