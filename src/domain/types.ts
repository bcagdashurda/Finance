import type { ISODate, WeekendPolicy } from './dates';
import type { CurrencyCode, Money } from './money';

export type ID = string;

interface Base {
  id: ID;
  workspaceId: ID;
  createdAt: string;
  updatedAt: string;
}

export interface Workspace {
  id: ID;
  name: string;
  legalName?: string;
  taxId?: string;
  baseCurrency: CurrencyCode;
  fiscalYearStartMonth: number;
  createdAt: string;
  updatedAt: string;
}

export type AccountKind = 'bank' | 'cash' | 'card' | 'pos' | 'investment' | 'other';

export interface Account extends Base {
  name: string;
  kind: AccountKind;
  institution?: string;
  iban?: string;
  currency: CurrencyCode;
  openingBalance: Money;
  openingDate: ISODate;
  minBalance?: Money;
  creditLimit?: Money;
  color: string;
  archived: boolean;
  sortOrder: number;
}

export type CategoryKind = 'income' | 'expense';

export interface Category extends Base {
  name: string;
  kind: CategoryKind;
  parentId?: ID;
  color: string;
  icon: string;
  monthlyBudget?: Money;
  archived: boolean;
  system?: boolean;
}

export type ContactKind = 'customer' | 'supplier' | 'both' | 'other';

export interface Contact extends Base {
  name: string;
  kind: ContactKind;
  taxId?: string;
  taxOffice?: string;
  email?: string;
  phone?: string;
  iban?: string;
  address?: string;
  paymentTermDays?: number;
  riskLimit?: Money;
  currency: CurrencyCode;
  /** Devir bakiyesi. Pozitif: bize borçlu (alacağımız var). Negatif: biz borçluyuz. */
  openingBalance: Money;
  /**
   * Devir bakiyesinin geçerli olduğu gün. Bu tarihten önceki hareketler (ör. sonradan içe aktarılan
   * eski ekstre) devire zaten dahildir; bakiyeye ikinci kez eklenmez. Yoksa tüm geçmiş sayılır.
   */
  openingDate?: ISODate;
  tags: string[];
  notes?: string;
  archived: boolean;
}

export type TransactionKind = 'income' | 'expense' | 'transfer';
export type TransactionSource = 'manual' | 'import' | 'document' | 'recurring' | 'instrument' | 'ai' | 'demo';

export interface Transaction extends Base {
  kind: TransactionKind;
  date: ISODate;
  accountId: ID;
  /** Hesabın para biriminde, daima pozitif */
  amount: Money;
  currency: CurrencyCode;
  /** 1 birim = kaç baz para birimi (işlem anındaki kur) */
  rateToBase: number;
  toAccountId?: ID;
  /** Transferde karşı hesabın para biriminde tutar */
  toAmount?: Money;
  categoryId?: ID;
  contactId?: ID;
  /** Cari hesabı etkiler mi (tahsilat / ödeme) */
  affectsLedger: boolean;
  description: string;
  reference?: string;
  tags: string[];
  source: TransactionSource;
  recurringId?: ID;
  occurrenceDate?: ISODate;
  instrumentId?: ID;
  importHash?: string;
}

export type DocumentDirection = 'receivable' | 'payable';
export type VatRate = 0 | 1 | 10 | 20;

/** Alacak (satış faturası vb.) veya borç (alış faturası, vergi tahakkuku vb.) belgesi. */
export interface FinDocument extends Base {
  direction: DocumentDirection;
  contactId?: ID;
  categoryId?: ID;
  title: string;
  number?: string;
  issueDate: ISODate;
  dueDate: ISODate;
  /** KDV dahil brüt tutar, belge para biriminde */
  amount: Money;
  currency: CurrencyCode;
  rateToBase: number;
  vatRate?: VatRate;
  vatAmount?: Money;
  expectedAccountId?: ID;
  /** Tahsil olasılığı (0–100); yalnızca alacaklarda anlamlı */
  probability?: number;
  cancelled: boolean;
  notes?: string;
}

export interface Allocation {
  id: ID;
  workspaceId: ID;
  documentId: ID;
  transactionId?: ID;
  instrumentId?: ID;
  /** Belge para biriminde */
  amount: Money;
  date: ISODate;
  createdAt: string;
}

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'yearly';
export type RecurringTemplate = 'kdv' | 'muhtasar' | 'sgk' | 'gecici-vergi' | 'kira' | 'maas' | 'kredi' | 'abonelik';
export type FlowDirection = 'in' | 'out';

export interface RecurringRule extends Base {
  direction: FlowDirection;
  title: string;
  amount: Money;
  currency: CurrencyCode;
  accountId?: ID;
  categoryId?: ID;
  contactId?: ID;
  frequency: Frequency;
  interval: number;
  anchorDate: ISODate;
  endDate?: ISODate;
  weekendPolicy: WeekendPolicy;
  autoPost: boolean;
  active: boolean;
  template?: RecurringTemplate;
}

export type InstrumentKind = 'cheque' | 'note';
export type InstrumentDirection = 'received' | 'issued';
export type ReceivedStatus = 'portfolio' | 'deposited' | 'collected' | 'endorsed' | 'bounced' | 'returned';
export type IssuedStatus = 'issued' | 'paid' | 'bounced' | 'cancelled';
export type InstrumentStatus = ReceivedStatus | IssuedStatus;

export interface InstrumentEvent {
  status: InstrumentStatus;
  date: ISODate;
  note?: string;
  contactId?: ID;
  accountId?: ID;
}

export interface Instrument extends Base {
  kind: InstrumentKind;
  direction: InstrumentDirection;
  serialNo: string;
  bank?: string;
  branch?: string;
  drawer?: string;
  contactId: ID;
  amount: Money;
  currency: CurrencyCode;
  rateToBase: number;
  issueDate: ISODate;
  dueDate: ISODate;
  status: InstrumentStatus;
  history: InstrumentEvent[];
  accountId?: ID;
  /** Ciro edilen cari */
  endorsedToId?: ID;
}

export type TargetRef =
  | { kind: 'document'; id: ID }
  | { kind: 'instrument'; id: ID }
  | { kind: 'recurring'; id: ID };

export type Adjustment =
  | { id: ID; type: 'delay'; target: TargetRef; days: number; label?: string }
  | { id: ID; type: 'exclude'; target: TargetRef; label?: string }
  | { id: ID; type: 'oneOff'; direction: FlowDirection; amount: Money; date: ISODate; label: string }
  | {
      id: ID;
      type: 'recurring';
      direction: FlowDirection;
      amount: Money;
      frequency: Frequency;
      start: ISODate;
      end?: ISODate;
      label: string;
    }
  | { id: ID; type: 'scale'; direction: FlowDirection; percent: number; from?: ISODate; to?: ISODate; label?: string };

export interface Scenario extends Base {
  name: string;
  color: string;
  active: boolean;
  adjustments: Adjustment[];
}

export interface Rate {
  /** `${date}:${currency}` */
  id: string;
  date: ISODate;
  currency: CurrencyCode;
  /** 1 birim = kaç baz para birimi */
  perBase: number;
  source: 'ecb' | 'manual' | 'seed';
}

export interface CategorizationRule extends Base {
  pattern: string;
  categoryId?: ID;
  contactId?: ID;
  hits: number;
  source: 'user' | 'ai';
}

export interface Setting<T = unknown> {
  key: string;
  value: T;
}
