/**
 * PRF-3a: shell-persistence tripwire.
 *
 * PRF-3 route-split the app with React.lazy and put the two Suspense
 * boundaries inside src/components/Layout.tsx, scoped around each shell
 * variant's <Outlet/> (see that file's "PRF-3" comments), so the
 * sidebar/header/tab bar stay mounted while a lazy route's chunk loads.
 * The original build had a single Suspense boundary wrapping the whole
 * routed tree instead (in App.tsx), which unmounts the entire shell on
 * every first visit to a lazy route -- and that version passed tsc, lint,
 * and 502 unit tests without a single failure, because none of them render
 * a live Suspense transition. This spec is the automated guard QA asked for.
 *
 * WHAT THIS PROVES: it logs in, lets the app shell mount normally on an
 * eagerly-bundled route, then navigates in-app to /admin (AdminPage --
 * `const AdminPage = lazy(() => import("@/pages/AdminPage"))` in
 * src/App.tsx), an "uncached" route this session has not fetched yet. A
 * Playwright route interceptor deliberately slows that chunk's network
 * request down so the Suspense-pending window is long enough to assert
 * against instead of racing it. During that window, and again once the
 * navigation settles, the test confirms the exact sidebar DOM node that was
 * present before the click is still present -- not a freshly remounted one
 * that merely matches the same selector (see the "tripwire" tag below).
 *
 * PATTERNS REUSED FROM demo-capture (DEMO-1b), not reinvented here:
 * - storageState-based login: `test.use({ storageState: storageStatePath(...) })`,
 *   same as every demo-capture spec. The actual sign-in flow is the same
 *   script (demo-capture/setup/create-storage-states.ts), wired in as this
 *   config's globalSetup -- see e2e/playwright.config.ts.
 * - `waitReady` (networkidle wait) from demo-capture/lib/waitReady.ts.
 * - `optionalEnv` from demo-capture/lib/env.ts, for the same "not
 *   hardcoded, one-line override" persona convention demo-capture's
 *   DEMO_CLIPn_LOGIN vars use (see below).
 *
 * ACCESS NOTE (same class of uncertainty demo-capture's own specs flag):
 * the sidebar's "Admin" link only renders for staff with admin-ish
 * capability flags (src/components/Layout.tsx: `showAdminTab`), and this
 * repo's demo-admin persona is whatever DEMO-1a's seed copied from its
 * source staff member -- this spec has no way to know that ahead of a real
 * run. If the "Admin" link isn't there, the assertion below fails loudly
 * with next steps rather than hanging; override the persona with
 * `PRF3A_LOGIN=<staff|coach|admin>` (no code change needed) if a different
 * seeded login is known to carry those flags.
 */
import { test, expect } from "@playwright/test";
import { storageStatePath, type Persona } from "../../demo-capture/config.ts";
import { waitReady } from "../../demo-capture/lib/waitReady.ts";
import { optionalEnv } from "../../demo-capture/lib/env.ts";

const PERSONA = optionalEnv(process.env, "PRF3A_LOGIN", "admin") as Persona;

test.use({ storageState: storageStatePath(PERSONA) });

// Generous enough that the deliberately-slowed chunk request is still
// pending when the mid-flight assertions run (real dev-server module fetch
// latency is a handful of ms; this delay dwarfs it), but well inside this
// config's 30s per-test timeout.
const CHUNK_DELAY_MS = 2_000;

