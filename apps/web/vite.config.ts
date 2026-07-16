import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PLAN §13 Phase 8 — installability (manifest + service worker) for the
    // permanent browser-only mobile story (§14). Icons are pre-generated,
    // committed static files (via `npx pwa-assets-generator`, see
    // pwa-assets.config.ts) rather than regenerated on every build — sharp's
    // native bindings are a fragile thing to depend on inside the Docker
    // build stage for something that only changes when the logo does.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180x180.png'],
      manifest: {
        name: 'Distill',
        short_name: 'Distill',
        description: 'A cybersecurity-focused RSS/API news reader.',
        theme_color: '#863bff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache the built SPA shell only — API responses stay live
        // (auth-scoped, always fresh), no runtime-caching strategy for them.
        // Fonts are deliberately excluded from the precache glob: the reader
        // font picker (apps/web/src/lib/reader-fonts.ts) ships ~10 curated
        // webfonts so only one is ever actually rendered at a time — forcing
        // every visitor to download all of them upfront would bloat the
        // install by several MB. runtimeCaching below caches each font the
        // first time it's actually used instead.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /\.woff2?$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'reader-fonts',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: Number(process.env.WEB_PORT ?? 3000),
  },
})
