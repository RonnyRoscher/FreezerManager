/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/FreezerManager/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'FreezerManager',
        short_name: 'Gefrierfach',
        description: 'Gefriergut erfassen, Labels drucken und per QR-Scan austragen',
        lang: 'de',
        display: 'standalone',
        start_url: '/FreezerManager/',
        scope: '/FreezerManager/',
        theme_color: '#1f6feb',
        background_color: '#f4f7fa',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      // Only the app shell is cached; data always comes live from Supabase.
      workbox: { globPatterns: ['**/*.{js,css,html,png,svg}'], runtimeCaching: [] },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test/setup.ts'],
  },
});
