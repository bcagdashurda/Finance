/**
 * Cari isimlerini yapay zekâya göndermeden önce takma adlarla değiştirir
 * ("Yıldız Gıda A.Ş." → "Cari-3"), yanıtta geri çözer.
 */
export class Masker {
  private aliasOf = new Map<string, string>();
  private nameOf = new Map<string, string>();

  constructor(
    names: string[],
    public enabled: boolean,
  ) {
    names.forEach((n, i) => {
      const alias = `Cari-${i + 1}`;
      this.aliasOf.set(n, alias);
      this.nameOf.set(alias, n);
    });
  }

  name(n: string | undefined): string | undefined {
    if (!n || !this.enabled) return n;
    return this.aliasOf.get(n) ?? n;
  }

  /** Serbest metindeki gerçek isimleri takma adla değiştirir (uzun isimler önce). */
  mask(text: string): string {
    if (!this.enabled) return text;
    let out = text;
    const names = [...this.aliasOf.keys()].sort((a, b) => b.length - a.length);
    for (const n of names) {
      const first = n.split(/\s+/)[0]!;
      const re = new RegExp(escape(n), 'gi');
      out = out.replace(re, this.aliasOf.get(n)!);
      // Yalnızca ilk kelimeyle anılmışsa ("Yıldız'dan") da maskele
      if (first.length >= 4) out = out.replace(new RegExp(`\\b${escape(first)}`, 'g'), this.aliasOf.get(n)!);
    }
    return out;
  }

  unmask(text: string): string {
    if (!this.enabled) return text;
    return text.replace(/Cari-(\d+)/g, (m) => this.nameOf.get(m) ?? m);
  }
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
