# PRF-3a: shell-persistence tripwire

One Playwright spec: an automated guard against the shell-unmount regression
PRF-3 (PR #70) hit during its own build (a misplaced Suspense boundary that
unmounted the whole app shell -- sidebar, header, tab bar -- on the first
visit to any lazy route, and passed tsc, lint, and 502 unit tests without
complaint). See `e2e/specs/prf-3a-shell-persistence.spec.ts` for the full
explanation and `src/components/Layout.tsx`'s "PRF-3" comments for where the
boundary is supposed to live.

This is a separate config from `demo-capture/playwright.config.ts` on
purpose -- that harness is tuned for recording 1080p conference b-roll, a
different job. What it reuses directly from `demo-capture/`, rather than
reinventing, is the login/storageState flow: `e2e/playwright.config.ts`'s
`globalSetup` is the exact same script
(`demo-capture/setup/create-storage-states.ts`) demo-capture's own specs use,
and the spec imports `demo-capture/config.ts` and `demo-capture/lib/` helpers
directly instead of duplicating them.

## Prerequisites

Same as `demo-capture/` -- see `demo-capture/README.md` "Prerequisites" and
"Env vars" in full. Short version:

1. The demo org must be seeded (`scripts/demo-seed/`, DEMO-1a).
2. `demo-capture/.env` filled in with at least `DEMO_ADMIN_PASSWORD` (this
   spec logs in as the `admin` persona by default -- see `PRF3A_LOGIN`
   below).
3. Playwright's browser binary installed: `npx playwright install chromium`.
4. The app running locally: `npm run dev` (port 8080 by default).

## Env vars

Reuses every var `demo-capture/.env` already defines (`DEMO_CAPTURE_BASE_URL`,
`DEMO_ADMIN_EMAIL`/`DEMO_ADMIN_PASSWORD`, etc. -- see
`demo-capture/README.md` "Env vars"). One addition:

- `PRF3A_LOGIN` -- optional, defaults to `admin`. Which seeded persona
  (`staff` | `coach` | `admin`) this spec logs in as. The spec needs a
  persona whose sidebar shows an "Admin" link (see its ACCESS NOTE); override
  this if the seeded `demo-admin` doesn't carry those flags.

## How to run

```bash
# From the repo root, with the dev server already running (npm run dev):
npx playwright test --config=e2e/playwright.config.ts
```

## What is and isn't verified

Built and verified without live demo-org credentials in this environment
(no `demo-capture/.env` present here -- same situation demo-capture's own
README describes for its own build):

- The spec and config parse and typecheck.
- `npm run check` (typecheck + lint + unit tests + build) stays green with
  this folder added.
- The route-interception pattern's URL match (`/AdminPage/i`) was verified
  against a real local dev server: `import("@/pages/AdminPage")` resolves to
  a request for `/src/pages/AdminPage.tsx`, confirmed with `curl` against a
  running `npm run dev` instance during this build.
- Every locator here is grounded in reading the real component source
  (`src/components/Layout.tsx`, `src/components/AppSidebar.tsx`,
  `src/components/RouteLoadingFallback.tsx`, `src/App.tsx`), not guessed.

**Not verified, because no demo org / credentials were available locally:**

- The spec actually running end to end (real login succeeding, the "Admin"
  link being present for whatever persona the seeded demo org gives it,
  the tripwire assertions passing against a live app).
- Whether `demo-admin`'s copied permission flags include the ones
  `showAdminTab` checks (same class of uncertainty demo-capture's own
  "Persona / access notes" section documents for its five clips).
