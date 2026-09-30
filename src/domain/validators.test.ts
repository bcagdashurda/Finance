import { describe, expect, it } from 'vitest';
import { bankFromIban, formatIban, isValidIban, isValidTckn, isValidVkn, makeTrIban, makeVkn, normalizeIban } from './validators';

describe('IBAN', () => {
  it('accepts a valid Turkish IBAN with or without spaces', () => {
    expect(isValidIban('TR330006100519786457841326')).toBe(true);
    expect(isValidIban('TR33 0006 1005 1978 6457 8413 26')).toBe(true);
  });

  it('rejects a wrong checksum or length', () => {
    expect(isValidIban('TR330006100519786457841327')).toBe(false);
    expect(isValidIban('TR33000610051978645784132')).toBe(false);
  });

  it('formats in groups of four', () => {
    expect(formatIban('tr330006100519786457841326')).toBe('TR33 0006 1005 1978 6457 8413 26');
    expect(normalizeIban(' tr33 0006 ')).toBe('TR330006');
  });

  it('recognises the bank from a Turkish IBAN (EFT code)', () => {
    expect(bankFromIban(makeTrIban('00062', '0000000123456789'))).toBe('Garanti BBVA');
    expect(bankFromIban('TR33 0001 0005 1978 6457 8413 26')).toBe('Ziraat Bankası');
    expect(bankFromIban('TR3300064')).toBe('İş Bankası');
    expect(bankFromIban('TR12 9999 9')).toBeNull();
    expect(bankFromIban('DE89370400440532013000')).toBeNull();
    expect(bankFromIban('TR33')).toBeNull();
  });

  it('builds valid IBANs from a bank code and account number', () => {
    const iban = makeTrIban('00062', '0000000123456789');
    expect(iban).toHaveLength(26);
    expect(isValidIban(iban)).toBe(true);
  });
});

describe('VKN', () => {
  it('builds and validates tax numbers with the GİB check digit', () => {
    const vkn = makeVkn('123456789');
    expect(vkn).toMatch(/^\d{10}$/);
    expect(isValidVkn(vkn)).toBe(true);
    const wrong = vkn.slice(0, 9) + String((Number(vkn[9]) + 1) % 10);
    expect(isValidVkn(wrong)).toBe(false);
  });

  it('rejects wrong length or letters', () => {
    expect(isValidVkn('123456789')).toBe(false);
    expect(isValidVkn('12345678a0')).toBe(false);
  });
});

describe('TCKN', () => {
  it('validates the two check digits', () => {
    expect(isValidTckn('10000000146')).toBe(true);
    expect(isValidTckn('10000000147')).toBe(false);
    expect(isValidTckn('00000000146')).toBe(false);
  });
});
