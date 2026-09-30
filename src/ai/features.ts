import type { Finance } from '@/app/finance';
import { buildEntryContext } from '@/app/entry-context';
import { parseEntry, type EntryKind, type ParsedEntry } from '@/domain/nlp';
import { isISODate } from '@/domain/dates';
import { isCurrencyCode, toMinor } from '@/domain/money';
import type { ID } from '@/domain/types';
import { chat, chatJson, type ChatMessage } from './client';
import type { AiConfig } from './config';
import { Masker } from './masking';
import { runTool, TOOLS } from './tools';

export function makeMasker(f: Finance, config: AiConfig): Masker {
  return new Masker(f.contacts.map((c) => c.name), config.maskNames);
}

// ---------------------------------------------------------------------------
// Doğal dil ile kayıt

const ENTRY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'amount', 'currency', 'date', 'due_date', 'contact', 'category', 'account', 'description'],
  properties: {
    kind: { type: 'string', enum: ['collect', 'pay', 'income', 'expense', 'transfer', 'receivable', 'payable'] },
    amount: { type: ['number', 'null'], description: 'Ana birimde tutar (ör. 45000.5)' },
    currency: { type: 'string', enum: ['TRY', 'USD', 'EUR', 'GBP'] },
    date: { type: 'string', description: 'YYYY-AA-GG' },
    due_date: { type: ['string', 'null'], description: 'Vade YYYY-AA-GG ya da null' },
    contact: { type: ['string', 'null'], description: 'Listedeki cari adı birebir ya da null' },
    category: { type: ['string', 'null'], description: 'Listedeki kategori adı birebir ya da null' },
    account: { type: ['string', 'null'], description: 'Listedeki hesap adı birebir ya da null' },
    description: { type: 'string' },
  },
} as const;

interface EntryJson {
  kind: EntryKind;
  amount: number | null;
  currency: string;
  date: string;
  due_date: string | null;
  contact: string | null;
  category: string | null;
  account: string | null;
  description: string;
}

/** Önce kural tabanlı ayrıştırıcı; yapay zekâ onu düzeltir/tamamlar. */
export async function parseEntryAI(text: string, f: Finance, config: AiConfig): Promise<ParsedEntry> {
  const ctx = buildEntryContext(f);
  const rule = parseEntry(text, ctx);
  const m = makeMasker(f, config);
  const contacts = f.contacts.filter((c) => !c.archived).map((c) => m.name(c.name)!);
  const out = await chatJson<EntryJson>(config, {
    model: config.fastModel,
    cache: true,
    maxTokens: 600,
    jsonSchema: { name: 'mizan_entry', schema: ENTRY_SCHEMA as unknown as Record<string, unknown> },
    messages: [
      {
        role: 'system',
        content: `Türkçe finans kayıt ayrıştırıcısısın. Bugün ${f.today}. Kullanıcının cümlesini tek bir kayda çevir.
Türler: collect=müşteriden tahsilat, pay=tedarikçiye ödeme, income=cariye bağlı olmayan gelir, expense=cariye bağlı olmayan gider, transfer=hesaplar arası, receivable=kesilen fatura/alacak, payable=gelen fatura/borç.
"45 bin"=45000, "1,5 milyon"=1500000. Göreli tarihleri bugüne göre çöz. Yalnızca listedeki adları kullan; eşleşme yoksa null.
Cariler: ${contacts.join(' | ')}
Kategoriler: ${ctx.categories.map((c) => c.name).join(' | ')}
Hesaplar: ${ctx.accounts.map((a) => a.name).join(' | ')}`,
      },
      { role: 'user', content: m.mask(text) },
    ],
  });
  const contactName = out.contact ? m.unmask(out.contact) : null;
  const contactId = contactName ? f.contacts.find((c) => c.name === contactName)?.id : undefined;
  const categoryId = out.category ? f.categories.find((c) => c.name === out.category)?.id : undefined;
  const accountId = out.account ? f.accounts.find((a) => a.name === out.account)?.id : undefined;
  return {
    kind: out.kind ?? rule.kind,
    amount: out.amount != null ? toMinor(out.amount) : rule.amount,
    currency: isCurrencyCode(out.currency) ? out.currency : rule.currency,
    date: isISODate(out.date) ? out.date : rule.date,
    dueDate: out.due_date && isISODate(out.due_date) ? out.due_date : rule.dueDate,
    contactId: contactId ?? rule.contactId,
    categoryId: categoryId ?? rule.categoryId,
    accountId: accountId ?? rule.accountId,
    description: m.unmask(out.description || rule.description),
    confidence: Math.max(rule.confidence, 0.85),
  };
}

// ---------------------------------------------------------------------------
// Ekstre satırlarını toplu sınıflandırma

export interface CategorizeLine {
  id: number;
  description: string;
  amount: number;
}

