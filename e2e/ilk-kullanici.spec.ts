import path from 'node:path';
import { expect, test } from '@playwright/test';
import { expectNoHorizontalOverflow, openDemo, snap, stubNetwork, watchErrors } from './helpers';

/**
 * Uygulamayı ilk kez açan gerçek bir kullanıcı: kendi işletmesini kurar, hesap, cari, fatura girer,
 * banka ekstresini içe aktarır. Hem akışı hem de sonuçtaki RAKAMLARI doğrular.
 */
test('ilk kullanıcı: kurulum → hesap → cari → fatura → ekstre', async ({ page }, info) => {
  const errors = watchErrors(page);
  await stubNetwork(page);
  await page.goto('/');

  // --- Kurulum ve doğrulama
  await page.getByRole('button', { name: 'Kendi işletmemi kur' }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'İşletmeyi kur' }).click();
  await expect(dialog.getByText('İşletmenizin adını yazın')).toBeVisible();
  await expect(dialog.getByRole('textbox', { name: 'İşletme adı' })).toBeFocused();
  await dialog.getByRole('textbox', { name: 'İşletme adı' }).fill('Atlas Tekstil');
  await dialog.getByRole('textbox', { name: /Vergi numarası/ }).fill('123456789');
  await dialog.getByRole('button', { name: 'İşletmeyi kur' }).click();
  await expect(dialog.getByText(/Vergi numarası geçersiz/)).toBeVisible();
  await dialog.getByRole('textbox', { name: /Vergi numarası/ }).fill('');
  await dialog.getByRole('button', { name: 'İşletmeyi kur' }).click();

  // --- Boş Kokpit: yönlendiren rehber var, sıfırlarla dolu panolar ve sahte alarm yok
  await expect(page.getByRole('heading', { name: /birkaç dakikada hazırlayın/ })).toBeVisible();
  await expect(page.getByText('Başlangıç · 0/5')).toBeVisible();
  await expect(page.getByText('Nakit pozisyonu')).toHaveCount(1); // yalnızca önizleme kartında
  await expectNoHorizontalOverflow(page, 'boş kokpit');
  await snap(page, info, '01-bos-kokpit');

  // --- 1. Hesap: IBAN'dan banka tanınır, "850 bin" yazımı anlaşılır
  await page.getByRole('button', { name: /Banka ve kasa hesaplarınızı ekleyin/ }).click();
  await expect(page).toHaveURL(/\/hesaplar$/);
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Hesap adı' }).fill('İş Bankası Ticari');
  await dialog.getByRole('textbox', { name: /IBAN/ }).fill('TR950006400000001234567890');
  await expect(dialog.getByText('İş Bankası hesabı olarak tanındı')).toBeVisible();
  await dialog.getByRole('textbox', { name: 'Başlangıç bakiyesi' }).fill('850 bin');
  await snap(page, info, '02-hesap-formu');
  await dialog.getByRole('button', { name: 'Hesabı ekle' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('main')).toContainText('850.000');
  await expect(page.locator('main')).toContainText('İş Bankası Ticari');

  // --- 2. Cariler: seri giriş ("Kaydet ve yenisini ekle"), devir bakiyesi
  await page.goto('/cariler?yeni=1');
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Ad / unvan' }).fill('Yıldız Gıda A.Ş.');
  await dialog.getByRole('textbox', { name: 'Devir tutarı' }).fill('120 bin');
  await dialog.getByRole('button', { name: 'Kaydet ve yenisini ekle' }).click();
  await expect(dialog.getByRole('textbox', { name: 'Ad / unvan' })).toHaveValue('');
  await dialog.getByRole('radio', { name: 'Tedarikçi' }).click();
  await dialog.getByRole('textbox', { name: 'Ad / unvan' }).fill('Demir Kumaş Ltd.');
  await dialog.getByRole('radio', { name: 'Biz borçluyuz' }).click();
  await dialog.getByRole('textbox', { name: 'Devir tutarı' }).fill('80.000');
  await dialog.getByRole('button', { name: 'Cariyi ekle' }).click();
  await expect(dialog).toBeHidden();
  const main = page.locator('main');
  await expect(main).toContainText('Yıldız Gıda A.Ş.');
  await expect(main).toContainText('Demir Kumaş Ltd.');
  await expect(main).toContainText('120.000');
  await expect(main).toContainText('80.000');

  // --- 3. Alacak faturası: başlık boş bırakılsa da kaydedilir
  await page.goto('/');
  await page.getByRole('button', { name: /Açık fatura ve yaklaşan ödemeleri girin/ }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /Belge tutarı/ }).fill('240 bin');
  await dialog.getByRole('button', { name: /^Cari/ }).click();
  await page.keyboard.type('Yıldız');
  await page.keyboard.press('Enter');
  await expect(dialog.getByRole('button', { name: /^Cari/ })).toContainText('Yıldız Gıda');
  await dialog.getByRole('button', { name: 'Kaydet' }).click();
  await expect(page.getByText('Alacak kaydedildi')).toBeVisible();
  // Kokpit alacak toplamı Cariler ile aynı kaynaktan: 120.000 devir + 240.000 fatura
  await expect(page.locator('main')).toContainText('360.000');
  // Zorunlu üç adım bitti: büyük kurulum paneli yerine tek satır; kalan isteğe bağlı adımlar bağlantı
  const strip = page.getByRole('region', { name: 'Kurulum' });
  await expect(strip).toContainText('Temel kurulum tamam');
  await expect(strip.getByRole('button', { name: 'banka ekstrenizi içe aktarın' })).toBeVisible();
  await expect(strip.getByRole('button', { name: 'yapay zekâyı açın' })).toBeVisible();
  await expect(page.getByText('Kurulumu tamamlayın.')).toHaveCount(0);
  await snap(page, info, '03-kokpit-dolu');

  // --- 4. Ekstre içe aktarma: kolonlar ve kategoriler otomatik
  await page.goto('/islemler?ice-aktar=1');
  dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles(path.join(import.meta.dirname, 'fixtures', 'isbank-eylul.csv'));
  await expect(dialog).toContainText('13 okunabilir satır');
  await dialog.getByRole('button', { name: /Devam: eşleştir/ }).click();
  await expect(dialog).toContainText('13 aktarılacak');
  await expect(dialog).toContainText('başlangıç tarihinden');
  const cat = (text: string) => dialog.locator('li', { hasText: text }).locator('select option:checked');
  await expect(cat('SGK PRIM')).toHaveText('SGK ve muhtasar');
  await expect(cat('MAAS ODEMESI')).toHaveText('Personel maaşları');
  await expect(cat('TURK TELEKOM')).toHaveText('Yazılım ve abonelikler');
  await expect(cat('OPET')).toHaveText('Araç ve yakıt');
  await expect(cat('GELEN HAVALE YILDIZ GIDA A.S. FT')).toHaveText('Yıldız Gıda A.Ş.');
  await snap(page, info, '04-ekstre-kontrol');
  await dialog.getByRole('button', { name: '13 işlemi aktar' }).click();
  await expect(page.getByText('13 işlem içe aktarıldı')).toBeVisible();

  // Açılıştan önceki ekstre bugünkü bakiyeyi DEĞİŞTİRMEZ (çift sayım yok)
  await page.goto('/hesaplar');
  await expect(page.locator('main')).toContainText('850.000');
  // Devirden önceki tahsilatlar cari bakiyesinden tekrar DÜŞÜLMEZ: 120.000 + 240.000
  await page.goto('/cariler');
  await expect(page.locator('main').locator('a, li, tr', { hasText: 'Yıldız Gıda A.Ş.' }).first()).toContainText('360.000');
  await expectNoHorizontalOverflow(page, 'cariler');

  expect(errors, errors.join('\n')).toEqual([]);
});

