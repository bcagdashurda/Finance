import type { Finance } from '@/app/finance';
import { buildEntryContext } from '@/app/entry-context';
import { normalizeTr, parseEntry, type EntryKind, type ParsedEntry } from '@/domain/nlp';
import { isISODate } from '@/domain/dates';
import { isCurrencyCode, toMinor } from '@/domain/money';
import type { ID } from '@/domain/types';
import { chat, chatJson, type ChatMessage } from './client';
import type { AiConfig } from './config';
import { Masker } from './masking';
import { assistantPrompt, categorizePrompt, entryPrompt, narratePrompt, reminderPrompt, type NarrateKind, type ReminderToneKey } from './prompts';
import { runTool, TOOLS } from './tools';

export function makeMasker(f: Finance, config: AiConfig): Masker {
  return new Masker(f.contacts.map((c) => c.name), config.maskNames);
}

const fold = (s: string) => normalizeTr(s).replace(/[^a-z0-9]+/g, ' ').trim();

/** Modelin yazdığı adı listede bulur: önce birebir, sonra harf büyüklüğü ve noktalama farkını yok sayarak. */
function byName<T extends { name: string }>(items: T[], name: string | null | undefined): T | undefined {
  if (!name) return undefined;
  return items.find((x) => x.name === name) ?? items.find((x) => fold(x.name) === fold(name));
}

/** Kategori yalnızca kaydın yönüyle uyuşuyorsa kabul edilir (gelir kaydına gider kategorisi olmaz). */
function categoryFor(f: Finance, name: string | null | undefined, side: 'income' | 'expense' | null): ID | undefined {
  if (!side) return undefined;
  return byName(f.categories.filter((c) => c.kind === side && !c.archived), name)?.id;
}

const sideOf = (k: EntryKind): 'income' | 'expense' | null =>
  k === 'collect' || k === 'income' || k === 'receivable' ? 'income' : k === 'transfer' ? null : 'expense';

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
  const out = await chatJson<EntryJson>(config, {
    model: config.fastModel,
    cache: true,
    maxTokens: 600,
    jsonSchema: { name: 'mizan_entry', schema: ENTRY_SCHEMA as unknown as Record<string, unknown> },
    messages: [
      {
        role: 'system',
        content: entryPrompt({
          contacts: ctx.contacts.map((c) => ({ name: m.name(c.name)!, kind: c.kind })),
          incomeCategories: ctx.categories.filter((c) => c.kind === 'income').map((c) => c.name),
          expenseCategories: ctx.categories.filter((c) => c.kind === 'expense').map((c) => c.name),
          accounts: ctx.accounts,
          today: f.today,
        }),
      },
      { role: 'user', content: m.mask(text) },
    ],
  });
  const contactId = byName(f.contacts, out.contact ? m.unmask(out.contact) : null)?.id ?? rule.contactId;
  let kind: EntryKind = out.kind ?? rule.kind;
  // Karşıda cari varsa nakit hareketi cari hareketidir (gelir → tahsilat, gider → ödeme)
  if (contactId && kind === 'income') kind = 'collect';
  if (contactId && kind === 'expense') kind = 'pay';
  const side = sideOf(kind);
  const ruleCategory = side && f.categoriesById.get(rule.categoryId ?? '')?.kind === side ? rule.categoryId : undefined;
  return {
    kind,
    amount: out.amount != null ? toMinor(out.amount) : rule.amount,
    currency: isCurrencyCode(out.currency) ? out.currency : rule.currency,
    date: isISODate(out.date) ? out.date : rule.date,
    dueDate: out.due_date && isISODate(out.due_date) ? out.due_date : rule.dueDate,
    contactId,
    categoryId: categoryFor(f, out.category, side) ?? ruleCategory,
    accountId: byName(f.accounts.filter((a) => !a.archived), out.account)?.id ?? rule.accountId,
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
        { role: 'system', content: categorizePrompt({ incomeCategories: income, expenseCategories: expense, contacts }) },
        { role: 'user', content: JSON.stringify(chunk.map((l) => ({ id: l.id, aciklama: m.mask(l.description), tutar: l.amount / 100 }))) },
      ],
    });
    const byId = new Map(chunk.map((l) => [l.id, l]));
    for (const it of out.items ?? []) {
      const line = byId.get(it.id);
      if (!line) continue; // modelin uydurduğu satır
      const categoryId = categoryFor(f, it.category, line.amount >= 0 ? 'income' : 'expense');
      const contactId = byName(f.contacts, it.contact ? m.unmask(it.contact) : null)?.id;
      if (categoryId || contactId) result.set(it.id, { categoryId, contactId });
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Metin üretimi

/** Ekran Markdown göstermez: model yine de yazarsa kalın/başlık işaretlerini temizle. */
export function plainText(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .trim();
}

/** TR IBAN: "TR" + 24 rakam, boşluklu ya da boşluksuz */
const IBAN = /\bTR\d{2}(?:\s?\d){22}\b/g;

export async function draftReminder(
  input: { tone: ReminderToneKey; contactId?: ID; maxDaysLate?: number; draft: string },
  f: Finance,
  config: AiConfig,
): Promise<string> {
  const m = makeMasker(f, config);
  const habit = input.contactId ? f.behavior.get(input.contactId) : undefined;
  // IBAN gönderilmez (onay ekranındaki söz): yer tutucuyla gider, yanıtta geri konur
  const ibans: string[] = [];
  const draft = input.draft.replace(IBAN, (hit) => `[IBAN-${ibans.push(hit)}]`);
  const r = await chat(config, {
    temperature: 0.5,
    maxTokens: 900,
    messages: [
      { role: 'system', content: reminderPrompt({ tone: input.tone, maxDaysLate: input.maxDaysLate, habit }) },
      { role: 'user', content: m.mask(draft) },
    ],
  });
  let text = plainText(m.unmask(r.message.content ?? ''));
  ibans.forEach((iban, i) => {
    const tag = `[IBAN-${i + 1}]`;
    text = text.includes(tag) ? text.split(tag).join(iban) : `${text}\n\nIBAN: ${iban}`;
  });
  return text;
}

const TONE_TAG: Record<string, string> = { bad: 'risk', warn: 'uyarı', good: 'olumlu', info: 'bilgi' };

export async function narrateInsights(
  insights: Array<{ title: string; body: string; tone?: string }>,
  f: Finance,
  config: AiConfig,
  kind: NarrateKind = 'brifing',
): Promise<string> {
  const m = makeMasker(f, config);
  const r = await chat(config, {
    temperature: 0.4,
    maxTokens: 500,
    cache: true,
    messages: [
      { role: 'system', content: narratePrompt(kind) },
      { role: 'user', content: m.mask(insights.map((i) => `- ${i.tone && TONE_TAG[i.tone] ? `[${TONE_TAG[i.tone]}] ` : ''}${i.title}: ${i.body}`).join('\n')) },
    ],
  });
  return plainText(m.unmask(r.message.content ?? ''));
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
    { role: 'system', content: assistantPrompt({ business: f.workspace.name, today: f.today }) },
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
