import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // demo-capture/specs/*.spec.ts are Playwright specs (import test/expect
    // from @playwright/test, not vitest) -- excluded so `vitest run` doesn't
    // try to execute them under the wrong test runner. demo-capture's own
    // *.test.ts files (its pure env-lookup helpers) are deliberately left
    // in scope. See DEMO-1b.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**', '**/demo-capture/specs/**'],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
    },
  },
});
