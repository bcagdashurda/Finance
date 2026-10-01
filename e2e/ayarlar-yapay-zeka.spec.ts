import { expect, test } from '@playwright/test';
import { openDemo, watchErrors } from './helpers';

/**
 * Kullanıcıya dönük Ayarlar sade olmalı (kullanıcı geri bildirimi 2026-10-01): teknik bulut ayarı (Supabase)
 * hiç görünmez; yapay zekâ "servis seç → Nasıl alınır? → yapıştır" ile açılır. Gerçek servise istek atılmaz.
 */
test('yapay zekâ ayarı sade: Supabase yok, rehber var, anahtardan servis tanınıyor', async ({ page }, info) => {
  test.skip(!['laptop-1280', 'mobile-375'].includes(info.project.name), 'masaüstü ve telefon yeterli');
  const errors = watchErrors(page);
  await openDemo(page);
  await page.goto('/ayarlar');
  const section = page.locator('#yapay-zeka');
  await expect(section).toBeVisible();

  // Bulut kurulmamışken teknik bölüm ve kelime hiç yok
  await expect(page.locator('#bulut')).toHaveCount(0);
  expect(await page.evaluate(() => /supabase|anon public|edge function/i.test(document.body.innerText))).toBe(false);

  // Servis seçimi ve rehber
  await expect(section.getByRole('radio', { name: /Groq/ })).toHaveAttribute('aria-checked', 'true');
  await section.getByRole('button', { name: 'Nasıl alınır?' }).click();
  const guide = page.getByRole('dialog', { name: 'Groq anahtarı nasıl alınır?' });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole('heading', { level: 3 })).toHaveCount(5);
  await expect(guide.getByRole('link', { name: /Groq’u aç/ })).toHaveAttribute('href', 'https://console.groq.com/keys');
  await page.keyboard.press('Escape');

  // Yanlış servisin anahtarı yapıştırılınca seçim kendiliğinden düzelir
  await section.getByLabel(/anahtarı$/).fill('AIzaSyD-ornek');
  await expect(section.getByRole('radio', { name: /Google Gemini/ })).toHaveAttribute('aria-checked', 'true');
  await expect(section.getByText('Bu bir Google Gemini anahtarı; Google Gemini seçildi.')).toBeVisible();
  await section.getByRole('button', { name: 'Nasıl alınır?' }).click();
  await expect(page.getByRole('dialog', { name: 'Gemini anahtarı nasıl alınır?' }).getByRole('link', { name: /AI Studio/ })).toHaveAttribute('href', 'https://aistudio.google.com/apikey');

  expect(errors, errors.join('\n')).toEqual([]);
});
