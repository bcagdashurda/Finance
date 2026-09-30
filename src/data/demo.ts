/**
 * Deterministik demo işletme: "Deniz Ambalaj San. ve Tic. Ltd. Şti." (İzmir, oluklu ambalaj).
 * 14 aylık geçmiş, gerçekçi müşteri ödeme davranışları, çek/senet portföyü, KDV,
 * maaş/SGK/kira tekrarları ve Ekim sonunda planlı bir nakit sıkışması üretir.
 * Saf fonksiyondur: aynı (bugün, tohum) için aynı veriyi döndürür.
 */
import {
  addDays,
  addMonths,
  adjustToBusinessDay,
  diffDays,
  endOfMonth,
  makeDate,
  monthKey,
  startOfMonth,
  type ISODate,
} from '@/domain/dates';
import { convertMinor, toMinor, type CurrencyCode, type Money } from '@/domain/money';
import { occurrences } from '@/domain/recurrence';
import { balancesByAccount, transactionEffect } from '@/domain/balances';
import { makeTrIban, makeVkn } from '@/domain/validators';
import type {
  Account,
  Allocation,
  Category,
  Contact,
  FinDocument,
  ID,
  Instrument,
  InstrumentEvent,
  Rate,
  RecurringRule,
  Scenario,
  Transaction,
  Workspace,
} from '@/domain/types';
import { DEFAULT_CATEGORIES } from './seed';

export interface DemoDataset {
  workspace: Workspace;
  accounts: Account[];
  categories: Category[];
  contacts: Contact[];
  transactions: Transaction[];
  documents: FinDocument[];
  allocations: Allocation[];
  recurring: RecurringRule[];
  instruments: Instrument[];
  scenarios: Scenario[];
  rates: Rate[];
  settings: { minCashBalance: Money };
}

// ---------------------------------------------------------------------------
// Deterministik rastgelelik

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

class Rng {
  private next: () => number;
  constructor(seed: number) {
    this.next = mulberry32(seed);
  }
  float(): number {
    return this.next();
  }
  between(min: number, max: number): number {
    return min + (max - min) * this.next();
  }
  int(min: number, max: number): number {
    return Math.floor(this.between(min, max + 1));
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)]!;
  }
  normal(mean: number, sd: number): number {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  /** Yuvarlak görünen tutar (ör. 184.250,00) */
  amount(minMajor: number, maxMajor: number, step = 50): Money {
    const major = Math.round(this.between(minMajor, maxMajor) / step) * step;
    return toMinor(major);
  }
}

// ---------------------------------------------------------------------------
// Profiller

interface CustomerProfile {
  key: string;
  name: string;
  termDays: number;
  invoicesPerMonth: [number, number];
  amount: [number, number];
  delayMean: number;
  delaySd: number;
  method: 'transfer' | 'cheque' | 'mixed';
  currency: CurrencyCode;
  category: string;
  city: string;
  phone: string;
  email: string;
  riskLimit?: number;
}

const CUSTOMERS: CustomerProfile[] = [
  { key: 'yildiz', name: 'Yıldız Gıda A.Ş.', termDays: 60, invoicesPerMonth: [2, 3], amount: [180_000, 420_000], delayMean: 3, delaySd: 4, method: 'cheque', currency: 'TRY', category: 'satis', city: 'Manisa', phone: '+90 236 555 14 20', email: 'finans@yildizgida.example', riskLimit: 1_500_000 },
  { key: 'ege', name: 'Ege Tarım Kooperatifi', termDays: 45, invoicesPerMonth: [1, 2], amount: [90_000, 250_000], delayMean: 12, delaySd: 8, method: 'transfer', currency: 'TRY', category: 'satis', city: 'Aydın', phone: '+90 256 555 32 11', email: 'muhasebe@egetarim.example' },
  { key: 'marmara', name: 'Marmara Kozmetik Ltd. Şti.', termDays: 30, invoicesPerMonth: [2, 4], amount: [60_000, 160_000], delayMean: 1, delaySd: 2, method: 'transfer', currency: 'TRY', category: 'satis', city: 'Kocaeli', phone: '+90 262 555 47 08', email: 'odemeler@marmarakozmetik.example' },
  { key: 'kuzey', name: 'Kuzey Mobilya San. Tic.', termDays: 60, invoicesPerMonth: [1, 2], amount: [120_000, 300_000], delayMean: 29, delaySd: 11, method: 'transfer', currency: 'TRY', category: 'satis', city: 'Bursa', phone: '+90 224 555 90 63', email: 'satinalma@kuzeymobilya.example', riskLimit: 600_000 },
  { key: 'akdeniz', name: 'Akdeniz Meyve İhracat A.Ş.', termDays: 30, invoicesPerMonth: [1, 2], amount: [4_000, 12_000], delayMean: 5, delaySd: 5, method: 'transfer', currency: 'USD', category: 'ihracat', city: 'Mersin', phone: '+90 324 555 21 77', email: 'finance@akdenizmeyve.example' },
  { key: 'bereket', name: 'Bereket Unlu Mamuller', termDays: 30, invoicesPerMonth: [1, 3], amount: [40_000, 110_000], delayMean: 7, delaySd: 6, method: 'mixed', currency: 'TRY', category: 'satis', city: 'İzmir', phone: '+90 232 555 63 40', email: 'bereket@unlumamul.example' },
  { key: 'toros', name: 'Toros Deterjan San. A.Ş.', termDays: 90, invoicesPerMonth: [1, 1], amount: [250_000, 560_000], delayMean: 8, delaySd: 9, method: 'cheque', currency: 'TRY', category: 'satis', city: 'Adana', phone: '+90 322 555 18 92', email: 'tedarik@torosdeterjan.example', riskLimit: 2_000_000 },
  { key: 'goksu', name: 'Göksu E-Ticaret', termDays: 15, invoicesPerMonth: [3, 5], amount: [15_000, 60_000], delayMean: 0, delaySd: 2, method: 'transfer', currency: 'TRY', category: 'satis', city: 'İstanbul', phone: '+90 216 555 70 35', email: 'hesap@goksu.example' },
  { key: 'kaya', name: 'Kaya Kuruyemiş', termDays: 30, invoicesPerMonth: [1, 2], amount: [35_000, 85_000], delayMean: 4, delaySd: 5, method: 'transfer', currency: 'TRY', category: 'satis', city: 'Gaziantep', phone: '+90 342 555 12 58', email: 'kaya@kuruyemis.example' },
];

