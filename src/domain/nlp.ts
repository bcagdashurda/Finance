/**
 * Türkçe doğal dil kayıt ayrıştırıcı (kural tabanlı; yapay zekâ kapalıyken de çalışır).
 * "Yıldız'dan 45 bin tahsilat 15 Ekim" → { kind: 'collect', amount, contactId, date }
 */
import { parseTurkishDate, type ISODate } from './dates';
import { detectCurrency, parseAmount, type CurrencyCode, type Money } from './money';
import type { ContactKind, ID } from './types';

export type EntryKind = 'collect' | 'pay' | 'income' | 'expense' | 'transfer' | 'receivable' | 'payable';

export interface EntryContext {
  today: ISODate;
  contacts: Array<{ id: ID; name: string; kind: ContactKind }>;
  categories: Array<{ id: ID; name: string; kind: 'income' | 'expense'; keywords: string[] }>;
  accounts: Array<{ id: ID; name: string; currency: CurrencyCode }>;
}

export interface ParsedEntry {
  kind: EntryKind;
  amount: Money | null;
  currency: CurrencyCode;
  date: ISODate;
  dueDate?: ISODate;
  contactId?: ID;
  categoryId?: ID;
  accountId?: ID;
  description: string;
  confidence: number;
}

/** Karşılaştırma için normalize: küçük harf, aksan yok, ı→i. */
export function normalizeTr(text: string): string {
  return text
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ı/g, 'i');
}

const GENERIC_NAME_TOKENS = new Set([
  'a.s.', 'as', 'a.s', 'ltd', 'ltd.', 'sti', 'sti.', 'san', 'san.', 'tic', 'tic.', 'sanayi', 'ticaret', 've',
  'limited', 'sirketi', 'anonim', 'bankasi', 'banka', 'hesap', 'hesabi', 'ticari', 'vadesiz', 'kooperatifi',
]);

const SOFTEN: Record<string, string> = { k: 'g', p: 'b', t: 'd', c: 'c' };

