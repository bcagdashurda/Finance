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

/**
 * Sayfa taşmasa da içerik kendi kutusunda sıkışabilir. 1024 px'te bulunan hatalar:
 * Kokpit'te rakam kesikti, Cariler'de ad sütunu ~10 px'e düşmüştü, raporda "Toplam" yarım kalıyordu.
 */
test('sıkışma yok: Kokpit rakamları, cari adları, rapor Toplam sütunu', async ({ page }) => {
  await openDemo(page);
  await page.waitForTimeout(2500); // sayaç animasyonu
  const kokpit = await page.evaluate(() => {
    const hero = document.querySelector('main section.panel')!;
    const hr = hero.getBoundingClientRect();
    const big = hero.querySelector('div.display')!;
    const range = document.createRange();
    range.selectNodeContents(big);
    const kpis = [...hero.querySelectorAll('a .display')].map((v) => {
      const a = v.closest('a')!.getBoundingClientRect();
      const r = v.getBoundingClientRect();
      return { text: v.textContent, fits: r.left >= a.left && r.right <= a.right - 8 };
    });
    return { bigFits: range.getBoundingClientRect().right <= hr.right - 16, kpis };
  });
  expect(kokpit.bigFits, 'Nakit pozisyonu rakamı panelden taşıyor').toBe(true);
  for (const k of kokpit.kpis) expect(k.fits, `Gösterge tutarı sıkışık: ${k.text}`).toBe(true);

  await page.goto('/cariler');
  // Ad metninin kendisi değil, ad için ayrılan ilk ızgara hücresi (simge + ad) ölçülür
  const nameCell = page.locator('main a[href^="/cariler/"] > div').first();
  await expect(nameCell).toBeVisible();
  const cellWidth = (await nameCell.boundingBox())!.width;
  expect(cellWidth, 'cari adı sütunu çok dar').toBeGreaterThanOrEqual(180);

  await page.goto('/raporlar?rapor=pnl');
  await page.waitForTimeout(1200);
  const toplam = await page.evaluate(() => {
    const box = document.querySelector('.scroll-table')!.getBoundingClientRect();
    const th = [...document.querySelectorAll('.scroll-table thead th')].at(-1)!.getBoundingClientRect();
    return { visible: th.left >= box.left - 1 && th.right <= box.right + 1 };
  });
  expect(toplam.visible, 'rapor tablosunda "Toplam" sütunu yarım ya da görünmüyor').toBe(true);
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
