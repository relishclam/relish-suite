import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon-180x180.png',
        'maskable-icon-512x512.png',
      ],
      manifest: false, // We supply our own public/manifest.json (Step 6)
      workbox: {
        // Cache first-party app shell
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Runtime caching for Supabase API calls
        runtimeCaching: [
          {
            // Suite DB API
            urlPattern: /^https:\/\/mmkbknnzgpvsqgnynrbe\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'suite-api',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 }, // 1 hour
              networkTimeoutSeconds: 5,
            },
          },
          {
            // Approvals DB API (read-only)
            urlPattern: /^https:\/\/ewbguvwrejdvlhzcqlbp\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'approvals-api',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            // ClamFlow DB API (read-only)
            urlPattern: /^https:\/\/idwgenbkguejgwtzbicu\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'clamflow-api',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 },
              networkTimeoutSeconds: 5,
            },
          },
          {
            // Google Fonts stylesheets
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // Google Fonts webfont files
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
