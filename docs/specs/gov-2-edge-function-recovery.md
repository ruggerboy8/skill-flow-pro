# GOV-2: Recover orphaned edge function sources, reconcile config.toml

Date: 2026-08-19. Branch `fix/gov-2-recover-edge-functions`. Read-only against
production throughout: no deploy, undeploy, or migration was applied. Source
of truth for everything below is the live inventory from the Supabase MCP
`list_edge_functions` / `get_edge_function` tools against project
`yeypngaufuualdfzcjpk`, cross-checked with `grep` across `src/` and
`supabase/functions/` and with prior audit docs already in the repo
(`docs/archive/phase-c-comparison.md`, `docs/archive/audits/security-rls-audit.md`,
`docs/archive/audits/multi-tenant-isolation-audit.md`).

## 1. Live inventory vs. the ticket's list

**47 functions are deployed and ACTIVE.** The ticket named 11 as orphaned
(no source in repo); the live inventory confirms exactly those 11 and no
others, same 11 names, no additions, no removals. No delta to report there.

The ticket also said config.toml "still declares stanzas for sequencer-health
and sync-onboarding-assignments whose source directories do not exist in the
repo." That's half right: config.toml (before this branch) declared a stanza
only for `sync-onboarding-assignments`. There was **no** `sequencer-health`
stanza in the file at all, it was simply missing, the same as
`compute-weekly-plans`, `notify-meeting-summary`, and
`backfill-new-user-excuses`. This matches the repo's own prior audit trail:
`docs/archive/phase-c-comparison.md` records that a ghost `sequencer-health`
config entry was already removed by John before this session, and
`docs/archive/audits/security-rls-audit.md` (finding M2) independently
flagged the same `sequencer-health` / `sync-onboarding-assignments` gap
months ago and marked it "needs live verification." That verification is
what step 1 below did.

## 2. Recovery results

All 11 orphaned functions were fetched successfully via
`mcp__claude_ai_Supabase__get_edge_function`. No fetch failures, no CLI
fallback needed.

| Function | Own `_shared` imports | Bytes (entrypoint) |
|---|---|---|
| `rollover-weekly` | none | 6,941 |
| `compute-weekly-plans` | 4 (data, engine, config, types) | 5,847 |
| `override-plan` | none (inline `corsHeaders`) | 3,607 |
| `save-priorities` | 3 (data, engine, config) | 5,259 |
| `manager-priorities-save` | 2 (cors, types) | 4,238 |
| `sequencer-alcan-rankings` | 5 (cors, engine, data, config, types) | 4,731 |
| `sequencer-sim-upsert` | 4 (cors, engine, config, types) | 4,631 |
| `sequencer-health` | none | 3,717 |
| `sync-onboarding-assignments` | none | 5,314 |
| `parse-feedback` | none | 5,963 |
| `parse-interview` | none | 4,122 |

**Correction from an earlier draft of this document:** the first pass of
this table said six functions import the shared module and named
`override-plan` as one of them. That was wrong. Reading `override-plan`'s
own source shows it defines `corsHeaders` inline and has zero `import ...
from '../_shared/...'` statements. **The correct count is five**:
`compute-weekly-plans`, `save-priorities`, `manager-priorities-save`,
`sequencer-alcan-rankings`, `sequencer-sim-upsert`. `override-plan`'s
response from the MCP tool happened to include the `_shared/*.ts` files
anyway, because the tool returns each deployed bundle's full sibling-file
set from the same deploy batch, not a true per-function dependency closure.
That's a fact about how the recovery tool packages its response, not about
what `override-plan` itself imports, and this document previously
conflated the two.

The five importing functions share a common module that also had no source
in the repo. That module was recovered once into
`supabase/functions/_shared/`:

- `_shared/cors.ts` (158 bytes)
- `_shared/sequencer-types.ts` (1,580 bytes)
- `_shared/sequencer-config.ts` (369 bytes)
- `_shared/sequencer-data.ts` (3,775 bytes)
- `_shared/sequencer-engine.ts` (5,230 bytes)

