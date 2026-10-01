import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { openDemo } from './helpers';

/**
 * WCAG 2.2 AA otomatik denetimi (axe-core): her ana sayfa açık ve koyu temada, kayıt penceresi açıkken.
 * İlk denetimde bulunanlar: soluk metin kontrastı 2,6:1, rolsüz aria-label (tutarlar, rozet),
 * klavyeyle kaydırılamayan rapor tablosu, etiketsiz dosya girişi.
 * Yalnızca masaüstü ve telefon projelerinde koşar (diğer genişlikler aynı bileşenleri kullanır).
 */
const PAGES = ['/', '/akis', '/takvim', '/islemler', '/hesaplar', '/cariler', '/cekler', '/raporlar?rapor=pnl', '/raporlar?rapor=kdv', '/hikaye', '/ayarlar'];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function violations(page: Page, where: string) {
  const r = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return r.violations.map((v) => `${where} → ${v.id} (${v.impact}) ×${v.nodes.length}: ${v.nodes[0]?.target.join(' ')} — ${v.nodes[0]?.failureSummary?.split('\n')[1] ?? ''}`);
}

for (const scheme of ['light', 'dark'] as const) {
  test(`erişilebilirlik (${scheme === 'light' ? 'açık' : 'koyu'} tema)`, async ({ page }, info) => {
    test.skip(!['laptop-1280', 'mobile-375'].includes(info.project.name), 'masaüstü ve telefon yeterli');
    test.setTimeout(120_000);
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await openDemo(page);
    const found: string[] = [];
    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await page.waitForTimeout(900);
      found.push(...(await violations(page, path)));
    }
    // Detay sayfaları (telefonda yana kayan ekstre tablosu burada)
    for (const [list, link] of [['/cariler', 'main a[href^="/cariler/"]'], ['/hesaplar', 'main a[href^="/hesaplar/"]']] as const) {
      await page.goto(list);
      await page.locator(link).first().click();
      await expect(page.locator('h1').first()).toBeVisible();
      await page.waitForTimeout(900);
      found.push(...(await violations(page, `${list} detayı`)));
    }
    // Kayıt penceresi açıkken (odak tuzağı, form etiketleri)
    await page.goto('/');
    await page.getByRole('button', { name: /^(Kayıt|Yeni kayıt)$/ }).filter({ visible: true }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.waitForTimeout(500);
    found.push(...(await violations(page, 'kayıt penceresi')));
    expect(found, found.join('\n')).toEqual([]);
  });
}
