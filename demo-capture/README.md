# DEMO-1b: conference capture harness

Records the five clips John needs for the conference presentation, using
Playwright to script the exact user journeys the real app already supports
and capture 1080p video of each one. See
`docs/specs/demo-capture-environment.md` for the full spec (DEMO-1b is
ticket 2 of 3; this harness is the whole of that ticket).

**Status when this was built: the demo org has not been seeded yet.**
DEMO-1a (`scripts/demo-seed/`) exists but has not been run against
production. Nothing here can be run end-to-end until that seed exists — see
"What is and isn't verified" below.

## Prerequisites

1. **Seed the demo org first.** Follow `scripts/demo-seed/README.md`
   (DEMO-1a) to create the "Bluebird Dental" demo org and its three logins.
   This harness has nothing to log into until that's done.
2. **Node deps installed**: `npm install` at the repo root (Playwright is a
   root devDependency, not a separate package inside `demo-capture/`).
3. **Playwright's browser binary**: `npx playwright install chromium` (one
   time per machine; not part of `npm install`).
4. **The app running somewhere** — either the local dev server
   (`npm run dev`, port 8080 by default) or a production build served
   locally (see "SIMTOOLS note" below for why you'd want the latter before
   the real recording session).

## Env vars

Copy `demo-capture/.env.example` to `demo-capture/.env` and fill it in
(gitignored — never commit it):

- `DEMO_STAFF_PASSWORD`, `DEMO_COACH_PASSWORD`, `DEMO_ADMIN_PASSWORD` —
  required. The passwords set for the three demo logins when DEMO-1a's seed
  script ran.
- `DEMO_STAFF_EMAIL` / `DEMO_COACH_EMAIL` / `DEMO_ADMIN_EMAIL` — optional,
  default to the fixed `demo-<role>@bluebird.demo` addresses DEMO-1a's cast
  list always creates. Only set these if the demo org is ever reseeded under
  a different email domain.
- `DEMO_CAPTURE_BASE_URL` — optional, defaults to `http://localhost:8080`.
- `DEMO_CAPTURE_HEADED` — optional, `true` to watch the browser while it
  records (useful for the DEMO-1c dry run); defaults to headless.
- `DEMO_CAPTURE_RETRIES` — optional, defaults to `2`.
- `DEMO_CLIP1_LOGIN` .. `DEMO_CLIP5_LOGIN` — optional persona overrides
  (`staff` | `coach` | `admin`) for individual clips. See "Persona / access
  notes" below for why you might need these.
- `DEMO_CLIP4_FEEDBACK_TEXT` — optional, the observation typed into Clip 4's
  AI polish step. Defaults to a generic sample line.
