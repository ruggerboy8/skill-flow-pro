import { defineConfig, devices } from "@playwright/test";
import { BASE_URL, HEADED, OUTPUT_DIR, RETRIES } from "./config.ts";

/**
 * DEMO-1b capture harness config.
 *
 * Five clips, one spec file each, run sequentially (workers: 1) so nothing
 * else on the machine is competing for CPU/network while a clip records —
 * conference b-roll needs steady frame timing, not fast CI throughput.
 *
 * Run with:
 *   npx playwright test --config=demo-capture/playwright.config.ts
 * or, from demo-capture/: npx playwright test
 *
 * See demo-capture/README.md for prerequisites (the demo org must be
 * seeded first — DEMO-1a) and the exact env vars this reads.
 */
export default defineConfig({
  testDir: "./specs",
  outputDir: OUTPUT_DIR,
  fullyParallel: false,
  workers: 1,
  retries: RETRIES,
  // Live Supabase calls (auth, queries, and — for Clip 4 — an AI edge
  // function) are slower than a mocked test suite; give each clip room.
  timeout: 120_000,
  reporter: [["list"]],
  globalSetup: "./setup/create-storage-states.ts",
  use: {
    baseURL: BASE_URL,
    headless: !HEADED,
    viewport: { width: 1920, height: 1080 },
    video: {
      mode: "on",
      size: { width: 1920, height: 1080 },
    },
    // No screenshot/trace noise needed for a clean recording run; re-enable
    // locally (`trace: 'on'`) if a clip is failing and needs debugging.
    trace: "off",
    screenshot: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
