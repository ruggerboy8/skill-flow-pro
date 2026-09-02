/**
 * PRF-3a's own globalSetup -- signs in ONLY the one persona this harness's
 * spec needs (e2e/persona.ts's PERSONA, default "admin"), not
 * demo-capture's fixed staff+coach+admin trio.
 *
 * This deliberately does NOT reuse
 * demo-capture/setup/create-storage-states.ts as its globalSetup: that
 * script's `globalSetup` unconditionally signs in all three demo personas,
 * so pointing this config at it directly would demand
 * DEMO_STAFF_PASSWORD/DEMO_COACH_PASSWORD/DEMO_ADMIN_PASSWORD even though
 * this spec only ever loads one storageState -- the exact problem a review
 * of this branch caught. Its `signInAndSave` helper isn't exported (and
 * demo-capture is DEMO-1b's tool -- this ticket shouldn't be changing its
 * public surface or behavior for a second caller), so this file mirrors
 * that one persona's worth of the same flow instead of importing it:
 * `credsFor`, `storageStatePath`, `AUTH_DIR`, and `BASE_URL` are still
 * imported straight from demo-capture/config.ts, and the login steps below
 * are the same locators, wait strategy, and failure-mode messaging as
 * demo-capture's script, just scoped to one persona.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { AUTH_DIR, BASE_URL, credsFor, storageStatePath } from "../../demo-capture/config.ts";
import { PERSONA } from "../persona.ts";

export default async function globalSetup(): Promise<void> {
  const { email, password } = credsFor(PERSONA);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // "/" shows the public LandingPage for a logged-out visitor, not the
    // login form (src/App.tsx AppRoutes: `if (!user && pathname === '/')
    // return <LandingPage/>`) -- "/login" always renders <Login/> regardless
    // of auth state. Same reasoning as demo-capture's own login script.
    await page.goto(BASE_URL + "/login");
    await page.waitForLoadState("networkidle");

    const emailInput = page.locator("#email");
    if ((await emailInput.count()) === 0) {
      throw new Error(
        `Expected the login form at ${BASE_URL}/login for the "${PERSONA}" persona, ` +
          `but #email was not found. Is the app already showing a signed-in ` +
          `session, or is DEMO_CAPTURE_BASE_URL pointed somewhere unexpected?`
      );
    }

    await emailInput.fill(email);
    await page.locator("#password").fill(password);
    await page.getByRole("button", { name: /sign in/i }).click();

    // Success: the login form is replaced by the app shell. Give it a
    // generous timeout since first sign-in also warms up Supabase.
    await emailInput
      .waitFor({ state: "detached", timeout: 20_000 })
      .catch(() => {
        throw new Error(
          `Sign-in for "${PERSONA}" (${email}) did not complete within 20s. ` +
            `Check DEMO_${PERSONA.toUpperCase()}_PASSWORD in demo-capture/.env (this ` +
            `harness reuses demo-capture's credentials -- see e2e/README.md), and confirm ` +
            `the demo org has been seeded (scripts/demo-seed) with this login.`
        );
      });
    await page.waitForLoadState("networkidle");

    mkdirSync(AUTH_DIR, { recursive: true });
    await context.storageState({ path: storageStatePath(PERSONA) });
    console.log(`[e2e] Saved storageState for "${PERSONA}" (${email}) -> ${storageStatePath(PERSONA)}`);
  } finally {
    await browser.close();
  }
}