The MCP tool returns each function's full sibling-file bundle per call, so
the same shared-module content came back attached to multiple responses,
byte-identical every time. I diffed them and wrote each shared file once
rather than duplicating it per function (Deno's relative-import resolution
means one `_shared/` copy serves all five, matching how they're actually
deployed). Note for later triage, not fixed here: the repo already has a
different shared file, `_shared/sequencerScoring.ts` (camelCase,
pre-existing, used by `sequencer-rank`), so there are now two
differently-named "sequencer scoring logic" modules in `_shared/`. That's a
duplication finding, not something GOV-2's scope covers, so flagging it for
a separate ticket rather than merging them.

No fetch failed. Nothing was left missing or fabricated.

**Every recovered file was verified byte-identical to the live deployment by
md5 checksum on 2026-08-19**, not just eyeballed as "looks the same." An
earlier pass of this recovery had used a file-writing path that silently
stripped trailing whitespace on two files (`rollover-weekly/index.ts`,
`sequencer-health/index.ts`), which a straight visual read of the code would
not have caught: the diffs were a trailing space on two lines and one
whitespace-only line, invisible in a normal code view. QA caught it by
diffing against a live-fetched reference copy. The fix: re-fetch each
function fresh via the MCP tool, save the raw JSON response to disk through
a path proven immune to whitespace stripping (a quoted Bash heredoc, which a
direct test confirmed preserves trailing spaces and tabs exactly), then use
Python's `json.loads` to decode the `content` field and write it with
`open(path, "w", newline="").write(content)`. For every one of the 16 files
(11 entrypoints, 5 shared modules), the md5 of the freshly-fetched content
string and the md5 of the resulting on-disk file were computed independently
and confirmed to match; see the checksum table in the build report for this
fix. Cross-checked against QA's own saved reference copies for 9 of the 16
files: `rollover-weekly` and `sequencer-health` matched byte-for-byte
(confirming the specific bug QA found is fixed), while `compute-weekly-plans`,
`sequencer-alcan-rankings`, and three of the five shared files showed a
narrow, opposite-direction discrepancy against QA's references: QA's copies
have a truly blank line where the live source (confirmed directly from the
raw MCP JSON text, before any processing) has a whitespace-only line. Every
one of those differences is whitespace-only with no code-content difference.
This repo's files were kept as fetched from the live MCP response rather
than matched to QA's reference copies, since the raw JSON text is the more
direct source and QA's own capture process appears to have the same class of
bug on those specific lines.

## 3. config.toml reconciliation

Before this branch: 32 `[functions.*]` stanzas, several stale or wrong
relative to production. After: all 47 stanzas, regenerated from the live
inventory rather than edited in place, so every value is independently
verified rather than assumed correct where it happened to already match.

- **12 stanzas have `verify_jwt = false`, 35 have `verify_jwt = true`.** That
  matches the live platform exactly (confirmed by `grep -c` against the file
  after writing it).
- **Added declarations that didn't exist before, 12 in total** (verified with
  `git diff origin/main..HEAD -- supabase/config.toml`, comparing the set of
  `[functions.*]` stanza headers before and after: 35 before, 47 after, 12
  added, 0 removed): `backfill-new-user-excuses`, `compute-weekly-plans`,
  `manager-priorities-save`, `notify-meeting-summary`, `override-plan`,
  `parse-feedback`, `parse-interview`, `rollover-weekly`, `save-priorities`,
  `sequencer-alcan-rankings`, `sequencer-health`, `sequencer-sim-upsert`.
  **Correction from an earlier draft of this section:** it previously listed
  `sync-onboarding-assignments` as one of the newly-added stanzas and, in the
  same sentence, described it as already having one, an internal
  contradiction, and it omitted `parse-feedback` and `parse-interview`
  entirely. Both are fixed here. `sync-onboarding-assignments` is **not** a
  new stanza: it already existed in `origin/main` with `verify_jwt = false`
  (see section 1), and this branch only backed that existing declaration
  with real source instead of none.
- **Removed:** nothing needed removing. The suspected stale
  `sequencer-health` stanza the ticket described did not actually exist in
  the file (see section 1), so there was nothing to delete there, only
  something to add.
- All non-function config (`project_id`) is untouched.

## 4. Security review: the three public recovered functions

All three were `verify_jwt = false` in production with **no source in the
repo**, meaning nobody had reviewed them before now.

### `compute-weekly-plans`

