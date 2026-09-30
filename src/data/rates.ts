import { db } from './db';
import type { CurrencyCode } from '@/domain/money';
import type { Rate } from '@/domain/types';

/**
 * Frankfurter (Avrupa Merkez Bankası referans kurları) — anahtarsız, CORS'a açık.
 * TL bazında sorgulanır; saklanan değer "1 birim döviz = kaç TL".
 */
export async function fetchLatestRates(): Promise<Rate[]> {
  const res = await fetch('https://api.frankfurter.dev/v2/rates?base=TRY&quotes=USD,EUR,GBP');
  if (!res.ok) throw new Error('Kur servisine ulaşılamadı');
  const json = (await res.json()) as Array<{ date: string; quote: string; rate: number }>;
  const rows: Rate[] = json
    .filter((r) => r.rate > 0)
    .map((r) => ({
      id: `${r.date}:${r.quote}`,
      date: r.date,
      currency: r.quote as CurrencyCode,
      perBase: Math.round((1 / r.rate) * 10_000) / 10_000,
      source: 'ecb',
    }));
  if (!rows.length) throw new Error('Kur verisi boş döndü');
  await db.rates.bulkPut(rows);
  return rows;
}

export async function setManualRate(currency: CurrencyCode, perBase: number, date: string): Promise<void> {
  await db.rates.put({ id: `${date}:${currency}`, date, currency, perBase, source: 'manual' });
}
