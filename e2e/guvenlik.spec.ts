import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openDemo, watchErrors } from './helpers';

/**
 * Yayındaki İçerik Güvenlik Politikası (vercel.json) üretim derlemesine uygulanır: uygulama bu politika
 * altında açılmalı, gezinmeli, kayıt penceresi ve tema betiği çalışmalı. Tarayıcı bir şeyi engellerse
 * konsola "Refused to …" düşer ve test kırmızıya döner. (Yerel sunucu bu başlığı göndermediği için
 * hatalı bir politika ancak yayında fark edilirdi.)
 */
const csp = (JSON.parse(readFileSync('vercel.json', 'utf8')).headers as Array<{ headers: Array<{ key: string; value: string }> }>)
  .flatMap((h) => h.headers)
  .find((h) => h.key === 'Content-Security-Policy')!.value;

test('uygulama yayın güvenlik politikası (CSP) altında çalışır', async ({ page }, info) => {
  test.skip(!['laptop-1280', 'mobile-375'].includes(info.project.name), 'masaüstü ve telefon yeterli');
  await page.route('**/*', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
  });
  const errors = watchErrors(page);

  // Satır içi tema betiği (özetle izinli) ilk boyamadan önce çalışmalı
  await page.addInitScript(() => localStorage.setItem('mizan:theme', 'dark'));
  await openDemo(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  for (const path of ['/akis', '/takvim', '/cariler', '/raporlar?rapor=pnl', '/hikaye', '/ayarlar']) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    await page.waitForTimeout(600);
  }
  await page.goto('/');
  await page.getByRole('button', { name: /^(Kayıt|Yeni kayıt)$/ }).filter({ visible: true }).first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(400);
  // Buraya kadar hiçbir şey engellenmemeli (tema betiği dahil: özeti yanlışsa burada "Refused to execute" görünür)
  expect(errors, errors.join('\n')).toEqual([]);

  // Politika gerçekten uygulandı mı? Satır içi, özeti olmayan bir betik engellenmeli
  const blocked = await page.evaluate(() => {
    const s = document.createElement('script');
    s.textContent = 'window.__cspDelindi = true';
    document.head.appendChild(s);
    return (window as unknown as { __cspDelindi?: boolean }).__cspDelindi === true;
  });
  expect(blocked, 'CSP uygulanmamış: özeti olmayan satır içi betik çalıştı').toBe(false);
});
