# DEMO-1a: Bluebird Dental demo org seed script

Creates (and later refreshes) a permanent, fictional demo organization
inside the production Supabase project, so John can record conference
capture clips against real UI behavior without ever pointing a camera at
real Alcan data. See `docs/specs/demo-capture-environment.md` for the full
spec (DEMO-1a is ticket 1 of 3; this script is the whole of that ticket).

## What it does

1. Creates the "Bluebird Dental" org: 1 organization, 1 practice group, 3
   locations (`Bluebird Uptown`, `Bluebird Riverside`, `Bluebird Lakeside`),
   each with a distinct timezone and a `program_start_date` /
   `cycle_length_weeks` chosen so the current week lands mid-cycle.
2. Copies one real Alcan location's staff roster and their
   `weekly_assignments` + `weekly_scores` history into the demo org,
   remapping every foreign key.
3. Replaces every staff name and email with a fictional identity from the
   fixed cast list in `cast.ts` during the copy. Drops the real `user_id`
   link (each demo staff member gets a fresh Supabase Auth user instead).
4. Never copies evaluations, evaluation items, audio, transcripts, coaching
   notes, or survey responses -- and copies every other table through an
   explicit column allowlist (see `lib/columnAllowlist.ts`), so a free-text
   column can never cross over by accident.
