import { describe, expect, it } from 'vitest';
import { rule } from '@/test/factories';
import { occurrences, unpostedOccurrences } from './recurrence';

const dates = (list: { date: string }[]) => list.map((o) => o.date);

describe('occurrences', () => {
  it('generates monthly dates anchored to the 31st without drifting', () => {
    const r = rule({ anchorDate: '2026-01-31', frequency: 'monthly' });
    expect(dates(occurrences(r, '2026-01-01', '2026-04-30'))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('keeps the nominal date as a stable key when the date is moved to a business day', () => {
    const r = rule({ anchorDate: '2026-10-03', frequency: 'monthly', weekendPolicy: 'next' });
    expect(occurrences(r, '2026-10-01', '2026-10-31')).toEqual([{ nominal: '2026-10-03', date: '2026-10-05' }]);
  });

  it('respects interval, end date and the requested window', () => {
    const r = rule({ anchorDate: '2026-01-05', frequency: 'weekly', interval: 2, endDate: '2026-02-20' });
    expect(dates(occurrences(r, '2026-01-10', '2026-12-31'))).toEqual(['2026-01-19', '2026-02-02', '2026-02-16']);
  });

  it('supports quarterly and yearly rules', () => {
    const q = rule({ anchorDate: '2026-02-17', frequency: 'quarterly' });
    expect(dates(occurrences(q, '2026-01-01', '2026-12-31'))).toEqual([
      '2026-02-17',
      '2026-05-17',
      '2026-08-17',
      '2026-11-17',
    ]);
    const y = rule({ anchorDate: '2025-03-01', frequency: 'yearly' });
    expect(dates(occurrences(y, '2026-01-01', '2027-12-31'))).toEqual(['2026-03-01', '2027-03-01']);
  });

  it('returns nothing for inactive rules', () => {
    const r = rule({ anchorDate: '2026-01-05', active: false });
    expect(occurrences(r, '2026-01-01', '2026-12-31')).toEqual([]);
  });
});

describe('unpostedOccurrences', () => {
  const posted = new Set<string>();
  it('lists missed occurrences of the lookback window, but never before the rule was added', () => {
    const old = rule({ id: 'eski', anchorDate: '2026-01-05', createdAt: '2026-01-01T09:00:00.000Z' });
    const fresh = rule({ id: 'yeni', anchorDate: '2026-01-05', createdAt: '2026-09-30T09:00:00.000Z' });
    const list = unpostedOccurrences([old, fresh], posted, '2026-09-30', 45);
    expect(list.map((x) => `${x.rule.id}:${x.occurrence.nominal}`)).toEqual(['eski:2026-09-05']);
  });

  it('skips posted and auto-posted occurrences', () => {
    const r = rule({ id: 'k', anchorDate: '2026-01-05', createdAt: '2026-01-01T09:00:00.000Z' });
    const auto = rule({ id: 'a', anchorDate: '2026-01-05', createdAt: '2026-01-01T09:00:00.000Z', autoPost: true });
    expect(unpostedOccurrences([r, auto], new Set(['k:2026-09-05']), '2026-09-30', 45)).toEqual([]);
  });
});
