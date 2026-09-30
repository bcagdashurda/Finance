import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/data/db';
import { setActiveWorkspace } from '@/data/repo';
import { SETTINGS_KEYS } from '@/data/load';
import { balancesByAccount, totalInBase, totalsByCurrency, type RateTable } from '@/domain/balances';
import { documentStatus, indexAllocations, type DocumentState } from '@/domain/documents';
import { contactBalances } from '@/domain/ledger';
import { today as todayISO, type ISODate } from '@/domain/dates';
import { overallBehavior, paymentBehavior, type PaymentBehavior } from '@/domain/behavior';
import { estimateVat, type VatPeriod } from '@/domain/vat';
import { buildForecast, type ForecastInput, type ForecastResult } from '@/domain/forecast';
import { computeRunRate, type RunRate } from '@/domain/runrate';
import { DEFAULT_AI, type AiConfig } from '@/ai/config';
import type { CloudConfig } from '@/cloud/store';

/**
 * Yapay zekâ ayarı: Ayarlar'dan girilen anahtar önceliklidir. Anahtar boşsa ve
 * .env dosyasında VITE_GROQ_API_KEY varsa o kullanılır (dosyaya yazmak açık onay sayılır).
 */
function resolveAiConfig(stored: Partial<AiConfig> | undefined): AiConfig {
  const cfg: AiConfig = { ...DEFAULT_AI, ...(stored ?? {}) };
  const envKey = (import.meta.env.VITE_GROQ_API_KEY as string | undefined)?.trim();
  if (!cfg.apiKey && envKey) {
    return { ...cfg, apiKey: envKey, enabled: stored?.enabled ?? true, consentAt: cfg.consentAt ?? 'env' };
  }
  return cfg;
}
import type { CurrencyCode, Money } from '@/domain/money';
import type {
  Account,
  Allocation,
  CategorizationRule,
  Category,
  Contact,
  FinDocument,
  ID,
  Instrument,
  RecurringRule,
  Scenario,
  Transaction,
  Workspace,
} from '@/domain/types';

export interface FinanceSnapshot {
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
  rules: CategorizationRule[];
  rates: RateTable;
  ratesDate: ISODate | null;
  settings: {
    minCashBalance: Money;
    isDemo: boolean;
    /** Tempo tahmini projeksiyona dahil mi */
    tempo: boolean;
    ai: AiConfig;
    lock: { pinHash: string; salt: string } | null;
    lastBackupAt: string | null;
    cloud: CloudConfig | null;
  };
}

export interface FinanceDerived {
  today: ISODate;
  balances: Map<ID, Money>;
  totalBase: Money;
  byCurrency: Map<CurrencyCode, Money>;
  allocationIndex: Map<ID, Allocation[]>;
  docStates: Map<ID, DocumentState>;
  contactBalances: Map<ID, Money>;
  accountsById: Map<ID, Account>;
  categoriesById: Map<ID, Category>;
  contactsById: Map<ID, Contact>;
  /** Tarihe göre azalan sıralı işlemler */
  transactionsDesc: Transaction[];
  behavior: Map<ID, PaymentBehavior>;
  fallbackBehavior: PaymentBehavior | null;
  postedOccurrences: Set<string>;
  vat: VatPeriod[];
  /** 90 günlük baz projeksiyon (senaryosuz) */
  forecast: ForecastResult;
  runRate: RunRate;
}

export type Finance = FinanceSnapshot & FinanceDerived;

type LoadState = { status: 'loading' } | { status: 'empty' } | { status: 'ready'; snapshot: FinanceSnapshot };

const DEFAULT_RATES: RateTable = { TRY: 1, USD: 49, EUR: 55.7, GBP: 65.4 };

