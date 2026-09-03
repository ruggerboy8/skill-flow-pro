# PML-2: Tenant content unification (org pro moves become full peers)

**Status:** APPROVED (John, 2026-09-03; PML-1 shipped and published same day)
**Lane:** cross-cutting
**Ticket:** PML-2 on the MyProMoves Dev Board (tk_saef1g22FB4cTNE8k36TBf)
**Foundation:** docs/audits/tenant-model-audit-2026-09-03.md and John's four
decisions of 2026-09-03 (recorded there and on the ticket)
**Sequenced:** after PML-1 ships

## What and why

The tenant build left two competing storage designs for org-custom pro moves
(dead ownership columns on `pro_moves` vs the live `organization_pro_moves`
table), a rewording feature participants never see, three different content
eligibility rules, and two role-label mechanisms. John's decisions: org-custom
moves become full peers of platform moves (recommendable, materials-capable,
version-tracked); org rewording is participant-facing; org role labels show
everywhere normal users look; practice type is a hard boundary enforced by one
shared rule. This spec unifies the mechanisms accordingly, conservatively:
build alongside, migrate, never break live paths.

## Ticket breakdown (build order matters)

### PML-2a: Storage unification (org moves fold into pro_moves)

Move org-custom moves into `pro_moves` using the ownership columns that
already exist (`owner_org_id`, `source='org_custom'`,
`copied_from_action_id`). Live data is small (8 org moves, 1 historical
assignment referencing one), so the risk is code paths, not volume.

1. Migration (SQL editor, idempotent, starts with
   `set_config('app.change_reason', 'PML-2a: fold organization_pro_moves into pro_moves', true)`):
   - Insert each active and inactive `organization_pro_moves` row into
     `pro_moves` with `owner_org_id = org_id`, `source = 'org_custom'`,
     mapped `action_statement`, `description`, `role_id`, `competency_id`,
     `practice_types`, `active`. Record the mapping in a new nullable column
     `organization_pro_moves.migrated_action_id`.
   - Repoint `weekly_assignments`: where `org_move_id` is set, set
     `action_id` to the mapped move and null out `org_move_id`. Check the
     table's XOR-style constraints first and write the update to satisfy
     them. Sanity `DO $$` block verifies zero rows left with `org_move_id`
     set and zero assignments pointing at nothing.
   - RLS: add an org-admin carve-out to the platform-admin-only `pro_moves`
     write policy (`20260727163955`): org admins may insert/update/deactivate
     rows where `owner_org_id = their org`. Platform rows stay locked to
     platform admins. Delete stays blocked for platform rows via the existing
     trigger; org-owned rows are already exempt.
   - Grants per the local-Supabase gotcha do not apply (hosted), but keep the
     policy explicit.
2. Frontend: the org library tab and pickers write and read org-custom moves
   as `pro_moves` rows (`owner_org_id = org`). The PML-1 org-move code paths
   (SmartSlotPicker merge, wizard resolution, `fetchOrgProMoveMetaByIds`)
   simplify to plain `pro_moves` reads; remove the special-casing once the
   migration is verified live.
3. `organization_pro_moves` stays in place, read by nothing, for at least one
   release (conservative-migration rule and DB-DDL-must-lag-deploy). A later
   cleanup ticket drops it plus `weekly_assignments.org_move_id`.