- `DEMO_CLIP4_STAFF_SEARCH` — optional, which staff member Clip 4 opens.
  Defaults to `DEMO_STAFF_EMAIL` (the demo-staff login's email). See
  "Clip 4 opens a specific staff member" below.
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — optional, same var names
  `scripts/demo-seed/.env.example` uses. Only needed to let Clip 1's
  automatic reset run — see "Clip 1 is re-runnable" below. Never required
  just to record; without them, Clip 1 still runs once cleanly, it just
  can't reset itself for a second take.
- `DEMO_CLIP1_AUTO_RESET` — optional, `false` to disable Clip 1's automatic
  reset even when the two Supabase vars above are set.

None of this ever touches the repo's own `.env` — it's a separate file,
separate variables, read only by the code under `demo-capture/`.

## Clip 1 is re-runnable

Clip 1 submits a real confidence score, which permanently completes
demo-staff's current-week assignment. Left alone, that means recording this
clip a second time — a manual retake, or Playwright's own `DEMO_CAPTURE_RETRIES`
firing after a submit already landed — finds no "Rate Confidence" CTA and
fails the first assertion instead of recording anything.

`specs/01-staff-self-eval.spec.ts` has a `beforeEach` that clears
demo-staff's current-week confidence fields before every attempt, via
`setup/reset-clip1.ts`. That helper:

- Only runs when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set (same
  names `scripts/demo-seed/.env.example` uses — one `.env` can serve both
  tools). Without them, it's a no-op, not a failure — the spec's own
  assertion then explains what to do.
- Nulls exactly the three columns (`confidence_score`, `confidence_date`,
  `confidence_late`) that DEMO-1a's own live `--refresh` reset nulls for the
  same reason (`scripts/demo-seed/seed.ts`, "Re-clear the participant
  login's current-week score") — this reuses that column list and filter
  shape rather than inventing a second, divergent reset.
- Targets demo-staff's most recent `weekly_scores.week_of` row(s), which
  DEMO-1a's seed guarantees is the current week. It does not shift any
  dates the way `--refresh` does, so it's safe to run between every take
  without drifting the seeded weeks.
- Can be disabled with `DEMO_CLIP1_AUTO_RESET=false` if you'd rather manage
  resets yourself.

**Without those two Supabase vars configured**, the fallback is running
`npx tsx scripts/demo-seed/seed.ts --refresh` (DEMO-1a) before recording
Clip 1 again — that also re-clears demo-staff's current week (among other
things), just manually instead of automatically. Either way, a second run
with neither done fails loudly, on the very first assertion, with a message
naming both options — never a silent pass or a generic timeout.

## How to run

```bash
# From the repo root:
npx playwright test --config=demo-capture/playwright.config.ts
# or, equivalently:
npm run demo:capture
```

This automatically:
1. Runs the login/setup script (`demo-capture/setup/create-storage-states.ts`,
   wired in as Playwright's `globalSetup`) — signs in as demo-staff,
   demo-coach, and demo-admin through the real login form and saves each
   session to `demo-capture/.auth/*.json` (gitignored).
2. Runs the five clip specs in `demo-capture/specs/`, one per clip, each
   loading its persona's saved session so no recording ever shows a login
   screen.
3. Writes 1920x1080 video for every clip to `demo-capture/recordings/`
   (gitignored — that's the raw footage, not something to commit).

Run a single clip: append its spec file, e.g.
`npx playwright test --config=demo-capture/playwright.config.ts demo-capture/specs/01-staff-self-eval.spec.ts`.

Retakes: rerun the same command. `DEMO_CAPTURE_RETRIES` also makes
Playwright retry a clip automatically if it fails, each retry producing its
own video so you can pick the clean one.

## The five clips

| # | Spec file | Persona | Route |
|---|---|---|---|
| 1 | `01-staff-self-eval.spec.ts` | demo-staff | `/` → `/confidence/current/step/:n` |
| 2 | `02-coach-facilitation.spec.ts` | demo-coach | `/facilitate` |
| 3 | `03-group-domain-confidence.spec.ts` | demo-coach | `/dashboard` |
| 4 | `04-evaluation-glows-grows.spec.ts` | demo-coach | `/coach` → `/coach/:staffId/eval/:evalId/capture` |
| 5 | `05-regional-command-center.spec.ts` | demo-admin | `/dashboard` |

Every spec waits on `networkidle` (see `demo-capture/lib/waitReady.ts`)
before any scripted click or scroll, so live Supabase latency doesn't land
mid-load in the recorded frame.

**Viewport**: `playwright.config.ts`'s `chromium` project spreads
Playwright's `devices["Desktop Chrome"]` descriptor for its other sane
defaults (real Chrome UA, `isMobile: false`), but that descriptor ships its
own 1280x720 viewport, which otherwise silently overrides the 1920x1080 set
at the top level (project-level `use` wins on merge). The project pins
`viewport` back to `{ width: 1920, height: 1080 }` explicitly after the
spread — verified by importing the resolved config and inspecting
`projects[0].use.viewport`, not just eyeballing the file.

## Clip 4 opens a specific staff member

The coach dashboard's default row order is a submission-status sort, not
"who owns the seeded draft evaluation" — clicking the first row is
unreliable and commonly opens the wrong person. Clip 4 instead fills the
dashboard's own "Search by name or email..." filter with
`CLIP4_STAFF_SEARCH` (`config.ts`, defaults to the demo-staff login's
email — override with `DEMO_CLIP4_STAFF_SEARCH` if the real seeded draft
evaluation ends up on a different cast member) and asserts the search
narrows the table to exactly one row before opening it.

## Clip 4 hits live edge functions — dry run first

Clip 4's "Polish into glow & grow" button calls a real AI edge function
(`separateFeedback`, from `src/pages/coach/EvaluationCapture.tsx`), not
seeded or mocked data. Per the spec: **run it once as a dry run and only
record a take where the AI output comes back clean.** The spec itself
treats a slow or missing response as a failed take (30s timeout with a
clear message), not a silent partial recording — but a technically-passing
run can still come back with an awkward split, wrong emphasis, or a glow
that reads as generic. Watch the actual take before treating it as the one
to use on stage.

**Clip 4 and the microphone**: the real coach-facing flow offers both a
voice-capture button and a plain textarea for typed notes
(`src/components/coach/VoiceCaptureButton.tsx` next to the textarea in
`EvaluationCapture.tsx`). This spec types a canned observation
(`DEMO_CLIP4_FEEDBACK_TEXT`) into the textarea rather than feeding audio
through a fake microphone device — a scripted recording can't speak, and
driving Chromium's `--use-file-for-fake-audio-capture` flag reliably needs a
prepared WAV file that doesn't exist yet. Typing still exercises the same
live AI endpoint this clip is about. If John wants footage of the actual
mic → transcription path, that has to be a manual capture (OBS/QuickTime
over a person actually talking), not this automated spec — flagging for
DEMO-1c, not building it here.

## Persona / access notes (read before the DEMO-1c dry run)

The spec describes clips 2-4 as recorded "as demo-coach," but two of the
routes they hit are gated by permission checks that plain `isCoach` doesn't
automatically satisfy:

- **`/facilitate` (Clip 2)** requires `isSuperAdmin || isOrgAdmin ||
  isRegional` (`src/components/RequireAccess.tsx`, `allowFacilitate`) — not
  `isCoach`. A coach without one of those flags gets redirected home instead
  of landing on the facilitator view.
- **`/coach/:staffId/eval/:evalId/capture` (Clip 4)** requires
  `canSubmitEvals || canReviewEvals || isOrgAdmin || isSuperAdmin ||
  isOfficeManager` (`allowStaffEvals`) on top of coach-surface access — also
  not satisfied by `isCoach` alone.

Whether the seeded demo-coach carries one of those flags depends on which
permissions DEMO-1a's copy step preserved from the real source staff member,
which this harness has no way to know ahead of the seed existing. Each spec
file has an "ACCESS NOTE" comment explaining exactly what it needs and
fails with a clear assertion message (not a silent skip or a hang) if it
doesn't get it.

**If a clip fails on this at the DEMO-1c dry run**, the fix is a one-line
env var, no code change: set `DEMO_CLIP2_LOGIN=admin` or
`DEMO_CLIP4_LOGIN=admin` in `demo-capture/.env` and rerun. `/dashboard`
(clips 3 and 5) does not have this problem — `allowDashboard` includes plain
`isCoach`.

## SIMTOOLS note

The captured build must run with `VITE_ENABLE_SIMTOOLS` off, so no dev-only
affordances (the sim console, debug badges) show up on camera. That flag is
baked into the client bundle at build/dev-server start time
(`import.meta.env.VITE_ENABLE_SIMTOOLS`, read in `src/main.tsx`,
`src/components/Layout.tsx`, `src/components/home/ThisWeekPanel.tsx`,
`src/devtools/SimConsole.tsx`) — the repo's own `.env` currently sets it to
`"true"` for normal local dev, and **this harness must not edit that file**.

Vite gives shell-level `process.env` values priority over anything in
`.env`, so override it at the command line instead, without touching the
file:

```bash
# Dev server, SIMTOOLS off:
VITE_ENABLE_SIMTOOLS=false npm run dev

# Or a production-style build + local preview, SIMTOOLS off:
VITE_ENABLE_SIMTOOLS=false npm run build
npm run preview          # serves dist/, defaults to port 4173
DEMO_CAPTURE_BASE_URL=http://localhost:4173 npm run demo:capture
```

Before the real recording session, load the app in a real browser this way
and confirm nothing sim-flagged is visible (the sidebar's dev tools entry,
the sim console badge) — this harness doesn't assert on SIMTOOLS being off
itself, since that's a build-time state, not something a page load can
detect from the outside.

## What is and isn't verified

Built and verified without the seeded org:

- `npm run check` (typecheck + lint + unit tests + build) stays green with
  this harness added — verified directly.
- `demo-capture/playwright.config.ts` loads and all five specs parse:
  `npx playwright test --config=demo-capture/playwright.config.ts --list`
  lists all 5 clips.
- `demo-capture/**/*.ts` typechecks clean under a dedicated strict
  `demo-capture/tsconfig.json` (`npx tsc --noEmit -p demo-capture/tsconfig.json`)
  and lints clean (`npx eslint demo-capture`).
- **Structural smoke test** (run manually during the build, not checked
  in): with the real dev server running and fake credentials, the harness's
  login script launched a real Chromium browser, navigated to the real
  `/login` route, found and filled the real `#email`/`#password` fields,
  submitted against the live Supabase project, and failed cleanly with an
  actionable timeout message once the (nonexistent) demo-staff login didn't
  work. This caught a real bug during the build: the login script originally
  targeted `/` for a logged-out visitor, which renders the public
  `LandingPage`, not the `Login` form (`src/App.tsx`) — fixed to target
  `/login`, which always renders `Login` regardless of auth state.

**Not verified, because the demo org does not exist yet:**

- Any spec actually completing (real login succeeding, a real Pro Move
  rendering, the AI edge function actually returning a glow/grow split).
- Every locator this harness uses is grounded in reading the actual
  component source (cited in each spec's comments), not guessed — but
  reading source isn't the same as watching it render against real seeded
  data. Treat the first real run against the seeded org as the actual test
  of every locator in this harness, and expect to fix at least one
  (evaluation content especially — Clip 4's flow depends on an evaluation
  existing at all, which DEMO-1a explicitly does not create; see its README
  "What was not done").
- Whether `demo-coach`'s copied permission flags satisfy `/facilitate` and
  the eval routes (see "Persona / access notes" above).
- Whether Clip 2's chosen Pro Move actually has populated resources to show
  (DEMO-1a's README flags this as a `--source-location` choice problem for
  DEMO-1c, not something this harness curates for).

## Files

```
demo-capture/
  README.md                          this file
  .env.example                       template — copy to .env, gitignored
  playwright.config.ts                1920x1080, video on, globalSetup wires in the login script
  config.ts                           env/config loader — base URL, credentials, persona routing
  tsconfig.json                       standalone strict typecheck for this folder (not part of npm run check)
  setup/create-storage-states.ts      login/setup script — also runnable standalone via `npx tsx`
  setup/reset-clip1.ts                gated Clip 1 reset helper (see "Clip 1 is re-runnable")
  lib/waitReady.ts                    shared networkidle wait helper
  lib/env.ts, lib/env.test.ts         pure env-lookup helpers + unit tests
  specs/
    01-staff-self-eval.spec.ts
    02-coach-facilitation.spec.ts
    03-group-domain-confidence.spec.ts
    04-evaluation-glows-grows.spec.ts
    05-regional-command-center.spec.ts
  .auth/          gitignored — saved login sessions
  recordings/     gitignored — recorded video output
```