interface SupplierProfile {
  key: string;
  name: string;
  termDays: number;
  every: number; // kaç ayda bir
  invoicesPerMonth: [number, number];
  amount: [number, number];
  category: string;
  chequeShare: number;
  phone: string;
}

const SUPPLIERS: SupplierProfile[] = [
  { key: 'egekagit', name: 'Ege Kâğıt Sanayi A.Ş.', termDays: 60, every: 1, invoicesPerMonth: [2, 2], amount: [380_000, 560_000], category: 'hammadde', chequeShare: 0.3, phone: '+90 232 555 88 10' },
  { key: 'boya', name: 'Boya Kimya Ltd. Şti.', termDays: 30, every: 1, invoicesPerMonth: [1, 1], amount: [60_000, 140_000], category: 'hammadde', chequeShare: 0, phone: '+90 232 555 41 29' },
  { key: 'aydin', name: 'Aydın Nakliyat', termDays: 30, every: 1, invoicesPerMonth: [1, 2], amount: [35_000, 80_000], category: 'lojistik', chequeShare: 0, phone: '+90 256 555 30 64' },
  { key: 'ozkan', name: 'Özkan Makine Servis', termDays: 30, every: 2, invoicesPerMonth: [1, 1], amount: [20_000, 70_000], category: 'bakim', chequeShare: 0, phone: '+90 232 555 57 93' },
  { key: 'liman', name: 'Liman Gümrük Müşavirliği', termDays: 15, every: 1, invoicesPerMonth: [1, 1], amount: [12_000, 18_000], category: 'danismanlik', chequeShare: 0, phone: '+90 232 555 26 51' },
];

// ---------------------------------------------------------------------------