What this buys for free: sequencer eligibility (the existing
`org_visible_pro_moves` RPC's org branch starts matching), framework_history
version capture, the delete guard, and learning materials
(`pro_move_resources` keys on `action_id`, so org moves can carry resources
with no schema change). Build note: org moves have null
`curriculum_priority*`; verify `sequencer-rank` tolerates null priorities and
ranks them sanely (likely last within their lens) rather than crashing.

#### PML-1 QA follow-ups folded into 2a (John, 2026-09-03)

- **Library filters apply to org moves too.** The library tab's role, domain,
  and visibility filters currently skip org-custom moves. After unification
  the library reads one table, so apply the filters to all rows uniformly.
- **No duplicate placement of an org move in one week.**
  `WeekBuilderPanel`'s `excludeActionIds` ignores org moves today. After 2a
  org moves have real `action_id`s so the existing exclusion covers them;
  verify with a test rather than assuming.
- **Dormant `ProMovePickerDialog` wiring.** `WeekBuilderPanel.tsx:1065`
  passes `handleSelectProMove` directly as `onSelect`, but the signatures
  disagree (an org-move id would land in the `weekStart` argument). The path
  is unreachable today. Either fix the signature or delete the dead branch;
  do not leave it as is.

**Deploy-order trap (critical for 2a):** today's pickers and libraries query
`pro_moves` with NO owner filter. If the fold migration runs before the
frontend filters by owner, every org sees every other org's custom moves.
So: frontend ships first with owner-aware reads (`owner_org_id IS NULL OR
owner_org_id = my org`) that behave identically while the ownership columns
are still empty; the migration applies only after that code is published.
Same discipline as db-ddl-must-lag-deploy, applied to data instead of DDL.

### PML-2b: Participant-facing rewording (content overrides applied for real)

One resolution rule: the statement (and description) a user inside an org
sees is `COALESCE(org content override, platform text)`.

1. Extend the COALESCE sweep pattern of `20260612170000` to apply
   `organization_pro_move_content_overrides` in the RPCs participants and
   coaches read (`get_staff_week_assignments`, `get_my_weekly_scores`,
   `get_staff_weekly_scores`, `view_weekly_scores_with_competency`, and the
   analytics functions that render statements).
2. Client paths that read `pro_moves.action_statement` directly (the wizards,
   `useWeeklyAssignments`, week views) go through one shared resolution
   helper so the org wording shows at check-in, check-out, and summaries.
3. Overrides apply to platform moves only (an org edits its own moves
   directly). Verify Avenue's existing override (pro_move 260) renders for
   an Avenue participant as the acceptance case.
4. Out of band, noted for the Ask corpus: the mirror renders platform text;
   per-org override rendering is a future Ask concern, not this ticket.

### PML-2c: One shared eligibility rule (practice type hard boundary)

Make `org_visible_pro_moves` (or a successor function) the single source of
"which moves may this org see for this role": active, practice type matches
the org OR owned by the org, minus the org's hidden list.

1. Planner picker (`ProMovePickerDialog`, `SmartSlotPicker`, `LibraryPanel`)
   and `pro-move-suggest` switch from their own ad-hoc queries to this rule
   (RPC call or an equivalent view), removing the orgId-skips-practice-type
   branch.
2. Sequencer already uses the RPC; confirm identical results across all three
   surfaces for the same org+role as a test.
3. Add a Vitest test for the eligibility helper and, per the audit's guard
   recommendation, an assertion-style test that picker and sequencer
   eligibility agree (decision on broader CI guards still open with John).

### PML-2d: Role labels everywhere + resolver consolidation

1. Sweep the remaining raw `roles.role_name` surfaces
   (`facilitatorData.ts`, `MyRoleLayout.tsx`, `FacilitatePage.tsx`, the org
   library and pickers if any remain after PML-1) onto
   `useRoleDisplayNames`. Rule: org label everywhere a normal user sees a
   role name; platform names only in cross-org super-admin tools.
2. Drop or adopt the dead `resolve_role_display_name` RPC (recommend: drop
   in a cleanup migration, the hook is the mechanism).
3. Consolidate the two org-id resolvers: make `current_user_org_id()` the
   one function (it prefers `staff.organization_id`, which the trigger keeps
   synced) and rewrite the handful of RLS policies using `get_user_org_id`
   to match, then drop `get_user_org_id`. Small, but it closes audit
   finding E.
4. Fix the org teardown line in `admin-users` to target the surviving
   storage (after PML-2a it becomes `pro_moves WHERE owner_org_id = org`,
   which finally does what it says).

## Acceptance script (John, as org admin plus a participant fixture)

1. After PML-2a: Arianna's org moves still show, edit, pick, and score
   exactly as in PML-1 (no regression), and now also appear in the
   recommender lenses for their role. Version history: edit one org move,
   confirm a framework_history row captured it.
2. Attach a resource to an org move (platform editor UX permitting) and see
   it on the move.
3. After PML-2b: as an Avenue participant, the June-reworded move shows
   Avenue's wording at check-in and in the week summary.
4. After PML-2c: the planner picker, AI-suggest, and recommender for a UK
   org contain zero US-pediatric moves and vice versa, with no manual
   hiding.
5. After PML-2d: role names read RDA/DFI/OM everywhere a normal Alcan user
   looks; super-admin platform screens still show platform names.

## Personas to test as

admin(desktop), participant, lead; adversarial QA per cross-cutting lane.

## Out of scope

- Redesigned authoring UI beyond what PML-1 built (a richer editor for
  materials/intervention text can be its own ticket once storage is unified).
- Offboarded-org content retention/export policy (open decision).
- Broad CI guard framework (open decision; PML-2c adds one targeted
  assertion).
- Dropping `organization_pro_moves` and `org_move_id` (follow-up cleanup
  ticket after a stable release).
- Ask corpus rendering of org overrides.

## DB impact

Yes, several migrations, applied in order and each lagging the frontend
deploy where required (db-ddl-must-lag-deploy): 2a fold + RLS carve-out,
2b RPC extensions, 2c eligibility function update, 2d resolver
consolidation + RPC drop. All idempotent, all setting `app.change_reason`.
Safe application per John's standing instruction: Claude applies verified,
reversible migrations directly; anything destructive (the eventual table
drop) waits for explicit approval in the cleanup ticket.

## Docs the builder must read

- CLAUDE.md: "Data model & terminology", "Framework content is versioned",
  "Applying migrations", design conventions.
- docs/enterprise-architecture.md; docs/audits/tenant-model-audit-2026-09-03.md.
- docs/pro-move-versioning-implementation-plan.md (capture behavior).
- docs/testing.md, docs/dev/lint-policy.md.
- supabase/migrations/20260313172307, 20260612143951, 20260612170000,
  20260727163955 (the four load-bearing prior migrations).
