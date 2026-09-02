/**
 * DEMO-1b: login/setup script.
 *
 * Signs in as each of the three demo personas (demo-staff, demo-coach,
 * demo-admin) through the real login form and saves each session as a
 * Playwright storageState file. Every spec in demo-capture/specs then loads
 * its persona's storageState instead of driving the login form itself, so
 * no clip's recording ever shows a login screen.
 *
 * Runs automatically as Playwright's globalSetup (see playwright.config.ts)
 * before `npx playwright test`. Can also be run on its own, e.g. to
 * refresh sessions without recording anything:
 *
 *   npx tsx demo-capture/setup/create-storage-states.ts
 *
 * Requires DEMO_STAFF_PASSWORD / DEMO_COACH_PASSWORD / DEMO_ADMIN_PASSWORD
 * (and optionally the matching *_EMAIL vars) to be set — see
 * demo-capture/.env.example. Requires the demo org to already be seeded
 * (DEMO-1a); logging in as a persona that doesn't exist yet fails loudly
 * rather than producing a broken storageState.
 */
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { AUTH_DIR, BASE_URL, credsFor, storageStatePath, type Persona } from "../config.ts";

const PERSONAS: Persona[] = ["staff", "coach", "admin"];

async function signInAndSave(persona: Persona): Promise<void> {
  const { email, password } = credsFor(persona);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();

    // "/" shows the public LandingPage for a logged-out visitor, not the
    // login form (src/App.tsx AppRoutes: `if (!user && pathname === '/')
    // return <LandingPage/>`). Any other path bypasses that special case and
    // renders <Login/> directly, so "/login" is the reliable target
    // regardless of what marketing does with the root route later.
    await page.goto(BASE_URL + "/login");
    await page.waitForLoadState("networkidle");

    const emailInput = page.locator("#email");
    if ((await emailInput.count()) === 0) {
      throw new Error(
        `Expected the login form at ${BASE_URL}/login for the "${persona}" persona, ` +
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
          `Sign-in for "${persona}" (${email}) did not complete within 20s. ` +
            `Check the password in demo-capture/.env, and confirm the demo org ` +
            `has been seeded (scripts/demo-seed) with this login.`
        );
      });
    await page.waitForLoadState("networkidle");

    // A route guard could still bounce a mis-provisioned persona back to "/"
    // with an error toast rather than a broken form; that's a permissions
    // question for DEMO-1c, not something this script can fix, so it isn't
    // treated as a hard failure here. It's on the operator to notice one of
    // the acceptance script steps didn't match on a dry run.

    mkdirSync(AUTH_DIR, { recursive: true });
    await context.storageState({ path: storageStatePath(persona) });
    console.log(`Saved storageState for "${persona}" (${email}) -> ${storageStatePath(persona)}`);
  } finally {
    await browser.close();
  }
}

export default async function globalSetup(): Promise<void> {
  for (const persona of PERSONAS) {
    await signInAndSave(persona);
  }
}

// Allow `npx tsx demo-capture/setup/create-storage-states.ts` directly, not
// just as Playwright's globalSetup.
if (import.meta.url === `file://${process.argv[1]}`) {
  globalSetup()
    .then(() => console.log("All demo personas signed in."))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