function nameTokens(name: string): string[] {
  return normalizeTr(name)
    .split(/[\s\-/,()]+/)
    .map((t) => t.replace(/[.'’]+$/g, ''))
    .filter((t) => t.length >= 3 && !GENERIC_NAME_TOKENS.has(t));
}

interface Word {
  raw: string;
  norm: string;
  start: number;
  end: number;
}

function words(text: string): Word[] {
  const out: Word[] = [];
  const re = /[\p{L}][\p{L}'’.]*/gu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const stem = raw.split(/['’]/)[0]!.replace(/\.+$/, '');
    out.push({ raw, norm: normalizeTr(stem), start: m.index, end: m.index + raw.length });
  }
  return out;
}

/** Kelime, eklerle birlikte token ile eşleşir mi? ("kasadan" ~ "kasa", "yemeği" ~ "yemek") */
function wordMatches(word: string, token: string): boolean {
  if (word === token) return true;
  if (word.startsWith(token) && word.length - token.length <= 5) return true;
  const last = token.at(-1)!;
  const soft = SOFTEN[last];
  if (soft && token.length >= 4) {
    const softened = token.slice(0, -1) + soft;
    if (word.startsWith(softened) && word.length - softened.length <= 4) return true;
  }
  return false;
}

interface Match<T> {
  item: T;
  score: number;
  spans: Array<[number, number]>;
}

function bestMatch<T>(ws: Word[], items: T[], tokensOf: (item: T) => string[]): Match<T> | null {
  let best: Match<T> | null = null;
  for (const item of items) {
    const tokens = tokensOf(item);
    let score = 0;
    const spans: Array<[number, number]> = [];
    for (const t of tokens) {
      const w = ws.find((x) => wordMatches(x.norm, t));
      if (w) {
        score += t.length;
        spans.push([w.start, w.end]);
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { item, score, spans };
  }
  return best;
}

/**
 * Yönü fiilin kişisi belirler: 1. kişi ("ödedim", "gönderdik") parayı işletme verdi → çıkış;
 * 3. kişi ("Toros ödedi", "yatırdı") parayı karşı taraf verdi → giriş. Edilgen ("ödendi") yön söylemez.
 */
const OUT_VERB = /\b(odedim|odedik|gonderdim|gonderdik|yatirdim|yatirdik|verdim|verdik)\b|havale ettim|havale ettik|eft yaptim|eft yaptik|odeme yaptim|odeme yaptik/;
const IN_VERB = /\b(odedi|yatirdi|gonderdi)\b/;

/**
 * Cümledeki ödeme fiilinin kişisinden para yönü; fiil yoksa ya da edilgense null. 3. kişide yönelme eki
 * varsa ("Boya'ya ödedi": biri Boya'ya ödemiş) giriş sayılmaz.
 */
export function verbDirection(text: string): 'in' | 'out' | null {
  const n = normalizeTr(text);
  if (OUT_VERB.test(n)) return 'out';
  if (IN_VERB.test(n) && !/['’]y?[ae]\b/.test(n)) return 'in';
  return null;
}

const KIND_PATTERNS: Array<[EntryKind, RegExp]> = [
  ['receivable', /fatura(si)? kes|satis faturasi|alacak kayd|fatura(yi)? gonderdim/],
  ['payable', /fatura(si)? geldi|alis faturasi|fatura(si)? ulasti|borc kayd|tahakkuk/],
  ['transfer', /virman|transfer|aktar(dim|ma)|hesaplar arasi/],
  // 1. kişi önce: "ödedim" içinde "ödedi" de geçer
  ['pay', OUT_VERB],
  ['collect', new RegExp(`tahsil|havale geldi|cek aldim|${IN_VERB.source}`)],
  ['pay', /odeme|odendi/],
  ['income', /\bgelir|faiz geliri|kazanc|satis\b/],
  ['expense', /gider|harcama|masraf|aldim|satin/],
];

const FILLER = /\b(yaptim|ettim|geldi|kestim|vade(si|li)?|son odeme( tarihi)?|tarihli|olarak|icin|ile|tutarinda|tutarli|tl|lira|dolar|euro|avro|sterlin|usd|eur|gbp|try|ya|ye|a|e)\b/g;

const DUE_MARKER = /(vade(si|li)?|son odeme( tarihi)?|odeme tarihi)\s*[:=]?\s*$/;

export function parseEntry(input: string, ctx: EntryContext): ParsedEntry {
  let remaining = input;
  const removed: Array<[number, number]> = [];
  let confidence = 0;

  // 1. Tarihler (en fazla üç ifade): "vade"/"son ödeme" ile başlayanlar vade tarihidir.
  let date: ISODate | undefined;
  let dueDate: ISODate | undefined;
  for (let i = 0; i < 3; i++) {
    const parsed = parseTurkishDate(remaining, ctx.today);
    if (!parsed) break;
    const idx = remaining.indexOf(parsed.match);
    const before = normalizeTr(remaining.slice(Math.max(0, idx - 22), idx));
    const isDue = DUE_MARKER.test(before);
    if (isDue) dueDate = parsed.date;
    else if (!date) date = parsed.date;
    remaining = remaining.slice(0, idx) + ' '.repeat(parsed.match.length) + remaining.slice(idx + parsed.match.length);
    confidence += 0.1;
  }

  // 2. Tutar
  const amountRe = /(?:[₺$€£]\s*)?\d[\d.,]*(?:\s*(?:milyar|milyon|bin|k)(?![\p{L}]))?(?:\s*(?:tl|try|lira|dolar|usd|euro|eur|avro|sterlin|gbp|₺|\$|€|£)(?![\p{L}]))?/giu;
  let amount: Money | null = null;
  let amountFragment = '';
  for (const m of remaining.matchAll(amountRe)) {
    const value = parseAmount(m[0]);
    if (value && value > 0) {
      amount = value;
      amountFragment = m[0];
      removed.push([m.index!, m.index! + m[0].length]);
      confidence += 0.4;
      break;
    }
  }
  const currency: CurrencyCode = detectCurrency(amountFragment) ?? detectCurrency(input) ?? 'TRY';

  const ws = words(remaining);
  const norm = normalizeTr(remaining);

  // 3. Cari, hesap, kategori
  const contact = bestMatch(ws, ctx.contacts, (c) => nameTokens(c.name));
  const account = bestMatch(ws, ctx.accounts, (a) => nameTokens(a.name));
  const category = bestMatch(ws, ctx.categories, (c) => c.keywords.map(normalizeTr));
  if (contact) {
    removed.push(...contact.spans);
    confidence += 0.2;
  }
  if (account) removed.push(...account.spans);
  if (category) {
    confidence += 0.1;
  }

  // 4. Tür
  let kind: EntryKind | undefined;
  for (const [k, re] of KIND_PATTERNS) {
    if (re.test(norm)) {
      kind = k;
      confidence += 0.2;
      break;
    }
  }
  if (kind === 'income' && contact && contact.item.kind !== 'supplier') kind = 'collect';
  if (kind === 'expense' && contact && contact.item.kind === 'supplier') kind = 'pay';
  // "kira ödemesi", "nakit tahsilat": cari adı yoksa cariye bağlı tür (tahsilat/ödeme) değil, gelir/gider
  if (!contact && kind === 'pay') kind = 'expense';
  if (!contact && kind === 'collect') kind = 'income';
  if (!kind) {
    if (contact) kind = contact.item.kind === 'supplier' ? 'pay' : 'collect';
    else if (category) kind = category.item.kind === 'income' ? 'income' : 'expense';
    else kind = 'expense';
  }

  // Hesap: açıkça yazılmadıysa para birimine uyan ilk hesap
  let accountId = account?.item.id;
  if (!accountId && currency !== 'TRY') accountId = ctx.accounts.find((a) => a.currency === currency)?.id;

  // 5. Açıklama: kalan anlamlı kelimeler
  let desc = remaining;
  for (const [s, e] of [...removed].sort((a, b) => b[0] - a[0])) desc = desc.slice(0, s) + ' '.repeat(e - s) + desc.slice(e);
  const descWords = words(desc)
    .filter((w) => !KIND_PATTERNS.some(([, re]) => re.test(w.norm)))
    .filter((w) => normalizeTr(w.raw).replace(FILLER, '').trim().length > 0)
    .filter((w) => !['son', 'tarihi'].includes(w.norm))
    .map((w) => w.raw.split(/['’]/)[0]!);
  let description = descWords.join(' ').replace(/\s+/g, ' ').trim();
  if (description) description = description[0]!.toLocaleUpperCase('tr-TR') + description.slice(1);

  const today = ctx.today;
  const isDoc = kind === 'receivable' || kind === 'payable';
  return {
    kind,
    amount,
    currency,
    date: isDoc ? today : (date ?? today),
    dueDate: isDoc ? (dueDate ?? date) : dueDate,
    contactId: contact?.item.id,
    categoryId: category?.item.id,
    accountId,
    description,
    confidence: Math.min(1, confidence),
  };
}

/** Sistem kategorileri için arama anahtar kelimeleri (kategori adına ek olarak). */
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  storefront: ['satış', 'satis', 'sipariş'],
  globe: ['ihracat', 'export'],
  handshake: ['hizmet', 'danışmanlık geliri'],
  percent: ['faiz', 'repo', 'mevduat'],
  package: ['hammadde', 'malzeme', 'kağıt', 'karton', 'mukavva'],
  // Eşleşmede en uzun anahtar kelime kazanır: "sgk prim" (8) > "maaş" — bu yüzden "prim" tek başına yok
  users: ['maaş', 'maas', 'personel', 'avans', 'bordro', 'maaş ödemesi'],
  bank: ['sgk', 'sgk prim', 'sgk primi', 'sosyal güvenlik', 'muhtasar', 'bağkur'],
  buildings: ['kira'],
  lightning: ['elektrik', 'doğalgaz', 'su faturası', 'enerji', 'enerjisa', 'igdaş', 'başkentgaz', 'ck enerji', 'aydem', 'iski', 'aski', 'izsu'],
  truck: ['nakliye', 'kargo', 'lojistik', 'navlun', 'yurtiçi kargo', 'aras kargo', 'mng kargo'],
  wrench: ['bakım', 'onarım', 'tamir', 'servis', 'makine'],
  receipt: ['kdv'],
  scales: ['vergi', 'harç', 'damga'],
  'credit-card': ['kredi', 'taksit', 'masraf', 'komisyon', 'faiz gideri', 'hesap işletim', 'işletim ücreti', 'eft ücreti', 'havale ücreti', 'bsmv', 'kart aidatı'],
  briefcase: ['müşavir', 'muhasebe', 'avukat', 'danışman'],
  car: ['yakıt', 'benzin', 'mazot', 'akaryakıt', 'otopark', 'köprü', 'otoyol', 'opet', 'shell', 'petrol ofisi', 'aytemiz', 'hgs', 'ogs', 'lastik'],
  'fork-knife': ['yemek', 'kahve', 'restoran', 'ikram', 'multinet', 'sodexo', 'ticket'],
  paperclip: ['kırtasiye', 'ofis', 'toner'],
  cloud: ['yazılım', 'abonelik', 'lisans', 'hosting', 'sunucu', 'telekom', 'turkcell', 'vodafone', 'superonline', 'türknet', 'gsm'],
  megaphone: ['reklam', 'pazarlama', 'google', 'instagram', 'fuar'],
  shield: ['sigorta', 'kasko', 'poliçe'],
};