test("app shell stays mounted while an uncached lazy route's chunk is pending", async ({ page }) => {
  // Land on "/" first -- Index is a static import in src/App.tsx (`import
  // Index from "@/pages/Index"`), not React.lazy -- so the shell mounts
  // normally, with nothing lazy involved yet, before this test touches a
  // Suspense boundary at all.
  await page.goto("/");
  await waitReady(page);

  const sidebar = page.locator('[data-sidebar="sidebar"]');
  await expect(
    sidebar,
    `expected the desktop sidebar shell to be present after logging in as "${PERSONA}" -- ` +
      "if this fails, check that persona's storageState (demo-capture/.auth/*.json) is fresh, " +
      "and that the default 1280x720 viewport isn't tripping useMobileShell (it shouldn't -- " +
      "that hook also requires a PWA flag, see src/hooks/useMobileShell.ts)."
  ).toBeVisible({ timeout: 15_000 });

  // Tag the actual DOM node, not just its selector. If the shell unmounts
  // and a new one remounts in its place -- the exact PRF-3 regression --
  // React discards this manually-added attribute along with the old node,
  // even though a fresh sidebar would still match `[data-sidebar="sidebar"]`
  // and look identical on screen. Checking for the tag surviving is a much
  // stronger claim than "a sidebar is visible" at each point in time.
  await sidebar.evaluate((el) => el.setAttribute("data-prf3a-tripwire", "pre-nav"));

  // Slow down the /admin chunk's own network request so the Suspense-pending
  // window is observable instead of racing it. Matched on "AdminPage"
  // appearing in the request path rather than a full literal path: Vite's
  // dev server serves a lazy-imported page's source directly at a path
  // containing its filename (verified locally against the dev server while
  // building this spec: `import("@/pages/AdminPage")` resolves to a request
  // for `/src/pages/AdminPage.tsx`), and a production build's default chunk
  // naming keeps the source name too (no custom chunkFileNames/manualChunks
  // in vite.config.ts), so the same pattern holds for either. Delaying
  // `route.continue()` rather than fabricating a `route.fulfill()` body lets
  // the real response through unmodified -- just later -- which is more
  // robust than hand-rolling a fake module payload.
  await page.route(/AdminPage/i, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, CHUNK_DELAY_MS));
    await route.continue();
  });

  const adminLink = page.getByRole("link", { name: "Admin", exact: true });
  await expect(
    adminLink,
    `expected an "Admin" sidebar link for the "${PERSONA}" persona (see the ACCESS NOTE ` +
      "in this file's header comment) -- if this fails, set PRF3A_LOGIN to a persona known " +
      "to carry admin-ish capability flags and rerun."
  ).toBeVisible({ timeout: 15_000 });
  await adminLink.click();

  // --- Pending window: the /admin chunk request above is deliberately
  //     still in flight for CHUNK_DELAY_MS here. ---
  await expect(
    page.getByRole("status", { name: "Loading" }),
    "expected the content-scoped RouteLoadingFallback (src/components/RouteLoadingFallback.tsx, " +
      "rendered inside Layout.tsx's <Suspense>) to be showing while /admin's chunk is still " +
      "loading -- if this never appears, the delayed route above likely isn't matching the real " +
      "chunk request; rerun headed (`DEMO_CAPTURE_HEADED`-style: pass `--headed` on the CLI) and " +
      "check the actual network request URL for this navigation."
  ).toBeVisible({ timeout: CHUNK_DELAY_MS });

  await expect(
    sidebar,
    "THE TRIPWIRE, mid-navigation: the app shell (sidebar) unmounted while /admin's lazy chunk " +
      "was still loading. This is the exact PRF-3 regression -- a Suspense boundary is wrapping " +
      "more than Layout.tsx's <Outlet/> again (e.g. moved back up to App.tsx around the whole " +
      "routed tree). See Layout.tsx's PRF-3 comments for where the boundary belongs."
  ).toHaveAttribute("data-prf3a-tripwire", "pre-nav");

  // --- Settled: the chunk has now finished loading. ---
  await waitReady(page);
  await expect(page).toHaveURL(/\/admin/, { timeout: 15_000 });

  await expect(
    sidebar,
    "THE TRIPWIRE, after the navigation settled: same check as above, once /admin has finished " +
      "rendering -- the shell must still be the original DOM node from before the click, not a " +
      "node that was torn down and rebuilt during the transition."
  ).toHaveAttribute("data-prf3a-tripwire", "pre-nav");
});
