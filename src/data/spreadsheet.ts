/**
 * Excel (.xlsx/.xls) ve CSV dosyalarını satır dizisine çevirir. Excel motoru yalnızca gerektiğinde yüklenir.
 * Eski Türk bankası/muhasebe CSV'leri Windows-1254 kodlamalı olabilir; bozuk karakter görülürse yeniden çözülür.
 */
import type { Cell } from '@/domain/statement';
import { normalizeTr } from '@/domain/nlp';

export async function readSpreadsheet(file: File): Promise<Cell[][]> {
  if (/\.xlsx?$/i.test(file.name)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]!]!;
    return XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '' });
  }
  const buf = await file.arrayBuffer();
  let text = new TextDecoder('utf-8').decode(buf);
  if (text.includes('�')) text = new TextDecoder('windows-1254').decode(buf);
  const Papa = (await import('papaparse')).default;
  return Papa.parse<string[]>(text, { skipEmptyLines: true }).data;
}

/** Üstteki başlık/logo satırlarını atlayıp ilk "başlık satırı"nı bulur. */
export function findHeaderRow(rows: Cell[][], test: (cells: string[]) => boolean): number {
  for (let i = 0; i < Math.min(25, rows.length); i++) {
    const cells = rows[i]!.map((c) => normalizeTr(String(c ?? '')));
    if (test(cells)) return i;
  }
  return 0;
}
