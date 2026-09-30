import { describe, expect, it } from 'vitest';
import { percent, relativeDay } from './format';

describe('relativeDay', () => {
  const T = '2026-09-30';
  it('uses words for near dates', () => {
    expect(relativeDay('2026-09-30', T)).toBe('Bugün');
    expect(relativeDay('2026-10-01', T)).toBe('Yarın');
    expect(relativeDay('2026-10-03', T)).toBe('3 gün sonra');
    expect(relativeDay('2026-10-14', T)).toBe('2 hafta sonra');
  });

  it('uses months (not a repeated date) for far dates', () => {
    expect(relativeDay('2026-11-29', T)).toBe('2 ay sonra');
    expect(relativeDay('2026-07-01', T)).toBe('3 ay önce');
    expect(relativeDay('2028-01-01', T)).toBe('1 Ocak 2028');
  });
});

describe('percent', () => {
  it('uses the typographic minus like money amounts', () => {
    expect(percent(-0.223, 1)).toBe('−%22,3');
    expect(percent(0.5)).toBe('%50');
  });
});
