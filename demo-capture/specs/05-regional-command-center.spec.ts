/**
 * Clip 0 / spare: regional command center.
 *
 * The admin overview: rising completion percentages across the demo org's
 * locations. Route "/dashboard" (src/pages/dashboard/RegionalDashboard.tsx),
 * recorded from an admin login per the spec.
 */
import { test, expect } from "@playwright/test";
import { CLIP_PERSONAS, storageStatePath } from "../config.ts";
import { waitReady } from "../lib/waitReady.ts";

test.use({ storageState: storageStatePath(CLIP_PERSONAS.regionalCommandCenter) });

test("regional command center: org overview with completion metrics", async ({ page }) => {
  await page.goto("/dashboard");
  await waitReady(page);

  await expect(page.getByRole("heading", { name: "Regional Command Center" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Avg Completion")).toBeVisible({ timeout: 15_000 });
});
