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
7. Guarantees demo-staff has an uncompleted, `status = 'locked'`
   current-week assignment (locked because every app read path filters on
   it -- see "Design decisions" below), hard-failing the run with a clear
   message if that can't be arranged rather than warning and continuing.
8. Chooses the demo-staff/demo-coach/demo-admin personas deterministically
   by suitability (role present, most recent activity for the participant),
   not by arbitrary sort order -- see "Persona selection" below.
9. Is idempotent and resumable (a partial previous run is detected and
   continued, not duplicated -- see "Resuming an interrupted seed" below),
   and supports `--refresh` to re-point the "current week" to whenever it's
   actually run, including keeping the legacy cycle/week-in-cycle position
   unchanged.

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

Re-running that same command later, once the org already exists and looks
fully seeded, is a no-op (it prints "nothing to do" and exits) -- it will
not duplicate rows. `--source-location` is only read when there is
something left to do (first seed, or resuming a partial one); once the
demo org is fully seeded it's ignored.

### Resuming an interrupted seed

If `seed.ts` dies partway through the first seed (network blip, a
suitability hard-failure after some rows already landed, Ctrl-C, whatever),
the demo org is left in a partial state: the `organizations` row exists,
but staff/assignments/scores may be incomplete. Re-running the exact same
command picks this up automatically:

```bash
npx tsx scripts/demo-seed/seed.ts --source-location=<alcan-location-uuid>
```

On startup, the script checks whether the existing demo org looks complete
(at least 3 locations, at least 3 staff, at least 1 weekly_assignments row,
at least 1 weekly_scores row -- scores are the last thing a fresh seed
writes, so their presence is the "the copy reached the end" signal; a crash
mid-score-batch can still slip past this, so compare the final printed
counts against the dry run before trusting a resumed org).
If not, it logs "looks incomplete -- resuming the copy" and runs the same
copy logic again, except every step is get-or-create instead of
insert-only:

- **Org / group / locations**: looked up by slug first (already was
  idempotent).
- **Auth users**: one pagination sweep of `auth.users` up front, so a
  duplicate-email error can't happen even if a crashed attempt already
  created the auth user for someone whose `staff` row never landed.
- **Staff**: looked up by the cast member's demo email; if found, its
  structural fields are refreshed from source and it's reused (never
  re-inserted, never given a second auth user).
