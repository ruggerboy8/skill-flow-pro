/**
 * Human pacing for recorded clips.
 *
 * A Playwright run clicks as fast as elements appear, which reads as
 * robotic on camera (John's review of the first Clip 1 take, 2026-09-02:
 * "wayyyy too fast, doesn't feel natural"). Every deliberate pause in a
 * clip spec goes through dwell(), scaled by one knob:
 *
 *   DEMO_CAPTURE_PACE  multiplier, default 1 (natural viewing speed).
 *                      0 disables all dwells (fast smoke run);
 *                      1.5 slows everything by half again.
 *
 * These are *viewing* pauses (a person reading the screen before acting),
 * separate from the readiness waits (waitReady, locator waits) that keep
 * the spec from racing the app. Never replace a readiness wait with a
 * dwell.
 */
import type { Page } from "@playwright/test";

export const PACE = Number(process.env.DEMO_CAPTURE_PACE ?? "1");

/** Pause `ms` milliseconds (scaled by DEMO_CAPTURE_PACE) for on-camera pacing. */
export async function dwell(page: Page, ms: number): Promise<void> {
  if (PACE > 0) await page.waitForTimeout(ms * PACE);
}