export function generateDemo(todayISO: ISODate, seed = 20260929): DemoDataset {
  const rng = new Rng(seed);
  const T = todayISO;
  const start = startOfMonth(addMonths(T, -13));
  const stamp = new Date(`${T}T09:00:00.000Z`).toISOString();
  const wsId = 'demo-ws';
  let seq = 0;
  const id = (prefix: string): ID => `demo-${prefix}-${(++seq).toString(36)}`;
  const base = { workspaceId: wsId, createdAt: stamp, updatedAt: stamp };

  // Kurlar: TL her ay ~%1,1 değer kaybediyor.
  const usdAt = (d: ISODate) => 49 * Math.pow(1.011, diffDays(d, T) / 30.44);
  const rateFor = (currency: CurrencyCode, d: ISODate): number => {
    if (currency === 'TRY') return 1;
    const usd = usdAt(d);
    if (currency === 'USD') return Number(usd.toFixed(4));
    if (currency === 'EUR') return Number((usd * 1.137).toFixed(4));
    return Number((usd * 1.334).toFixed(4));
  };

  const workspace: Workspace = {
    id: wsId,
    name: 'Deniz Ambalaj',
    legalName: 'Deniz Ambalaj San. ve Tic. Ltd. Şti.',
    taxId: makeVkn('287304519'),
    baseCurrency: 'TRY',
    fiscalYearStartMonth: 1,
    createdAt: stamp,
    updatedAt: stamp,
  };

  // Kategoriler
  const categories: Category[] = DEFAULT_CATEGORIES.map((c) => ({
    ...base,
    id: `demo-cat-${c.key}`,
    name: c.name,
    kind: c.kind,
    color: c.color,
    icon: c.icon,
    archived: false,
    system: true,
  }));
  const cat = (key: string): ID => `demo-cat-${key}`;
  categories.find((c) => c.id === cat('hammadde'))!.monthlyBudget = toMinor(1_150_000);
  categories.find((c) => c.id === cat('enerji'))!.monthlyBudget = toMinor(75_000);
  categories.find((c) => c.id === cat('yemek'))!.monthlyBudget = toMinor(22_000);
  categories.find((c) => c.id === cat('arac'))!.monthlyBudget = toMinor(18_000);
  categories.find((c) => c.id === cat('pazarlama'))!.monthlyBudget = toMinor(30_000);

  // Hesaplar
  const mkAccount = (
    key: string,
    name: string,
    kind: Account['kind'],
    currency: CurrencyCode,
    color: string,
    extra: Partial<Account> = {},
  ): Account => ({
    ...base,
    id: `demo-acc-${key}`,
    name,
    kind,
    currency,
    openingBalance: 0,
    openingDate: start,
    color,
    archived: false,
    sortOrder: 0,
    ...extra,
  });
  const accounts: Account[] = [
    mkAccount('garanti', 'Garanti BBVA Ticari', 'bank', 'TRY', 'c1', {
      institution: 'Garanti BBVA',
      iban: makeTrIban('00062', '0001294700620847'),
      minBalance: toMinor(750_000),
      sortOrder: 1,
    }),
    mkAccount('is', 'İş Bankası Vadesiz', 'bank', 'TRY', 'c3', {
      institution: 'İş Bankası',
      iban: makeTrIban('00064', '0000011020437791'),
      sortOrder: 2,
    }),
    mkAccount('usd', 'Ziraat Bankası USD', 'bank', 'USD', 'c7', {
      institution: 'Ziraat Bankası',
      iban: makeTrIban('00010', '0000870341572006'),
      sortOrder: 3,
    }),
    mkAccount('kasa', 'Merkez kasa', 'cash', 'TRY', 'c4', { sortOrder: 4 }),
    mkAccount('kart', 'Şirket kredi kartı', 'card', 'TRY', 'c5', {
      institution: 'Garanti BBVA',
      creditLimit: toMinor(400_000),
      sortOrder: 5,
    }),
  ];
  const acc = (key: string): ID => `demo-acc-${key}`;
  const accById = new Map(accounts.map((a) => [a.id, a]));

  // Cariler
  const contacts: Contact[] = [];
  const contactId = new Map<string, ID>();
  CUSTOMERS.forEach((c, i) => {
    const cid = `demo-c-${c.key}`;
    contactId.set(c.key, cid);
    contacts.push({
      ...base,
      id: cid,
      name: c.name,
      kind: 'customer',
      taxId: makeVkn(String(410000000 + i * 7_919_311).slice(0, 9)),
      taxOffice: `${c.city} Vergi Dairesi`,
      email: c.email,
      phone: c.phone,
      address: c.city,
      paymentTermDays: c.termDays,
      riskLimit: c.riskLimit ? toMinor(c.riskLimit) : undefined,
      currency: c.currency,
      openingBalance: 0,
      tags: c.currency === 'USD' ? ['ihracat'] : [],
      archived: false,
    });
  });
  SUPPLIERS.forEach((s, i) => {
    const sid = `demo-s-${s.key}`;
    contactId.set(s.key, sid);
    contacts.push({
      ...base,
      id: sid,
      name: s.name,
      kind: 'supplier',
      taxId: makeVkn(String(530000000 + i * 3_571_117).slice(0, 9)),
      taxOffice: 'İzmir Vergi Dairesi',
      phone: s.phone,
      paymentTermDays: s.termDays,
      currency: 'TRY',
      openingBalance: 0,
      tags: [],
      archived: false,
    });
  });
  const extraContacts: Array<[string, string, Contact['kind']]> = [
    ['erdem', 'Erdem Gayrimenkul', 'supplier'],
    ['ozturk', 'Öztürk Mali Müşavirlik', 'supplier'],
  ];
  for (const [key, name, kind] of extraContacts) {
    const cid = `demo-s-${key}`;
    contactId.set(key, cid);
    contacts.push({ ...base, id: cid, name, kind, currency: 'TRY', openingBalance: 0, tags: [], archived: false });
  }
  const cid = (key: string): ID => contactId.get(key)!;

  const transactions: Transaction[] = [];
  const documents: FinDocument[] = [];
  const allocations: Allocation[] = [];
  const instruments: Instrument[] = [];

  const pushTx = (t: Omit<Transaction, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt' | 'tags' | 'source'> & Partial<Pick<Transaction, 'tags' | 'source'>>) => {
    const row: Transaction = { ...base, id: id('tx'), tags: [], source: 'demo', ...t };
    transactions.push(row);
    return row;
  };
  const allocate = (documentId: ID, amount: Money, date: ISODate, ref: { transactionId?: ID; instrumentId?: ID }) => {
    allocations.push({ id: id('al'), workspaceId: wsId, documentId, amount, date, createdAt: stamp, ...ref });
  };

  const vatOf = (gross: Money): Money => Math.round((gross * 20) / 120);
  const bizDay = (d: ISODate) => adjustToBusinessDay(d, 'next');
  let docNo = 1040;
  let chequeNo = 318_200;

  // ---------------------------------------------------------------------------
  // Satış faturaları ve tahsilatlar

  const receivedCheques: Instrument[] = [];

  // Dönem başından önceki 3 ayın faturaları "devreden" olarak üretilir; yalnızca
  // dönem içinde tahsil edilenler tutulur (açılış alacakları).
  for (const profile of CUSTOMERS) {
    for (let m = -3; m <= 13; m++) {
      const monthStart = addMonths(start, m);
      const monthEnd = endOfMonth(monthStart);
      const count = rng.int(...profile.invoicesPerMonth);
      for (let n = 0; n < count; n++) {
        const issueDate = bizDay(addDays(monthStart, rng.int(1, 26)));
        if (issueDate > T) continue;
        if (issueDate > monthEnd) continue;
        // Mevsimsellik: yaz ve yılsonu siparişleri daha yüksek
        const month = Number(issueDate.slice(5, 7));
        const season = [7, 8, 11, 12].includes(month) ? 1.18 : [1, 2].includes(month) ? 0.86 : 1;
        const gross = Math.round(rng.amount(profile.amount[0], profile.amount[1], profile.currency === 'USD' ? 10 : 50) * season);
        const dueDate = addDays(issueDate, profile.termDays);
        const delay = Math.max(-5, Math.round(rng.normal(profile.delayMean, profile.delaySd)));
        const payDate = bizDay(addDays(dueDate, delay));
        if (m < 0 && payDate < start) continue;
        const doc: FinDocument = {
          ...base,
          id: id('doc'),
          direction: 'receivable',
          contactId: cid(profile.key),
          categoryId: cat(profile.category),
          title: profile.currency === 'USD' ? 'İhracat faturası' : 'Satış faturası',
          number: `DNZ2026${String(++docNo).padStart(6, '0')}`,
          issueDate,
          dueDate,
          amount: gross,
          currency: profile.currency,
          rateToBase: rateFor(profile.currency, issueDate),
          vatRate: profile.currency === 'USD' ? 0 : 20,
          vatAmount: profile.currency === 'USD' ? 0 : vatOf(gross),
          expectedAccountId: profile.currency === 'USD' ? acc('usd') : acc('garanti'),
          cancelled: false,
        };
        documents.push(doc);
        if (payDate > T) continue;

        const useInstrument =
          profile.method === 'cheque' ? rng.chance(0.7) : profile.method === 'mixed' ? rng.chance(0.35) : false;

        if (useInstrument) {
          const kind = profile.method === 'mixed' ? 'note' : 'cheque';
          const insDue = bizDay(addDays(payDate, rng.int(30, 75)));
          const history: InstrumentEvent[] = [{ status: 'portfolio', date: payDate }];
          const ins: Instrument = {
            ...base,
            id: id('ins'),
            kind,
            direction: 'received',
            serialNo: kind === 'cheque' ? String(++chequeNo) : `SN-${++chequeNo}`,
            bank: kind === 'cheque' ? rng.pick(['Akbank', 'Yapı Kredi', 'Halkbank', 'VakıfBank', 'QNB']) : undefined,
            drawer: profile.name,
            contactId: cid(profile.key),
            amount: gross,
            currency: profile.currency,
            rateToBase: doc.rateToBase,
            issueDate: payDate,
            dueDate: insDue,
            status: 'portfolio',
            history,
          };
          instruments.push(ins);
          receivedCheques.push(ins);
          allocate(doc.id, gross, payDate, { instrumentId: ins.id });
          continue;
        }

        // Havale: %12 ihtimalle iki parça
        const target = profile.currency === 'USD' ? acc('usd') : rng.chance(0.72) ? acc('garanti') : acc('is');
        if (rng.chance(0.12)) {
          const first = Math.round((gross * rng.between(0.4, 0.7)) / 100) * 100;
          const t1 = pushTx({
            kind: 'income', date: payDate, accountId: target, amount: first, currency: profile.currency,
            rateToBase: rateFor(profile.currency, payDate), contactId: doc.contactId, categoryId: doc.categoryId,
            affectsLedger: true, description: `${doc.number} kısmi tahsilat`,
          });
          allocate(doc.id, first, payDate, { transactionId: t1.id });
          const secondDate = bizDay(addDays(payDate, rng.int(12, 28)));
          if (secondDate <= T) {
            const t2 = pushTx({
              kind: 'income', date: secondDate, accountId: target, amount: gross - first, currency: profile.currency,
              rateToBase: rateFor(profile.currency, secondDate), contactId: doc.contactId, categoryId: doc.categoryId,
              affectsLedger: true, description: `${doc.number} kalan tahsilat`,
            });
            allocate(doc.id, gross - first, secondDate, { transactionId: t2.id });
          }
        } else {
          const t = pushTx({
            kind: 'income', date: payDate, accountId: target, amount: gross, currency: profile.currency,
            rateToBase: rateFor(profile.currency, payDate), contactId: doc.contactId, categoryId: doc.categoryId,
            affectsLedger: true, description: `${doc.number} tahsilatı`,
          });
          allocate(doc.id, gross, payDate, { transactionId: t.id });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Alış faturaları ve ödemeler

  const payableDocs: FinDocument[] = [];
  const supplierPayDate = new Map<ID, ISODate>();
  for (const profile of SUPPLIERS) {
    for (let m = -3; m <= 13; m += profile.every) {
      const monthStart = addMonths(start, m);
      const count = rng.int(...profile.invoicesPerMonth);
      for (let n = 0; n < count; n++) {
        const issueDate = bizDay(addDays(monthStart, rng.int(2, 24)));
        if (issueDate > T) continue;
        const gross = rng.amount(profile.amount[0], profile.amount[1]);
        const payDate = bizDay(addDays(addDays(issueDate, profile.termDays), rng.int(0, 3)));
        if (m < 0 && payDate < start) continue;
        const doc: FinDocument = {
          ...base,
          id: id('doc'),
          direction: 'payable',
          contactId: cid(profile.key),
          categoryId: cat(profile.category),
          title: 'Alış faturası',
          number: `${profile.key.slice(0, 3).toUpperCase()}2026${String(rng.int(10000, 99999))}`,
          issueDate,
          dueDate: addDays(issueDate, profile.termDays),
          amount: gross,
          currency: 'TRY',
          rateToBase: 1,
          vatRate: 20,
          vatAmount: vatOf(gross),
          expectedAccountId: acc('garanti'),
          cancelled: false,
        };
        documents.push(doc);
        payableDocs.push(doc);
        supplierPayDate.set(doc.id, payDate);
      }
    }
  }

  // Ciro: vadesi uzak portföy çeklerinin bir kısmı Ege Kâğıt'a ciro edilir.
  const endorsable = receivedCheques
    .filter((c) => c.kind === 'cheque' && diffDays(c.dueDate, c.issueDate) > 40)
    .slice(0, 12)
    .filter((_, i) => i % 4 === 1);

  for (const doc of payableDocs.sort((a, b) => a.dueDate.localeCompare(b.dueDate))) {
    const profile = SUPPLIERS.find((s) => cid(s.key) === doc.contactId)!;
    const payDate = supplierPayDate.get(doc.id)!;
    if (payDate > T) continue;

    // Ciro ile ödeme
    const endorse = profile.key === 'egekagit' ? endorsable.find((c) => c.status === 'portfolio' && c.issueDate <= payDate && c.dueDate > payDate) : undefined;
    if (endorse) {
      endorse.status = 'endorsed';
      endorse.endorsedToId = doc.contactId;
      endorse.history.push({ status: 'endorsed', date: payDate, contactId: doc.contactId });
      const covered = Math.min(endorse.amount, doc.amount);
      allocate(doc.id, covered, payDate, { instrumentId: endorse.id });
      const rest = doc.amount - covered;
      if (rest > 0) {
        const t = pushTx({
          kind: 'expense', date: payDate, accountId: acc('garanti'), amount: rest, currency: 'TRY', rateToBase: 1,
          contactId: doc.contactId, categoryId: doc.categoryId, affectsLedger: true, description: `${doc.number} bakiye ödemesi`,
        });
        allocate(doc.id, rest, payDate, { transactionId: t.id });
      }
      continue;
    }

    if (rng.chance(profile.chequeShare)) {
      const insDue = bizDay(addDays(payDate, rng.int(30, 60)));
      const ins: Instrument = {
        ...base,
        id: id('ins'),
        kind: 'cheque',
        direction: 'issued',
        serialNo: String(705_100 + instruments.length),
        bank: 'Garanti BBVA',
        contactId: doc.contactId!,
        amount: doc.amount,
        currency: 'TRY',
        rateToBase: 1,
        issueDate: payDate,
        dueDate: insDue,
        status: 'issued',
        history: [{ status: 'issued', date: payDate }],
        accountId: acc('garanti'),
      };
      instruments.push(ins);
      allocate(doc.id, doc.amount, payDate, { instrumentId: ins.id });
      continue;
    }

    const account = rng.chance(0.8) ? acc('garanti') : acc('is');
    const t = pushTx({
      kind: 'expense', date: payDate, accountId: account, amount: doc.amount, currency: 'TRY', rateToBase: 1,
      contactId: doc.contactId, categoryId: doc.categoryId, affectsLedger: true, description: `${doc.number} ödemesi`,
    });
    allocate(doc.id, doc.amount, payDate, { transactionId: t.id });
  }

  // Çek yaşam döngüsü: vadesi gelenler tahsil / ödenir; biri karşılıksız.
  let bouncedOne = false;
  for (const ins of instruments) {
    if (ins.dueDate > T) continue;
    if (ins.direction === 'received' && ins.status === 'portfolio') {
      const depositDate = adjustToBusinessDay(addDays(ins.dueDate, -5), 'previous');
      if (!bouncedOne && ins.contactId === cid('bereket') && ins.kind === 'note' && diffDays(T, ins.dueDate) > 45) {
        bouncedOne = true;
        ins.status = 'bounced';
        ins.history.push({ status: 'bounced', date: ins.dueDate, note: 'Vadesinde ödenmedi, protesto edildi' });
        // Karşılıksız: tahsis geri alınır, müşteri 3 hafta sonra havale ile öder.
        const al = allocations.find((a) => a.instrumentId === ins.id);
        if (al) {
          allocations.splice(allocations.indexOf(al), 1);
          const lateDate = bizDay(addDays(ins.dueDate, 21));
          const t = pushTx({
            kind: 'income', date: lateDate, accountId: acc('garanti'), amount: ins.amount, currency: 'TRY', rateToBase: 1,
            contactId: ins.contactId, categoryId: cat('satis'), affectsLedger: true, description: 'Protestolu senet bedeli havalesi',
          });
          allocate(al.documentId, ins.amount, lateDate, { transactionId: t.id });
        }
        continue;
      }
      ins.status = 'collected';
      ins.accountId = acc('garanti');
      ins.history.push({ status: 'deposited', date: depositDate, accountId: acc('garanti') });
      ins.history.push({ status: 'collected', date: bizDay(ins.dueDate), accountId: acc('garanti') });
      pushTx({
        kind: 'income', date: bizDay(ins.dueDate), accountId: acc('garanti'), amount: ins.amount, currency: ins.currency,
        rateToBase: 1, contactId: ins.contactId, categoryId: cat('satis'), affectsLedger: false,
        description: `${ins.kind === 'cheque' ? 'Çek' : 'Senet'} tahsilatı · ${ins.serialNo}`, source: 'demo', instrumentId: ins.id,
      });
    } else if (ins.direction === 'issued' && ins.status === 'issued') {
      ins.status = 'paid';
      ins.history.push({ status: 'paid', date: bizDay(ins.dueDate), accountId: acc('garanti') });
      pushTx({
        kind: 'expense', date: bizDay(ins.dueDate), accountId: acc('garanti'), amount: ins.amount, currency: 'TRY', rateToBase: 1,
        contactId: ins.contactId, categoryId: cat('hammadde'), affectsLedger: false,
        description: `Çek ödemesi · ${ins.serialNo}`, instrumentId: ins.id,
      });
    } else if (ins.direction === 'received' && ins.status === 'endorsed') {
      // Ciro edilen çekin vadesi geçti; bizim açımızdan iş kapandı.
    }
  }
  // Tahsile verilmiş ama vadesi yaklaşan portföy çekleri
  for (const ins of instruments) {
    if (ins.direction === 'received' && ins.status === 'portfolio' && diffDays(ins.dueDate, T) <= 6) {
      ins.status = 'deposited';
      ins.accountId = acc('garanti');
      ins.history.push({ status: 'deposited', date: adjustToBusinessDay(addDays(T, -1), 'previous'), accountId: acc('garanti') });
    }
  }

  // ---------------------------------------------------------------------------
  // Tekrarlayan yükümlülükler

  const mkRule = (r: Omit<RecurringRule, 'id' | 'workspaceId' | 'createdAt' | 'updatedAt'>): RecurringRule => ({
    ...base,
    id: id('rule'),
    ...r,
  });
  const recurring: RecurringRule[] = [
    mkRule({ direction: 'out', title: 'Fabrika kirası', amount: toMinor(95_000), currency: 'TRY', accountId: acc('garanti'), categoryId: cat('kira'), contactId: cid('erdem'), frequency: 'monthly', interval: 1, anchorDate: makeDate(Number(start.slice(0, 4)), Number(start.slice(5, 7)), 5), weekendPolicy: 'next', autoPost: false, active: true, template: 'kira' }),
    mkRule({ direction: 'out', title: 'Personel maaşları', amount: toMinor(780_000), currency: 'TRY', accountId: acc('garanti'), categoryId: cat('maas'), frequency: 'monthly', interval: 1, anchorDate: '2025-01-31', weekendPolicy: 'previous', autoPost: false, active: true, template: 'maas' }),
    mkRule({ direction: 'out', title: 'Muhtasar ve SGK primleri', amount: toMinor(430_000), currency: 'TRY', accountId: acc('garanti'), categoryId: cat('sgk'), frequency: 'monthly', interval: 1, anchorDate: '2025-01-26', weekendPolicy: 'next', autoPost: false, active: true, template: 'muhtasar' }),
    mkRule({ direction: 'out', title: 'İşletme kredisi taksiti', amount: toMinor(145_000), currency: 'TRY', accountId: acc('is'), categoryId: cat('finansman'), frequency: 'monthly', interval: 1, anchorDate: '2025-06-15', endDate: addMonths(T, 9), weekendPolicy: 'next', autoPost: true, active: true, template: 'kredi' }),
    mkRule({ direction: 'out', title: 'Mali müşavirlik ücreti', amount: toMinor(18_000), currency: 'TRY', accountId: acc('is'), categoryId: cat('danismanlik'), contactId: cid('ozturk'), frequency: 'monthly', interval: 1, anchorDate: '2025-01-10', weekendPolicy: 'next', autoPost: false, active: true }),
    mkRule({ direction: 'out', title: 'Yazılım abonelikleri', amount: toMinor(4_650), currency: 'TRY', accountId: acc('kart'), categoryId: cat('yazilim'), frequency: 'monthly', interval: 1, anchorDate: '2025-01-03', weekendPolicy: 'none', autoPost: true, active: true, template: 'abonelik' }),
    mkRule({ direction: 'out', title: 'Geçici vergi', amount: toMinor(186_000), currency: 'TRY', accountId: acc('garanti'), categoryId: cat('vergi'), frequency: 'quarterly', interval: 1, anchorDate: '2025-02-17', weekendPolicy: 'next', autoPost: false, active: true, template: 'gecici-vergi' }),
    mkRule({ direction: 'out', title: 'Fabrika sigortası', amount: toMinor(38_400), currency: 'TRY', accountId: acc('garanti'), categoryId: cat('sigorta'), frequency: 'quarterly', interval: 1, anchorDate: '2025-03-20', weekendPolicy: 'next', autoPost: false, active: true }),
  ];

  // Geçmiş oluşumlar gerçekleşmiş işlem olarak yazılır (maaşta küçük dalgalanma).
  for (const r of recurring) {
    for (const occ of occurrences(r, start, T)) {
      if (occ.date > T) continue;
      // Bu ayın muhtasarı henüz ödenmediyse (bugün 26'dan önce) atla
      let amount = r.amount;
      if (r.template === 'maas') amount = Math.round(r.amount * rng.between(0.97, 1.04) / 100) * 100;
      if (r.template === 'muhtasar') amount = Math.round(r.amount * rng.between(0.96, 1.05) / 100) * 100;
      pushTx({
        kind: 'expense', date: occ.date, accountId: r.accountId!, amount, currency: r.currency, rateToBase: 1,
        contactId: r.contactId, categoryId: r.categoryId, affectsLedger: false, description: r.title,
        recurringId: r.id, occurrenceDate: occ.nominal, source: 'recurring',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // KDV: ay içi hesaplanan − indirilecek, izleyen ayın 28'inde ödenir.
  let carry = 0;
  for (let m = 0; m <= 13; m++) {
    const monthStart = addMonths(start, m);
    const key = monthKey(monthStart);
    const out = documents
      .filter((d) => d.direction === 'receivable' && monthKey(d.issueDate) === key)
      .reduce((s, d) => s + convertMinor(d.vatAmount ?? 0, d.rateToBase, 1), 0);
    const inn = documents
      .filter((d) => d.direction === 'payable' && monthKey(d.issueDate) === key)
      .reduce((s, d) => s + (d.vatAmount ?? 0), 0);
    const payable = out - inn - carry;
    const payDate = adjustToBusinessDay(makeDate(Number(key.slice(0, 4)), Number(key.slice(5, 7)), 28), 'none');
    const due = bizDay(addMonths(payDate, 1));
    if (payable <= 0) {
      carry = -payable;
      continue;
    }
    carry = 0;
    if (due > T) continue;
    pushTx({
      kind: 'expense', date: due, accountId: acc('garanti'), amount: Math.round(payable / 100) * 100, currency: 'TRY',
      rateToBase: 1, categoryId: cat('kdv'), affectsLedger: false, description: `KDV ödemesi · ${key}`,
    });
  }

  // ---------------------------------------------------------------------------
  // Doğrudan giderler / gelirler

  for (let m = 0; m <= 13; m++) {
    const monthStart = addMonths(start, m);
    const month = Number(monthStart.slice(5, 7));
    const winter = [12, 1, 2, 3].includes(month);
    const inMonth = (d: ISODate) => d <= T && d <= endOfMonth(monthStart);

    const energyDate = bizDay(addDays(monthStart, 19));
    if (inMonth(energyDate)) {
      pushTx({ kind: 'expense', date: energyDate, accountId: acc('garanti'), amount: rng.amount(winter ? 72_000 : 48_000, winter ? 96_000 : 66_000, 10), currency: 'TRY', rateToBase: 1, categoryId: cat('enerji'), affectsLedger: false, description: 'Elektrik faturası' });
    }
    const gasDate = bizDay(addDays(monthStart, 22));
    if (winter && inMonth(gasDate)) {
      pushTx({ kind: 'expense', date: gasDate, accountId: acc('garanti'), amount: rng.amount(18_000, 34_000, 10), currency: 'TRY', rateToBase: 1, categoryId: cat('enerji'), affectsLedger: false, description: 'Doğalgaz faturası' });
    }

    let cardSpend = 0;
    const cardTx = (desc: string, category: string, min: number, max: number) => {
      const d = addDays(monthStart, rng.int(0, 27));
      if (!inMonth(d)) return;
      const amount = rng.amount(min, max, 5);
      cardSpend += amount;
      pushTx({ kind: 'expense', date: d, accountId: acc('kart'), amount, currency: 'TRY', rateToBase: 1, categoryId: cat(category), affectsLedger: false, description: desc });
    };
    for (let i = rng.int(4, 6); i > 0; i--) cardTx(rng.pick(['Opet akaryakıt', 'Shell akaryakıt', 'BP akaryakıt']), 'arac', 1_800, 4_600);
    for (let i = rng.int(8, 14); i > 0; i--) cardTx(rng.pick(['Müşteri yemeği', 'Personel yemek', 'Kahve ve ikram', 'İş yemeği']), 'yemek', 450, 3_400);
    for (let i = rng.int(1, 3); i > 0; i--) cardTx(rng.pick(['Kırtasiye alımı', 'Toner ve kartuş', 'Ofis malzemesi']), 'ofis', 600, 4_200);
    if (rng.chance(0.45)) cardTx(rng.pick(['LinkedIn reklamı', 'Google Ads', 'Fuar standı ön ödeme', 'Katalog baskısı']), 'pazarlama', 8_000, 42_000);

    // Kredi kartı ekstre ödemesi (ayın 12'si, önceki ay harcaması)
    const cardPay = bizDay(addDays(monthStart, 11));
    if (m > 0 && inMonth(cardPay)) {
      const prevMonth = monthKey(addMonths(monthStart, -1));
      const prevSpend = transactions
        .filter((t) => t.accountId === acc('kart') && t.kind === 'expense' && monthKey(t.date) === prevMonth)
        .reduce((s, t) => s + t.amount, 0);
      if (prevSpend > 0) {
        pushTx({ kind: 'transfer', date: cardPay, accountId: acc('garanti'), toAccountId: acc('kart'), amount: prevSpend, toAmount: prevSpend, currency: 'TRY', rateToBase: 1, affectsLedger: false, description: 'Kredi kartı ekstre ödemesi' });
      }
    }
    void cardSpend;

    // Banka masrafları
    for (const [account, label] of [[acc('garanti'), 'EFT/havale masrafları'], [acc('is'), 'Hesap işletim ücreti']] as const) {
      const d = bizDay(addDays(monthStart, 27));
      if (inMonth(d)) pushTx({ kind: 'expense', date: d, accountId: account, amount: rng.amount(180, 1_400, 5), currency: 'TRY', rateToBase: 1, categoryId: cat('finansman'), affectsLedger: false, description: label });
    }
    // Gecelik faiz geliri
    const interestDate = endOfMonth(monthStart);
    if (interestDate <= T) pushTx({ kind: 'income', date: adjustToBusinessDay(interestDate, 'previous'), accountId: acc('is'), amount: rng.amount(4_000, 13_000, 1), currency: 'TRY', rateToBase: 1, categoryId: cat('faiz'), affectsLedger: false, description: 'Gecelik repo faiz getirisi' });

    // Peşin satışlar kasaya, ay sonunda bankaya yatırılır
    let cash = 0;
    for (let w = 0; w < 4; w++) {
      const d = addDays(monthStart, w * 7 + rng.int(0, 4));
      if (!inMonth(d)) continue;
      const amount = rng.amount(3_000, 14_000, 10);
      cash += amount;
      pushTx({ kind: 'income', date: d, accountId: acc('kasa'), amount, currency: 'TRY', rateToBase: 1, categoryId: cat('satis'), affectsLedger: false, description: 'Peşin satış (perakende)' });
    }
    const deposit = adjustToBusinessDay(endOfMonth(monthStart), 'previous');
    if (cash > 20_000_00 && deposit <= T) {
      const amount = Math.floor((cash * 0.8) / 100_000) * 100_000;
      pushTx({ kind: 'transfer', date: deposit, accountId: acc('kasa'), toAccountId: acc('garanti'), amount, toAmount: amount, currency: 'TRY', rateToBase: 1, affectsLedger: false, description: 'Kasadan bankaya para yatırma' });
    }
  }

  // Döviz bozdurma: USD hesabı 14.000$'ı aşınca 10.000$ TL'ye çevrilir.
  transactions.sort((a, b) => a.date.localeCompare(b.date));
  {
    const usdAcc = accById.get(acc('usd'))!;
    let running = 0;
    const conversions: Transaction[] = [];
    for (const t of transactions) {
      running += transactionEffect(t, usdAcc.id);
      if (running > toMinor(14_000)) {
        const amount = toMinor(10_000);
        const d = bizDay(addDays(t.date, 2));
        if (d > T) break;
        const rate = rateFor('USD', d);
        conversions.push({
          ...base, id: id('tx'), kind: 'transfer', date: d, accountId: usdAcc.id, toAccountId: acc('garanti'), amount,
          toAmount: convertMinor(amount, rate, 1), currency: 'USD', rateToBase: rate, affectsLedger: false,
          description: 'Döviz bozdurma USD → TL', tags: [], source: 'demo',
        });
        running -= amount;
      }
    }
    transactions.push(...conversions);
  }

  // Hesap arası dengeleme: İş Bankası'nda biriken fazlanın Garanti'ye aktarımı
  for (let m = 1; m <= 13; m += 2) {
    const d = bizDay(addDays(addMonths(start, m), 3));
    if (d > T) continue;
    transactions.push({
      ...base, id: id('tx'), kind: 'transfer', date: d, accountId: acc('is'), toAccountId: acc('garanti'),
      amount: toMinor(250_000), toAmount: toMinor(250_000), currency: 'TRY', rateToBase: 1, affectsLedger: false,
      description: 'Hesaplar arası virman', tags: [], source: 'demo',
    });
  }

  // ---------------------------------------------------------------------------
  // Gelecek planları: yatırım taksiti (sıkışmayı yaratır), olasılıklı sipariş
  const machineDue = bizDay(addDays(T, 22));
  documents.push({
    ...base, id: id('doc'), direction: 'payable', contactId: cid('ozkan'), categoryId: cat('bakim'),
    title: 'Oluklu mukavva hattı — 1. taksit', number: 'OZK-YATIRIM-01', issueDate: addDays(T, -12), dueDate: machineDue,
    amount: toMinor(1_280_000), currency: 'TRY', rateToBase: 1, vatRate: 20, vatAmount: vatOf(toMinor(1_280_000)),
    expectedAccountId: acc('garanti'), cancelled: false, notes: 'Makine yatırımı; 3 taksidin ilki',
  });
  documents.push({
    ...base, id: id('doc'), direction: 'payable', contactId: cid('ozkan'), categoryId: cat('bakim'),
    title: 'Oluklu mukavva hattı — 2. taksit', number: 'OZK-YATIRIM-02', issueDate: addDays(T, -12), dueDate: bizDay(addDays(machineDue, 60)),
    amount: toMinor(1_280_000), currency: 'TRY', rateToBase: 1, vatRate: 20, vatAmount: vatOf(toMinor(1_280_000)),
    expectedAccountId: acc('garanti'), cancelled: false,
  });
  documents.push({
    ...base, id: id('doc'), direction: 'receivable', contactId: cid('toros'), categoryId: cat('satis'),
    title: 'Kasım sezon siparişi (teyit bekliyor)', number: 'TEKLIF-2026-118', issueDate: addDays(T, 14), dueDate: addDays(T, 74),
    amount: toMinor(740_000), currency: 'TRY', rateToBase: 1, vatRate: 20, vatAmount: vatOf(toMinor(740_000)),
    expectedAccountId: acc('garanti'), probability: 60, cancelled: false, notes: 'Satınalma onayı bekleniyor',
  });

  // ---------------------------------------------------------------------------
  // Açılış bakiyeleri: hiçbir banka/kasa hesabı geçmişte eksiye düşmesin.
  transactions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const openingTargets: Record<string, number> = {
    [acc('garanti')]: toMinor(1_400_000),
    [acc('is')]: toMinor(420_000),
    [acc('usd')]: toMinor(3_500),
    [acc('kasa')]: toMinor(40_000),
    [acc('kart')]: 0,
  };
  for (const a of accounts) {
    if (a.kind === 'card') continue;
    let running = 0;
    let min = 0;
    for (const t of transactions) {
      running += transactionEffect(t, a.id);
      if (running < min) min = running;
    }
    const buffer = a.minBalance ?? (a.currency === 'USD' ? toMinor(1_000) : toMinor(60_000));
    a.openingBalance = Math.max(openingTargets[a.id] ?? 0, -min + buffer);
  }

  // ---------------------------------------------------------------------------
  // Kur tablosu: son 14 ay, haftalık
  const rates: Rate[] = [];
  for (let d = start; d <= T; d = addDays(d, 7)) {
    for (const c of ['USD', 'EUR', 'GBP'] as const) {
      rates.push({ id: `${d}:${c}`, date: d, currency: c, perBase: rateFor(c, d), source: 'seed' });
    }
  }
  for (const c of ['USD', 'EUR', 'GBP'] as const) {
    rates.push({ id: `${T}:${c}`, date: T, currency: c, perBase: rateFor(c, T), source: 'seed' });
  }

  // Örnek senaryolar
  const kuzeyOpen = documents
    .filter((d) => d.contactId === cid('kuzey') && d.direction === 'receivable' && d.dueDate > addDays(T, -60))
    .sort((a, b) => b.amount - a.amount)[0];
  const scenarios: Scenario[] = [
    {
      ...base,
      id: id('scn'),
      name: 'Kuzey Mobilya 30 gün daha geciktirirse',
      color: 'c7',
      active: false,
      adjustments: kuzeyOpen
        ? [{ id: id('adj'), type: 'delay', target: { kind: 'document', id: kuzeyOpen.id }, days: 30, label: kuzeyOpen.number }]
        : [],
    },
    {
      ...base,
      id: id('scn'),
      name: 'Kasım\'dan itibaren 2 yeni operatör',
      color: 'c5',
      active: false,
      adjustments: [
        { id: id('adj'), type: 'recurring', direction: 'out', amount: toMinor(118_000), frequency: 'monthly', start: endOfMonth(addMonths(T, 1)), label: 'Ek personel maliyeti' },
      ],
    },
  ];

  // Sanity: bakiyeler
  void balancesByAccount;

  return {
    workspace,
    accounts,
    categories,
    contacts,
    transactions,
    documents,
    allocations,
    recurring,
    instruments,
    scenarios,
    rates,
    settings: { minCashBalance: toMinor(4_500_000) },
  };
}
