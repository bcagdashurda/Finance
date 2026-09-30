/**
 * Carileri Excel/CSV'den toplu aktarma: kolon tahmini, bakiye yönü (muhasebe "B/A" ekleri dahil),
 * alan doğrulama ve mükerrer tespiti. Saf fonksiyonlar; arayüz ImportContactsSheet'te.
 */
import { parseAmount, type Money } from './money';
import { normalizeTr } from './nlp';
import type { ContactKind } from './types';
import { isValidIban, isValidTaxId, normalizeIban } from './validators';
import type { Cell } from './statement';

export interface ContactMapping {
  name: number;
  kind?: number;
  taxId?: number;
  taxOffice?: number;
  phone?: number;
  email?: number;
  iban?: number;
  address?: number;
  termDays?: number;
  /** İşaretli ya da B/A ekli tek bakiye kolonu */
  balance?: number;
  /** Ayrı borç / alacak kolonları (bakiye = borç − alacak) */
  debit?: number;
  credit?: number;
}

// Sıra önemli: daha özgül desenler önce ("vergi dairesi" → taxOffice, "vergi no" → taxId)
const PATTERNS: Array<[keyof ContactMapping, RegExp]> = [
  ['taxOffice', /vergi dairesi|^v\.? ?d\.?$/],
  ['taxId', /vkn|tckn|vergi (no|numarasi|kimlik)|kimlik no|tax/],
  ['iban', /iban/],
  ['email', /e-?posta|e-?mail|^mail/],
  ['phone', /telefon|^tel|gsm|cep|phone/],
  ['address', /adres|address/],
  ['termDays', /vade/],
  ['balance', /bakiye|balance|devir/],
  ['debit', /^borc$|^borc tutari$|^debit$/],
  ['credit', /^alacak$|^alacak tutari$|^credit$/],
  ['kind', /^tip|tipi$|^tur$|turu$|grup|type|kategori/],
  ['name', /unvan|firma|isim|ad soyad|adi soyadi|^adi?$|cari ad|musteri ad|tedarikci ad|name|title/],
];

export function guessContactMapping(headers: string[]): ContactMapping | null {
  const out: Partial<ContactMapping> = {};
  headers.forEach((h, i) => {
    const n = normalizeTr(String(h ?? '')).trim();
    if (!n) return;
    for (const [key, re] of PATTERNS) {
      if (out[key] !== undefined) continue;
      if (re.test(n)) {
        out[key] = i;
        return;
      }
    }
  });
  // Ad kolonu bulunamadıysa "cari" geçen ama kod olmayan kolon
  if (out.name === undefined) {
    const i = headers.findIndex((h) => {
      const n = normalizeTr(String(h ?? ''));
      return n.includes('cari') && !n.includes('kod');
    });
    if (i >= 0) out.name = i;
  }
  if (out.name === undefined) return null;
  if (out.balance !== undefined) {
    delete out.debit;
    delete out.credit;
  }
  return out as ContactMapping;
}

/**
 * Başlık satırı: ilk 25 satırda en çok kolonu tanınan satır. Rapor başlıkları ("Cari Hesap Listesi")
 * tek kolon eşleştirir; gerçek başlık satırı birkaç kolon (ünvan, vergi no, bakiye…) eşleştirir.
 */
