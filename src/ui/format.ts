import { diffDays, toLocalDate, type ISODate } from '@/domain/dates';

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('tr-TR', opts);
const dayMonth = fmt({ day: 'numeric', month: 'short' });
const dayMonthLong = fmt({ day: 'numeric', month: 'long' });
const full = fmt({ day: 'numeric', month: 'long', year: 'numeric' });
const short = fmt({ day: '2-digit', month: '2-digit', year: 'numeric' });
const weekday = fmt({ weekday: 'long' });
const weekdayShort = fmt({ weekday: 'short' });
const monthLong = fmt({ month: 'long' });
const monthShort = fmt({ month: 'short' });
const monthYear = fmt({ month: 'long', year: 'numeric' });

/** "15 Eki" */
export const formatDayMonth = (iso: ISODate) => dayMonth.format(toLocalDate(iso));
/** "15 Ekim" */
export const formatDayMonthLong = (iso: ISODate) => dayMonthLong.format(toLocalDate(iso));
/** "15 Ekim 2026" */
export const formatDate = (iso: ISODate) => full.format(toLocalDate(iso));
/** "15.10.2026" */
export const formatDateShort = (iso: ISODate) => short.format(toLocalDate(iso));
/** "Perşembe" */
export const formatWeekday = (iso: ISODate) => weekday.format(toLocalDate(iso));
export const formatWeekdayShort = (iso: ISODate) => weekdayShort.format(toLocalDate(iso));
/** "2026-10" → "Ekim" */
export const formatMonth = (key: string) => monthLong.format(toLocalDate(`${key}-01`));
/** "2026-10" → "Eki" */
export const formatMonthShort = (key: string) => monthShort.format(toLocalDate(`${key}-01`));
/** "2026-10" → "Ekim 2026" */
export const formatMonthYear = (key: string) => monthYear.format(toLocalDate(`${key}-01`));

const LOCATIVE = ['ta', 'ta', 'ta', 'da', 'ta', 'da', 'da', 'ta', 'de', 'de', 'da', 'ta'];

/** "2026-08" → "Ağustos'ta" (ünlü uyumu ve sertleşmeyle bulunma eki) */
export function formatMonthIn(key: string): string {
  const m = Number(key.slice(5, 7)) - 1;
  return `${formatMonth(key)}'${LOCATIVE[m]}`;
}

/** "Bugün", "Yarın", "3 gün sonra", "5 gün önce" */
export function relativeDay(iso: ISODate, today: ISODate): string {
  const d = diffDays(iso, today);
  if (d === 0) return 'Bugün';
  if (d === 1) return 'Yarın';
  if (d === -1) return 'Dün';
  if (d > 1 && d < 7) return `${d} gün sonra`;
  if (d < -1 && d > -7) return `${-d} gün önce`;
  if (d >= 7 && d < 60) return `${Math.round(d / 7)} hafta sonra`;
  if (d <= -7 && d > -60) return `${Math.round(-d / 7)} hafta önce`;
  return formatDate(iso);
}

export function pluralDays(n: number): string {
  return `${n} gün`;
}

export function percent(value: number, digits = 0): string {
  return new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: digits }).format(value);
}
