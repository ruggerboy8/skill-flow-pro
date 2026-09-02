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
import { test, expect } from "@playwright/test";
import { CLIP_PERSONAS, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, credsFor, storageStatePath } from "../config.ts";
import { waitReady } from "../lib/waitReady.ts";
import { resetClip1ConfidenceScore } from "../setup/reset-clip1.ts";

test.use({ storageState: storageStatePath(CLIP_PERSONAS.staffSelfEval) });

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
  await rateConfidence.click();
  await waitReady(page);

  // One screen per assigned Pro Move (spec: three). Always score 4 — a low
  // score (1 or 2) opens the "Smart Friction" intervention modal, which
  // isn't part of what this clip needs and would leave the recording
  // stopped mid-modal instead of back at the completed home screen.
  const MAX_STEPS = 6; // generous bound; the seed determines the real count
  for (let i = 0; i < MAX_STEPS; i++) {
    await waitReady(page);
    // The step transition is a client-side route change, so networkidle
    // (waitReady) can already be satisfied before the next step renders --
    // an instant count() here raced the wizard and broke out on step 1
    // (found live, first real recording 2026-09-02). Wait for the score
    // button to actually appear; when it doesn't within the window, the
    // wizard is done and we're back on the home screen.
    const scoreFour = page.getByRole("button", { name: /^Confidence 4/ }).first();
    try {
      await scoreFour.waitFor({ state: "visible", timeout: 10_000 });
    } catch {
      break;
    }

    await scoreFour.click();

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

  await waitReady(page);
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Rate Confidence" })).toHaveCount(0);
});
