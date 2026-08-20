/**
 * Clip 2: coach facilitation.
 *
 * The facilitator presentation view for a check-in meeting: the location's
 * three current Pro Moves with their skill statement and (when populated)
 * learning material / resources. Route: "/facilitate"
 * (src/pages/facilitate/FacilitatePage.tsx), a full-screen, no-chrome
 * surface distinct from the "/coach" management dashboard.
 *
 * ACCESS NOTE: "/facilitate" is gated by allowFacilitate (isSuperAdmin ||
 * isOrgAdmin || isRegional — NOT plain isCoach; see
 * src/components/RequireAccess.tsx). Whether the seeded demo-coach carries
 * one of those flags depends on DEMO-1a's copy of the source staff member's
 * permissions, which this harness has no visibility into. If demo-coach
 * gets redirected home instead of landing on this page, that's a DEMO-1c
 * dry-run finding, not a bug in this spec — override the login with
 * DEMO_CLIP2_LOGIN=admin (no code change needed; see config.ts).
 */
import { test, expect } from "@playwright/test";
import { CLIP_PERSONAS, storageStatePath } from "../config.ts";
import { waitReady } from "../lib/waitReady.ts";

test.use({ storageState: storageStatePath(CLIP_PERSONAS.coachFacilitation) });

test("coach facilitation: current week's Pro Moves with descriptions and resources", async ({ page }) => {
  await page.goto("/facilitate");
  await waitReady(page);

  await expect(
    page,
    "expected to land on the facilitator presentation, not be redirected home " +
      "(see the ACCESS NOTE above if this fails)"
  ).toHaveURL(/\/facilitate/, { timeout: 15_000 });

  // Meeting defaults to "Check-in" and role defaults to the org's first
  // active role; the flow starts on "Question" (icebreaker) — advance to
  // the Pro Moves step, which is what this clip is actually about.
  await page.getByRole("button", { name: "Pro moves" }).click();
  await waitReady(page);

  // Reveal the learning-material panel for the current Pro Move, if this
  // one has resources. DEMO-1a's README flags that resource-populated
  // selection is a DEMO-1c concern, not guaranteed by the seed — so this is
  // best-effort, not a hard requirement of this spec.
  const showMaterial = page.getByRole("button", { name: "Show learning material" });
  if ((await showMaterial.count()) > 0) {
    await showMaterial.click();
    await waitReady(page);
  }
});