5. Creates 3 real logins (demo-staff / demo-coach / demo-admin) with
   passwords from your `.env`, plus one auth user per other copied cast
   member with a random, never-surfaced password (required because
   `staff.user_id` is `NOT NULL` -- see "Why every cast member gets an auth
   user" below).
6. Reshapes the copied confidence scores per domain per location so the
   4-domain org view has visible highs and lows instead of whatever the
   single source location happened to produce.
7. Guarantees demo-staff has an uncompleted current-week assignment.
8. Is idempotent, and supports `--refresh` to re-point the "current week" to
   whenever it's actually run.

## Setup

```bash
cp scripts/demo-seed/.env.example scripts/demo-seed/.env
# Fill in SUPABASE_SERVICE_ROLE_KEY and the three DEMO_*_PASSWORD values.
# scripts/demo-seed/.env is gitignored -- never commit it.
```

The service role key bypasses Row Level Security. Treat it like any other
production secret: local machine only, never pasted into chat, never
committed.

## How to run

**Always dry-run first.** Find a real Alcan location id (Supabase dashboard
or a `select id, name from locations` query) with an active, reasonably
sized roster -- Clip 3 wants "9 to 12 staff", and the script requires at
least 3 (it needs 3 distinct people to become demo-staff / demo-coach /
demo-admin).

```bash
# Preview only. No writes. Safe to run repeatedly.
npx tsx scripts/demo-seed/seed.ts --source-location=<alcan-location-uuid> --dry-run
```

Read the dry-run output: it prints the full "real name -> fictional name"
mapping so you can sanity-check the anonymization before anything is
written, plus counts of what would be created.

```bash
# The real, first seed.
npx tsx scripts/demo-seed/seed.ts --source-location=<alcan-location-uuid>
```

Re-running that same command later, once the org already exists, is a
no-op (it prints "nothing to do" and exits) -- it will not duplicate rows.
`--source-location` is only read the first time; once the demo org exists
it's ignored.

### Refreshing before a recording session

The copied weeks drift into the past every week the org sits unused.
Before a capture session:

```bash
npx tsx scripts/demo-seed/seed.ts --refresh --dry-run   # preview the shift
npx tsx scripts/demo-seed/seed.ts --refresh              # apply it
```

`--refresh` re-points every copied `weekly_assignments.week_start_date` and
`weekly_scores.week_of` (and their timestamp fields) by the same number of
days, so the week that was "current" at copy time lands on this week's
Monday. It's a parallel shift, not a rescale -- week-to-week spacing and
ordering are preserved. It also re-clears demo-staff's (now current) week
so Clip 1 still has something uncompleted to rate, and re-syncs the 3 login
passwords from `.env` (so rotating a password and re-running with
`--refresh` takes effect).

There's also `npm run demo:seed -- --refresh` if you'd rather not type
`npx tsx` every time.

## Why every cast member gets an auth user, not just the 3 named logins

The spec describes "3 auth users... demo-staff / demo-coach / demo-admin".
That's accurate for how many people get a *real, usable* login. But
`staff.user_id` is `NOT NULL` with a foreign key to `auth.users(id)` (see
migration `20250805203130_...sql`), so every copied staff row -- all 12+ of
them -- needs *some* backing auth user to exist, or the insert fails. The
other cast members get an auth user with a random password generated at
run time and never written anywhere; nobody is meant to log in as them, and
nothing in the app surfaces their password. This is a necessary
implementation detail to satisfy the schema, not a scope change -- flagging
it here since the spec's wording could otherwise read as "create exactly 3
auth users."

## Design decisions worth knowing about

- **Staff are spread across all 3 demo locations, round-robin.** The spec
  says "copies one Alcan location's staff roster... into the demo org" but
  Clip 3 needs "3 locations... visible highs and lows." Splitting the one
  copied roster round-robin across the 3 demo locations is what makes that
  possible without inventing people. `weekly_assignments` are replicated
  identically to all 3 locations (same Pro Move picks, same weeks) --
  what actually varies by location is the reshaped confidence scores, not
  which Pro Moves are assigned.
- **`confidence_source` / `performance_source` are always
  `'backfill_historical'`**, the enum value that exists specifically to
  mark data that was never entered live (distinct from `'live'` and from a
  user's own late `'backfill'`).
- **`entered_by` is set to the demo staff member's own id** (self-entry),
  not whatever the source row's `entered_by` was -- the source value might
  point at a real coach whose id has no meaning in the demo org.
- **`practice_groups.is_sandbox` is set to `true`** on the Bluebird group.
  Nothing in the live app currently reads this flag for rollover/reminder
  purposes (see findings below) -- it's set anyway because the column
  exists for exactly this purpose, and any future batch job should check
  it before iterating orgs.
- **Column allowlists reject free text explicitly.** `staff.location` /
  `staff.organization` (legacy plain-text fields, distinct from the FK
  columns) and every note/rationale-shaped column are excluded on sight,
  not just "not currently used." See `lib/columnAllowlist.ts` and its test
  file for the standing regression guard.

## Rollover / reminder findings (spec item: "verify which functions iterate
all orgs before seeding")

**`sequencer-rollover` does not exist.** It was already retired from
production on 2026-07-24 (`docs/improvement-backlog.md` item A3,
`docs/simplification-roadmap.md` 2.4): `v2/rollover.ts` was deleted, its
caller in `ThisWeekPanel` was removed, and the edge function itself was
deleted from prod. `CLAUDE.md`'s function list and `docs/glossary.md` still
reference it -- that's a stale-docs issue, not something DEMO-1a should fix
(out of scope; noting it for a separate doc-cleanup ticket).

**There is a dangling, still-scheduled `pg_cron` job that nothing serves.**
Two migrations (`20250825203536_...sql`, `20250825203814_...sql`) schedule
an hourly `pg_cron` job named `weekly-rollover` that `POST`s to
`.../functions/v1/rollover-weekly`. That function name does not appear
under `supabase/functions/` today, and I found no migration that ever
called `cron.unschedule('weekly-rollover')`. Two readings: either the
job was unscheduled directly via the Supabase SQL Editor outside of any
migration (per `CLAUDE.md`'s documented workaround for how migrations get
applied here), or it is still firing hourly against a route that 404s.
Either way, **it cannot touch the demo org's data**: an HTTP call to a
nonexistent edge function can't read or write any table, sandboxed or not.
No guard needed for DEMO-1a on this basis, but the dangling cron job itself
looks like real orphaned infrastructure -- worth its own ticket to confirm
live and clean up, not something I fixed here (scope creep).

**`coach-remind` is not a batch job.** It requires an authenticated
caller who is a coach, org admin, or clinical director, and an explicit
`recipients` array of `{user_id, email, name}` passed in the request body.
Nothing iterates over all orgs or all staff to call it automatically -- it
only ever sends to whoever a human explicitly selected in the UI. It would
only touch the demo org if someone deliberately chose demo-coach as sender
and demo staff as recipients. No guard needed.

**`deputy-sync-dispatcher` does iterate all orgs, weekly via `pg_cron`**
(`20260422215119_...sql`, Mondays 08:00 UTC) -- but only for
`deputy_connections` rows with `auto_sync_enabled = true`. DEMO-1a never
creates a `deputy_connections` row for Bluebird Dental, so this job has
nothing to iterate onto for the demo org; it is structurally incapable of
touching it. No guard needed, and none should be added unless a future
ticket wires up Deputy for the demo org (at which point this note should
be revisited).

**`sequencer-rank` / `sequencer-auto-assign`** both require an explicit
`orgId` (and `roleId`, `weekStartDate`) in the request body from an
authenticated org admin or super admin caller. Neither runs on a schedule
or iterates orgs on its own. They would only touch the demo org if someone
explicitly ran them against it from the UI -- which is fine; it's the same
sequencer machinery a real org uses, and running it against Bluebird
wouldn't corrupt anything, just add another (also fictional, still
RLS-isolated) draft assignment.

**Bottom line: no live scheduled job currently iterates all orgs/locations
in a way that can reach the demo org's data.** No code guard was added to
any edge function (none was needed, and DEMO-1a's scope explicitly
excludes editing `supabase/functions/`). The one thing worth a human's
attention is the orphaned `weekly-rollover` cron job -- flagging it here
per the spec's "surfaced to John first" instruction, not fixing it.

## Testing

Every piece of actual decision logic is a pure function in `lib/`, unit
tested with Vitest and runnable without a database:

- `lib/anonymize.test.ts` -- the anonymization mapping (deterministic,
  proven to never leak a source name/email), the round-robin location
  distribution, and the login-role flag overrides.
- `lib/columnAllowlist.test.ts` -- `pickAllowedColumns`, plus a standing
  regression guard (`assertNoFreeTextLeak`) run against the actual
  allowlists this script uses.
- `lib/variance.test.ts` -- the confidence-score reshaping (deterministic,
  stays in range, produces real highs and lows, never invents a missing
  submission).
- `lib/refreshWeek.test.ts` -- the `--refresh` day-shift math, following
  the same host-timezone-independence discipline as `src/lib/dateUtils.test.ts`
  (COR-1): the same input must give the same answer under any host TZ.
- `lib/rowBuilders.test.ts` -- the weekly_assignments / weekly_scores row
  shaping (source stamping, `assign:` prefixing, `backfill_historical`
  tagging, the current-week score clear).

```bash
npx vitest run scripts/demo-seed
```

`seed.ts` itself is intentionally thin: Supabase I/O and CLI plumbing that
calls into the tested `lib/` functions. It is not unit tested directly (it
cannot be, without either a live database or a substantial mocking
refactor of the Supabase client) -- see "Hard rules" in the ticket this
script was built under. It was manually verified with a stricter, temporary
`tsc --strict` pass during development (not part of `npm run check`, which
only type-checks `src/`) to catch type errors the project's own relaxed
`tsconfig.app.json` wouldn't.

## What was not done / open questions for DEMO-1c

- **Resource-populated Pro Move selection (Clip 2).** The spec's acceptance
  script wants the coach view to land on skills whose resource sections are
  actually populated. This script copies whatever the real source
  location's current-week assignments happen to be -- it does not curate
  for resource completeness. If the chosen `--source-location`'s current
  picks turn out to be resource-light, that's a `--source-location` choice
  problem to solve when picking the location for the real seed, not
  something this script tries to fix by substituting a different Pro Move
  than what the real history says. Flagging for DEMO-1c's dry run.
- **The Clip 1 "uncompleted current week" guarantee is verified, not
  bulletproof.** The script warns loudly (but does not fail) if it can't
  confirm a current-week `weekly_assignments` row exists for demo-staff's
  specific role after the copy + shift. This should be visible in the run
  output; if it fires, pick a different source location or role mix.
- **No teardown/delete path.** Per the spec, this is out of scope for
  DEMO-1a ("Teardown is possible later because org-owned rows are exempt
  from the platform delete guard"). If a fresh copy is ever needed, the
  demo org's rows need to be deleted manually first (they're all
  `owner_org_id`/org-scoped, not platform pro_moves, so the delete guard
  trigger does not block it).
