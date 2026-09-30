import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, openDemo, snap, watchErrors } from './helpers';

/**
 * Demo verisiyle her sayfa, her ekran boyutunda: açılıyor mu, konsol hatası var mı,
 * yatayda taşıyor mu? Tam sayfa ekran görüntüsü HTML rapora eklenir.
 */
const ROUTES: Array<[path: string, title: RegExp]> = [
  ['/', /Kokpit/],
  ['/akis', /Nakit akışı/],
  ['/takvim', /Ödeme takvimi/],
  ['/islemler', /İşlemler/],
  ['/hesaplar', /Hesaplar/],
  ['/cariler', /Cariler/],
  ['/cekler', /Çek ve senet/],
  ['/raporlar', /Raporlar/],
  ['/ayarlar', /Ayarlar/],
];

for (const [path, title] of ROUTES) {
  test(`sayfa ${path}`, async ({ page }, info) => {
    const errors = watchErrors(page);
    await openDemo(page);
    await page.goto(path);
    await expect(page.locator('h1').first()).toHaveText(title);
    await page.waitForTimeout(1500); // açılış animasyonları
    await expectNoHorizontalOverflow(page, path);
    await snap(page, info, path === '/' ? 'kokpit' : path.slice(1));
    expect(errors, errors.join('\n')).toEqual([]);
  });
}

test('raporların hepsi', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page);
  for (const id of ['pnl', 'cashflow', 'category', 'aging', 'budget', 'kdv', 'fx']) {
    await page.goto(`/raporlar?rapor=${id}`);
    await expect(page.locator('h1').first()).toHaveText(/Raporlar/);
    await page.waitForTimeout(700);
    await expectNoHorizontalOverflow(page, `rapor ${id}`);
    await snap(page, info, `rapor-${id}`);
  }
  expect(errors, errors.join('\n')).toEqual([]);
});

test('detay sayfaları: hesap ve cari', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page);
  await page.goto('/hesaplar');
  await page.locator('main a[href^="/hesaplar/"]').first().click();
  await expect(page).toHaveURL(/\/hesaplar\/.+/);
  await page.waitForTimeout(1200);
  await expectNoHorizontalOverflow(page, 'hesap detayı');
  await snap(page, info, 'hesap-detay');
  await page.goto('/cariler');
  await page.locator('main a[href^="/cariler/"]').first().click();
  await expect(page).toHaveURL(/\/cariler\/.+/);
  await page.waitForTimeout(1200);
  await expectNoHorizontalOverflow(page, 'cari detayı');
  await snap(page, info, 'cari-detay');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('ayın hikâyesi (GSAP kaydırma)', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page);
  await page.goto('/hikaye');
  await page.waitForTimeout(1500);
  await expectNoHorizontalOverflow(page, 'hikâye');
  await snap(page, info, 'hikaye-ust');
  // Sona kadar kaydır: tüm bölümler görünür hale gelmeli
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 700) {
    await page.mouse.wheel(0, 700);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(800);
  await snap(page, info, 'hikaye-son');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('karşılama ekranı', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Nakdinizin');
  await page.waitForTimeout(2500);
  await expectNoHorizontalOverflow(page, 'karşılama');
  await snap(page, info, 'karsilama');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('koyu tema', async ({ page }, info) => {
  const errors = watchErrors(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await openDemo(page);
  await page.waitForTimeout(1800);
  await snap(page, info, 'kokpit-koyu');
  await page.goto('/raporlar');
  await page.waitForTimeout(800);
  await snap(page, info, 'raporlar-koyu');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('mobil gezinme ve kayıt sayfası', async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 1280) >= 1024, 'alt gezinme çubuğu yalnızca dar ekranlarda');
  const errors = watchErrors(page);
  await openDemo(page);
  const nav = page.getByRole('navigation', { name: 'Alt gezinme' });
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: 'Yeni kayıt' }).click();
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('textbox', { name: /Tutar/ })).toBeVisible();
  await snap(page, info, 'mobil-kayit');
  await page.keyboard.press('Escape');
  await nav.getByRole('button', { name: 'Daha fazla' }).click();
  await expect(page.getByRole('dialog').getByRole('link', { name: 'Raporlar' })).toBeVisible();
  await snap(page, info, 'mobil-menu');
  await page.getByRole('dialog').getByRole('link', { name: 'Raporlar' }).click();
  await expect(page.locator('h1').first()).toHaveText(/Raporlar/);
  expect(errors, errors.join('\n')).toEqual([]);
});
