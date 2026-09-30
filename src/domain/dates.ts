/**
 * Takvim tarihleri 'YYYY-MM-DD' (ISODate) dizgisi olarak tutulur. Saat dilimi
 * sorunlarını önlemek için tüm aritmetik UTC gece yarısı üzerinden yapılır.
 * ISO dizgileri sözlük sırasıyla karşılaştırılabilir.
 */

export type ISODate = string;

const DAY_MS = 86_400_000;

function toUTC(iso: ISODate): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function makeDate(year: number, month: number, day: number): ISODate {
  return fromUTC(Date.UTC(year, month - 1, day));
}

/** Yerel saate göre bugünün tarihi. */
export function today(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function toISODate(date: Date): ISODate {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Yerel gece yarısında bir Date (UI bileşenleri için). */
export function toLocalDate(iso: ISODate): Date {
  return new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

export function isISODate(value: unknown): value is ISODate {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function addDays(iso: ISODate, days: number): ISODate {
  return fromUTC(toUTC(iso) + days * DAY_MS);
}

/** a − b, gün cinsinden. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(a) - toUTC(b)) / DAY_MS);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addMonths(iso: ISODate, months: number): ISODate {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return makeDate(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function startOfMonth(iso: ISODate): ISODate {
  return `${iso.slice(0, 7)}-01`;
}

export function endOfMonth(iso: ISODate): ISODate {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  return makeDate(y, m, daysInMonth(y, m));
}

/** 0 = Pazar … 6 = Cumartesi */
export function dayOfWeek(iso: ISODate): number {
  return new Date(toUTC(iso)).getUTCDay();
}

/** Pazartesi başlangıçlı hafta. */
export function startOfWeek(iso: ISODate): ISODate {
  const dow = dayOfWeek(iso);
  return addDays(iso, dow === 0 ? -6 : 1 - dow);
}

export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}

export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

/** [from, to] aralığındaki her gün. */
export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// ---------------------------------------------------------------------------
// Resmî tatiller

const FIXED_HOLIDAYS = ['01-01', '04-23', '05-01', '05-19', '07-15', '08-30', '10-29'];

// Dinî bayramlar ay takvimine göre değişir; Diyanet takvimine göre güncellenmelidir.
const MOVABLE_HOLIDAYS = new Set<ISODate>([
  // 2026 Ramazan Bayramı, Kurban Bayramı
  '2026-03-20', '2026-03-21', '2026-03-22',
  '2026-05-27', '2026-05-28', '2026-05-29', '2026-05-30',
  // 2027
  '2027-03-09', '2027-03-10', '2027-03-11',
  '2027-05-16', '2027-05-17', '2027-05-18', '2027-05-19',
]);

export function isHoliday(iso: ISODate): boolean {
  return FIXED_HOLIDAYS.includes(iso.slice(5)) || MOVABLE_HOLIDAYS.has(iso);
}

export function isWeekend(iso: ISODate): boolean {
  const dow = dayOfWeek(iso);
  return dow === 0 || dow === 6;
}

export function isBusinessDay(iso: ISODate): boolean {
  return !isWeekend(iso) && !isHoliday(iso);
}

export type WeekendPolicy = 'none' | 'next' | 'previous';

export function adjustToBusinessDay(iso: ISODate, policy: WeekendPolicy): ISODate {
  if (policy === 'none') return iso;
  const step = policy === 'next' ? 1 : -1;
  let d = iso;
  while (!isBusinessDay(d)) d = addDays(d, step);
  return d;
}

// ---------------------------------------------------------------------------
// Türkçe doğal dil tarih ayrıştırma

const L = 'a-zçğıöşü';
const START = `(?<![${L}0-9])`;
const END = `(?![${L}])`;
const SUFFIX = `(?:['’](?:[${L}]{1,4}))?`;

const MONTHS: Array<[string, number]> = [
  ['ocak', 1], ['şubat', 2], ['subat', 2], ['mart', 3], ['nisan', 4],
  ['mayıs', 5], ['mayis', 5], ['haziran', 6], ['temmuz', 7], ['ağustos', 8],
  ['agustos', 8], ['eylül', 9], ['eylul', 9], ['ekim', 10], ['kasım', 11],
  ['kasim', 11], ['aralık', 12], ['aralik', 12],
];
const MONTH_ALT = MONTHS.map(([name]) => name).join('|');

// Uzun adlar önce: "cumartesi" "cuma"dan, "pazartesi" "pazar"dan önce denenmeli.
const WEEKDAYS: Array<[string, number]> = [
  ['pazartesi', 1], ['salı', 2], ['sali', 2], ['çarşamba', 3], ['carsamba', 3],
  ['perşembe', 4], ['persembe', 4], ['cumartesi', 6], ['cuma', 5], ['pazar', 0],
];
const WEEKDAY_ALT = WEEKDAYS.map(([name]) => name).join('|');

export interface ParsedDate {
  date: ISODate;
  /** Orijinal metinde eşleşen parça */
  match: string;
}

function monthNumber(name: string): number {
  return MONTHS.find(([n]) => n === name)?.[1] ?? 1;
}

function weekdayNumber(name: string): number {
  return WEEKDAYS.find(([n]) => n === name)?.[1] ?? 1;
}

/** Yıl verilmemiş bir gün/ay için: 60 günden eski kalıyorsa gelecek yıla taşı. */
function resolveYearless(day: number, month: number, ref: ISODate): ISODate | null {
  const year = Number(ref.slice(0, 4));
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  const candidate = makeDate(year, month, day);
  return diffDays(ref, candidate) > 60 ? makeDate(year + 1, month, day) : candidate;
}

function nextWeekday(ref: ISODate, weekday: number): ISODate {
  const delta = (weekday - dayOfWeek(ref) + 7) % 7;
  return addDays(ref, delta);
}

interface Rule {
  pattern: RegExp;
  resolve: (m: RegExpExecArray, ref: ISODate) => ISODate | null;
}

const RULES: Rule[] = [
  {
    pattern: new RegExp(`${START}(\\d{1,2})[./](\\d{1,2})[./](\\d{4})${END}`),
    resolve: (m) => {
      const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
      if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
      return makeDate(y, mo, d);
    },
  },
  {
    pattern: new RegExp(`${START}(\\d{1,2})\\s+(${MONTH_ALT})\\s+(\\d{4})${SUFFIX}${END}`),
    resolve: (m) => {
      const y = Number(m[3]);
      const mo = monthNumber(m[2]!);
      const d = Number(m[1]);
      if (d < 1 || d > daysInMonth(y, mo)) return null;
      return makeDate(y, mo, d);
    },
  },
  {
    pattern: new RegExp(`${START}(\\d{1,2})\\s+(${MONTH_ALT})${SUFFIX}${END}`),
    resolve: (m, ref) => resolveYearless(Number(m[1]), monthNumber(m[2]!), ref),
  },
  {
    pattern: new RegExp(`${START}(\\d{1,2})[./](\\d{1,2})${END}(?!\\d)(?![./,]\\d)`),
    resolve: (m, ref) => resolveYearless(Number(m[1]), Number(m[2]), ref),
  },
  {
    pattern: new RegExp(`${START}(\\d+)\\s+(gün|hafta|ay)\\s+(sonra|önce)${END}`),
    resolve: (m, ref) => {
      const n = Number(m[1]) * (m[3] === 'önce' ? -1 : 1);
      if (m[2] === 'ay') return addMonths(ref, n);
      return addDays(ref, m[2] === 'hafta' ? n * 7 : n);
    },
  },
  {
    pattern: new RegExp(`${START}haftaya\\s+(${WEEKDAY_ALT})${END}`),
    resolve: (m, ref) => addDays(startOfWeek(addDays(ref, 7)), (weekdayNumber(m[1]!) + 6) % 7),
  },
  {
    pattern: new RegExp(`${START}(?:bu\\s+)?(${WEEKDAY_ALT})${SUFFIX}${END}`),
    resolve: (m, ref) => nextWeekday(ref, weekdayNumber(m[1]!)),
  },
  {
    pattern: new RegExp(`${START}ay[ıi]n\\s+(\\d{1,2})${SUFFIX}${END}`),
    resolve: (m, ref) => {
      const d = Number(m[1]);
      const thisMonth = makeDate(Number(ref.slice(0, 4)), Number(ref.slice(5, 7)), 1);
      let candidate = addDays(thisMonth, d - 1);
      if (candidate < ref) candidate = addDays(addMonths(thisMonth, 1), d - 1);
      return candidate;
    },
  },
  { pattern: new RegExp(`${START}ay[ıi]?n?\\s*sonu${SUFFIX}${END}`), resolve: (_m, ref) => endOfMonth(ref) },
  { pattern: new RegExp(`${START}(?:gelecek|önümüzdeki)\\s+ay${END}`), resolve: (_m, ref) => addMonths(ref, 1) },
  { pattern: new RegExp(`${START}(?:gelecek|önümüzdeki)\\s+hafta${END}`), resolve: (_m, ref) => addDays(ref, 7) },
  { pattern: new RegExp(`${START}haftaya${END}`), resolve: (_m, ref) => addDays(ref, 7) },
  { pattern: new RegExp(`${START}(?:öbür|ertesi)\\s*gün${END}`), resolve: (_m, ref) => addDays(ref, 2) },
  { pattern: new RegExp(`${START}yarın${SUFFIX}${END}`), resolve: (_m, ref) => addDays(ref, 1) },
  { pattern: new RegExp(`${START}bugün${SUFFIX}${END}`), resolve: (_m, ref) => ref },
  { pattern: new RegExp(`${START}dün${SUFFIX}${END}`), resolve: (_m, ref) => addDays(ref, -1) },
];

/**
 * Metindeki ilk tarih ifadesini bulur. `ref` göreli ifadelerin çözüleceği gündür.
 * Eşleşen parça orijinal harf büyüklüğüyle döner.
 */
export function parseTurkishDate(text: string, ref: ISODate): ParsedDate | null {
  const lower = text.toLocaleLowerCase('tr-TR');
  let best: { index: number; date: ISODate; length: number } | null = null;
  for (const rule of RULES) {
    const m = rule.pattern.exec(lower);
    if (!m) continue;
    const date = rule.resolve(m, ref);
    if (!date) continue;
    // En soldaki, eşitlikte en uzun eşleşmeyi seç (kurallar öncelik sırasında).
    if (!best || m.index < best.index) {
      best = { index: m.index, date, length: m[0].length };
    }
  }
  if (!best) return null;
  return { date: best.date, match: text.slice(best.index, best.index + best.length) };
}
