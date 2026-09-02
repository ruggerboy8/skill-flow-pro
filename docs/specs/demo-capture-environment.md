# Spec: DEMO-1, Demo org + scripted conference capture

**Status:** approved by John 2026-08-19 (in session)
**Lane:** medium
**Ticket:** DEMO-1 (Motion, MyProMoves Dev Board)
**Branch:** feature/demo-capture-environment

## What and why

John is presenting the product at a conference and needs frame-accurate screen
recordings of the real UI. Today there is no safe thing to point a camera at:
the only realistic data is live Alcan data with real names. This work creates a
permanent demo organization inside the production Supabase project, populated
by copying one real location's staff and history with every identifying detail
replaced, plus a Playwright harness that records five planned clips against it.
Because organizations are the RLS isolation boundary, demo logins can never see
Alcan data and Alcan users can never see the demo cast. The demo org also
becomes reusable for future sales demos and screenshots.

## The five clips this must support

1. **Staff self-eval.** A staff login opens the current week, sees three
   assigned skills, rates confidence, submits. Needs an uncompleted
   current-week assignment.
2. **Coach facilitation.** A coach login views that location's week: skill
   descriptions, resources, the three skills. Platform Pro Moves
   (`owner_org_id is null`) are shared content, so descriptions and resources
   come for free; the seed must pick skills whose resource sections are
   actually populated.
3. **Domain confidence, group level.** Org-wide view by the four domains with
   believable variance. This is the heavy lift: 3 locations, 9 to 12 staff,
   4 to 6 weeks of backfilled `weekly_scores` shaped so some domains read
   strong and others weak.
4. **Evaluation, glows and grows.** An evaluation mid-flow, then the live
   record voice, transcribe, AI summary path. The eval is fabricated fresh in
   the demo org. It is never copied from a real one, because real evaluation
   notes and transcripts can contain patient and staff names.
5. **Clip 0, spare.** Regional command center overview with rising completion
   percentages, recorded from an admin login.

## How the data is made

- **New org:** a fictional brand (working name "Bluebird Dental", John can
  rename), 1 practice group, 3 locations with timezones and program dates set
  so the current cycle week lands mid-program.
- **Copy source:** one real Alcan location's staff roster and their
  `weekly_assignments` and `weekly_scores` history, remapped into the demo
  org. During the copy every staff row gets a fictional name and a
  `@bluebird.demo` style email from a fixed cast list checked into the repo.
  Real `user_id` links are dropped; demo staff get fresh auth users only where
  a login is needed.
- **What is never copied:** evaluations, evaluation items, audio, transcripts,
  coaching notes, survey responses. Anything free-text from production is
  assumed to contain names and stays out. Scores, dates, and assignment
  structure are numbers and FKs, safe to carry over.
- **Logins created:** demo-staff (participant), demo-coach, demo-admin. Plain
  email/password, no MFA, credentials in `.env.local` style notes outside git.
- **Variance pass:** after the copy, a shaping step nudges backfilled
  confidence scores per domain per location so Clip 3 charts show texture.
- **Freshness:** the seed script is idempotent and re-runnable. A `--refresh`
  mode re-points the "current week" rows to whatever week it is run in, so the
  org is recordable any week without manual fixing. The demo org must also be
  excluded from, or tolerant of, `sequencer-rollover` and `coach-remind` runs;
  builder verifies which functions iterate all orgs before seeding.
- **Mechanism:** a Node script in `scripts/demo-seed/` run locally with the
  service role key. Not a migration: this is data, not schema, and it must
  never run via Lovable's migration path.

## The capture harness

- `demo-capture/` folder with Playwright as a dev dependency, one spec per
  clip, shared login `storageState` so no clip records a login wall.
- 1920x1080 viewport, video on, waits on network idle before any scripted
  cursor movement so live Supabase latency never lands in frame.
- Clip 4 runs the real edge functions. The harness supports unlimited retakes;
  the procedure is dry-run first, record only a take where the AI output comes
  back clean.
- `VITE_ENABLE_SIMTOOLS` must be off in the captured build so no dev
  affordances appear in frame.

## Acceptance script (for John)

1. Log in as demo-staff. Expect: a normal staff home showing this week's three
   Pro Moves, confidence not yet submitted. Rate and submit; it completes like
   the real thing. No real Alcan name appears anywhere.
2. Log in as demo-coach. Expect: the demo location's week with skill
   descriptions and populated resources, and the staff pages show the fictional
   cast with weeks of history.
3. As demo-coach or demo-admin, open the domain confidence view. Expect:
   charts across the four domains with visible highs and lows across 3
   locations, not flat or empty.
4. As demo-coach, open the seeded in-progress evaluation and run the voice to
   glows-and-grows path once as a dry run. Expect: transcription and summary
   come back and land in the form.
5. Run `npx playwright test` in `demo-capture/`. Expect: five video files, one
   per clip, at 1080p, no login screens or loading skeletons in frame.
6. Log in as a real Alcan user. Expect: nothing about Bluebird is visible
   anywhere.

## Personas to test as

participant (demo-staff), coach (demo-coach), admin on desktop (demo-admin),
plus one real-account spot check for isolation.

## Out of scope

- No schema changes, no app code changes (one exception allowed: a guard if
  rollover or reminders would spam the demo org, surfaced to John first).
- No staging environment. This runs in prod on purpose.
- Editing or renaming any real staff row. The copy is insert-only into the new
  org.
- Polishing the presentation itself, slide timing, or video editing.

## DB impact

No migrations. Data inserts only, all scoped under the new demo organization.
Teardown is possible later because org-owned rows are exempt from the platform
delete guard. Backfill runs set
`app.change_reason = 'batch: demo org seed for conference capture'` if any
framework table is ever touched, though the plan is to touch none.

## Ticket breakdown (order matters)

1. **DEMO-1a, seed script + demo org.** The copy, anonymization, variance
   shaping, logins, refresh mode. Verify rollover/reminder behavior toward the
   new org before first run.
2. **DEMO-1b, capture harness.** Playwright specs for the five clips against
   the seeded org. Depends on 1a.
3. **DEMO-1c, dry run + recording session.** Walk the acceptance script,
   record all clips, review with John. Depends on 1b.

## Docs the builder must read

- `docs/data-model.md`, CLAUDE.md "Framework content is versioned" and
  "Applying migrations" (schema and why this is not a migration)
- `docs/system-overview.md`, `docs/glossary.md` (the weekly loop the clips tell)
- `docs/features/evaluation-*.md` and the hollow-evals guard note (Clip 4 must
  not create a hollow eval)
- CLAUDE.md design conventions (no code changes expected, but for the simtools
  flag and env handling)