**What the code is written to do.** For each of the two roles (DFI=1,
RDA=2), compute the locked current-week Pro Move picks and a draft
next-week preview using the recovered sequencer engine
(`_shared/sequencer-engine.ts`), then write both results and expand the
locked week into `weekly_focus` rows for every active location.

**Reads/writes as written.** Reads `pro_moves`, `competencies`, four
`seq_*` RPCs, and `manager_priorities`, all via a **service-role** REST
client (`_shared/sequencer-data.ts`), which bypasses RLS entirely. Writes:
upserts `alcan_weekly_plan` (both the locked and draft/preview rows),
deletes and re-inserts `weekly_focus` rows for every active location, all
through the service-role key.

**Against today's schema, it cannot get anywhere near a write.** Both
tables it targets are gone under those names: `alcan_weekly_plan` was
dropped outright by `supabase/migrations/20260326212932_0b8d16a0-*.sql`
(`DROP TABLE IF EXISTS alcan_weekly_plan;`), and `weekly_focus` was renamed
to `zzz_archived_weekly_focus` by
`supabase/migrations/20260724210000_slice_d_archive_cycle_era.sql`. No
later migration recreates either under the old name, and I confirmed that
by grepping every migration after each drop/rename for the table names.
But the function never even reaches those writes to find that out, because
it fails two steps earlier, in the input-fetching stage:

1. `Deno.serve` parses the optional `runDate` and computes dates in plain
   JS, no database calls yet.
2. Inside the `for (const roleId of [1, 2])` loop, the first database call
   of any kind is `await fetchAlcanInputsForRole(...)`
   (`_shared/sequencer-data.ts`), called before the `alcan_weekly_plan`
   upsert, not after it.
3. `fetchAlcanInputsForRole`'s first REST call, against `pro_moves`,
   succeeds; that table is untouched by either migration.
4. Its second REST call is a POST to
   `/rest/v1/rpc/seq_confidence_history_18w`. That function was dropped by
   name in the `DROP FUNCTION` loop inside the slice D migration (line 26
   of `20260724210000_slice_d_archive_cycle_era.sql`, alongside
   `seq_domain_coverage_8w` and `seq_last_selected_by_move`), and nothing
   recreates it afterward. PostgREST returns a 404 with a JSON error body
   (`code: "PGRST202"`) for a call to a function that no longer exists,
   not an array.
5. The code never checks `confRes.ok`. It runs
   `const confidenceHistory = (confData || []).map(...)` directly. Since
   `confData` is the truthy error object, `(confData || [])` evaluates to
   that object, and calling `.map` on a plain object throws a `TypeError`
   synchronously, inside `fetchAlcanInputsForRole`.
6. That `TypeError` propagates up through the `await
   fetchAlcanInputsForRole(...)` call in `compute-weekly-plans/index.ts`
   to the handler's outer `catch (error)` block, which returns HTTP 500
   with `{ error: error.message }`.

The `alcan_weekly_plan` upsert (line 65 of `index.ts`) and the
`weekly_focus` delete/insert inside `expandToWeeklyFocus` are never
reached on either role's iteration. **This is a correction from an earlier
draft of this document**, which described the write as something an
unauthenticated caller could actually trigger; tracing the code against
the current schema shows it cannot, because the function dies in its
input-fetching step before either write statement executes.

**Auth/secret checks: none.** The handler reads only an optional `runDate`
from the request body. There is no JWT check, no shared-secret header
check, no admin-role check anywhere in the function. This is unchanged by
the schema finding above; the endpoint is still wide open, it just doesn't
do anything useful once reached.

**Is public exposure justified? No**, though for a different reason than
severity of impact. The absence of any auth check is still a real defect
in the code itself, and worth fixing on principle regardless of what the
schema happens to look like this week. But it is not currently a live
data-integrity hole.

**Risk if hit unauthenticated, today.** An anonymous caller can invoke a
service-role Deno function that does a small amount of real work (one
successful `pro_moves` read) and then throws, returning a 500. No row in
`alcan_weekly_plan` or `weekly_focus` gets written, because neither of
those write statements is ever reached and neither target exists under
that name anymore. The concrete live risk today is **unauthenticated
invocation of a dead service-role endpoint**, not silent overwrite of
production planning data. That said, two things keep this from being a
non-issue: first, the write code is real, correctly targets a
service-role client that bypasses RLS, and would resume having its
original effect immediately if `alcan_weekly_plan` or `weekly_focus`
(or equivalents under those exact names) ever came back, whether by a
rollback, a new migration, or a compatibility view; second, it still burns
compute and hits the `pro_moves` table on every anonymous call, which is a
minor unauthenticated-cost vector on its own even though it can't corrupt
data right now. **Net effect on the recommendation: this strengthens the
case to undeploy** (see section 7) rather than weakens it. The function is
not merely unused, it is unauthenticated *and* non-functional against the
schema currently live, with no upside to keeping it deployed while it is
in that state.

