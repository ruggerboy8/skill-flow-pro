import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE_URL } from "../demo-capture/config.ts";

const HERE = path.dirname(fileURLToPath(import.meta.url));

/**
 * PRF-3a: shell-persistence regression tripwire.
 *
 * PRF-3 (PR #70, merged) route-split the app with React.lazy and put both
 * Suspense boundaries inside src/components/Layout.tsx, scoped around each
 * shell variant's <Outlet/>, so the sidebar/header/tab bar stay mounted
 * while a lazy route's chunk is still loading. That placement is a
 * structural footgun nothing automated was guarding: an earlier version of
 * this same change had a single Suspense boundary wrapping the whole routed
 * tree instead, which unmounts the entire shell on every first visit to a
 * lazy route -- and that version sailed past tsc, lint, and 502 unit tests
 * without a single failure. This config exists to run the one spec that
 * catches that regression the moment it reappears.
 *
 * Deliberately a separate config from demo-capture/playwright.config.ts,
 * not a sixth spec folded into it: that harness is tuned for recording
 * 1080p conference b-roll (video always on, fixed 1920x1080, workers: 1 for
 * steady frame timing) for the five specific presentation clips -- a
 * different job from a fast, repeatable structural tripwire. What it DOES
 * reuse directly, rather than re-implementing, is demo-capture's own
 * building blocks: BASE_URL below, and `globalSetup`, which is the exact
 * same login/storageState script (demo-capture/setup/create-storage-states.ts)
 * the DEMO-1b specs use -- so there is exactly one place that knows how to
 * sign a persona in and save its session, not two.
 *
 * Run with:
 *   npx playwright test --config=e2e/playwright.config.ts
 * See e2e/README.md for prerequisites -- same demo org + credentials as
 * demo-capture (see demo-capture/README.md "Env vars").
 */
export default defineConfig({
  testDir: "./specs",
  outputDir: path.join(HERE, "test-results"),
  fullyParallel: true,
  retries: 0,
  timeout: 30_000,
  reporter: [["list"]],
  // Reuses demo-capture's login script verbatim (see file header above).
  globalSetup: "../demo-capture/setup/create-storage-states.ts",
  use: {
    baseURL: BASE_URL,
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
