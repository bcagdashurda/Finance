/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import trialHandler from './api/ai/[...path]';

/**
 * Vercel'deki ücretsiz deneme işlevini (api/ai) yerel geliştirme ve önizleme sunucusunda da çalıştırır:
 * uygulamanın deneme yoklaması yerelde 404 (konsol hatası) almasın, deneme yerelde de denenebilsin.
 * Anahtar yalnızca kabuk ortamından (GROQ_API_KEY); yoksa deneme "kapalı" görünür.
 */
function trialApi(): Plugin {
  const handle = async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    if (!req.url?.startsWith('/api/ai/')) return next();
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) headers.append(k, x);
    const response = await trialHandler(
      new Request(`http://${req.headers.host ?? 'localhost'}${req.url}`, { method: req.method, headers, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(chunks) }),
    );
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
  return {
    name: 'mizan-trial-api',
    configureServer: (server) => void server.middlewares.use(handle),
    configurePreviewServer: (server) => void server.middlewares.use(handle),
  };
}

export default defineConfig({
  plugins: [
    trialApi(),
    react(),
    tailwindcss(),
    // Kurulabilir uygulama + çevrimdışı açılış: kabuk ve kod önbellekte, veriler zaten cihazda (IndexedDB)
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Mizan — Nakit Kokpiti',
        short_name: 'Mizan',
        description: 'İşletmenizin nakdini bugünden 13 hafta ileriye kadar gösteren finans kokpiti.',
        lang: 'tr',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        theme_color: '#2340B8',
        background_color: '#F3F5F8',
        categories: ['finance', 'business', 'productivity'],
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        shortcuts: [
          { name: 'Nakit akışı', url: '/akis' },
          { name: 'İşlemler', url: '/islemler' },
          { name: 'Cariler', url: '/cariler' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Türkçe için gereksiz yazı tipi alt kümeleri ve nadir kullanılan Excel motoru ilk kurulumda indirilmez
        globIgnores: ['**/*-{vietnamese,cyrillic,cyrillic-ext,greek}-*.woff2', '**/xlsx-*.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/functions\//, /^\/rest\//, /^\/auth\//],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // Adı özetli (hash'li) dosyalar değişmez: ilk kullanımda önbelleğe al
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/assets/'),
            handler: 'CacheFirst',
            options: { cacheName: 'varliklar', expiration: { maxEntries: 60, maxAgeSeconds: 60 * 24 * 3600 } },
          },
          {
            // Döviz kurları: ağ öncelikli, çevrimdışıyken son bilinen kur
            urlPattern: /^https:\/\/api\.frankfurter\.dev\//,
            handler: 'NetworkFirst',
            options: { cacheName: 'kurlar', networkTimeoutSeconds: 4, expiration: { maxEntries: 20, maxAgeSeconds: 7 * 24 * 3600 } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        // Kütüphaneleri ayrı, uzun ömürlü önbelleklenebilir parçalara böl
        manualChunks(id: string) {
          const m = id.match(/node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/);
          if (!m) return undefined;
          const pkg = m[1]!.replace(/\\/g, '/');
          if (['react', 'react-dom', 'scheduler', 'react-router'].includes(pkg)) return 'vendor-react';
          if (['motion', 'framer-motion', 'motion-dom', 'motion-utils'].includes(pkg)) return 'vendor-motion';
          if (pkg.startsWith('@radix-ui/') || ['radix-ui', 'cmdk', '@floating-ui/react-dom', '@floating-ui/dom', '@floating-ui/core', '@floating-ui/utils'].includes(pkg)) return 'vendor-ui';
          if (pkg.startsWith('d3-') || pkg === 'internmap') return 'vendor-d3';
          if (pkg === 'dexie' || pkg === 'dexie-react-hooks') return 'vendor-dexie';
          if (pkg === '@phosphor-icons/react') return 'vendor-icons';
          return undefined;
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    setupFiles: ['./src/test/setup.ts'],
  },
});
