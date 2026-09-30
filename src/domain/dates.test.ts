import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  adjustToBusinessDay,
  diffDays,
  endOfMonth,
  isBusinessDay,
  parseTurkishDate,
  startOfMonth,
  startOfWeek,
} from './dates';

describe('calendar arithmetic on ISO dates', () => {
  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-09-29', 3)).toBe('2026-10-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts whole days between dates', () => {
    expect(diffDays('2026-10-15', '2026-09-29')).toBe(16);
    expect(diffDays('2026-09-29', '2026-10-15')).toBe(-16);
  });

  it('adds months clamping to the last day of shorter months', () => {
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-10-15', 3)).toBe('2027-01-15');
    expect(addMonths('2026-03-31', -1)).toBe('2026-02-28');
  });

  it('finds month and week boundaries (weeks start on Monday)', () => {
    expect(startOfMonth('2026-09-29')).toBe('2026-09-01');
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(startOfWeek('2026-10-01')).toBe('2026-09-28');
  });
});

describe('business days', () => {
  it('treats weekends and Turkish public holidays as non-business days', () => {
    expect(isBusinessDay('2026-10-03')).toBe(false); // Cumartesi
    expect(isBusinessDay('2026-10-29')).toBe(false); // Cumhuriyet Bayramı
    expect(isBusinessDay('2026-10-28')).toBe(true);
  });

  it('shifts to the next or previous business day', () => {
    expect(adjustToBusinessDay('2026-10-03', 'next')).toBe('2026-10-05');
    expect(adjustToBusinessDay('2026-10-03', 'previous')).toBe('2026-10-02');
    expect(adjustToBusinessDay('2026-10-28', 'next')).toBe('2026-10-28');
    expect(adjustToBusinessDay('2026-10-03', 'none')).toBe('2026-10-03');
  });
});

describe('parseTurkishDate', () => {
  const today = '2026-09-29'; // Salı

  it.each([
    ['bugün', '2026-09-29'],
    ['yarın ödenecek', '2026-09-30'],
    ['öbür gün', '2026-10-01'],
    ['dün', '2026-09-28'],
    ['3 gün sonra', '2026-10-02'],
    ['2 hafta sonra', '2026-10-13'],
    ['1 ay sonra', '2026-10-29'],
    ['haftaya', '2026-10-06'],
    ['cuma', '2026-10-02'],
    ['haftaya cuma', '2026-10-09'],
    ['ay sonu', '2026-09-30'],
    ['ayın 15\'i', '2026-10-15'],
    ['15 Ekim', '2026-10-15'],
    ["15 Ekim'de", '2026-10-15'],
    ['3 ocak', '2027-01-03'],
    ['15 ekim 2027', '2027-10-15'],
    ['15.10.2026', '2026-10-15'],
    ['15/11', '2026-11-15'],
  ])('parses "%s"', (text, expected) => {
    expect(parseTurkishDate(text, today)?.date).toBe(expected);
  });

  it('reports the matched fragment so it can be removed from a description', () => {
    expect(parseTurkishDate("Yıldız'dan 45 bin, vade 15 Ekim'de", today)?.match).toBe("15 Ekim'de");
  });

  it('returns null when no date is present', () => {
    expect(parseTurkishDate('kira ödemesi', today)).toBeNull();
  });
});
