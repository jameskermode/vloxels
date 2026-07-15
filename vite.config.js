import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The @dimforge/rapier3d-compat build inlines its wasm as base64, so no special
// bundler config is needed. base: './' makes the built site work from any
// subfolder (e.g. GitHub Pages project pages).
export default defineConfig({
  base: './',
  server: {
    host: true, // same as --host; lets the Pi/tablets reach the dev server
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate', // new deploys ship instantly, no user action
      includeAssets: ['apple-touch-icon-180x180.png', 'favicon-48x48.png'],
      manifest: {
        name: 'Vloxels',
        short_name: 'Vloxels',
        description: 'Build a voxel level, then play it with real spinning-physics.',
        display: 'fullscreen',
        orientation: 'landscape',
        theme_color: '#8ecaff',
        background_color: '#8ecaff',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // The main bundle inlines the Rapier wasm (~2.5 MB), so raise the
        // precache size limit and make sure wasm/json/png are all cached for
        // genuine offline play.
        globPatterns: ['**/*.{js,css,html,json,png,svg,wasm}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
});