async function loadSnapshot(): Promise<LoadState> {
  const active = await db.settings.get(SETTINGS_KEYS.activeWorkspace);
  const wsId = active?.value as ID | undefined;
  if (!wsId) return { status: 'empty' };
  const workspace = await db.workspaces.get(wsId);
  if (!workspace) return { status: 'empty' };

  const by = <T,>(table: { where(k: string): { equals(v: string): { toArray(): Promise<T[]> } } }) =>
    table.where('workspaceId').equals(wsId).toArray();

  const [accounts, categories, contacts, transactions, documents, allocations, recurring, instruments, scenarios, rules, rateRows, settingRows] =
    await Promise.all([
      by<Account>(db.accounts),
      by<Category>(db.categories),
      by<Contact>(db.contacts),
      by<Transaction>(db.transactions),
      by<FinDocument>(db.documents),
      by<Allocation>(db.allocations),
      by<RecurringRule>(db.recurring),
      by<Instrument>(db.instruments),
      by<Scenario>(db.scenarios),
      by<CategorizationRule>(db.rules),
      db.rates.toArray(),
      db.settings.toArray(),
    ]);

  // Her para birimi için en güncel kur
  const rates: RateTable = { ...DEFAULT_RATES };
  let ratesDate: ISODate | null = null;
  const latest = new Map<string, { date: string; perBase: number }>();
  for (const r of rateRows) {
    const cur = latest.get(r.currency);
    if (!cur || r.date > cur.date) latest.set(r.currency, { date: r.date, perBase: r.perBase });
  }
  for (const [currency, r] of latest) {
    rates[currency as CurrencyCode] = r.perBase;
    if (!ratesDate || r.date > ratesDate) ratesDate = r.date;
  }

  const setting = (key: string) => settingRows.find((s) => s.key === key)?.value;

  accounts.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'tr'));
  contacts.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
  categories.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  return {
    status: 'ready',
    snapshot: {
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
      rules,
      rates,
      ratesDate,
      settings: {
        minCashBalance: (setting(SETTINGS_KEYS.minCashBalance) as number | undefined) ?? 100_000_000,
        isDemo: Boolean(setting(SETTINGS_KEYS.demo)),
        tempo: (setting(SETTINGS_KEYS.tempo) as boolean | undefined) ?? true,
        ai: resolveAiConfig(setting(SETTINGS_KEYS.ai) as Partial<AiConfig> | undefined),
        cloud: (setting(SETTINGS_KEYS.cloud) as CloudConfig | undefined) ?? null,
        lock: (setting(SETTINGS_KEYS.lock) as { pinHash: string; salt: string } | undefined) ?? null,
        lastBackupAt: (setting(SETTINGS_KEYS.lastBackup) as string | undefined) ?? null,
      },
    },
  };
}

/** Projeksiyon girdisi: sayfalar ufuk ve senaryo değiştirerek yeniden kullanır. */
export function forecastInput(
  f: FinanceSnapshot &
    Pick<FinanceDerived, 'today' | 'docStates' | 'behavior' | 'fallbackBehavior' | 'postedOccurrences' | 'vat' | 'totalBase' | 'runRate'>,
  horizonDays: number,
  scenario?: ForecastInput['scenario'],
  options: { includeVat?: boolean; includeTempo?: boolean } = {},
): ForecastInput {
  const tempo = options.includeTempo ?? f.settings.tempo;
  return {
    runRate: tempo ? f.runRate : null,
    today: f.today,
    horizonDays,
    startingBalance: f.totalBase,
    documents: f.documents,
    docStates: f.docStates,
    recurring: f.recurring,
    postedOccurrences: f.postedOccurrences,
    instruments: f.instruments,
    transactions: f.transactions,
    rates: f.rates,
    behavior: f.behavior,
    fallbackBehavior: f.fallbackBehavior,
    vat: options.includeVat === false ? [] : f.vat,
    minBalance: f.settings.minCashBalance,
    scenario,
  };
}

