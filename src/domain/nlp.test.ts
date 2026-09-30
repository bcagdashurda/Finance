import { describe, expect, it } from 'vitest';
import { parseEntry, type EntryContext } from './nlp';

const ctx: EntryContext = {
  today: '2026-09-29',
  contacts: [
    { id: 'yildiz', name: 'Yıldız Gıda A.Ş.', kind: 'customer' },
    { id: 'kuzey', name: 'Kuzey Mobilya San. Tic.', kind: 'customer' },
    { id: 'ege', name: 'Ege Kâğıt Sanayi A.Ş.', kind: 'supplier' },
    { id: 'erdem', name: 'Erdem Gayrimenkul', kind: 'supplier' },
  ],
  categories: [
    { id: 'kira', name: 'Kira', kind: 'expense', keywords: ['kira'] },
    { id: 'yakit', name: 'Araç ve yakıt', kind: 'expense', keywords: ['yakıt', 'benzin', 'mazot', 'akaryakıt'] },
    { id: 'satis', name: 'Satış gelirleri', kind: 'income', keywords: ['satış'] },
    { id: 'yemek', name: 'Yemek ve temsil', kind: 'expense', keywords: ['yemek', 'kahve'] },
  ],
  accounts: [
    { id: 'garanti', name: 'Garanti BBVA Ticari', currency: 'TRY' },
    { id: 'kasa', name: 'Merkez kasa', currency: 'TRY' },
    { id: 'usd', name: 'Ziraat Bankası USD', currency: 'USD' },
  ],
};

describe('parseEntry', () => {
  it('reads a collection with contact, amount and date', () => {
    const d = parseEntry("Yıldız'dan 45 bin tahsilat 15 Ekim", ctx);
    expect(d).toMatchObject({ kind: 'collect', amount: 4_500_000, contactId: 'yildiz', date: '2026-10-15', currency: 'TRY' });
  });

  it('reads a payment to a supplier', () => {
    const d = parseEntry('Ege Kâğıt’a 120.000 TL ödeme yaptım', ctx);
    expect(d).toMatchObject({ kind: 'pay', amount: 12_000_000, contactId: 'ege', date: '2026-09-29' });
  });

  it('reads an expense with a keyword category and account', () => {
    const d = parseEntry('dün kasadan 2.350 lira yakıt', ctx);
    expect(d).toMatchObject({ kind: 'expense', amount: 235_000, categoryId: 'yakit', accountId: 'kasa', date: '2026-09-28' });
  });

  it('treats "fatura kestim" as a receivable document with a due date', () => {
    const d = parseEntry('Kuzey Mobilya’ya 180 bin fatura kestim vade 30 gün sonra', ctx);
    expect(d).toMatchObject({ kind: 'receivable', amount: 18_000_000, contactId: 'kuzey', dueDate: '2026-10-29' });
  });

  it('treats an incoming supplier invoice as a payable', () => {
    const d = parseEntry('Erdem Gayrimenkul kira faturası geldi 95 bin, son ödeme 5 Ekim', ctx);
    expect(d).toMatchObject({ kind: 'payable', amount: 9_500_000, contactId: 'erdem', dueDate: '2026-10-05', categoryId: 'kira' });
  });

  it('detects foreign currency and picks the matching account', () => {
    const d = parseEntry('500 dolar gelir', ctx);
    expect(d).toMatchObject({ kind: 'income', amount: 50_000, currency: 'USD', accountId: 'usd' });
  });

  it('keeps the unparsed words as the description', () => {
    const d = parseEntry('müşteri yemeği 1.850 TL', ctx);
    expect(d.description).toBe('Müşteri yemeği');
    expect(d.kind).toBe('expense');
    expect(d.categoryId).toBe('yemek');
  });

  it('treats "ödeme"/"tahsilat" without a named contact as expense/income (cari zorunlu türe düşmez)', () => {
    const rent = parseEntry('yarın 12 bin kira ödemesi', ctx);
    expect(rent).toMatchObject({ kind: 'expense', amount: 1_200_000, categoryId: 'kira', date: '2026-09-30' });
    const cash = parseEntry('5 bin nakit tahsilat', ctx);
    expect(cash.kind).toBe('income');
    // Cari adı varsa tahsilat/ödeme olarak kalır
    expect(parseEntry('Ege Kâğıt’a 120.000 TL ödeme yaptım', ctx).kind).toBe('pay');
  });

  it('returns a low-confidence draft when no amount is found', () => {
    const d = parseEntry('Yıldız Gıda', ctx);
    expect(d.amount).toBeNull();
    expect(d.confidence).toBeLessThan(0.5);
  });
});
