# Pro Move Versioning: effort audit and implementation plan

> **Status:** APPLIED 2026-07-30. Waves 1-3 are live in production and verified;
> Wave 4 code changes are in the repo (frontend ships on the next Lovable
> Publish). Companion to
> [pro-move-versioning-requirements.md](pro-move-versioning-requirements.md).
> See "Applied: results and deviations" at the end for what actually happened.

## Verdict

**Effort: roughly one focused working day.** The DB core is 3 to 4 migrations, almost
entirely additive. No frontend work is required for the core to function (R9 is
explicitly phase 2). A small frontend cleanup (two components) and a one-line edge
function fix ride along in the final wave.

**Do it sequenced, not as one migration.** Not because the total is large, but because
the risk is lopsided: everything except Wave 2 is near-zero risk, while Wave 2 (capture
triggers plus the delete guard) touches the write path of two live tables and interacts
with four existing hard-delete code paths. Sequencing buys a verification gate exactly
where the risk lives. The whole sequence is shippable in one sitting; "sequenced" here
means hours with canary checks between waves, not weeks.

**Timing constraint honored:** Dr. Alex's revision batch should wait until Wave 2 is
verified live. After that, the batch lands *into* the history system, which is the
whole point.

---

## What live verification changed about the requirements doc

The doc's core claims check out (the 4003 collision mechanism is exactly as described;
the six moves are gone; nothing recorded any of it). Four corrections and one
confirmation that matter for design:

1. **`evaluation_items` does not reference `pro_moves` at all.** It is keyed on
   `competency_id` and already carries `*_snapshot` columns (competency name,
   description, interview prompt), the house answer to "reference data changed under
   me." R4 scope is therefore the baselines tables, `weekly_scores`, and
   `weekly_assignments`, all of which have usable timestamps.
2. **Action 4026 is alive** ("I always allow RDAs to guide the flow of the day",
   competency 408). The deleted "4026-variant" was most likely an `ON CONFLICT DO
   UPDATE` overwrite casualty like 4003, not a deletion. Six confirmed-gone IDs
   (verified live by generate_series against 4001-4043): 4007, 4015, 4028, 4031,
   4040, 4041.
3. **Doctor framework is 53 live moves** (role_id 4). That settles the 44-vs-53
   document dispute.
4. **The deletions did not come through migrations.** All 589 migration files contain
   exactly two `DELETE FROM pro_moves` statements, neither touching the 40xx range.
   The six vanished out-of-band: dashboard SQL, the admin UI, or the clinical UI. This
   confirms R2's judgment that enforcement must live in the database, not the app.
5. **The destruction mechanism is FK `ON DELETE CASCADE`, not just missing guards.**
   `doctor_baseline_items`, `coach_baseline_items`, `pro_move_resources`,
   `organization_pro_move_overrides`, and `organization_pro_move_content_overrides`
   all cascade off a `pro_moves` delete; `weekly_scores.selected_action_id` and
   `weekly_assignments.action_id` go SET NULL. One deleted row silently destroys
   ratings and content across five tables. A `BEFORE DELETE` block on the parent
   neutralizes every cascade at once. Zero orphaned assessment rows reference the six
   IDs today (the cascades already did their work, or no items existed).

Also relevant: retirement has **never been used**. Zero rows have `retired_at` set;
six rows use `active = false`. The app filters on `active` everywhere and never reads
`retired_at` (write-only column). One surface (`ScoreHistoryV2`) intentionally queries
`active = false` for historical display, so retired moves already stay visible where
they should.

## Live write paths the design must not break

Found by full code survey (`src/` plus `supabase/functions/`):

