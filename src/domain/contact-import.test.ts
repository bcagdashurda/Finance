import { describe, expect, it } from 'vitest';
import { findContactHeader, guessContactMapping, normalizeContactRows, parseBalanceCell } from './contact-import';

describe('guessContactMapping', () => {
  it('recognises typical Turkish accounting export headers', () => {
    const m = guessContactMapping(['Cari Kodu', 'Cari Ünvanı', 'Vergi No', 'Vergi Dairesi', 'Telefon', 'E-Posta', 'Bakiye', 'Tipi']);
    expect(m).toMatchObject({ name: 1, taxId: 2, taxOffice: 3, phone: 4, email: 5, balance: 6, kind: 7 });
  });

  it('uses separate Borç / Alacak columns when present', () => {
    const m = guessContactMapping(['Firma Adı', 'VKN/TCKN', 'Borç', 'Alacak']);
    expect(m).toMatchObject({ name: 0, taxId: 1, debit: 2, credit: 3 });
    expect(m?.balance).toBeUndefined();
  });

  it('returns null when there is no name-like column', () => {
    expect(guessContactMapping(['Tarih', 'Tutar'])).toBeNull();
  });
});

describe('findContactHeader', () => {
  it('skips report titles above the real header row (e.g. "Cari Hesap Listesi")', () => {
    const rows = [
      ['ATLAS TEKSTİL SAN. VE TİC. LTD. ŞTİ.', '', '', ''],
      ['Cari Hesap Listesi - 30.09.2026', '', '', ''],
      ['', '', '', ''],
      ['Cari Kodu', 'Cari Ünvanı', 'Vergi No', 'Bakiye'],
      ['120.01.001', 'Yıldız Gıda A.Ş.', '', '245.800,00 B'],
    ];
    expect(findContactHeader(rows)).toBe(3);
  });
});

describe('parseBalanceCell', () => {
  it('reads signed numbers and Turkish formatted amounts', () => {
    expect(parseBalanceCell('12.500,00')).toBe(1_250_000);
    expect(parseBalanceCell('-8.000')).toBe(-800_000);
    expect(parseBalanceCell(4500)).toBe(450_000);
    expect(parseBalanceCell('')).toBe(0);
  });

  it('reads accounting B/A suffixes: B = cari bize borçlu (+), A = biz borçluyuz (−)', () => {
    expect(parseBalanceCell('12.500,00 B')).toBe(1_250_000);
    expect(parseBalanceCell('7.250,50 (A)')).toBe(-725_050);
    expect(parseBalanceCell('3.000 Alacak')).toBe(-300_000);
    expect(parseBalanceCell('3.000 Borç')).toBe(300_000);
  });
});

describe('normalizeContactRows', () => {
  const rows = [
    ['C001', 'Yıldız Gıda A.Ş.', '12345', 'Kadıköy', '0532 111 22 33', 'muhasebe@yildiz.com', '12.500,00 B', 'Alıcı'],
    ['C002', 'Demir Kumaş Ltd.', '', '', '', '', '8.000 A', 'Satıcı'],
    ['C003', '', '', '', '', '', '', ''],
    ['C004', 'Mavi Tekstil', '', '', '', 'bozuk-eposta', '0', ''],
    ['C005', 'yıldız gıda a.ş.', '', '', '', '', '', 'Müşteri'],
  ];
  const m = guessContactMapping(['Cari Kodu', 'Cari Ünvanı', 'Vergi No', 'Vergi Dairesi', 'Telefon', 'E-Posta', 'Bakiye', 'Tipi'])!;

  it('builds contacts with kind, balance direction and cleaned fields', () => {
    const { items, skipped } = normalizeContactRows(rows, m, 'customer', []);
    expect(skipped).toBe(1); // adı boş satır
    const yildiz = items.find((i) => i.name === 'Yıldız Gıda A.Ş.')!;
    expect(yildiz).toMatchObject({ kind: 'customer', openingBalance: 1_250_000, phone: '0532 111 22 33', email: 'muhasebe@yildiz.com' });
    expect(items.find((i) => i.name === 'Demir Kumaş Ltd.')).toMatchObject({ kind: 'supplier', openingBalance: -800_000 });
  });

  it('flags invalid tax ids and e-mails instead of silently importing them', () => {
    const { items } = normalizeContactRows(rows, m, 'customer', []);
    const yildiz = items.find((i) => i.name === 'Yıldız Gıda A.Ş.')!;
    expect(yildiz.taxId).toBeUndefined(); // 5 hane: VKN de TCKN de olamaz
    expect(yildiz.problems.join(' ')).toMatch(/VKN/);
    const mavi = items.find((i) => i.name === 'Mavi Tekstil')!;
    expect(mavi.email).toBeUndefined();
    expect(mavi.problems.join(' ')).toMatch(/E-posta/);
  });

  it('merges the same firm listed both as customer (120) and supplier (320) into one "both" contact', () => {
    const r = [
      ['120.01.002', 'Kuzey Mobilya Ltd.', '', '', '', '', '512.300,00 B', 'Alıcı'],
      ['320.01.004', 'KUZEY MOBİLYA LTD.', '', '', '', '', '12.300,00 A', 'Satıcı'],
    ];
    const { items } = normalizeContactRows(r, m, 'customer', []);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ name: 'Kuzey Mobilya Ltd.', kind: 'both', openingBalance: 51_230_000 - 1_230_000 });
    expect(items[0]!.problems.join(' ')).toMatch(/birleştirildi/);
  });

  it('marks duplicates within the file and against existing contacts (Turkish-insensitive)', () => {
    const { items } = normalizeContactRows(rows, m, 'customer', [{ name: 'DEMİR KUMAŞ LTD.' }]);
    expect(items.find((i) => i.name === 'Demir Kumaş Ltd.')?.duplicate).toBe('existing');
    expect(items.find((i) => i.name === 'yıldız gıda a.ş.')?.duplicate).toBe('file');
    expect(items.find((i) => i.name === 'Yıldız Gıda A.Ş.')?.duplicate).toBeUndefined();
  });
});
