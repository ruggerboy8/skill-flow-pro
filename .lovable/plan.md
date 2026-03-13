
Goal: make org-admin Pro Move experiences strictly tenant-scoped now, and lay database/app foundations for org-private authoring later (gated/off for now).

What I found
- The Builder “Pro-Move Library” tab is using the global `ProMoveLibrary` component (`src/pages/AdminBuilder.tsx`), which is platform-focused and defaults to “All” practice types.
- Org Admin page (`/admin` → Pro Moves) uses `OrgProMoveLibraryTab`, but it has a risky fallback to `'pediatric_us'` if org practice type is missing.
- Current DB data confirms why this is visible: `pro_moves` currently contains only `pediatric_us` rows; your test org is `general_uk` (so correct behavior should be zero rows).
- `organization_pro_move_overrides` RLS is currently too broad (authenticated users can read all rows; org admins can write any org’s rows if they pass another `org_id`).
- Recommender path still depends on optional client-provided practice type; org-level visibility should be enforced server-side too.

Implementation plan

1) Immediate scoping fix (UI behavior)
- Update `AdminBuilder` library tab to be role-aware:
  - Super Admin: keep `ProMoveLibrary` (platform/global editor).
  - Org Admin: render `OrgProMoveLibraryTab` (org-scoped visibility view).
- Remove unsafe fallback defaults in org-scoped components:
  - In `OrgProMoveLibraryTab`, if org/practice type can’t be resolved, show empty state + error toast, not pediatric fallback.
- Ensure all org-admin library screens are org-scoped by default and cannot switch to “all practice types.”

2) Harden current org visibility model
- Tighten `organization_pro_move_overrides` RLS to org ownership:
  - SELECT only for same-org members (or super admin).
  - INSERT/UPDATE/DELETE only for same-org org-admin/super-admin.
- Keep override semantics unchanged for now (`is_hidden` only), but enforce tenant boundary correctly.

3) Make pro-move eligibility server-resolved (not client-trusted)
- Add/extend server resolver logic (RPC or edge helper) that returns “available pro moves for org + role”:
  - Platform moves matching org practice type
  - Minus org-hidden overrides
  - (future-ready) plus org-owned custom moves
- Update consumers (`ProMovePickerDialog`, `RecommenderPanel`/`sequencer-rank`) to use orgId-driven resolution.
- Pass `orgId` into recommender calls and derive practice type server-side from org, not optional UI state.

4) Future-proof DB architecture for org-private authoring (gated OFF)
- Extend `pro_moves` (recommended, to avoid FK churn across weekly assignments/evals):
  - `owner_org_id uuid null` (null = platform move, non-null = org-owned)
  - `source text` (`platform` | `org_custom`)
  - `copied_from_action_id bigint null` (optional lineage)
- Keep existing `action_id` FK compatibility intact everywhere.
- Authoring remains gated:
  - No org-admin create/edit UI yet.
  - No org-admin write policy for org-owned rows until feature flag is enabled.

5) Controlled rollout for later enablement
- Add feature flag (UI + server check), e.g. `orgLibraryAuthoringEnabled`.
- Prepare but hide:
  - “Add org move” / “Edit org move” actions for org admins.
  - Platform rows remain immutable to org admins; only org-owned rows editable.

Technical details (target model)
```text
Effective org library set =
  (platform pro_moves where practice_types overlaps org.practice_type)
  UNION
  (pro_moves where owner_org_id = org_id and source = 'org_custom')
  MINUS
  (platform rows hidden in organization_pro_move_overrides for org_id)

Write rules (future when enabled):
- Super admin: full platform + org oversight
- Org admin: create/update/delete only owner_org_id = own org
- Org admin: cannot modify platform rows
```

Acceptance checks
- As `general_uk` org admin, Builder library shows 0 rows (until custom org rows exist).
- As same user, no pediatric rows appear in picker/recommender/library.
- As platform admin, Platform Console still sees/edits global library.
- Cross-org override leakage blocked by RLS policy tests.

Notes
- This plan intentionally keeps authoring disabled while creating a safe path to enable org-private add/edit later.
- It also removes fallback behavior that can silently leak pediatric content into non-pediatric org experiences.
