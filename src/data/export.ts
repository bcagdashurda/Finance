/**
 * Dışa aktarma yardımcıları. CSV, Türkçe Excel'in varsayılanı olan ';' ayırıcı
 * ve UTF-8 BOM ile yazılır; böylece Excel'de çift tıklayınca Türkçe karakterler bozulmaz.
 */

export interface Column<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

function escapeCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'number' ? String(v).replace('.', ',') : v;
  // CSV formül enjeksiyonu: ekstreden gelen "=HYPERLINK(…)" gibi metinler Excel'de formül olarak çalışır.
  // Başına ' konur (Excel metin sayar); "-95000,00" gibi saf sayılar dokunulmadan kalır.
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(?:[.,]\d+)?$/.test(s)) s = `'${s}`;
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCSV<T>(rows: T[], columns: Column<T>[]): string {
  const lines = [columns.map((c) => escapeCell(c.header)).join(';')];
  for (const r of rows) lines.push(columns.map((c) => escapeCell(c.value(r))).join(';'));
  return '﻿' + lines.join('\r\n');
}

export function download(filename: string, content: BlobPart, type = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Gerçek .xlsx (SheetJS, yalnızca gerektiğinde yüklenir). Tutarlar sayı hücresi olarak yazılır. */
export async function downloadXlsx(filename: string, sheets: Array<{ name: string; rows: Array<Array<string | number | null>> }>): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.rows);
    ws['!cols'] = (s.rows[0] ?? []).map((_, i) => ({ wch: i === 0 ? 34 : 16 }));
    XLSX.utils.book_append_sheet(wb, ws, s.name.slice(0, 31));
  }
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  download(filename, out, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/** Kuruş → "1234,56" (Excel'de sayı olarak okunur) */
export const minorToCell = (minor: number) => (minor / 100).toFixed(2).replace('.', ',');
