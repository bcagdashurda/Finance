// Raporların gerçek yazdırma çıktısını (A4 PDF) üretir: node e2e/pdf-check.mjs [çıktı klasörü]
// Uygulama http://localhost:5173 adresinde çalışıyor olmalı.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const out = process.argv[2] ?? 'test-results/pdf';
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 }, locale: 'tr-TR' })).newPage();
await page.goto('http://localhost:5173/');
await page.getByRole('button', { name: 'Demo işletmeyle keşfet' }).click();
await page.getByRole('heading', { name: 'Kokpit', level: 1 }).waitFor();
for (const id of ['pnl', 'cashflow', 'category', 'aging', 'kdv']) {
  await page.goto(`http://localhost:5173/raporlar?rapor=${id}`);
  await page.waitForTimeout(2500);
  // Not: emulateMedia('screen') sonrası page.pdf ekran stilini kullanır; hep 'print' ile üretilir
  await page.emulateMedia({ media: 'print' });
  await page.pdf({ path: `${out}/rapor-${id}.pdf`, preferCSSPageSize: true, printBackground: true });
  console.log('yazıldı', id);
}
await page.goto('http://localhost:5173/hikaye');
await page.waitForTimeout(2500);
await page.emulateMedia({ media: 'print' });
await page.pdf({ path: `${out}/hikaye.pdf`, preferCSSPageSize: true, printBackground: true });
console.log('yazıldı hikaye');
await browser.close();
