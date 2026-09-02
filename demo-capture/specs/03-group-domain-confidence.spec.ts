/**
 * Clip 3: group domain confidence.
 *
 * The org-wide, four-domain confidence view with visible highs and lows
 * across the demo org's 3 locations — the heaviest data-shaping lift in
 * DEMO-1a (its "variance pass"). Lives on the Regional Command Center at
 * "/dashboard" (src/components/dashboard/DomainConfidenceHeatmap.tsx),
 * the same page Clip 5 uses, just framed on a different section.
 */
import { test, expect } from "@playwright/test";
import { CLIP_PERSONAS, storageStatePath } from "../config.ts";
import { waitReady } from "../lib/waitReady.ts";

test.use({ storageState: storageStatePath(CLIP_PERSONAS.groupDomainConfidence) });

test("group domain confidence: four-domain heatmap across locations", async ({ page }) => {
  await page.goto("/dashboard");
  await waitReady(page);

  const heatmapHeading = page.getByText("Domain Confidence by Location");
  await expect(
    heatmapHeading,
    "expected the Domain Confidence heatmap on the Regional Command Center"
  ).toBeVisible({ timeout: 15_000 });

  await heatmapHeading.scrollIntoViewIfNeeded();
  // The heatmap's own data query runs after the page shell paints; wait
  // again once it's in view so the chart isn't still loading in frame.
  await waitReady(page);
});
