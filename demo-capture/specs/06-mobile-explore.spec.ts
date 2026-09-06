/**
 * clip5-mobile-explore: the new Explore surface (mobile PWA shell).
 *
 * NOTE ON NUMBERING: the polish handoff calls this output "clip5"
 * (CLIP1-RETAKE-INSTRUCTIONS.md, TAKE 3/4 sections), but spec file 05
 * already exists as the desktop regional-command-center clip — so this
 * FILE is 06 while its OUTPUTS keep the contracted clip5-* names.
 *
 * Flow (read-only, no submits — re-runnable by nature, no reset needed):
 *   home → tap the Explore tab → tap a domain in the Craft Atlas → slow
 *   scroll through the domain's skill areas → open one Pro Move's detail
 *   drawer → hold → end. Target 15-20s.
 *
 * Route map: "/" → /my-role (Atlas overview, MobileTabBar tab "Explore")
 * → /my-role/domain/:slug (DomainDetail: CompetencyAccordion list; a move
 * row opens ProMoveDrawer, the detail view).
 */
import { test, expect } from "@playwright/test";
import { CLIP_PERSONAS, storageStatePath } from "../config.ts";
import { waitReady } from "../lib/waitReady.ts";
import { dwell } from "../lib/pace.ts";
import { MOBILE_CAPTURE_USE, installCaptureSetup, writeTapLog } from "../lib/capture.ts";

test.use({
  storageState: storageStatePath(CLIP_PERSONAS.staffSelfEval),
  ...MOBILE_CAPTURE_USE,
});

test("mobile explore: browse the Pro Moves library and open a move", async ({ page }) => {
  await installCaptureSetup(page);
  await page.goto("/");
  await waitReady(page);
  await expect(page.getByText(/late for this week/i)).toHaveCount(0);
  await dwell(page, 1200);

  // The mobile shell's bottom tab bar (role=tablist of role=tab buttons).
  await page.getByRole("tab", { name: "Explore" }).click();
  await waitReady(page);

  // Craft Atlas overview: four domain spine cards. Clinical is the seeded
  // participant's richest domain (fully-resourced DA moves).
  const clinicalCard = page.getByText("Clinical", { exact: true }).first();
  await clinicalCard.waitFor({ state: "visible", timeout: 15_000 });
  await dwell(page, 1400);
  await clinicalCard.click();
  await page.waitForURL(/\/my-role\/domain\//, { timeout: 15_000 });
  await waitReady(page);
  await dwell(page, 1000);

  // The mobile domain page lists "Areas to explore" as tappable cards
  // (buttons named "<hook> <competency> N Pro Moves"), not the desktop
  // accordion layout. One smooth pass down the list: small incremental
  // scrolls, not one jump (per the retake instructions).
  const areaCard = page.getByRole("button", { name: /Pro Moves/ }).first();
  await areaCard.waitFor({ state: "visible", timeout: 15_000 });
  await page.mouse.move(195, 500);
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(0, 150);
    await dwell(page, 650);
  }

  // Open the first area (CraftAtlasArea: the numbered Pro Move list).
  await areaCard.click();
  await page.waitForURL(/\/my-role\/area\//, { timeout: 15_000 });
  await waitReady(page);
  await dwell(page, 1500);

  // Tap the first Pro Move row — a real <button> whose name is the move's
  // action statement — landing on the full ExploreMove detail page.
  const moveRow = page.getByRole("button", { name: /.{25,}/ }).first();
  await moveRow.waitFor({ state: "visible", timeout: 10_000 });
  await moveRow.click();
  await page.waitForURL(/\/my-role\/move\//, { timeout: 15_000 });
  await waitReady(page);
  // Hold on the move detail — the payoff frame — then end.
  await dwell(page, 3000);

  await writeTapLog(page, "clip5-mobile-explore", { w: 390, h: 844 }, "clip5");
});
