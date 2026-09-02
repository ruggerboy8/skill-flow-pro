import type { Page } from "@playwright/test";

/**
 * Wait for the page to go quiet before any scripted cursor movement.
 *
 * Every clip is recorded against live Supabase data, not a mock — a click
 * that fires the instant the page paints can land while a query is still in
 * flight, putting a loading skeleton or a layout jump in the recorded frame.
 * `networkidle` (no in-flight requests for 500ms) is the closest built-in
 * signal Playwright has to "the data actually arrived." Real API latency
 * varies, so callers should call this before every meaningful interaction,
 * not just once per page load.
 */
export async function waitReady(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle");
}