### `sequencer-health`

**What it does.** A read-only status probe: whether the sequencer's
auto-run flag is on, the configured org timezone, whether the gate RPC
reports open, whether the first dynamic week has been seeded, and whether
each role has a locked-current / proposed-next `weekly_plan` row.

**Reads/writes.** Reads `app_kv` (two specific keys), the
`check_sequencer_gate` RPC, and existence-only queries against `weekly_plan`
(id only, no PII, no scores). Writes nothing.

**Auth/secret checks: none**, but there's also nothing to protect: no
personal data, no tenant-identifying content, just operational booleans and
two dates.

**Is public exposure justified?** Practically low-risk (no data leak), but
not *correct* either. Nothing in the codebase calls it (see section 6), so
there's no legitimate anonymous caller to justify leaving it open. It should
default to `verify_jwt = true` like every other internal status/ops
endpoint, not stay public because the exposure happens to be harmless today.

**Risk if hit unauthenticated.** Low. Information disclosure is limited to
scheduling/readiness state, not user data. Main risk is just that it's an
unnecessary open surface with no legitimate caller.

### `sync-onboarding-assignments`

**What the code is written to do.** For every active location with
`onboarding_active = true`, walk the onboarding `weekly_focus` templates
(cycles 1 through 3), compute each template's `week_start_date` for that
location's program start, and insert a `weekly_assignments` row for any
combination not already present.

**Reads/writes as written.** Reads `locations` and `weekly_focus`.
**Writes** `weekly_assignments`: real INSERTs, via a **service-role**
client that bypasses RLS, guarded only by an existing-row check (so it's
idempotent, not authorization-checked).

**Against today's schema, it errors out on the second read and never
reaches the write.** `weekly_focus` was renamed to
`zzz_archived_weekly_focus` by
`supabase/migrations/20260724210000_slice_d_archive_cycle_era.sql`, and no
later migration recreates a table or view under the plain `weekly_focus`
name. Tracing the handler in order:

1. The `locations` select (line 41 of `index.ts`) succeeds; that table is
   untouched by either migration.
2. The `weekly_focus` select (line 54) fails, because that table no
   longer exists under that name. The Supabase client returns this as a
   populated `focusError` (a schema-cache-miss error, the same class
   PostgREST returns for any query against a table it can't find), not a
   thrown exception at the query site.
3. The code explicitly checks this: `if (focusError) { throw new
   Error(...) }` (line 63-64). Unlike `compute-weekly-plans`, this is a
   deliberate, handled check, not an incidental `TypeError` from an
   unguarded `.map`.
4. The thrown `Error` is caught by the handler's own `try`/`catch` (the
   `catch` starting the block that contains the whole handler body), which
   returns `{ success: false, error: ... }` with HTTP 500.
5. The `for (const location...)` / `for (const template...)` loops that
   contain the `weekly_assignments` select-then-insert logic (lines 74-129)
   are never entered, because `focusTemplates` is never assigned; the
   function throws before that point.

**This part of the earlier draft held up under re-tracing**, and Codex's
description was accurate: the function does error out on its `weekly_focus`
query and does exit before ever reaching the `weekly_assignments` insert.

**Auth/secret checks: none.** No JWT validation, no shared secret, no
admin-role check anywhere in the handler. Unchanged by the schema finding;
the endpoint is still wide open, it just fails before doing anything.

**Is public exposure justified? No**, on the same principle as
`compute-weekly-plans`: an unauthenticated service-role endpoint is a
defect regardless of whether the schema underneath it currently lets it
do anything.