| Path | What it does | Design response |
|---|---|---|
| [ProMoveList.tsx:344](../src/components/admin/ProMoveList.tsx) | Platform console hard delete. Already catches FK errors and tells the user "Please retire it instead." | Guard blocks; error crafted so the existing toast fires (see D1). Delete button removed in Wave 4. |
| [DoctorProMoveLibrary.tsx:253](../src/pages/clinical/DoctorProMoveLibrary.tsx) | **Deletes all child resources first**, then the parent move; catches `23503` on the parent. | Most dangerous path: content dies before the parent block can help. Capture triggers make it restorable; Wave 4 converts the flow to retire and drops the pre-delete. |
| [admin-users/index.ts:1419](../supabase/functions/admin-users/index.ts) | `delete_user` hard-deletes every pro move whose `retired_by` points at the deleted staff. The parallel `delete_organization` code at :1566 correctly does `.update({ retired_by: null })` instead. | **This is a bug** (would erase platform IP because someone once clicked "retire"). No-op today only because `retired_by` is never set. One-line fix in Wave 4. |
| [admin-users/index.ts:1621](../supabase/functions/admin-users/index.ts) | Org teardown deletes org-owned moves (`owner_org_id = org`). | Legitimate. Guard exempts rows with `owner_org_id IS NOT NULL`; they are still history-captured. |
| [generate-pro-move-weights](../supabase/functions/generate-pro-move-weights/index.ts) | AI job upserts `curriculum_priority*` columns onto pro_moves (fire-and-forget after every form save). | Would flood a naive trigger with junk versions. Trigger diffs **content columns only**; priority-score-only updates produce no version row. |
| `bulk_upsert_pro_moves` RPC | The only writing RPC (CSV import). Plain UPDATE/INSERT inside. | Triggers fire normally; captured for free. Same for future `ON CONFLICT DO UPDATE` seed migrations, which is exactly the 4003 corruption vector. |
| [LearningDrawer.tsx](../src/components/admin/LearningDrawer.tsx), [DoctorMaterialsDrawer.tsx](../src/components/clinical/DoctorMaterialsDrawer.tsx), [save-audio](../supabase/functions/save-audio/index.ts) | Resource editing does targeted single-row insert/update/delete per content block (video, script, link, audio, doctor_* sections). No wholesale delete-and-reinsert. | Resource deletes stay **allowed but captured** (op plus full old row). Blocking them would break routine editing. |

## Mechanism design

Follows two in-house precedents: `coach_baseline_audit` (SECURITY DEFINER trigger
feeding an append-only table, SELECT-only for users) and `admin_audit` (jsonb
old/new values shape).

**1. One history table, `framework_history`** (append-only):

- `id` bigint identity PK; `table_name` text; `record_pk` text; `action_id` bigint
  (denormalized so a move's resource history groups under it; **no FK**, history must
  outlive rows and hold retro entries for deleted IDs); `version_no` int, unique per
  `(table_name, record_pk)`.
- `op` text: `insert | update | delete | backfill | retro-seed`.
- `old_row` / `new_row` jsonb via `to_jsonb()` (future column adds captured
  automatically, no trigger edits needed); `changed_fields` text[].
- `changed_by` uuid (`auth.uid()` when present), `changed_via` text (`api` when a JWT
  claim exists, else `sql`), `change_reason` text from
  `current_setting('app.change_reason', true)`, defaulting to `unrecorded (UI edit)` /
  `unrecorded (SQL)` per R9. Migrations can (should) call
  `set_config('app.change_reason', 'batch: ...', true)` at the top; that line gives
  Lovable-applied migrations attribution for free.
- `changed_at` timestamptz. As-of resolution derives validity windows with `lead()`
  over `changed_at`; no `valid_to` column to maintain.

**2. One generic capture trigger function** (SECURITY DEFINER, `search_path` pinned,
matching house style), attached AFTER INSERT/UPDATE/DELETE on `pro_moves` and
`pro_move_resources`. On UPDATE it diffs **content columns only**:

- `pro_moves`: `action_statement, description, competency_id, role_id, active,
  retired_at, retired_by, steps, intervention_text, practice_types,
  conditionally_applicable, owner_org_id, source` plus the new R6 columns. Excluded:
  `curriculum_priority*`, `updated_at`, `updated_by`, and the vestigial `status`,
  `version`, `date_added`.
- `pro_move_resources`: everything except `updated_at`.
- No content diff, no version row. This silences the weights job.

**3. Delete guard**: BEFORE DELETE on `pro_moves`, raises when `owner_org_id IS NULL`
(platform rows only; org teardown untouched). See D1 for the error shape.