test('carileri muhasebe programı çıktısından toplu aktarma', async ({ page }) => {
  const errors = watchErrors(page);
  await stubNetwork(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Kendi işletmemi kur' }).click();
  await page.getByRole('dialog').getByRole('textbox', { name: 'İşletme adı' }).fill('Atlas Tekstil');
  await page.getByRole('dialog').getByRole('button', { name: 'İşletmeyi kur' }).click();
  await expect(page.getByText('Başlangıç · 0/5')).toBeVisible();
  await page.goto('/cariler?ice-aktar=1');
  const dialog = page.getByRole('dialog');
  await dialog.locator('input[type=file]').setInputFiles(path.join(import.meta.dirname, 'fixtures', 'logo-cari-listesi.csv'));
  // Rapor başlıkları atlanır, 120/320'deki aynı firma birleştirilir, bozuk alanlar işaretlenir
  await expect(dialog).toContainText('8 cari eklenecek');
  await expect(dialog).toContainText('₺844.101');
  await expect(dialog).toContainText('₺200.050');
  await expect(dialog).toContainText('birleştirildi');
  await expect(dialog).toContainText('VKN/TCKN geçersiz');
  await dialog.getByRole('button', { name: '8 cariyi ekle' }).click();
  await expect(page.getByText('8 cari eklendi')).toBeVisible();
  const main = page.locator('main');
  await expect(main).toContainText('₺644.051'); // net cari pozisyon
  await expect(main).toContainText('Müşteri ve tedarikçi');
  await expectNoHorizontalOverflow(page, 'cariler (aktarım sonrası)');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('demodan kendi işletmesine geçiş tek adımda', async ({ page }) => {
  const errors = watchErrors(page);
  await stubNetwork(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Demo işletmeyle keşfet' }).click();
  await expect(page.getByText('Demo işletme', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Kendi işletmemi kur' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Devam et' }).click();
  // Karşılama ekranında kurulum penceresi kendiliğinden açılır
  await expect(page.getByRole('dialog').getByRole('heading', { name: 'İşletmenizi kurun' })).toBeVisible();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('cari seçici: kelime başı arama ve Escape ile katman katman kapanma', async ({ page }, info) => {
  const errors = watchErrors(page);
  await openDemo(page);
  if ((info.project.use.viewport?.width ?? 1280) < 1024) {
    await page.getByRole('navigation', { name: 'Alt gezinme' }).getByRole('button', { name: 'Yeni kayıt' }).click();
  } else {
    await page.getByRole('button', { name: 'Kayıt', exact: true }).first().click();
  }
  const sheet = page.getByRole('dialog');
  await sheet.getByRole('radio', { name: 'Ödeme' }).click();
  await sheet.getByRole('button', { name: /^Kime/ }).click();
  await page.keyboard.type('ege');
  // Harf harf dağınık eşleşme değil, kelime başı eşleşmesi en üstte seçili olmalı
  await expect(page.locator('[cmdk-item][data-selected="true"]')).toContainText('Ege');
  await page.keyboard.press('Escape');
  await expect(page.locator('[cmdk-root]')).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('komut paleti: yazarak kayıt (yapay zekâ olmadan)', async ({ page }, info) => {
  test.skip((info.project.use.viewport?.width ?? 1280) < 640, 'klavye kısayolu masaüstü içindir');
  const errors = watchErrors(page);
  await stubNetwork(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Demo işletmeyle keşfet' }).click();
  await expect(page.getByRole('heading', { name: 'Kokpit', level: 1 })).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog');
  await expect(palette).toBeVisible();
  await page.keyboard.type('yarın 45 bin kira ödemesi');
  await snap(page, info, 'palet');
  await page.keyboard.press('Enter');
  const sheet = page.getByRole('dialog');
  await expect(sheet.getByRole('textbox', { name: /Tutar/ })).toHaveValue(/45\.000/);
  expect(errors, errors.join('\n')).toEqual([]);
});