**Risk if hit unauthenticated, today.** An anonymous caller can invoke a
service-role Deno function that reads `locations` successfully, fails on
the `weekly_focus` read, and returns a 500. **No row is written to
`weekly_assignments` today**, because the function never reaches that
code. **Correction from an earlier draft of this document**, which
described this as "the most concrete finding of the three" and said
outright that an anonymous caller could write assignments; that was wrong
against the schema as it exists now. The write code is real, targets a
service-role client, and would resume writing immediately if `weekly_focus`
(or an equivalent under that exact name) ever came back. Until then, the
concrete live risk is the same shape as `compute-weekly-plans`:
**unauthenticated invocation of a dead service-role endpoint**, plus a
minor unauthenticated-cost vector from the `locations` read on every call.
**Net effect on the recommendation: this strengthens the case to undeploy**
rather than weakens it, for the same reason as above, not weaker than a
"dead source, never wired to a frontend" endpoint but differently dead: it
was live, wired to real tables at some point, and the schema moved out
from under it without anyone flipping `verify_jwt` or retiring the
function.

**All three of section 4's functions should move to `verify_jwt = true`**
(or, if a legitimate anonymous caller exists, for example an external cron
hitting `rollover-weekly`'s pattern, an explicit in-code auth check like
the one already present in `backfill-format-evaluator-notes`, see section
5). That change is a SEC-4 ticket action, not a GOV-2 one. This document
records the finding; it does not flip the flag.

## 5. The other live `verify_jwt = false` functions

Nine more functions are public besides the three above, for **12 total**.
All nine already had source in the repo before this branch. Config coverage
after this branch's rewrite:

| Function | Config documents it now? | Note |
|---|---|---|
| `extract-insights` | Yes (already did) | Has an in-code JWT check per the wider assessment. |
| `polish-note` | Yes (already did) | Flagged before, in `docs/archive/audits/security-rls-audit.md` M1, as an unauthenticated AI-proxy with no in-code check: cost/abuse risk, not data leak. |
| `format-reflection` | Yes (already did) | Same M1 finding as `polish-note`. |
| `deputy-oauth-callback` | Yes (already did) | OAuth callback endpoints are conventionally public (the redirect itself carries the state token); not re-reviewed here, out of GOV-2 scope. |
| `deputy-sync` | Yes (already did) | Not re-reviewed here. |
| `deputy-sync-dispatcher` | Yes (already did) | Cron-invoked (see section 6); flagged previously in the assessment (SEC-4) as public with a service-role key and zero in-code auth. |
| `backfill-format-evaluator-notes` | Yes (already did) | Worth noting: despite `verify_jwt = false` at the platform level, this function has a real **in-code** JWT + `is_super_admin` check (`index.ts:67-95`), the opposite pattern from the three reviewed above, which have no gate at any layer. This matches the fix already recorded in `docs/archive/audits/multi-tenant-isolation-audit.md` finding 1. |
| `notify-meeting-summary` | **Newly added** by this branch | Not reviewed in depth; flagged only because it was undocumented before. |
| `backfill-new-user-excuses` | **Newly added** by this branch | Same: undocumented before, not reviewed in depth. |

## 6. Method for the "does anything call it" column

For every one of the 47 live functions I ran
`grep -rl "<slug>" src/ supabase/functions/`, excluding the function's own
directory (which always self-matches in log lines), then separately checked
`supabase/migrations/*.sql` for `cron.schedule` jobs referencing the
function's URL. This is a repo-text search, not a runtime trace: it will
miss a caller built from a dynamically-constructed string, and it can't see
callers outside this repo (an external webhook, a manual dashboard trigger,
Zapier, etc.). Treat the "0 callers found" cells below as "not found by grep
in this repo," not as proof nothing anywhere calls the function.

**One live cron job was found**, and it changes the read on the highest-risk
item in this report:

- `weekly-rollover` (`supabase/migrations/20250825203536_*.sql` and
  `20250825203814_*.sql`, both `cron.schedule('weekly-rollover', '0 * * * *', ...)`)
  calls `rollover-weekly` **hourly**, using the project's anon key as its
  bearer token. Both migrations register the same job name, which is a
  normal idempotent re-registration in pg_cron, not two duplicate jobs.