export function findContactHeader(rows: Cell[][]): number {
  let best = 0;
  let bestScore = 0;
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    const m = guessContactMapping(rows[i]!.map((c) => String(c ?? '')));
    const score = m ? Object.keys(m).length : 0;
    if (score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

/**
 * Bakiye hücresi → kuruş. Muhasebe çıktılarındaki ekler: "B" / "Borç" = cari bize borçlu (+),
 * "A" / "Alacak" = biz borçluyuz (−). Boş hücre 0; okunamayan metin null.
 */
export function parseBalanceCell(v: Cell): Money | null {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return Math.round(v * 100);
  let text = v.trim();
  if (!text) return 0;
  let sign = 0;
  const suffix = normalizeTr(text).match(/\s*\(?\s*(b|borc|a|alacak)\s*\)?\s*$/);
  if (suffix) {
    sign = suffix[1] === 'b' || suffix[1] === 'borc' ? 1 : -1;
    text = text.slice(0, text.length - suffix[0].length);
  }
  const value = parseAmount(text);
  if (value === null) return null;
  return sign ? sign * Math.abs(value) : value;
}

function parseKind(v: Cell, fallback: ContactKind): ContactKind {
  const n = normalizeTr(String(v ?? ''));
  if (!n) return fallback;
  const supplier = /tedarik|satici|saglayici|supplier|vendor/.test(n);
  const customer = /musteri|alici|customer|client/.test(n);
  if ((supplier && customer) || /ikisi|her iki|both/.test(n)) return 'both';
  if (supplier) return 'supplier';
  if (customer) return 'customer';
  return fallback;
}

export interface ContactImportItem {
  row: number;
  name: string;
  kind: ContactKind;
  taxId?: string;
  taxOffice?: string;
  phone?: string;
  email?: string;
  iban?: string;
  address?: string;
  paymentTermDays?: number;
  /** + bize borçlu, − biz borçluyuz */
  openingBalance: Money;
  /** Düzeltilen ya da atlanan alanlar (kullanıcıya gösterilir) */
  problems: string[];
  /** Dosyada tekrar eden ya da zaten kayıtlı cari */
  duplicate?: 'file' | 'existing';
}

const text = (v: Cell) => String(v ?? '').replace(/\s+/g, ' ').trim();
const key = (name: string) => normalizeTr(name).replace(/[^a-z0-9]/g, '');

export function normalizeContactRows(
  rows: Cell[][],
  m: ContactMapping,
  defaultKind: ContactKind,
  existing: Array<{ name: string; taxId?: string }>,
): { items: ContactImportItem[]; skipped: number } {
  const known = new Set(existing.map((c) => key(c.name)));
  const knownTax = new Set(existing.map((c) => c.taxId).filter(Boolean));
  const seen = new Map<string, ContactImportItem>();
  const items: ContactImportItem[] = [];
  let skipped = 0;
  rows.forEach((r, row) => {
    const name = text(r[m.name]);
    if (!name) {
      skipped++;
      return;
    }
    const problems: string[] = [];
    const item: ContactImportItem = { row, name, kind: m.kind !== undefined ? parseKind(r[m.kind], defaultKind) : defaultKind, openingBalance: 0, problems };

    if (m.taxId !== undefined) {
      const raw = text(r[m.taxId]).replace(/\D/g, '');
      if (raw) {
        if (isValidTaxId(raw)) item.taxId = raw;
        else problems.push(`VKN/TCKN geçersiz (${raw}); boş bırakıldı`);
      }
    }
    if (m.taxOffice !== undefined && text(r[m.taxOffice])) item.taxOffice = text(r[m.taxOffice]);
    if (m.phone !== undefined && text(r[m.phone])) item.phone = text(r[m.phone]);
    if (m.email !== undefined && text(r[m.email])) {
      const e = text(r[m.email]);
      if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) item.email = e;
      else problems.push(`E-posta geçersiz (${e}); boş bırakıldı`);
    }
    if (m.iban !== undefined && text(r[m.iban])) {
      const iban = normalizeIban(text(r[m.iban]));
      if (isValidIban(iban)) item.iban = iban;
      else problems.push('IBAN doğrulanamadı; boş bırakıldı');
    }
    if (m.address !== undefined && text(r[m.address])) item.address = text(r[m.address]);
    if (m.termDays !== undefined) {
      const d = Number(text(r[m.termDays]).replace(/\D/g, ''));
      if (d > 0 && d <= 365) item.paymentTermDays = d;
    }

    let balance: Money | null = 0;
    if (m.balance !== undefined) balance = parseBalanceCell(r[m.balance]);
    else if (m.debit !== undefined || m.credit !== undefined) {
      const debit = m.debit !== undefined ? parseBalanceCell(r[m.debit]) : 0;
      const credit = m.credit !== undefined ? parseBalanceCell(r[m.credit]) : 0;
      balance = debit === null || credit === null ? null : Math.abs(debit) - Math.abs(credit);
    }
    if (balance === null) problems.push('Bakiye okunamadı; 0 kabul edildi');
    item.openingBalance = balance ?? 0;

    const k = key(name);
    const first = seen.get(k);
    // Muhasebede aynı firma hem 120 (alıcı) hem 320 (satıcı) hesabında olur: tek cari, net bakiye
    if (first && !first.duplicate && first.kind !== item.kind && first.kind !== 'both' && item.kind !== 'both') {
      first.kind = 'both';
      first.openingBalance += item.openingBalance;
      for (const f of ['taxId', 'taxOffice', 'phone', 'email', 'iban', 'address', 'paymentTermDays'] as const) {
        if (first[f] === undefined && item[f] !== undefined) (first as unknown as Record<string, unknown>)[f] = item[f];
      }
      first.problems.push('Alıcı ve satıcı kayıtları birleştirildi (net bakiye)');
      return;
    }
    if (known.has(k) || (item.taxId && knownTax.has(item.taxId))) item.duplicate = 'existing';
    else if (first) item.duplicate = 'file';
    if (!first) seen.set(k, item);
    items.push(item);
  });
  return { items, skipped };
}
