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
 */
import { test, expect } from "@playwright/test";
import { CLIP_PERSONAS, storageStatePath } from "../config.ts";
import { waitReady } from "../lib/waitReady.ts";

test.use({ storageState: storageStatePath(CLIP_PERSONAS.staffSelfEval) });

test("staff self-eval: rate confidence on this week's Pro Moves and submit", async ({ page }) => {
  await page.goto("/");
  await waitReady(page);

  const rateConfidence = page.getByRole("button", { name: "Rate Confidence" });
  await expect(
    rateConfidence,
    "expected an uncompleted current-week assignment for demo-staff " +
      "(DEMO-1a's seed is supposed to guarantee this — if it's missing, " +
      "re-run scripts/demo-seed/seed.ts --refresh before recording)"
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
    const scoreFour = page.getByRole("button", { name: /^Confidence 4/ });
    if ((await scoreFour.count()) === 0) break;

    await scoreFour.click();
    await page.getByRole("button", { name: /^(Next|Submit|Backfill)\b/ }).click();
  }

  await waitReady(page);
  await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
  await expect(page.getByRole("button", { name: "Rate Confidence" })).toHaveCount(0);
});