- `docs/archive/phase-c-comparison.md` (a prior review, not this session)
  states this cron job was manually unscheduled by John via the SQL editor,
  outside of any migration. **I could not independently confirm that.**
  Unscheduling was done ad hoc, not through a committed migration, and
  querying `cron.job` live was outside the read-only tool set authorized for
  this task (only `list_edge_functions` / `get_edge_function`, plus repo
  grep). This is an open question for QA/John: confirm whether
  `weekly-rollover` is still scheduled before treating `rollover-weekly` as
  either "safe to undeploy" or "silently still running hourly against
  production."
- A second cron job, `deputy-sync-dispatcher-weekly`
  (`supabase/migrations/20260422215119_*.sql`), calls
  `deputy-sync-dispatcher` every Monday. That function already has source in
  the repo (not one of the 11), so it's out of GOV-2's recovery scope, but it
  explains why `deputy-sync-dispatcher` shows "0 callers" in the frontend
  grep despite being a real, actively-scheduled function, same shape as
  `rollover-weekly`.

Also worth stating plainly: `docs/archive/phase-c-comparison.md` records
that a prior review already concluded **all 11 of these same orphaned
functions were zero-caller**, independently of this session's grep. That's
corroborating evidence, not something to take on faith alone. This session's
own grep reached the same conclusion by a different method.

## 7. Full reconciliation table

"Recovered?" is n/a for the 36 functions that already had source before this
branch. "Keep/undeploy" is a recommendation only. **No function was
undeployed**; that action is explicitly out of scope for tonight per the
ticket.

