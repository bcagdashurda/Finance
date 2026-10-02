import { generateDemo } from '@/data/demo';
import { balancesByAccount, totalInBase, totalsByCurrency } from '@/domain/balances';
import { documentStatus, indexAllocations } from '@/domain/documents';
import { contactBalances } from '@/domain/ledger';
import { overallBehavior, paymentBehavior } from '@/domain/behavior';
import { estimateVat } from '@/domain/vat';
import { computeRunRate } from '@/domain/runrate';
import { buildForecast } from '@/domain/forecast';
import { DEFAULT_AI, type AiConfig } from '@/ai/config';
import { forecastInput, type Finance } from '@/app/finance';

export const testAiConfig: AiConfig = { ...DEFAULT_AI, enabled: true, apiKey: 'test', consentAt: '2026-09-30' };

/** Örnek işletmenin (demo) tam türetilmiş Finance nesnesi; React'siz testler için. */
export function demoFinance(T = '2026-09-29', ai: AiConfig = testAiConfig): Finance {
  const d = generateDemo(T);
  const rates = { TRY: 1, USD: 49, EUR: 55.7, GBP: 65.4 };
  const balances = balancesByAccount(d.accounts, d.transactions, T);
  const allocationIndex = indexAllocations(d.allocations);
  const docStates = new Map(d.documents.map((x) => [x.id, documentStatus(x, allocationIndex, T)]));
  const behavior = paymentBehavior(d.contacts, d.documents, allocationIndex, T);
  const postedOccurrences = new Set(d.transactions.filter((t) => t.recurringId).map((t) => `${t.recurringId}:${t.occurrenceDate}`));
  const snapshot = {
    workspace: d.workspace, accounts: d.accounts, categories: d.categories, contacts: d.contacts, transactions: d.transactions,
    documents: d.documents, allocations: d.allocations, recurring: d.recurring, instruments: d.instruments, scenarios: d.scenarios,
    rules: [], rates, ratesDate: T,
    settings: { minCashBalance: d.settings.minCashBalance, isDemo: true, tempo: true, ai, lock: null, lastBackupAt: null },
  };
  const derived = {
    today: T, balances, totalBase: totalInBase(d.accounts, balances, rates), byCurrency: totalsByCurrency(d.accounts, balances), allocationIndex, docStates,
    contactBalances: contactBalances(d.contacts, d.documents, d.transactions, d.instruments, rates, T),
    accountsById: new Map(d.accounts.map((a) => [a.id, a])), categoriesById: new Map(d.categories.map((c) => [c.id, c])),
    contactsById: new Map(d.contacts.map((c) => [c.id, c])), transactionsDesc: [...d.transactions].sort((a, b) => b.date.localeCompare(a.date)),
    behavior, fallbackBehavior: overallBehavior(behavior), postedOccurrences, vat: estimateVat(d.documents, T),
    runRate: computeRunRate({ documents: d.documents, transactions: d.transactions, today: T, behavior }),
  };
  const partial = { ...snapshot, ...derived } as unknown as Finance;
  return { ...partial, forecast: buildForecast(forecastInput(partial, 90)) } as Finance;
}
