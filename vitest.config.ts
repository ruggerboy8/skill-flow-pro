import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // demo-capture/specs/*.spec.ts and e2e/specs/*.spec.ts are Playwright
    // specs (import test/expect from @playwright/test, not vitest) --
    // excluded so `vitest run` doesn't try to execute them under the wrong
    // test runner. Their own *.test.ts files (pure helpers) are
    // deliberately left in scope. See DEMO-1b (demo-capture) and PRF-3a
    // (e2e, the shell-persistence tripwire).
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/**',
      '**/demo-capture/specs/**',
      '**/e2e/specs/**',
    ],
  },
  resolve: {
    alias: {
      '@': new URL('./src', import.meta.url).pathname,
      // src/lib/pwa.ts dynamically imports the VitePWA plugin's virtual
      // module in production builds only; this test-only stand-in lets that
      // file (and anything importing it) transform under vitest, which
      // doesn't load vite.config.ts's VitePWA() plugin. See the stub file's
      // header comment for the full explanation.
      'virtual:pwa-register': new URL('./src/test/virtualPwaRegisterStub.ts', import.meta.url).pathname,
    },
  },
});