| Slug | Live `verify_jwt` | Source in repo before? | Recovered? | Version | Last updated | Recommendation |
|---|---|---|---|---|---|---|
| `admin-users` | true | yes | n/a | 334 | 2026-08-19 | Keep. 9 references in `src/`, core admin surface. |
| `backfill-format-evaluator-notes` | false | yes | n/a | 34 | 2026-08-19 | Keep. One-off backfill tool, but has its own in-code auth gate (section 5); 0 frontend callers is expected for an admin-triggered backfill. |
| `backfill-new-user-excuses` | false | yes | n/a | 29 | 2026-08-19 | 1 reference found. Config now documents it (was undocumented before this branch). Not reviewed in depth, out of GOV-2 scope. |
| `categorize-doctor-content` | true | yes | n/a | 154 | 2026-08-19 | Keep. 1 reference, active AI content pipeline. |
| `coach-remind` | true | yes | n/a | 265 | 2026-08-19 | Keep. 1 reference. |
| `coaching-extract-issues` | true | yes | n/a | 15 | 2026-08-19 | Keep. 1 reference. |
| `compute-weekly-plans` | false | **no** | **yes** | 17 | 2025-11-04 | **Undeploy candidate, stronger case than "unused."** 0 callers found in `src/` or `supabase/functions/`, no cron reference, and it is unauthenticated and non-functional against today's schema: it fails inside its own input-fetching step, before either of its two writes, because `alcan_weekly_plan` is dropped and the `seq_confidence_history_18w` RPC it calls first no longer exists (section 4). Part of a same-batch cluster (see below) that looks like an abandoned Nov 2025 build. Confirm with owner before acting; do not undeploy on this recommendation alone. |
| `deputy-get-employees` | true | yes | n/a | 41 | 2026-08-19 | Keep. 3 references, part of the live Deputy integration. |
| `deputy-initiate-oauth` | true | yes | n/a | 62 | 2026-08-19 | Keep. 1 reference. |
| `deputy-oauth-callback` | false | yes | n/a | 64 | 2026-08-19 | Keep. 3 references; public is conventional for an OAuth redirect target. |
| `deputy-sync` | false | yes | n/a | 65 | 2026-08-19 | Keep. 3 references, live Deputy integration. |
| `deputy-sync-dispatcher` | false | yes | n/a | 42 | 2026-08-19 | Keep. Cron-invoked weekly (`deputy-sync-dispatcher-weekly`, confirmed in migrations); 0 frontend callers is expected, not a sign of disuse. Already flagged in the wider assessment (SEC-4) as public with a service-role key and no in-code auth, that's a SEC-4 fix, not a GOV-2 one. |
| `deputy-test-connection` | true | yes | n/a | 52 | 2026-08-19 | 0 callers found by grep. Plausibly an admin "test connection" button; not confirmed. Flag for a follow-up look, not an undeploy call tonight. |
| `extract-insights` | false | yes | n/a | 179 | 2026-08-19 | Keep. 3 references, has an in-code JWT check per the wider assessment. |
| `format-agenda` | true | yes | n/a | 145 | 2026-08-19 | Keep. 1 reference. |
| `format-evaluator-note` | true | yes | n/a | 34 | 2026-08-19 | Keep. 1 reference. |
| `format-pro-move-content` | true | yes | n/a | 153 | 2026-08-19 | Keep. 2 references. |
| `format-reflection` | false | yes | n/a | 149 | 2026-08-19 | Keep (in use) but flagged in the wider assessment (SEC-4/M1) as an unauthenticated AI-cost surface, a separate ticket. |
| `format-transcript` | true | yes | n/a | 164 | 2026-08-19 | Keep. 2 references. |
| `generate-audio` | true | yes | n/a | 212 | 2026-08-19 | Keep. 1 reference. |
| `generate-pro-move-weights` | true | yes | n/a | 68 | 2026-08-19 | Keep. 2 references. |
| `invite-to-schedule` | true | yes | n/a | 118 | 2026-08-19 | Keep. 2 references. |
| `lead-request-meeting` | true | yes | n/a | 15 | 2026-08-19 | Keep. 1 reference. |
| `manager-priorities-save` | true | **no** | **yes** | 17 | 2025-11-04 | **Undeploy candidate.** 0 callers found. Same Nov 2025 batch as `compute-weekly-plans`/`override-plan`/`save-priorities` (near-identical `updated_at`); superseded-looking design (has a whole unused "simulation mode" branch). Confirm with owner first. |
| `map-baseline-domain-notes` | true | yes | n/a | 117 | 2026-08-19 | Keep. 1 reference. |
| `map-observation-notes` | true | yes | n/a | 151 | 2026-08-19 | Keep. 2 references. |
| `notify-eval-release` | true | yes | n/a | 154 | 2026-08-19 | Keep. 1 reference. |
| `notify-meeting-summary` | false | yes | n/a | 97 | 2026-08-19 | 1 reference found. Config now documents it (was undocumented before this branch). Not reviewed in depth, out of GOV-2 scope. |
| `override-plan` | true | **no** | **yes** | 17 | 2025-11-04 | **Undeploy candidate.** 0 callers found. Same Nov 2025 cluster as above; super-admin-gated, but nothing calls it. Confirm with owner first. |
| `parse-feedback` | true | **no** | **yes** | 17 | 2025-12-17 | 0 callers found. Lower risk than the cluster above (verify_jwt already true), but likely unused, flag for confirmation, not urgent. |
| `parse-interview` | true | **no** | **yes** | 11 | 2025-12-17 | Same as `parse-feedback`: 0 callers found, already protected, flag for confirmation. |
| `planner-upsert` | true | yes | n/a | 226 | 2026-08-19 | Keep. 1 reference. Already flagged in the wider assessment (SEC-4) for accepting a body-supplied `orgId`/`updaterUserId`, a separate ticket. |
| `polish-note` | false | yes | n/a | 155 | 2026-08-19 | Keep (in use) but same SEC-4/M1 AI-cost exposure finding as `format-reflection`. |
| `pro-move-suggest` | true | yes | n/a | 65 | 2026-08-19 | Keep. 2 references. |
| `rollover-weekly` | true | **no** | **yes** | 103 | 2025-11-06 | **Keep, pending live cron confirmation.** 0 callers in `src/`, but a migration-registered pg_cron job (`weekly-rollover`) invokes it hourly. A prior doc claims John manually unscheduled that cron outside of any migration; not independently verifiable with this task's read-only tools. Do not undeploy until someone confirms live whether `weekly-rollover` is still scheduled. |
| `save-audio` | true | yes | n/a | 207 | 2026-08-19 | Keep. 1 reference. |
| `save-priorities` | true | **no** | **yes** | 17 | 2025-11-04 | **Undeploy candidate.** 0 callers found. Same Nov 2025 cluster. Confirm with owner first. |
| `send-hr-export` | true | yes | n/a | 25 | 2026-08-19 | Keep. 1 reference. |
| `separate-feedback` | true | yes | n/a | 20 | 2026-08-19 | Keep. 1 reference. |
| `sequencer-alcan-rankings` | true | **no** | **yes** | 18 | 2025-11-04 | **Undeploy candidate.** 0 callers found. Same Nov 2025 cluster; the live/active sequencer path is `sequencer-rank` (7 references), which corroborates this being an abandoned parallel implementation. Confirm with owner first. |
| `sequencer-auto-assign` | true | yes | n/a | 70 | 2026-08-19 | Keep. 1 reference. |
| `sequencer-health` | false | **no** | **yes** | 37 | 2025-11-06 | **Undeploy candidate**, or at minimum flip to `verify_jwt = true`. 0 callers found; read-only so lower risk than the two write endpoints in this cluster, but still an unnecessary public surface. Confirm with owner first. |
| `sequencer-rank` | true | yes | n/a | 262 | 2026-08-19 | Keep. 7 references; this is the actually-used sequencer, distinct from the Alcan-wide cluster above. |
| `sequencer-sim-upsert` | true | **no** | **yes** | 17 | 2025-11-04 | **Undeploy candidate.** 0 callers found. Same Nov 2025 cluster, super-admin-gated but unused. Confirm with owner first. |
| `slot-domain-feedback` | true | yes | n/a | 25 | 2026-08-19 | Keep. 2 references. |
| `sync-onboarding-assignments` | false | **no** | **yes** | 59 | 2026-02-17 | **Highest-priority item in this table**, though not for the reason an earlier draft of this document gave. It is unauthenticated and, against today's schema, non-functional: its `weekly_focus` query fails (that table was renamed to `zzz_archived_weekly_focus`) and the function exits before ever reaching the `weekly_assignments` insert (section 4), so no live write is happening right now. 0 callers found in this repo, but repo docs (`docs/archive/edge-function-deployment.md`, `docs/archive/phase-3-5-implementation-plan.md`) describe it as a deliberately-built onboarding sync tool, so "confirm with owner before undeploying" applies doubly here: either it's genuinely dead and should go, or it's still wanted, in which case it needs both a schema fix and `verify_jwt = true` before it's touched again. Do not leave it as-is either way. |
| `transcribe-audio` | true | yes | n/a | 187 | 2026-08-19 | Keep. 7 references. |

