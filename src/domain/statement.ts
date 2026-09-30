/**
 * Banka ekstresi içe aktarma: tarih/tutar ayrıştırma, kolon tahmini,
 * mükerrer tespiti için hash, kural + anahtar kelime + cari eşleştirmeli kategori önerisi.
 */
import { makeDate, type ISODate } from './dates';
import { parseAmount, type Money } from './money';
import { normalizeTr } from './nlp';
import type { ID } from './types';

export type Cell = string | number | null | undefined;

export function parseDateCell(value: Cell): ISODate | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    // Excel seri tarihi (1899-12-30 tabanlı)
    if (value < 20000 || value > 80000) return null;
    const ms = Math.round((value - 25569) * 86_400_000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = value.trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return safeDate(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    return safeDate(y, Number(m[2]), Number(m[1]));
  }
  return null;
}

function safeDate(y: number, mo: number, d: number): ISODate | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 1990 || y > 2100) return null;
  const iso = makeDate(y, mo, d);
  return Number(iso.slice(8, 10)) === d ? iso : null;
}

export interface Mapping {
  date: number;
  description: number;
  amount?: number;
  debit?: number;
  credit?: number;
  balance?: number;
}

const HEADER_PATTERNS: Array<[keyof Mapping, RegExp]> = [
  ['balance', /bakiye|balance/],
  ['debit', /^borc$|borç|cikan|çıkan|gider|debit|harcama/],
  ['credit', /^alacak$|giren|gelen|credit|yatan/],
  ['amount', /tutar|miktar|amount|islem tutari/],
  ['description', /aciklama|açıklama|detay|islem$|description|karsi taraf|bilgi/],
  ['date', /tarih|date/],
];

/** Başlıklardan kolon eşlemesi tahmini. İlk "tarih" kolonu işlem tarihi sayılır (valör değil). */
export function guessMapping(headers: string[]): Mapping {
  const out: Partial<Mapping> = {};
  headers.forEach((h, i) => {
    const n = normalizeTr(h).trim();
    if (/valor|valör/.test(n)) return;
    for (const [key, re] of HEADER_PATTERNS) {
      if (out[key] !== undefined) continue;
      if (re.test(n) || re.test(h.toLocaleLowerCase('tr-TR'))) {
        out[key] = i;
        break;
      }
    }
  });
  if (out.amount !== undefined && (out.debit !== undefined || out.credit !== undefined)) {
    delete out.amount;
  }
  return { date: out.date ?? 0, description: out.description ?? 1, ...out } as Mapping;
}

export interface StatementItem {
  row: number;
  date: ISODate;
  description: string;
  /** İşaretli: + giriş, − çıkış */
  amount: Money;
}

function cellAmount(v: Cell): Money | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Math.round(v * 100);
  return parseAmount(v);
}

export function normalizeRows(rows: Cell[][], m: Mapping): { items: StatementItem[]; errors: Array<{ row: number; reason: string }> } {
  const items: StatementItem[] = [];
  const errors: Array<{ row: number; reason: string }> = [];
  rows.forEach((r, row) => {
    const date = parseDateCell(r[m.date]);
    if (!date) {
      errors.push({ row, reason: 'Tarih okunamadı' });
      return;
    }
    let amount: Money | null = null;
    if (m.amount !== undefined) amount = cellAmount(r[m.amount]);
    else {
      const debit = m.debit !== undefined ? cellAmount(r[m.debit]) : null;
      const credit = m.credit !== undefined ? cellAmount(r[m.credit]) : null;
      if (debit) amount = -Math.abs(debit);
      else if (credit) amount = Math.abs(credit);
    }
    if (!amount) {
      errors.push({ row, reason: 'Tutar okunamadı' });
      return;
    }
    const description = String(r[m.description] ?? '').replace(/\s+/g, ' ').trim();
    items.push({ row, date, description, amount });
  });
  return { items, errors };
}

/** FNV-1a — mükerrer satır tespiti için kararlı kısa hash. */
export function importHash(accountId: ID, date: ISODate, amount: Money, description: string): string {
  const s = `${accountId}|${date}|${amount}|${normalizeTr(description).replace(/\s+/g, ' ').trim()}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export interface SuggestContext {
  categories: Array<{ id: ID; kind: 'income' | 'expense'; keywords: string[] }>;
  contacts: Array<{ id: ID; name: string }>;
  rules: Array<{ pattern: string; categoryId?: ID; contactId?: ID }>;
}

export interface Suggestion {
  categoryId?: ID;
  contactId?: ID;
  confidence: number;
  source: 'rule' | 'contact' | 'keyword' | 'ai' | 'none';
}

const STOP = new Set(['a.s.', 'as', 'ltd', 'sti', 'san', 'tic', 've', 'sanayi', 'ticaret', 'limited', 'anonim', 'sirketi']);

/** Açıklamadan anlamlı kalıp (öğrenilen kural anahtarı): ilk iki anlamlı kelime. */
export function descriptionPattern(description: string): string {
  return normalizeTr(description)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !/^\d+$/.test(w) && !['eft', 'havale', 'gelen', 'giden', 'odeme', 'fast', 'pos', 'kart', 'no', 'ref'].includes(w))
    .slice(0, 2)
    .join(' ');
}

export function suggestCategory(description: string, amount: Money, ctx: SuggestContext): Suggestion {
  const text = normalizeTr(description);
  for (const r of ctx.rules) {
    if (r.pattern && text.includes(normalizeTr(r.pattern))) {
      return { categoryId: r.categoryId, contactId: r.contactId, confidence: 0.95, source: 'rule' };
    }
  }
  for (const c of ctx.contacts) {
    const tokens = normalizeTr(c.name)
      .split(/[\s.,]+/)
      .filter((t) => t.length >= 3 && !STOP.has(t));
    const hits = tokens.filter((t) => text.includes(t)).length;
    if (tokens.length && hits >= Math.min(2, tokens.length)) {
      return { contactId: c.id, confidence: 0.85, source: 'contact' };
    }
  }
  const kind = amount >= 0 ? 'income' : 'expense';
  let best: { id: ID; score: number } | null = null;
  for (const c of ctx.categories) {
    if (c.kind !== kind) continue;
    for (const k of c.keywords) {
      const nk = normalizeTr(k);
      if (nk.length >= 3 && text.includes(nk) && (!best || nk.length > best.score)) best = { id: c.id, score: nk.length };
    }
  }
  if (best) return { categoryId: best.id, confidence: 0.6, source: 'keyword' };
  return { confidence: 0, source: 'none' };
}