**4. R6 metadata columns on `pro_moves`** (nullable adds): `evidence_label` with CHECK
(`evidence-based | expert-consensus | practice-derived`), `source_citation`,
`license_note`, `authored_by` (free text; clinicians are not always staff rows). They
ride into every jsonb snapshot automatically, satisfying "travels with the version."
Names deliberately avoid the occupied junk columns (`version`, `status`, `date_added`,
untouched for now; cleanup candidates for the backlog).

**5. Releases**: `framework_releases` (`name` unique, `role_id`, `kind` = `live |
retro`, `notes`, `gap_note`, `created_by/at`) plus `framework_release_items`
(`release_id`, `history_id`, denormalized `table_name`/`record_pk`/`action_id`).
`create_framework_release(name, role_id, notes)` is one set-based insert grabbing the
latest history row for every member move and resource: cheap enough for every
milestone (acceptance criterion 5). `framework_release_diff(a, b)` classifies
added / retired / reworded / reclassified / content-changed from the member snapshots.
`framework_as_of(role_id, ts)` answers the June 12 question.

**6. Append-only enforcement, belt and braces**: explicit REVOKE of
INSERT/UPDATE/DELETE from `authenticated`/`anon` (and UPDATE/DELETE from
`service_role`) on the history and release tables, SELECT-only RLS policies for
authenticated, plus BEFORE UPDATE/DELETE raise-exception triggers so even dashboard
SQL cannot rewrite history without consciously dropping a trigger first. Inserts
happen only inside the SECURITY DEFINER functions. (Supabase default privileges
auto-grant broadly on new tables, so the REVOKEs are written explicitly.)

**7. Backfill (R8)**:

- `op = 'backfill'` v1 snapshot for every current `pro_moves` row (332) and
  `pro_move_resources` row (~316), all roles.
- `op = 'retro-seed'` rows for the doctor framework reconstructed from the three
  February files, dated 2026-02-05, including the 4003 collision encoded as it
  actually happened: v1 = "verbalize the exam note" under competency 401, v2 = the
  incipient-lesions overwrite (statement changed, competency stale). Both generations
  of 4003's `doctor_why` resource content exist in the seed files and are recorded.
