import { defineConfig } from 'vite';

// Nothing fancy: the @dimforge/rapier3d-compat build inlines its wasm as
// base64, so no special bundler config is needed. base: './' makes the built
// site work from any subfolder (e.g. GitHub Pages project pages).
export default defineConfig({
  base: './',
  server: {
    host: true, // same as --host; lets the Pi/tablets reach the dev server
  },
});
