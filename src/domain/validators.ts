/** Türkiye'ye özgü kimlik ve hesap numarası doğrulayıcıları. */

export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

export function formatIban(value: string): string {
  return normalizeIban(value).replace(/(.{4})/g, '$1 ').trim();
}

function mod97(numeric: string): number {
  let remainder = 0;
  for (let i = 0; i < numeric.length; i += 7) {
    remainder = Number(String(remainder) + numeric.slice(i, i + 7)) % 97;
  }
  return remainder;
}

function ibanToNumeric(iban: string): string {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  return rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55));
}

export function isValidIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
  if (iban.startsWith('TR') && iban.length !== 26) return false;
  if (iban.length < 15 || iban.length > 34) return false;
  return mod97(ibanToNumeric(iban)) === 1;
}

/** EFT banka kodları (TR IBAN'ın 5–9. haneleri). */
const TR_BANK_CODES: Record<string, string> = {
  '00010': 'Ziraat Bankası',
  '00012': 'Halkbank',
  '00015': 'VakıfBank',
  '00032': 'TEB',
  '00046': 'Akbank',
  '00059': 'Şekerbank',
  '00062': 'Garanti BBVA',
  '00064': 'İş Bankası',
  '00067': 'Yapı Kredi',
  '00099': 'ING',
  '00103': 'Fibabanka',
  '00111': 'QNB',
  '00123': 'HSBC',
  '00134': 'DenizBank',
  '00203': 'Albaraka Türk',
  '00205': 'Kuveyt Türk',
  '00206': 'Türkiye Finans',
  '00209': 'Ziraat Katılım',
  '00210': 'Vakıf Katılım',
};

/** IBAN'dan bankayı tanır (yalnızca TR); bilinmiyorsa null. Yazarken de çalışır: ilk 9 karakter yeterli. */
export function bankFromIban(value: string): string | null {
  const iban = normalizeIban(value);
  if (!iban.startsWith('TR') || iban.length < 9) return null;
  return TR_BANK_CODES[iban.slice(4, 9)] ?? null;
}

/** TR IBAN: 5 haneli banka kodu + 1 rezerv (0) + 16 haneli hesap. */
export function makeTrIban(bankCode: string, account: string): string {
  const body = bankCode.padStart(5, '0') + '0' + account.padStart(16, '0');
  const check = 98 - mod97(ibanToNumeric(`TR00${body}`));
  return `TR${String(check).padStart(2, '0')}${body}`;
}

function vknCheckDigit(first9: string): number {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    const tmp = (Number(first9[i]) + (9 - i)) % 10;
    let v = (tmp * 2 ** (9 - i)) % 9;
    if (tmp !== 0 && v === 0) v = 9;
    sum += v;
  }
  return (10 - (sum % 10)) % 10;
}

/** Vergi kimlik numarası (10 hane, GİB kontrol basamağı). */
export function isValidVkn(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  return vknCheckDigit(value.slice(0, 9)) === Number(value[9]);
}

export function makeVkn(first9: string): string {
  return first9 + String(vknCheckDigit(first9));
}

/** T.C. kimlik numarası (11 hane, iki kontrol basamağı). */
export function isValidTckn(value: string): boolean {
  if (!/^[1-9]\d{10}$/.test(value)) return false;
  const d = value.split('').map(Number);
  const odd = d[0]! + d[2]! + d[4]! + d[6]! + d[8]!;
  const even = d[1]! + d[3]! + d[5]! + d[7]!;
  const d10 = (((odd * 7 - even) % 10) + 10) % 10;
  if (d10 !== d[9]) return false;
  const d11 = d.slice(0, 10).reduce((a, b) => a + b, 0) % 10;
  return d11 === d[10];
}

/** VKN (10) veya TCKN (11) — şahıs şirketleri TCKN ile çalışır. */
export function isValidTaxId(value: string): boolean {
  return value.length === 11 ? isValidTckn(value) : isValidVkn(value);
}
