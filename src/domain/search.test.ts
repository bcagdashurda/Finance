import { describe, expect, it } from 'vitest';
import { searchScore } from './search';

describe('searchScore (Türkçe arama)', () => {
  it('ranks a word-prefix match above a scattered-letter match', () => {
    // "demir" harfleri "AkDEniz Meyve İhRacat" içinde sırayla geçer ama bu bir eşleşme değildir
    expect(searchScore('Akdeniz Meyve İhracat A.Ş.', 'demir')).toBe(0);
    expect(searchScore('Demir Kumaş Ltd. Şti.', 'demir')).toBeGreaterThan(0.9);
  });

  it('is Turkish-insensitive (ı/i, ş/s, ğ/g, büyük/küçük harf)', () => {
    expect(searchScore('Yıldız Gıda A.Ş.', 'yildiz')).toBeGreaterThan(0.9);
    expect(searchScore('ÖZKAN MAKİNE', 'özkan mak')).toBeGreaterThan(0.5);
    expect(searchScore('Ege Kağıt Sanayi', 'kagit')).toBeGreaterThan(0.9);
  });

  it('matches inner substrings with a lower score and multi-word queries by word prefixes', () => {
    expect(searchScore('Kuzey Mobilya San.', 'obil')).toBeGreaterThan(0);
    expect(searchScore('Kuzey Mobilya San.', 'obil')).toBeLessThan(searchScore('Kuzey Mobilya San.', 'mobil'));
    expect(searchScore('Kuzey Mobilya San. Tic. Ltd.', 'kuz mob')).toBeGreaterThan(0.5);
  });

  it('uses keywords (ör. vergi no) and returns 1 for an empty query', () => {
    expect(searchScore('Yıldız Gıda', '1234', ['1234567890'])).toBeGreaterThan(0.9);
    expect(searchScore('Yıldız Gıda', '')).toBe(1);
  });
});
