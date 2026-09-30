import { expect, test } from '@playwright/test';
import { openDemo } from './helpers';

/**
 * Yazdır / PDF: gerçek Chrome yazdırma motoruyla PDF üretilir. Önceki hata: 12 aylık tablo kağıttan
 * taşıp yarım kalıyordu, sonda boş sayfa çıkıyordu, hikâye 12 sayfa / 19 MB boş-yarım sayfaydı.
 */
test.describe('yazdırma', () => {
  test.beforeEach(({}, info) => {
    test.skip(info.project.name !== 'laptop-1280', 'PDF çıktısı ekran boyutundan bağımsız; tek projede yeterli');
  });

  const pageCount = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  /** İlk sayfanın boyutu (pt): yatay mı dikey mi */
  const landscape = (pdf: Buffer) => {
    const m = pdf.toString('latin1').match(/\/MediaBox\s*\[\s*[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)\s*\]/);
    return m ? Number(m[1]) > Number(m[2]) : false;
  };

  test('raporlar sayfaya sığar, boş sayfa yok', async ({ page }) => {
    await openDemo(page);
    // 12 aylık tablolar yalnızca yatay A4'e sığar (dikeyde sütunlar kesiliyordu)
    const expected: Record<string, { max: number; wide: boolean }> = {
      pnl: { max: 2, wide: true },
      cashflow: { max: 2, wide: true },
      kdv: { max: 1, wide: true },
      category: { max: 1, wide: false },
      aging: { max: 1, wide: false },
    };
    for (const [id, { max, wide }] of Object.entries(expected)) {
      await page.goto(`/raporlar?rapor=${id}`);
      await page.waitForTimeout(1500);
      await page.emulateMedia({ media: 'print' });
      // Kendi kâğıt genişliğinde (A4 yatay ~1030 px / dikey ~718 px içerik) tablo sağ kenarı aşmamalı
      await page.setViewportSize({ width: wide ? 1030 : 718, height: 730 });
      await page.waitForTimeout(300);
      const overflow = await page.evaluate(() => {
        const right = document.querySelector('main')!.getBoundingClientRect().right;
        return [...document.querySelectorAll('main table')].map((t) => t.getBoundingClientRect().right - right);
      });
      expect(Math.max(0, ...overflow), `${id}: tablo taşıyor`).toBeLessThanOrEqual(2);
      await page.setViewportSize({ width: 1280, height: 800 });
      const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
      expect(pageCount(pdf), `${id} sayfa sayısı`).toBeLessThanOrEqual(max);
      expect(landscape(pdf), `${id} sayfa yönü (yatay: ${wide})`).toBe(wide);
      expect(pdf.length, `${id} PDF boyutu`).toBeLessThan(600_000);
      await page.emulateMedia({ media: 'screen' });
    }
  });

  test('ayın hikâyesi tek sayfalık özet olarak basılır', async ({ page }) => {
    await openDemo(page);
    await page.goto('/hikaye');
    await page.waitForTimeout(1500);
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('article.print-only')).toBeVisible();
    await expect(page.locator('article.print-only')).toContainText('aylık özet');
    const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
    expect(pageCount(pdf)).toBe(1);
    expect(pdf.length).toBeLessThan(600_000);
  });
});
