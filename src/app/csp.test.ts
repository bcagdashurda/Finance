import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Yayın başlıklarındaki İçerik Güvenlik Politikası (CSP), index.html'deki satır içi tema betiğinin
 * özetini içermeli; betik değişip özet güncellenmezse tarayıcı betiği sessizce engeller.
 */
const read = (p: string) => readFileSync(p, 'utf8');
const inlineScript = read('index.html').match(/<script>([\s\S]*?)<\/script>/)![1]!;
const hash = `sha256-${createHash('sha256').update(inlineScript).digest('base64')}`;

const vercelCsp = (JSON.parse(read('vercel.json')).headers as Array<{ source: string; headers: Array<{ key: string; value: string }> }>)
  .flatMap((h) => h.headers)
  .find((h) => h.key === 'Content-Security-Policy')?.value;
const netlifyCsp = read('public/_headers').match(/Content-Security-Policy:\s*(.+)/)?.[1]?.trim();

describe('Content-Security-Policy', () => {
  it('is defined identically for Vercel and Netlify', () => {
    expect(vercelCsp).toBeTruthy();
    expect(netlifyCsp).toBe(vercelCsp);
  });

  it('allows the inline theme script by its exact hash, and no other inline script', () => {
    const scriptSrc = vercelCsp!.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'))!;
    expect(scriptSrc).toContain(`'${hash}'`);
    expect(scriptSrc).not.toContain('unsafe-inline');
    expect(scriptSrc).not.toContain('unsafe-eval');
  });

  it('forbids framing, plugins and foreign base URLs', () => {
    for (const d of ["frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'"]) expect(vercelCsp).toContain(d);
  });
});
