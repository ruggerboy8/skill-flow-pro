import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    // Honor a harness/host-assigned PORT (e.g. when 8080 is taken by another
    // dev server); fall back to 8080 for normal local runs.
    port: Number(process.env.PORT) || 8080,
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
    VitePWA({
      // Registration is manual and per-user gated (staff.pwa_enabled or the
      // pwa_v1 localStorage flag) — see src/lib/pwa.ts. The manifest and SW
      // are emitted for everyone but stay inert until a flagged user
      // activates. docs/features/pwa-push-notifications.md
      injectRegister: null,
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png', 'brand/alcan-icon.svg'],
      manifest: {
        name: 'Pro Moves',
        short_name: 'Pro Moves',
        description: 'Alcan Pro Moves — weekly practice, coaching, and growth',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell only: precache build assets so the installed app opens
        // instantly, but never cache runtime data — Supabase calls always hit
        // the network (stale check-in data is worse than a spinner).
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/auth\//, /^\/sedation/],
        cleanupOutdatedCaches: true,
        runtimeCaching: [],
        // Main bundle is ~3.4 MB; raise the precache ceiling so the app
        // shell (including the main chunk) is actually precached.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
