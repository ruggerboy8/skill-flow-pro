# Tenant model audit: org content separation (2026-09-03)

Triggered by Arianna's org-library bug report (ticket PML-1). A reviewer-grade
code audit plus live-database verification of how the multi-tenant content
model actually behaves versus its intended design. Feeds ticket PML-2.

One-sentence summary: the tenant model works end to end in exactly one surface
(the planner picker), and every other surface honors a different subset of it;
there are two competing storage designs for org-custom moves, two competing
role-label mechanisms, and two competing org-id resolver functions.

## Intended design (as evidenced)

From `docs/enterprise-architecture.md` ("The Two-Layer Model") and the March
2026 migrations: a platform pro move library plus a per-org layer. Phase 1 gave
orgs visibility control (hide/show); language customization was a documented
future phase, shipped early in June. The March schema expressed org ownership
in-table on `pro_moves` (`owner_org_id`, `source`, `copied_from_action_id`)
with an `org_visible_pro_moves` RPC. Org role labels via
`organization_role_names` + `resolve_role_display_name`. Practice-type scoping
(`organizations.practice_type` vs `pro_moves.practice_types[]`) is a content
isolation boundary. Authoring: platform admins own the platform library; org
admins own their org's visibility, overrides, custom moves, labels.

## Findings

**A. Two competing designs for org-custom moves; the March one is dead.**
`pro_moves.owner_org_id` / `source='org_custom'` / `copied_from_action_id`
have zero writers. Real write path is the separate `organization_pro_moves`
table (migration `20260612143951`). The `org_visible_pro_moves` RPC
(`20260313172307`) only looks at the dead columns, and the sequencer
(`sequencer-rank/index.ts:130`) is its only consumer, so the recommender can
never recommend org-custom moves. Dead schema: the three columns, the source
check constraint, `idx_pro_moves_owner_org_id`.

**B. Check-in/check-out wizards render org-custom moves blank. LIVE BUG.**
`ConfidenceWizard.tsx` and `PerformanceWizard.tsx` join `weekly_assignments`
only to `pro_moves` and read `pro_moves?.action_statement || ''`; neither
references `org_move_id`. The DB-side RPC sweep (`20260612170000`) COALESCEd
org moves everywhere else, but the wizards were missed. Verified in prod: one
org-move assignment exists (Avenue Dental, week 2026-06-15), so this already
bit real participants once. Fix rides in PML-1 (mandatory before org moves
become pickable for Alcan).

**C. Org wording overrides never reach participants. LIVE DRIFT.**
`organization_pro_move_content_overrides` is read only by the admin tab and
the planner picker. No participant-facing or scoring path applies it.
Verified in prod: Avenue Dental has one override (pro_move 260, June 2026);
participants have been rated on the original wording since.

**D. Planner picker and AI-suggest bypass practice-type scoping. LATENT.**
`ProMovePickerDialog.tsx:68-71` filters `practice_types` only when no orgId is
passed, and every real caller passes one; `pro-move-suggest` never filters it.
The sequencer RPC does enforce it. Verified in prod: currently no role has
active moves from two practice types, so role separation masks the leak. Same
class as the ASK-5 UK-content leak.

**E. Two org-id resolvers with different semantics, mixed in RLS.**
`get_user_org_id(uid)` (location-chain only, `20260312224749`) vs
`current_user_org_id()` (prefers `staff.organization_id`, `20260720161022`).
Both are used in RLS on org tables; they agree only while the backfill trigger
keeps `staff.organization_id` in sync with the location chain. Should be one
function.

**F. `resolve_role_display_name` RPC is dead; app uses `useRoleDisplayNames`
directly.** Labels work but through a second hand-rolled path, applied
unevenly (~15 surfaces use the hook; `facilitatorData.ts`, `MyRoleLayout.tsx`,
parts of `FacilitatePage.tsx` show raw platform names).

**G. Org teardown deletes from the dead table.** `admin-users/index.ts:~1800`
deletes `pro_moves WHERE owner_org_id = org` (matches nothing). Real cleanup
of `organization_pro_moves` + content overrides happens silently via
`ON DELETE CASCADE` when the organizations row is deleted.

**Checked and fine:** visibility overrides (`is_hidden`) are consistent across
sequencer, picker, AI-suggest, admin tab; the June DB-side RPC sweep is
thorough; `planner-upsert` and the summary hooks handle `org_move_id`
correctly; RLS write gates on the three org tables are correctly org-admin
scoped.

## Decisions (John, 2026-09-03)

1. **Org-custom moves are full peers of platform moves**: recommendable,
   able to carry materials, version-tracked. PML-2 folds them into
   `pro_moves` with `owner_org_id` (where sequencer, framework_history, and
   the delete guard already work), migrating the `organization_pro_moves`
   rows conservatively.
2. **Org rewording of platform moves is participant-facing**: the org's
   custom statement is what staff see at check-in/check-out and everywhere
   inside that org.
3. **Org role labels everywhere a normal user sees a role name**; platform
   names only in cross-org super-admin tools. One shared helper.
4. **Practice type is a hard content boundary enforced in one shared
   eligibility rule** used by picker, AI-suggest, and sequencer alike.

Open (flagged, not yet decided): offboarded-org content retention/export
policy (currently silent cascade delete); whether to add CI assertions that
keep eligibility/resolution rules from re-splitting in future AI-assisted
builds.

## Follow-through

- PML-1 (in flight): the five UI fixes incl. wizard org-move resolution.
- PML-2 (spec next): unification per decisions above; absorbs findings A, C,
  D, F, G. Finding E can ride along or go as its own tiny migration ticket.
- Full per-table RLS org-boundary sweep across all ~40 org-scoped tables was
  out of scope here; SEC-9b on the board is the right home for it.
