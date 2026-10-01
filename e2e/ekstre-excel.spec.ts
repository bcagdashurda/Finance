import path from 'node:path';
import { expect, test } from '@playwright/test';
import { openDemo, watchErrors } from './helpers';

/**
 * Gerçek Excel ekstresi (.xlsx): bankalar tarihleri Excel tarih sayısı, tutarları sayı olarak verir; bazıları
 * saati de ekler. Üstte rapor başlığı satırları var. 23:50'deki işlem saat dilimi yüzünden ertesi güne
 * kaymamalı. (CSV ile aynı 13 satır: e2e/fixtures/isbank-eylul.xlsx)
 */
test('Excel (.xlsx) ekstresi: tarih, saat ve tutarlar doğru okunur', async ({ page }, info) => {
  test.skip(!['laptop-1280', 'mobile-375', 'firefox-1366'].includes(info.project.name), 'masaüstü, telefon ve Firefox yeterli');
  const errors = watchErrors(page);
  await openDemo(page);
  await page.goto('/islemler?ice-aktar=1');
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles(path.join(import.meta.dirname, 'fixtures', 'isbank-eylul.xlsx'));
  await expect(dialog).toContainText('13 okunabilir satır');
  await dialog.getByRole('button', { name: /Devam: eşleştir/ }).click();
  await expect(dialog).toContainText('13 aktarılacak');

  const row = (text: string) => dialog.locator('li', { hasText: text });
  // Tam gün, 14:35 ve 23:50 içeren tarihler aynı güne düşer
  await expect(row('GELEN HAVALE YILDIZ GIDA A.S. FT')).toContainText('02.09.2026');
  await expect(row('EFT DEMIR KUMAS')).toContainText('03.09.2026');
  await expect(row('ENERJISA')).toContainText('22.09.2026');
  await expect(row('MAAS ODEMESI')).toContainText('15.09.2026');
  // Tutar ve yön (sayı hücreleri)
  await expect(row('POS SATIS')).toContainText('+₺18.240,50');
  await expect(row('EFT DEMIR KUMAS')).toContainText('−₺38.500,00');
  await expect(row('HESAP ISLETIM')).toContainText('−₺85,00');

  await dialog.getByRole('button', { name: '13 işlemi aktar' }).click();
  await expect(page.getByText('13 işlem içe aktarıldı')).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});
