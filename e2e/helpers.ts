import { expect, type Page, type TestInfo } from '@playwright/test';

/** Dış servisleri sabitle: testler internete ve günün kuruna bağlı olmasın. */
export async function stubNetwork(page: Page) {
  await page.route('https://api.frankfurter.dev/**', (route) =>
    route.fulfill({ json: [{ date: '2026-09-30', base: 'TRY', quote: 'USD', rate: 0.0204 }, { date: '2026-09-30', base: 'TRY', quote: 'EUR', rate: 0.018 }, { date: '2026-09-30', base: 'TRY', quote: 'GBP', rate: 0.0153 }] }),
  );
}

/** Konsol hatalarını ve yakalanmamış istisnaları toplar; test sonunda boş olmalı. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

/** Sayfa yatayda taşmamalı (mobilde yana kaydırma = kırık yerleşim). */
export async function expectNoHorizontalOverflow(page: Page, where: string) {
  const { scroll, inner, culprits } = await page.evaluate(() => {
    const inner = document.documentElement.clientWidth;
    const culprits: string[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > inner + 1) {
        // Kendi içinde kaydırılan kapsayıcıların çocuklarını sayma
        let p = el.parentElement;
        let clipped = false;
        while (p) {
          const s = getComputedStyle(p);
          if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) {
            clipped = true;
            break;
          }
          p = p.parentElement;
        }
        if (!clipped) culprits.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)} → ${Math.round(r.right)}px`);
      }
    }
    return { scroll: document.documentElement.scrollWidth, inner, culprits: culprits.slice(0, 5) };
  });
  expect(scroll, `${where}: yatay taşma (${scroll}px > ${inner}px). Taşan: ${culprits.join(' | ')}`).toBeLessThanOrEqual(inner + 1);
}

export async function snap(page: Page, info: TestInfo, name: string) {
  await page.waitForTimeout(400);
  const body = await page.screenshot({ fullPage: true, animations: 'disabled' });
  await info.attach(name, { body, contentType: 'image/png' });
}

/**
 * Demo işletmeyi yükleyip Kokpit'e iner. Uzun bekleme yalnızca Playwright'ın Windows WebKit derlemesi için:
 * orada IndexedDB satır başına ~15 ms yazıyor (ham IndexedDB ile ölçüldü; Chrome'da tüm demo ~0,3 sn).
 */
export async function openDemo(page: Page) {
  await stubNetwork(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Demo işletmeyle keşfet' }).click();
  await expect(page.getByRole('heading', { name: 'Kokpit', level: 1 })).toBeVisible({ timeout: 45_000 });
}

export const isMobile = (info: TestInfo) => (info.project.use.viewport?.width ?? 1280) < 640;
