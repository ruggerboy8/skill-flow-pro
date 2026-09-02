/**
 * Clip 1: staff self-eval.
 *
 * A staff login opens the current week, sees the three assigned Pro Moves,
 * rates confidence on each, and submits. DEMO-1a's seed guarantees
 * demo-staff has an uncompleted, locked current-week assignment so this
 * always has something to record (see scripts/demo-seed/README.md,
 * "Design decisions worth knowing about").
 *
 * Route: "/" (src/pages/Index.tsx -> ThisWeekPanel) then the confidence
 * wizard at /confidence/current/step/:n (src/pages/ConfidenceWizard.tsx).
 *
 * RE-RUNNING THIS CLIP: submitting confidence permanently completes
 * demo-staff's current week, so recording this clip a second time -- a
 * manual retake, or Playwright's own `retries` firing after a submit
 * already landed -- finds no "Rate Confidence" CTA. beforeEach below
 * clears it automatically (see setup/reset-clip1.ts) when a service-role
 * key is configured; otherwise the visibility assertion fails with an
 * explicit next step instead of a bare timeout. See README "Clip 1 is
 * re-runnable".
 */
import { writeFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { CLIP_PERSONAS, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, credsFor, storageStatePath } from "../config.ts";
import { waitReady } from "../lib/waitReady.ts";
import { dwell } from "../lib/pace.ts";
import { resetClip1ConfidenceScore } from "../setup/reset-clip1.ts";

// Phone-sized by default (John's direction, 2026-09-02): the staff-facing
// demo is the mobile PWA experience. demo-staff has staff.pwa_enabled = true
// in the seeded org, and useMobileShell requires viewport < 768px on top of
// that flag, so this viewport is what actually switches the recording onto
// the mobile shell (tab bar, mobile home). DEMO_CLIP1_VIEWPORT=desktop
// reverts to the shared 1920x1080 frame.
const MOBILE = process.env.DEMO_CLIP1_VIEWPORT !== "desktop";
test.use({
  storageState: storageStatePath(CLIP_PERSONAS.staffSelfEval),
  ...(MOBILE
    ? {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 3,
        isMobile: true,
        hasTouch: true,
        // Record at 2x the viewport: Playwright downsamples the capture to
        // video.size, so writing at 390x844 threw away the deviceScaleFactor
        // pixels and left text soft (John's take-2 review). The polish stage
        // wants clean pixels; it handles fps/motion itself.
        video: { mode: "on" as const, size: { width: 780, height: 1688 } },
        // Deterministic clock rendering regardless of which machine records.
        timezoneId: "America/Chicago",
      }
    : {}),
});

test.beforeEach(async () => {
  const staffEmail = credsFor(CLIP_PERSONAS.staffSelfEval).email;
  const result = await resetClip1ConfidenceScore(
    { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_CLIP1_AUTO_RESET: process.env.DEMO_CLIP1_AUTO_RESET },
    staffEmail
  );
  if (result.ran) {
    console.log(`[reset-clip1] cleared ${result.clearedRows} weekly_scores row(s) for ${staffEmail}`);
  } else {
    console.log(`[reset-clip1] skipped: ${result.reason}`);
  }
});

test("staff self-eval: rate confidence on this week's Pro Moves and submit", async ({ page }) => {
  // Suppress the PWA install banner ("Get the Pro Moves app"): it floats
  // fixed over the wizard's Next button (intercepted the click on the
  // first mobile take) and doesn't belong in conference footage. 'on' is
  // the exact value src/lib/pwa.ts stores when a user taps Dismiss.
  await page.addInitScript(() => {
    localStorage.setItem("pwa_banner_dismissed", "on");
  });

  // Visible tap ripples: mobile emulation has no cursor, so nothing in
  // frame shows why the UI changes. Every pointerdown draws a brief
  // Alcan-navy ripple (subtle, on-brand) and logs {t,x,y} to window.__taps
  // -- the ripple doubles as the sync beacon the polish stage uses to
  // align the tap log (page-relative timestamps, CSS-pixel coords) to
  // video frames.
  await page.addInitScript(() => {
    (window as unknown as { __taps: unknown[] }).__taps = [];
    addEventListener(
      "pointerdown",
      (e: PointerEvent) => {
        (window as unknown as { __taps: unknown[] }).__taps.push({ t: performance.now(), x: e.clientX, y: e.clientY });
        const r = document.createElement("div");
        r.style.cssText =
          `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:14px;height:14px;` +
          `margin:-7px 0 0 -7px;border-radius:50%;background:rgba(17,59,98,.25);` +
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

  // Freeze the page clock to Monday morning of the seeded week. The capture
  // day (Wed+) is past the week's rating window, which put a "confidence is
  // late" advisory in frame; a fixed Monday-morning clock removes it and
  // makes the header date deterministic across retakes. setFixedTime only
  // fakes Date -- timers (the wizard's celebration setTimeout) still run.
  // 18:30Z = Mon Aug 31, 1:30 PM Chicago (the context timezone above):
  // safely past any check-in open time, well before the Tuesday deadline.
  await page.clock.setFixedTime(new Date("2026-08-31T18:30:00Z"));
  await page.goto("/");
  await waitReady(page);

  const rateConfidence = page.getByRole("button", { name: "Rate Confidence" });
  await expect(
    rateConfidence,
    "expected an uncompleted current-week assignment for demo-staff. If this " +
      "clip already recorded successfully once, that's expected -- confidence " +
      "submission is permanent, and the automatic reset (beforeEach, see " +
      "setup/reset-clip1.ts) only runs when SUPABASE_URL + " +
      "SUPABASE_SERVICE_ROLE_KEY are configured. Either set those in " +
      "demo-capture/.env, or run `npx tsx scripts/demo-seed/seed.ts --refresh` " +
      "(DEMO-1a) before recording this clip again."
  ).toBeVisible({ timeout: 15_000 });
  // Guard: a retake must never silently reintroduce the late advisory the
  // fixed clock above exists to remove.
  await expect(page.getByText(/late for this week/i)).toHaveCount(0);
  // Let the viewer take in the home screen (this week's moves) before acting.
  await dwell(page, 2500);
  await rateConfidence.click();
  await waitReady(page);

  // One screen per assigned Pro Move (spec: three). Scores vary (4, 3, 4,
  // ...) so the take reads like a person, not a script — but never 1 or 2:
  // a low score opens the "Smart Friction" intervention modal, which isn't
  // part of what this clip needs and would leave the recording stopped
  // mid-modal instead of back at the completed home screen.
  const SCORE_PATTERN = [4, 3, 4];
  const MAX_STEPS = 6; // generous bound; the seed determines the real count
  for (let i = 0; i < MAX_STEPS; i++) {
    await waitReady(page);
    // The step transition is a client-side route change, so networkidle
    // (waitReady) can already be satisfied before the next step renders --
    // an instant count() here raced the wizard and broke out on step 1
    // (found live, first real recording 2026-09-02). Wait for the score
    // button to actually appear; when it doesn't within the window, the
    // wizard is done and we're back on the home screen.
    const score = SCORE_PATTERN[i % SCORE_PATTERN.length];
    const scoreButton = page.getByRole("button", { name: new RegExp(`^Confidence ${score}`) }).first();
    try {
      await scoreButton.waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      break;
    }

    // Reading pause: a person reads the Pro Move and the question before
    // picking a number, and glances at their choice before moving on.
    await dwell(page, 1600);
    await scoreButton.click();
    await dwell(page, 700);

    // Clicking the shared Next locator blindly deadlocks: the wizard
    // advances on click, the locator re-resolves to the NEXT step's
    // still-disabled button, and Playwright waits forever for it to
    // enable (found live, first real recording 2026-09-02). Instead:
    // assert the CURRENT step's button is enabled (it enables once a
    // score is picked), click it, then sync on the URL actually changing
    // -- to the next step, or home after the final submit's celebration
    // delay (ConfidenceWizard navigates ~1.8s after submitting).
    const advance = page.getByRole("button", { name: /^(Next|Submit|Backfill)\b/ }).first();
    await expect(advance).toBeEnabled({ timeout: 10_000 });
    const urlBefore = page.url();
    await advance.click({ timeout: 10_000 });
    await page.waitForURL((u) => u.toString() !== urlBefore, { timeout: 20_000 });
  }

  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Rate Confidence" })).toHaveCount(0);
  // Short hold on the submitted state, then end -- take 2's ~12s tail was
  // dead air for the polish stage (which trims the head, not the tail).
  await dwell(page, 2500);

  // Emit the tap log for the polish stage: one JSON beside the video, tap
  // timestamps page-relative (the compositor aligns on the first ripple),
  // coordinates in CSS pixels (390x844 space).
  const taps = await page.evaluate(() => (window as unknown as { __taps: unknown[] }).__taps);
  writeFileSync(
    new URL("../recordings/clip1-taps.json", import.meta.url),
    JSON.stringify({ clip: "clip1-mobile-staff-self-eval", viewport: { w: 390, h: 844 }, taps }, null, 2),
  );
});
