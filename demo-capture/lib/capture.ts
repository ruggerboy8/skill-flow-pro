/**
 * Shared capture recipe for recorded clips (TAKE 4 item 6): clock fake,
 * ripple + tap-log init scripts, storage suppressions, 2x video sizing,
 * and the taps.json writer. Specs 01 and 06 consume this today; clips 2-4
 * (desktop) inherit it next round via DESKTOP_CAPTURE_USE.
 *
 * The polish stage (brand compositor: device frame, eased zooms keyed from
 * taps, 1080p60 re-render) consumes exactly two files per approved clip,
 * both in recordings/: <clip>.webm + <clip>-taps.json. Raw handoff — no
 * editing, trimming, or re-encoding here.
 */
import { writeFileSync } from "node:fs";
import type { Page } from "@playwright/test";

/**
 * Frozen page clock: Mon Aug 31 2026, 1:30 PM Chicago (the pinned context
 * timezone below). Monday of the seeded week — removes the "confidence is
 * late" advisory and makes the header date deterministic across retakes.
 * setFixedTime only fakes Date; timers (the wizard's celebration
 * setTimeout) keep running.
 */
export const CAPTURE_FIXED_TIME = new Date("2026-08-31T18:30:00Z");

/**
 * Phone clips: 390x844 CSS px recorded as TRUE 780x1688 pixels.
 *
 * The naive route (context deviceScaleFactor + a 2x video.size) does NOT
 * work: Playwright's screencast captures at CSS resolution and only ever
 * scales DOWN to video.size — a 390x844 capture in a 780x1688 video comes
 * out padded into the corner with dead gray, not upscaled (verified by
 * frame extraction, take 4). --force-device-scale-factor=2 makes the
 * compositor rasterize at 2x physical pixels, so the screencast itself
 * delivers real 780x1688 frames. Click coordinates are unaffected (the
 * flag only changes rasterization, not the CSS coordinate space).
 */
export const MOBILE_CAPTURE_USE = {
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  launchOptions: { args: ["--force-device-scale-factor=2"] },
  video: { mode: "on" as const, size: { width: 780, height: 1688 } },
  timezoneId: "America/Chicago",
};

/** Desktop clips (2-4, next round): 1920x1080 CSS px rasterized at 2x
 * (3840x2160 frames), downscaled by Playwright to the contracted
 * 2560x1440 — downscaling, unlike upscaling, it does correctly. */
export const DESKTOP_CAPTURE_USE = {
  viewport: { width: 1920, height: 1080 },
  deviceScaleFactor: 2,
  launchOptions: { args: ["--force-device-scale-factor=2"] },
  video: { mode: "on" as const, size: { width: 2560, height: 1440 } },
  timezoneId: "America/Chicago",
};

/**
 * Everything a recorded page needs before the first navigation:
 *
 * - Suppress the PWA install banner ("Get the Pro Moves app") — it floats
 *   fixed over the wizard's Next button (intercepted a take-2 click) and
 *   doesn't belong in footage. 'on' is the value src/lib/pwa.ts stores
 *   when a user taps Dismiss.
 * - Clear any queued pending_submissions:* entries — leftovers make
 *   useReliableSubmission retry them on load and pop a "Recovered
 *   submission" toast mid-take (take-3 review, item B).
 * - Tap ripples: mobile emulation has no cursor, so every pointerdown
 *   draws a brief Alcan-navy ripple (.35 — .25 read faint on the pale
 *   wizard screens) and logs {t,x,y} to window.__taps. The ripple doubles
 *   as the compositor's sync beacon for aligning the tap log to frames.
 * - The fixed clock (see CAPTURE_FIXED_TIME).
 */
export async function installCaptureSetup(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("pwa_banner_dismissed", "on");
    Object.keys(localStorage)
      .filter((k) => k.startsWith("pending_submissions"))
      .forEach((k) => localStorage.removeItem(k));
  });

  await page.addInitScript(() => {
    (window as unknown as { __taps: unknown[] }).__taps = [];
    addEventListener(
      "pointerdown",
      (e: PointerEvent) => {
        (window as unknown as { __taps: unknown[] }).__taps.push({ t: performance.now(), x: e.clientX, y: e.clientY });
        const r = document.createElement("div");
        r.style.cssText =
          `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:14px;height:14px;` +
          `margin:-7px 0 0 -7px;border-radius:50%;background:rgba(17,59,98,.35);` +
          `border:2px solid rgba(17,59,98,.5);pointer-events:none;z-index:2147483647;` +
          `transition:transform 450ms ease-out,opacity 450ms ease-out;`;
        document.body.appendChild(r);
        requestAnimationFrame(() => {
          r.style.transform = "scale(3.2)";
          r.style.opacity = "0";
        });
        setTimeout(() => r.remove(), 500);
      },
      true,
    );
  });

  await page.clock.setFixedTime(CAPTURE_FIXED_TIME);
}

/**
 * Emit the tap log beside the video. Timestamps are page-relative (the
 * compositor aligns on the first ripple it sees); coordinates are CSS
 * pixels in the clip's viewport space.
 */
export async function writeTapLog(
  page: Page,
  clipName: string,
  viewport: { w: number; h: number },
  /** Output filename base — the handoff checklists name these literally
   * ("clip1-taps.json", "clip5-taps.json"), shorter than the clip name. */
  fileBase: string = clipName,
): Promise<void> {
  const taps = await page.evaluate(() => (window as unknown as { __taps: unknown[] }).__taps);
  writeFileSync(
    new URL(`../recordings/${fileBase}-taps.json`, import.meta.url),
    JSON.stringify({ clip: clipName, viewport, taps }, null, 2),
  );
}
