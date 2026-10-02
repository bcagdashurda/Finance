/**
 * Cari isimlerini yapay zekâya göndermeden önce takma adlarla değiştirir
 * ("Yıldız Gıda A.Ş." → "Cari-3"), yanıtta geri çözer.
 *
 * Banka ekstreleri adları büyük harfle ve Türkçe karaktersiz yazar ("YILDIZ GIDA A.S."), kullanıcı
 * küçük harfle yazar ("yıldızdan"): eşleşme harf büyüklüğüne ve Türkçe/ASCII farkına duyarsızdır.
 */

/** Türkçe harf ↔ ASCII karşılığı, büyük/küçük: aynı sınıfa düşer. */
const FOLD: Record<string, string> = {
  ı: 'ıiIİ', i: 'ıiIİ',
  ş: 'şsŞS', s: 'şsŞS',
  ğ: 'ğgĞG', g: 'ğgĞG',
  ü: 'üuÜU', u: 'üuÜU',
  ö: 'öoÖO', o: 'öoÖO',
  ç: 'çcÇC', c: 'çcÇC',
  â: 'âaÂA', a: 'âaÂA',
  î: 'îiÎIİı',
  û: 'ûuÛU',
};

/** Ad parçası olarak anlam taşımayan şirket ekleri (tek başına eşleşmeye yetmez). */
const LEGAL = new Set(['a.ş.', 'a.ş', 'aş', 'ltd.', 'ltd', 'şti.', 'şti', 'san.', 'san', 'tic.', 'tic', 've', 'sanayi', 'ticaret', 'limited', 'şirketi', 'anonim']);

function letterClass(ch: string, upperOnly = false): string {
  const lower = ch.toLocaleLowerCase('tr-TR');
  const variants = FOLD[lower] ?? `${lower}${lower.toLocaleUpperCase('tr-TR')}`;
  const set = upperOnly ? [...variants].filter((v) => v !== v.toLocaleLowerCase('tr-TR')) : [...variants];
  return `[${[...new Set(set)].join('')}]`;
}

/** Yazımdan bağımsız desen: harfler sınıf, nokta isteğe bağlı, boşluklar esnek. */
function foldPattern(text: string, capitalized = false): string {
  let out = '';
  [...text].forEach((ch, i) => {
    if (/\p{L}/u.test(ch)) out += letterClass(ch, capitalized && i === 0);
    else if (ch === '.') out += '\\.?';
    else if (/[\s-]/.test(ch)) out += '[\\s.,\\-]*';
    else out += ch.replace(/[\^$\\*+?()[\]{}|/]/g, '\\$&');
  });
  return out;
}

const START = '(?<![\\p{L}\\p{N}])';

export class Masker {
  private aliasOf = new Map<string, string>();
  private nameOf = new Map<string, string>();
  private matcher: RegExp | null = null;
  private patterns: Array<{ re: RegExp; alias: string }> = [];

  constructor(
    names: string[],
    public enabled: boolean,
  ) {
    names.forEach((n, i) => {
      const alias = `Cari-${i + 1}`;
      this.aliasOf.set(n, alias);
      this.nameOf.set(alias, n);
    });
    if (enabled && names.length) this.build(names);
  }

  /**
   * Desenler öncelik sırasıyla: tam ad > ayırt edici ilk iki sözcük > ilk sözcük. Birden fazla cariye
   * uyan kısa biçimler (iki "Ege …" firması) belirsizdir, kullanılmaz. Tek sözcük yalnızca büyük harfle
   * başlıyorsa eşleşir ("Mavi'den" evet, "mavi boya" hayır).
   */
  private build(names: string[]) {
    const fold = (s: string) => s.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
    const shortForms = names.map((n) => {
      const words = n.split(/\s+/).filter((w) => !LEGAL.has(w.toLocaleLowerCase('tr-TR')));
      return { name: n, two: words.length >= 2 ? `${words[0]} ${words[1]}` : null, one: words[0] && words[0].length >= 4 ? words[0] : null };
    });
    const owners = new Map<string, number>();
    for (const s of shortForms) for (const k of [s.two && `2:${fold(s.two)}`, s.one && `1:${fold(s.one)}`]) if (k) owners.set(k, (owners.get(k) ?? 0) + 1);
    const unique = (k: string) => owners.get(k) === 1;

    const entries: Array<{ pattern: string; alias: string; weight: number }> = [];
    for (const s of shortForms) {
      const alias = this.aliasOf.get(s.name)!;
      entries.push({ pattern: foldPattern(s.name), alias, weight: 3000 + s.name.length });
      if (s.two && unique(`2:${fold(s.two)}`)) entries.push({ pattern: foldPattern(s.two), alias, weight: 2000 + s.two.length });
      if (s.one && unique(`1:${fold(s.one)}`)) entries.push({ pattern: foldPattern(s.one, true), alias, weight: 1000 + s.one.length });
    }
    entries.sort((a, b) => b.weight - a.weight);
    this.patterns = entries.map((e) => ({ re: new RegExp(`^(?:${e.pattern})`, 'u'), alias: e.alias }));
    this.matcher = new RegExp(`${START}(?:${entries.map((e) => e.pattern).join('|')})`, 'gu');
  }

  name(n: string | undefined): string | undefined {
    if (!n || !this.enabled) return n;
    return this.aliasOf.get(n) ?? n;
  }

  /** Serbest metindeki gerçek isimleri takma adla değiştirir (tek geçiş: takma ad yeniden taranmaz). */
  mask(text: string): string {
    if (!this.enabled || !this.matcher) return text;
    return text.replace(this.matcher, (hit, offset: number, whole: string) => {
      const alias = this.patterns.find((p) => p.re.test(hit))?.alias ?? hit;
      // Kesme işaretsiz ek ("YILDIZDAN" → "Cari-3'DAN"): okunurluk için kesme ekle
      const next = whole[offset + hit.length];
      return next && /\p{L}/u.test(next) ? `${alias}'` : alias;
    });
  }

  unmask(text: string): string {
    if (!this.enabled) return text;
    return text.replace(/Cari-(\d+)/gi, (m, d: string) => this.nameOf.get(`Cari-${d}`) ?? m);
  }
}