function derive(s: FinanceSnapshot, today: ISODate): FinanceDerived {
  const balances = balancesByAccount(s.accounts, s.transactions, today);
  const active = s.accounts.filter((a) => !a.archived);
  const allocationIndex = indexAllocations(s.allocations);
  const docStates = new Map<ID, DocumentState>();
  for (const d of s.documents) docStates.set(d.id, documentStatus(d, allocationIndex, today));
  const totalBase = totalInBase(active, balances, s.rates);
  const behavior = paymentBehavior(s.contacts, s.documents, allocationIndex, today);
  const fallbackBehavior = overallBehavior(behavior);
  const postedOccurrences = new Set<string>();
  for (const t of s.transactions) if (t.recurringId && t.occurrenceDate) postedOccurrences.add(`${t.recurringId}:${t.occurrenceDate}`);
  const vat = estimateVat(s.documents, today);
  const periodicCategories = s.categories.filter((c) => c.icon === 'receipt' || c.icon === 'scales').map((c) => c.id);
  const runRate = computeRunRate({
    documents: s.documents,
    transactions: s.transactions,
    today,
    behavior,
    excludeCategoryIds: periodicCategories,
  });
  const built = buildForecast(
    forecastInput({ ...s, today, docStates, behavior, fallbackBehavior, postedOccurrences, vat, totalBase, runRate }, 90),
  );
  // Henüz hesap yokken "nakit ₺0'a iniyor" demek yanıltıcı: kurulum bitene dek eşik uyarısı üretme
  const forecast = active.length ? built : { ...built, alerts: [] };
  return {
    today,
    runRate,
    balances,
    behavior,
    fallbackBehavior,
    postedOccurrences,
    vat,
    forecast,
    totalBase,
    byCurrency: totalsByCurrency(active, balances),
    allocationIndex,
    docStates,
    contactBalances: contactBalances(s.contacts, s.documents, s.transactions, s.instruments, s.rates, today),
    accountsById: new Map(s.accounts.map((a) => [a.id, a])),
    categoriesById: new Map(s.categories.map((c) => [c.id, c])),
    contactsById: new Map(s.contacts.map((c) => [c.id, c])),
    transactionsDesc: [...s.transactions].sort(
      (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt),
    ),
  };
}

const FinanceContext = createContext<Finance | null>(null);
const LoadContext = createContext<LoadState['status']>('loading');

/** Gün değiştiğinde (gece yarısı) yeniden hesaplamak için. */
function useToday(): ISODate {
  const [value, setValue] = useState(todayISO);
  useEffect(() => {
    const id = window.setInterval(() => {
      const next = todayISO();
      setValue((prev) => (prev === next ? prev : next));
    }, 60_000);
    return () => window.clearInterval(id);
  }, []);
  return value;
}

export function FinanceProvider({ children }: { children: ReactNode }) {
  const state = useLiveQuery(loadSnapshot, [], { status: 'loading' } as LoadState);
  const today = useToday();

  const snapshot = state.status === 'ready' ? state.snapshot : null;
  useEffect(() => {
    setActiveWorkspace(snapshot?.workspace.id ?? null);
  }, [snapshot?.workspace.id]);

  const value = useMemo<Finance | null>(() => {
    if (!snapshot) return null;
    return { ...snapshot, ...derive(snapshot, today) };
  }, [snapshot, today]);

  return (
    <LoadContext.Provider value={state.status}>
      <FinanceContext.Provider value={value}>{children}</FinanceContext.Provider>
    </LoadContext.Provider>
  );
}

export function useLoadStatus() {
  return useContext(LoadContext);
}

/** Hazır veri; yalnızca çalışma alanı yüklendikten sonra render edilen ağaçta kullanılır. */
export function useFinance(): Finance {
  const value = useContext(FinanceContext);
  if (!value) throw new Error('useFinance: veri henüz hazır değil');
  return value;
}

export function useMaybeFinance(): Finance | null {
  return useContext(FinanceContext);
}
