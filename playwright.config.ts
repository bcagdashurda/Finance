import { defineConfig, devices } from '@playwright/test';

/**
 * Uçtan uca testler: gerçek üretim derlemesi (vite build + preview) üzerinde,
 * gerçek kullanıcı gibi tıklayarak. Her test temiz bir tarayıcıyla (boş IndexedDB) başlar.
 *
 *   npm run test:e2e            → tüm ekran boyutları
 *   npm run test:e2e -- --project=laptop-1280
 *   npx playwright show-report  → ekran görüntülü HTML rapor
 */
const PORT = 4317;

const viewport = (name: string, width: number, height: number, mobile = false) => ({
  name,
  use: mobile
    ? { ...devices['Pixel 7'], viewport: { width, height }, channel: 'chrome' as const }
    : { viewport: { width, height }, channel: 'chrome' as const },
});

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  workers: 4,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    // Service worker önbelleği testleri birbirine bağlamasın
    serviceWorkers: 'block',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [
    viewport('mobile-375', 375, 812, true),
    viewport('tablet-768', 768, 1024),
    viewport('laptop-1024', 1024, 768),
    viewport('laptop-1280', 1280, 800),
    viewport('laptop-1440', 1440, 900),
    viewport('fhd-1920', 1920, 1080),
    viewport('qhd-2560', 2560, 1440),
    // Chrome dışı motorlar: iPhone'da tüm tarayıcılar WebKit (Safari) kullanır; Firefox masaüstünde
    // Windows WebKit'te IndexedDB yazımı çok yavaş (satır başına ~15 ms): demo yüklemesi ~15 sn sürer
    { name: 'safari-iphone', use: { ...devices['iPhone 13'] }, timeout: 150_000 },
    { name: 'firefox-1366', use: { ...devices['Desktop Firefox'], viewport: { width: 1366, height: 768 } } },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