- **weekly_assignments**: looked up by its natural key
  (org, location, role, week, display_order); if found, reused (and forced
  back to `status = 'locked'` if it somehow wasn't).
- **weekly_scores**: looked up by `(staff_id, assignment_id)` before
  building the insert batch; already-present pairs are left alone, not
  re-inserted (there is no DB-level unique constraint on that pair, so this
  check happens in the script, not via `onConflict`).

This only works because the shift used to re-point copied weeks
(`shiftDays`) is anchored to the demo org's own `created_at` timestamp, not
wall-clock "now" -- so every resumed attempt at the same partial seed
recomputes the exact same target weeks as the first attempt, and the
natural-key lookups above actually find the earlier attempt's rows instead
of creating new ones with a slightly different `week_start_date`. (Once the
org is fully seeded, `--refresh` -- not another `seed.ts` run -- is what
moves it to the real current week; see below.)

Resuming with a *different* `--source-location` than the original attempt
is possible but not something this script defends against -- it would mix
data from two locations into one partial org. Stick with the same location
until the first seed finishes.

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
ordering are preserved. It also shifts every demo location's
`program_start_date` by that same number of days, so the legacy
cycle/week-in-cycle position (see `lib/refreshWeek.ts#weekInCycle`) stays
exactly where the seed originally put it -- without this, only the week
values would move while the program start date stood still, and the
location would eventually drift into "week 1 of a cycle" (some legacy code
treats that as "just onboarded") no matter how mid-program it started.
`--refresh` also re-clears demo-staff's (now current) week so Clip 1 still
has something uncompleted to rate, and re-syncs the 3 login passwords from
`.env` (so rotating a password and re-running with `--refresh` takes
effect).

`--refresh` only runs against an already-*complete* demo org. If the org
still looks partially seeded, `--refresh` is ignored in favor of resuming
the copy first (see above); re-run `--refresh` afterward.

There's also `npm run demo:seed -- --refresh` if you'd rather not type
`npx tsx` every time.

## The two assignment eras (found 2026-08-20, first seed attempt)

In February 2026 the live app stopped writing per-location
`weekly_assignments` rows and switched to org-level rows (`location_id`
null, `source = 'org'`). Every location's location-scoped rows are frozen
at 2026-02-09 or earlier; everything since lives only at the org level.
The original version of this script read only `location_id = <source>`,
which would have copied history ending in February and silently skipped
every score since -- and staff hired after the switch would have arrived
with no history at all (10 of Lake Orion's 14, at the time this was
caught).

The script now reads both eras and merges them via
`lib/mergeAssignmentEras.ts` (unit tested): future weeks are dropped from
both, and where the eras overlap (Dec 2025 - Feb 2026) the location-scoped
rows win for any role+week they cover, since they are what that location's
staff actually scored against. The seed and dry-run output print the kept /
dropped counts per era so a surprising merge is visible before anything is
written.

## Persona selection

Which three copied staff members become the demo-staff (participant),
demo-coach, and demo-admin logins can be pinned explicitly on the first
seed with `--participant=<name>`, `--coach=<name>`, `--admin=<name>`
(case-insensitive real name or email; a unique name fragment works too).
An override for the participant must still pass the same suitability bar
as an automatic pick (role + at least one score), because Clip 1 depends
on it. Any persona not pinned falls back to the automatic pick below.

Absent overrides, `lib/anonymize.ts` picks by suitability, in this order:

1. **demo-staff (participant)**: must have a `role_id` and at least one
   `weekly_scores` row of their own; among those, whoever's most recently
   active (`week_of`) wins. Clip 1 needs this person to plausibly land a
   real current-week assignment after the copy, so someone with no role or
   no history at all is a bad bet. If nobody in the source roster
   qualifies, the script **hard-fails** with a clear message rather than
   picking someone unsuitable -- a warning was not enough here, since Clip
   1 depends entirely on this choice.
2. **demo-coach**: excluding whoever was already picked as demo-staff,
   prefers a source staff member who was already a real coach
   (`is_coach`) and has a role; falls back to anyone with a role; falls
   back to whoever is left.
3. **demo-admin**: excluding both of the above, prefers anyone with a
   role; falls back to whoever is left.

Every remaining source staff member is then matched to the remaining
(non-login) cast members, sorted by id, same as before. Selection is
deterministic: the same source roster always picks the same three people
for the same three logins, run after run.

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

## Permissions are caps-only (found 2026-09-02, pre-seed review)

The app reads permissions exclusively from `user_capabilities` (+
`coach_scopes` for the coach persona) since 2026-07-25 — see the CAPS-ONLY
comment in `src/hooks/deriveUserRole.ts`. The legacy `staff.is_*` flags this
script copies grant nothing by themselves; a staff row without a
capabilities row renders as a permissionless user (demo-staff wouldn't even
count as a participant, and every clip's route guard would fail).

So after creating staff, the seed also:

- **Upserts one `user_capabilities` row per copied staff member**
  (`lib/capabilities.ts`, unit tested), using the exact formula of the
  2026-07-24 backfill migration
  (`20260724120000_backfill_user_capabilities.sql`) applied to the demo
  staff draft's flags. Because every draft pins `is_super_admin` to false,
  no demo row can ever receive `is_platform_admin` or `can_manage_library`.
- **Gives demo-coach an org-wide `coach_scopes` row** on the demo org.
  `can_view_submissions` alone already makes `isCoach` true, but the org
  scope is what makes `isRegional` true, which is what `/facilitate`
  (Clip 2's route, `allowFacilitate`) actually requires. It also scopes the
  coach surface to all three Bluebird locations, like a real regional coach.

Both writes are idempotent upserts, safe on resume and re-run.

## Design decisions worth knowing about

- **Every copied `weekly_assignments` row is forced to `status = 'locked'`,
  regardless of the source row's status.** QA caught this as the release
  blocker: every read path in the app filters on `status = 'locked'`
  (`src/lib/locationState.ts`, `useWeeklyAssignments`, `ConfidenceWizard`,
  `PerformanceWizard`, `MonthView`, `GlobalAssignmentBuilder`,
  `TeamWeeklyFocus`), so a copied `'draft'` row would sit in the table but
  render as if it did not exist -- silently breaking both the "weeks of
  history" Clip 2/3 need and Clip 1's uncompleted-current-week guarantee.
  This is forced for every copied week, not just the current one: a demo
  where history doesn't render is just as broken on camera as one where the
  current week doesn't. `status` was removed from
  `WEEKLY_ASSIGNMENTS_COPY_ALLOWLIST` entirely -- it is never read from the
  source row.
- **Staff are spread across all 3 demo locations, round-robin.** The spec
  says "copies one Alcan location's staff roster... into the demo org" but
  Clip 3 needs "3 locations... visible highs and lows." Splitting the one
  copied roster round-robin across the 3 demo locations is what makes that
  possible without inventing people. What varies by location is the
  reshaped confidence scores, not which Pro Moves are assigned.
- **`weekly_assignments` are written once, at the org level** (`location_id`
  null, `source = 'org'`) -- the shape the live app has written since Feb
  2026, automatically shared by all 3 demo locations. This replaced an
  earlier replicate-per-location design after Codex review of PR #105
  found (and live-schema checks confirmed) that the old shape could not
  insert at all: `weekly_assignments_source_check` rejects any made-up
  source value, and `weekly_assignments_check` requires `source='org'`
  rows to have no `location_id`. It was also semantically wrong --
  consumers (`assembleWeek` in `src/lib/locationState.ts`,
  `useWeeklyAssignments`) scope assignments by org + role + week, never by
  location, so three per-location copies would have shown every staff
  member nine Pro Moves instead of three.
- **`--exclude=<name>` leaves a source staff member out of the copy
  entirely** (repeatable, or comma-separated; same name/email matching as
  the persona flags, same hard-stop on a typo). Built for test accounts
  sitting in real rosters -- Buda's "Testing Testers" was the motivating
  case. Their scores never enter the copy either: everything downstream
  keys off the filtered roster.
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
  distribution, the login-role flag overrides, and the persona-suitability
  selectors (`selectParticipant`/`selectCoach`/`selectAdmin`, including the
  participant hard-failure case).
- `lib/columnAllowlist.test.ts` -- `pickAllowedColumns`, plus a standing
  regression guard (`assertNoFreeTextLeak`) run against the actual
  allowlists this script uses.
- `lib/variance.test.ts` -- the confidence-score reshaping (deterministic,
  stays in range, produces real highs and lows, never invents a missing
  submission).
- `lib/refreshWeek.test.ts` -- the `--refresh` day-shift math, following
  the same host-timezone-independence discipline as `src/lib/dateUtils.test.ts`
  (COR-1): the same input must give the same answer under any host TZ. Also
  `weekInCycle` and the proof that shifting `week_start_date` and
  `program_start_date` by the same amount leaves cycle position invariant
  (and that shifting only one of them, the pre-fix bug, does not).
- `lib/rowBuilders.test.ts` -- the weekly_assignments / weekly_scores row
  shaping (source stamping, forced `status = 'locked'` regardless of
  source, `assign:` prefixing, `backfill_historical` tagging, the
  current-week score clear).

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
- **The Clip 1 "uncompleted current week" guarantee now hard-fails
  instead of warning** (QA-flagged blocker, fixed): the script throws with
  a clear message, stopping the run, if it can't confirm a current-week
  `weekly_assignments` row exists (and is `status = 'locked'`) for
  demo-staff's specific role after the copy + shift. If it fires, the
  message says so plainly; pick a different source location, or note that
  whatever was already written is safe to leave (re-running resumes).
- **No teardown/delete path.** Per the spec, this is out of scope for
  DEMO-1a ("Teardown is possible later because org-owned rows are exempt
  from the platform delete guard"). If a fresh copy is ever needed, the
  demo org's rows need to be deleted manually first (they're all
  `owner_org_id`/org-scoped, not platform pro_moves, so the delete guard
  trigger does not block it).
