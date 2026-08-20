/**
 * Clip 4: evaluation, live glows and grows.
 *
 * Opens the seeded in-progress (draft) evaluation for a demo staff member
 * and drives the real "Polish into glow & grow" AI step — this is the one
 * clip that hits a live edge function (src/pages/coach/EvaluationCapture.tsx
 * -> separateFeedback), not seeded data. Per the spec: do a dry run first,
 * and only record a take where the AI output comes back clean.
 *
 * ACCESS NOTE: /coach/:staffId/eval/:evalId/capture is gated by both
 * allowCoachSurface and allowStaffEvals (canSubmitEvals || canReviewEvals ||
 * isOrgAdmin || isSuperAdmin || isOfficeManager — see
 * src/components/RequireAccess.tsx). Plain isCoach alone does not satisfy
 * allowStaffEvals. Whether demo-coach carries eval permissions depends on
 * DEMO-1a's copy of the source staff member; if this spec can't find the
 * "Quarterly Evaluations" tab or gets redirected, that's a DEMO-1c dry-run
 * finding — override with DEMO_CLIP4_LOGIN=admin, no code change needed.
 *
 * Clip 4 and the microphone: the real coach-facing flow offers a voice
 * capture button (src/components/coach/VoiceCaptureButton.tsx) alongside a
 * plain textarea for typed notes. This spec types a canned observation
 * (config.ts CLIP4_FEEDBACK_TEXT, overridable via DEMO_CLIP4_FEEDBACK_TEXT)
 * into that textarea rather than feeding audio into a fake microphone
 * device — a scripted recording can't actually speak, and driving Chromium's
 * fake-audio-capture flag reliably needs a prepared WAV file that doesn't
 * exist yet. Typing still exercises the same live "Polish into glow & grow"
 * edge function this clip is about. If John wants footage of the actual
 * mic/transcription path, that has to be a manual capture, not this
 * automated spec — flagging for DEMO-1c, not fixing here.
 */
import { test, expect } from "@playwright/test";
import { CLIP4_FEEDBACK_TEXT, CLIP_PERSONAS, storageStatePath } from "../config.ts";
import { waitReady } from "../lib/waitReady.ts";

test.use({ storageState: storageStatePath(CLIP_PERSONAS.evaluationGlowsGrows) });

test("evaluation: type an observation and get a live glow/grow split", async ({ page }) => {
  await page.goto("/coach");
  await waitReady(page);
  await expect(page.getByRole("heading", { name: "Coach Dashboard" })).toBeVisible({ timeout: 15_000 });

  await page.locator("table tbody tr").first().click();
  await waitReady(page);

  const evalsTab = page.getByRole("tab", { name: "Quarterly Evaluations" });
  await expect(
    evalsTab,
    "expected the Quarterly Evaluations tab (see the ACCESS NOTE above if this fails)"
  ).toBeVisible({ timeout: 15_000 });
  await evalsTab.click();
  await waitReady(page);

  const continueDraft = page.getByRole("button", { name: "Continue" }).first();
  await expect(
    continueDraft,
    "expected a draft (in-progress) evaluation to continue — DEMO-1a and " +
      "DEMO-1c are responsible for making sure one exists; evaluations are " +
      "fabricated fresh in the demo org, never copied from a real one"
  ).toBeVisible({ timeout: 15_000 });
  await continueDraft.click();
  await waitReady(page);

  const feedbackBox = page.getByPlaceholder(/Talk about what you saw/);
  await expect(feedbackBox).toBeVisible({ timeout: 15_000 });
  await feedbackBox.fill(CLIP4_FEEDBACK_TEXT);

  await page.getByRole("button", { name: "Polish into glow & grow" }).click();

  // Live AI edge function round trip — give it real room, not the default
  // click timeout, before deciding the take is unusable.
  await expect(
    page.getByPlaceholder("Glow"),
    "the AI split into glow/grow didn't land in time — per the spec, treat " +
      "this as a failed take: check the edge function logs, don't record"
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByPlaceholder("Grow")).toBeVisible();
  await waitReady(page);
});
