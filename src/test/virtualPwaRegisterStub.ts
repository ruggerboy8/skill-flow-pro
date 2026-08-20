// Stand-in for the 'virtual:pwa-register' module the real VitePWA Vite
// plugin provides (see vite.config.ts). Vitest's transform pipeline
// (vitest.config.ts) doesn't load that plugin, so without an alias to this
// file, transforming src/lib/pwa.ts fails at import-analysis time for any
// test that transitively imports it — even though the real import only
// executes in production builds, behind an `import.meta.env.DEV` guard.
// Aliased in vitest.config.ts; never used at runtime in the actual app.
export function registerSW() {
  return () => Promise.resolve();
}
