import { defineConfig } from 'vitest/config';
import { WxtVitest } from 'wxt/testing/vitest-plugin';

// WxtVitest resolves #imports, applies the wxt.config vite setup, sets
// import.meta.env.BROWSER/FIREFOX/etc., and mocks `browser` via fakeBrowser.
export default defineConfig({
  plugins: [WxtVitest()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
  },
});