export async function categorizeBatch(lines: CategorizeLine[], f: Finance, config: AiConfig): Promise<Map<number, { categoryId?: ID; contactId?: ID }>> {
  const m = makeMasker(f, config);
  const result = new Map<number, { categoryId?: ID; contactId?: ID }>();
  const income = f.categories.filter((c) => c.kind === 'income' && !c.archived).map((c) => c.name);
  const expense = f.categories.filter((c) => c.kind === 'expense' && !c.archived).map((c) => c.name);
  const contacts = f.contacts.filter((c) => !c.archived).map((c) => m.name(c.name)!);
  for (let i = 0; i < lines.length; i += 25) {
    const chunk = lines.slice(i, i + 25);
    const out = await chatJson<{ items: Array<{ id: number; category: string | null; contact: string | null }> }>(config, {
      model: config.fastModel,
      cache: true,
      maxTokens: 1400,
      jsonSchema: {
        name: 'mizan_categorize',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['id', 'category', 'contact'],
                properties: { id: { type: 'integer' }, category: { type: ['string', 'null'] }, contact: { type: ['string', 'null'] } },
              },
            },
          },
        },
      },
      messages: [
        {
          role: 'system',
          content: `Türk banka ekstresi satırlarını sınıflandır. Pozitif tutar gelir, negatif gider. Karşı taraf listedeki bir cariyse contact alanına adını birebir yaz; değilse uygun kategoriyi seç. Emin değilsen null.
Gelir kategorileri: ${income.join(' | ')}
Gider kategorileri: ${expense.join(' | ')}
Cariler: ${contacts.join(' | ')}`,
        },
        { role: 'user', content: JSON.stringify(chunk.map((l) => ({ id: l.id, aciklama: m.mask(l.description), tutar: l.amount / 100 }))) },
      ],
    });
    for (const it of out.items ?? []) {
      const categoryId = it.category ? f.categories.find((c) => c.name === it.category)?.id : undefined;
      const cname = it.contact ? m.unmask(it.contact) : null;
      const contactId = cname ? f.contacts.find((c) => c.name === cname)?.id : undefined;
      if (categoryId || contactId) result.set(it.id, { categoryId, contactId });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Metin üretimi

export async function draftReminder(
  input: { tone: string; contactName: string; ourCompany: string; draft: string },
  f: Finance,
  config: AiConfig,
): Promise<string> {
  const m = makeMasker(f, config);
  const r = await chat(config, {
    temperature: 0.5,
    maxTokens: 900,
    messages: [
      {
        role: 'system',
        content: `Türk ticari yazışma geleneğine uygun, ${input.tone} tonda bir tahsilat hatırlatması yaz. Taslaktaki rakamları, tarihleri, belge numaralarını ve IBAN'ı AYNEN koru; yeni rakam ekleme. Kısa, saygılı ve net ol. Yalnızca mesaj metnini döndür.`,
      },
      { role: 'user', content: m.mask(input.draft) },
    ],
  });
  return m.unmask(r.message.content ?? '').trim();
}

export async function narrateInsights(insights: Array<{ title: string; body: string }>, f: Finance, config: AiConfig): Promise<string> {
  const m = makeMasker(f, config);
  const r = await chat(config, {
    temperature: 0.4,
    maxTokens: 500,
    cache: true,
    messages: [
      {
        role: 'system',
        content: 'Bir KOBİ finans yöneticisine sabah brifingi yazıyorsun. Verilen tespitleri öncelik sırasına koy ve 3 kısa madde halinde, eyleme dönük Türkçe yaz. Rakamları aynen kullan, yenisini üretme. Madde işareti olarak "•" kullan.',
      },
      { role: 'user', content: m.mask(insights.map((i) => `- ${i.title}: ${i.body}`).join('\n')) },
    ],
  });
  return m.unmask(r.message.content ?? '').trim();
}

// ---------------------------------------------------------------------------
// Asistan (araç çağırma döngüsü)

export interface AssistantTurn {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
}

const TOOL_LABEL: Record<string, string> = {
  get_overview: 'Genel durum',
  get_forecast: 'Projeksiyon',
  get_upcoming: 'Yaklaşan kalemler',
  get_overdue: 'Gecikmeler',
  get_category_breakdown: 'Kategori dağılımı',
  get_monthly_summary: 'Aylık özet',
  search_transactions: 'İşlem arama',
  get_contact: 'Cari bilgisi',
  simulate: 'Senaryo simülasyonu',
};

export async function askAssistant(history: AssistantTurn[], question: string, f: Finance, config: AiConfig, signal?: AbortSignal): Promise<AssistantTurn> {
  const m = makeMasker(f, config);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `Sen Mizan'ın finans asistanısın. İşletme: ${f.workspace.name}. Bugün: ${f.today}. Para birimi: TL.
Kurallar:
- Türkçe, kısa ve net yanıt ver; gerektiğinde kısa maddeler kullan.
- Rakamları ASLA uydurma ya da kendin hesaplama; yalnızca araç sonuçlarındaki değerleri kullan. Gerekiyorsa birden fazla araç çağır.
- Tarihleri "15 Ekim" biçiminde yaz.
- Somut bir sonraki adım öner (ör. hangi cariyi aramalı, hangi ödemeyi kaydırmalı).
- Vergi/hukuk konularında kesin hüküm verme; mali müşavire danışmayı öner.`,
    },
    ...history.slice(-6).map((t) => ({ role: t.role, content: m.mask(t.content) }) as ChatMessage),
    { role: 'user', content: m.mask(question) },
  ];
  const used: string[] = [];
  for (let step = 0; step < 5; step++) {
    const r = await chat(config, { messages, tools: TOOLS, maxTokens: 1400, temperature: 0.2, signal });
    const msg = r.message;
    if (msg.tool_calls?.length) {
      messages.push({ role: 'assistant', content: msg.content ?? null, tool_calls: msg.tool_calls });
      for (const call of msg.tool_calls) {
        used.push(TOOL_LABEL[call.function.name] ?? call.function.name);
        const out = runTool(call.function.name, call.function.arguments, f, m);
        messages.push({ role: 'tool', tool_call_id: call.id, name: call.function.name, content: JSON.stringify(out) });
      }
      continue;
    }
    return { role: 'assistant', content: m.unmask(msg.content ?? '').trim(), tools: [...new Set(used)] };
  }
  return { role: 'assistant', content: 'Bu soruyu yanıtlamak için çok fazla adım gerekti. Soruyu biraz daraltabilir misiniz?', tools: used };
}