**A caution about the "updated_at" column for the 36 pre-existing
functions:** most of them share the exact same `updated_at` timestamp
(2026-08-19, today), across functions with completely different version
numbers and unrelated purposes. That's very unlikely to mean 36 functions
were all hand-edited on the same day. It reads like a platform-level touch
event (a project pause/resume, or a bulk metadata refresh) rather than a real
last-edited date. Treat that column as "last touched by the platform," not
"last reviewed by a person," for anything dated 2026-08-19.

## 8. Open questions for QA / John

1. **Is `weekly-rollover` still scheduled in pg_cron?** This determines
   whether `rollover-weekly` is silently running hourly against production
   right now. Needs a live `SELECT * FROM cron.job` check, outside this
   task's authorized read-only tool set.
2. **Should the six-function Nov 2025 cluster
   (`compute-weekly-plans`, `override-plan`, `save-priorities`,
   `manager-priorities-save`, `sequencer-alcan-rankings`,
   `sequencer-sim-upsert`) plus `sequencer-health` be undeployed as a group?**
   All seven show zero callers, share build timestamps, and look like one
   abandoned "Alcan-wide sequencer v2" effort that never got a frontend.
   `compute-weekly-plans` is now also confirmed non-functional against the
   current schema (section 4), which only strengthens this. This session
   recommends undeploying the group; the ticket says the undeploy decision
   itself belongs to a separate pass.
3. **`sync-onboarding-assignments` needs an owner decision this week, not
   eventually,** for a different reason than an earlier draft of this
   document gave: it's an unauthenticated endpoint that is currently
   non-functional (its `weekly_focus` query fails before it ever reaches
   the `weekly_assignments` write, section 4), left live and unreviewed. If
   it's still wanted, it needs both a schema fix and `verify_jwt = true`. If
   it's not, it should go.
4. Two functions I could not find a clear frontend caller for
   (`parse-feedback`, `parse-interview`) are at least already protected by
   `verify_jwt = true`, so there's no urgency, but they're worth a five-minute
   "do we still use these" check.
5. This document's "does anything call it" answers come from `grep` and
   migration search only, per the task's instructions. It cannot see
   external callers (webhooks, dashboards, third-party schedulers). Treat
   every "0 callers found" line as "not found in this repo," not "proven
   unused."