- Releases cut: `doctor-2026.02-seed` (kind `retro`, members = seed wording of
  4001-4043 including the deleted IDs, plus seed resources; `gap_note` = "history
  gap: Feb-Jul 2026 edits unrecorded"), and a current `<role>-2026.07` release for
  each of the 8 roles.
- The five deleted moves live in history and the retro release only. Resurrecting
  them as retired rows is possible later if wanted (D2), and history makes it a
  one-statement restore.

## Waves

**Wave 1: Foundations.** One migration: history + release tables, R6 columns,
RLS/grants, append-only guards. Purely additive, nothing references it, app untouched.
Verify: schema present, `get_advisors` clean. (~1 hour, risk minimal)

**Wave 2: Capture live.** One migration: trigger function, capture triggers on both
tables, delete guard, current-state backfill (v1 rows). This is the risk wave. Verify
immediately with a canary: edit one move's description (expect version row), attempt a
platform-row DELETE (expect block with the compat error), revert the canary edit
(captured too, which is correct). Rollback if anything misbehaves: three `DROP
TRIGGER` one-liners, kept in the migration header comment. (~2 hours including
verification)

**Gate: Dr. Alex's batch goes only after Wave 2 verifies.** From then on every edit,
however it arrives (UI, SQL editor, Lovable migration, CSV import), is captured.

**Wave 3: History depth and releases.** Retro seed rows, release functions, cut the
retro release plus 8 current releases, then run the acceptance queries (June 12 as-of;
seed-vs-current diff showing the five deletions, rewording, and the 4003 story).
(~2-3 hours, low risk; the seed reconstruction is the fiddly part)

**Wave 4: Code and repo hygiene.** The `admin-users:1419` one-line fix (delete →
update-null, mirroring :1566) and redeploy; remove the delete button from
`ProMoveList` (retire already exists there); convert `DoctorProMoveLibrary` delete to
retire and drop its resource pre-delete; regenerate `types.ts`; commit idempotent SQL
mirrors of all waves to `supabase/migrations/` (safe under Lovable double-apply);
update `data-model.md` and `improvement-backlog.md`. Frontend part ships on the normal
Lovable Publish rhythm; until it does, the compat error keeps the old buttons coherent.
(~1-2 hours, low risk)

**Phase 2 (later, per R9/R7, not blocking):** reason prompt on the edit surfaces (tiny
RPC wrapper around `set_config` plus a dialog field), same capture triggers on the
three org-override tables, optional delete guard on `competencies`, and the
resources-RLS tightening decision (see "Also found").

## Risk register

| # | Risk | Likelihood | Impact | Mitigation / rollback |
|---|---|---|---|---|
| 1 | Capture trigger fault aborts all writes to `pro_moves`/`pro_move_resources` | Low | High | Function is ~60 lines of to_jsonb and inserts; canary immediately after apply; rollback is one `DROP TRIGGER` per table. Admin-only edit surfaces mean tiny exposure window. |
| 2 | Delete guard breaks a flow that legitimately deletes | Low | Med | Only platform rows block; org teardown exempt; both UI paths already show "retire instead" messaging on this error class; `delete_user` matches zero rows today and gets fixed in Wave 4. |
| 3 | Doctor-library flow destroys resources before the blocked parent delete | Med until Wave 4 | Med | Capture lands in the same wave as the guard, so pre-deleted content is restorable from history; Wave 4 removes the path. |
| 4 | Version noise from the AI weights job | High if naive | Low | Content-column diff filter; priority-only updates write nothing. |
| 5 | Lovable double-applies committed SQL | Med | Low | Idempotent SQL only (IF NOT EXISTS / CREATE OR REPLACE / ON CONFLICT DO NOTHING), the house standard. |
| 6 | Retro seed reconstruction error | Low | Low | Derived mechanically from three files; rows flagged `retro-seed`; corrections append new versions, never rewrite. |
| 7 | Missing grants/policies on new tables | Low | Low | Explicit GRANT/REVOKE in the migration; `get_advisors` check after each wave. |
| 8 | `admin-users` redeploy regression from the one-line fix | Low | Med | Deploy off-hours, smoke-test a read action; revert is redeploying the previous version. |

Performance is a non-risk: framework tables are hundreds of rows, edits are rare and
human-driven, and the trigger adds one insert per real edit.

## Decisions taken (flag if you disagree)

- **D1: Block deletes rather than silently convert to retirement.** Silent conversion
  hides mistakes, and the doctor-library path would still pre-destroy resources, so
  conversion buys little. The guard raises SQLSTATE `23503` with a message containing
  "violates foreign key constraint": a deliberate compatibility shim so both existing
  UI handlers show their current "retire it instead" toasts with zero frontend change
  on day one. Labeled in the migration; becomes moot after Wave 4.
- **D2: The six deleted moves are not resurrected as rows.** They exist in the retro
  release and history, which satisfies R8. Restoring any of them as a retired row
  later is one statement from its history snapshot.
- **D3: History and releases are readable by all authenticated users.** Same
  sensitivity class as `pro_moves` itself, which is read-open internally. Writes are
  trigger-only.
- **D4: Org-override capture is phase 2**, per R7's own "platform-item history is the
  priority."
- **D5: Apply path.** Waves applied to live via MCP migration (the established
  rhythm), idempotent SQL mirrors committed to the repo, `types.ts` regenerated after.
  DDL here is additive, so the "DDL must lag deploy" rule for drops is not in play.

## Acceptance criteria mapping

| Criterion | Satisfied by |
|---|---|
| Edits via SQL and UI both produce version records; old wording retrievable | Wave 2 (DB triggers fire for every write path; canary proves both) |
| `DELETE FROM pro_moves ...` fails or converts | Wave 2 guard (fails, with compat error; org-owned exempt) |
| "Doctor framework as of June 12, 2026" | Wave 3 `framework_as_of()`; resolves to seed wording vs current with the gap marker, the honest R8 granularity |
| "What changed between release A and B, and why" | Wave 3 `framework_release_diff()` plus per-version `change_reason` |
| Release creation cheap at every milestone | Wave 3 function, one set-based insert |

## Applied: results and deviations (2026-07-30)

All four waves executed same-day. Live migration names (repo mirrors in
`supabase/migrations/20260730132*`): `framework_versioning_wave1_foundations`,
`framework_versioning_wave2_capture_and_guard`,
`framework_versioning_wave2b_trigger_fn_grants`,
`framework_versioning_wave3_backfill_and_releases`.

**Canary results (Wave 2):** description edit on inactive move 41 produced
version 1 with `changed_fields = [description]` and the session change reason;
the exact revert produced version 2 restoring null. Two real
`curriculum_priority` updates produced zero version rows (noise filter works).
`DELETE FROM pro_moves WHERE action_id = 41` failed with the 23503 guard error.
A resource title edit and revert on an archived audio row produced versions 1
and 2 with exact old/new values.

**Acceptance results (Wave 3):**

- `framework_as_of(4, '2026-06-12')` returns 43 moves, all `gap-reconstructed`
  (honest R8 granularity). 4003 resolves to its version 2 seed wording
  (incipient lesions, stale competency 401) exactly as a June rater saw it; the
  later-deleted 4007 and 4041 correctly still appear.
- `framework_release_diff('doctor-2026.02-seed', 'doctor-2026.07')`: 16 added
  (the 189-205 in-app authoring range), 6 `gone-pre-versioning` (exactly the six
  vanished IDs), 23 reworded, 1 reclassified (4003, its stale competency later
  fixed), 17 description-changed, 35 content-changed. Seed 43 minus 6 deleted
  plus 16 added equals today's 53: the arithmetic closes.
- Releases cut: `doctor-2026.02-seed` (retro: 43 moves, 139 resources) plus live
  `2026.07` releases for all 8 roles with moves (doctor at exactly 53).

**Deviations from the plan, all small:**

1. Added BEFORE TRUNCATE guards on both tables (TRUNCATE bypasses row triggers).
2. Wave 2b added: revoked EXECUTE on the three trigger functions from
   public/anon/authenticated (Supabase lint; trigger firing does not need it).
3. Two extra seed files were involved beyond the three the requirements cited:
   `20260205204830` (early doctor_why/script/good rows for 4001-4003, with the
   pre-overwrite 4003 content) and `20260205214622` (a dedupe keeping one random
   uuid-ordered row per action/type). The retro state records the post-dedupe
   end-state; for the nine overlapping 4001-4003 rows the survivor generation
   was uuid-random, and the 20260205214509 generation is recorded because live
   rows match its shape. Content only actually differed for 4003's three rows.
4. Retro resource rows use synthetic `record_pk` values (`seed:<action>:<type>`)
   because the original uuids are unrecoverable. The release diff matches
   resources per action by content, so this does not affect diffs.
5. The eight live releases were cut via `create_framework_release()` calls, not
   in the migration file (re-running would collide on unique names).
6. `DoctorProMoveLibrary` retire sets `active`/`retired_at` but not `retired_by`
   (component has no staff id in scope); attribution is still captured in
   `framework_history.changed_by` by the trigger.

**Verification of Wave 4 code:** `tsc --noEmit` clean after the component edits
and the types regeneration. The clinical and platform surfaces are auth-gated,
so browser verification was not run; the behavior change is delete paths
removed/repointed, and the DB-side behavior they now rely on is canary-proven.

## Also found along the way (out of scope, tracked separately)

- Since the 2026-07-24 RLS lockdown, `pro_moves` writes require platform admin, but
  the clinical surfaces are gated on `isClinicalDirector || isSuperAdmin`. A pure
  clinical director's edits may now silently update zero rows. Needs verification.
- Write-gate asymmetry: `pro_move_resources` writes still allow any coach/admin, and
  `bulk_upsert_pro_moves` checks only `is_coach_or_admin`, both looser than the
  platform-admin lockdown on `pro_moves` itself. For licensed IP, these want the same
  gate.
- `organization_pro_moves` has no edit or delete UI path at all once created.
- `pro_moves.status` / `version` / `date_added` are vestigial import columns
  (inconsistent junk data); backlog cleanup candidates once versioning is live.
