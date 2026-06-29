
## Current state (verified just now)

- **Maria Castillo** — `id 2000d667…`, Alcan Pediatric Dental, location `f9d29710…`
- `role_id = 3` (Office Manager), `is_office_manager = true`, `is_participant = true`
- `participation_start_at = 2026-03-09`
- 1 coach scope: `location` → her own location
- 21 historical `weekly_scores` rows (OM history)
- No `user_capabilities` row, no `staff_quarter_focus`, no evaluations, no backlog

## Consequences considered

1. **Timing is clean.** Today is Monday 2026-06-29 — the new week just started.
   - Week of 6/22 (last week): she has OM assignments; her submissions there stay intact.
   - Week of 6/29 onward: org-scoped FD assignments (`role_id = 1`) are already **locked** for 6/29, 7/6, 7/13, 7/20, 7/27, 8/3, 8/10. She'll pick those up automatically once her `role_id` flips.
   - OM (`role_id = 3`) assignments are only locked through 6/22 — OM was already winding down at the org level, so we're not orphaning a future OM plan.

2. **Historical OM scores are preserved.** `weekly_scores` rows reference the assignment, not the staff role flag, so her 21 prior submissions remain attributable and visible in her history.

3. **Coach scope.** She has a location-scoped coach scope. DFI is an individual contributor role; per our prior call we'll drop it (cleaner). If she should still help coach peers, say the word and we'll keep it.

4. **OM flag.** Clear `is_office_manager = false` so OM-only surfaces (e.g. manager dashboards, reminder routing) stop treating her as the OM.

5. **Role display.** Avenue Dental uses the pediatric role aliases; role 1 will render as **"Front Desk / DFI"** via `organization_role_names` — no UI change needed.

6. **Capabilities.** No `user_capabilities` row exists, so nothing to migrate there.

7. **Audit trail.** Write a `staff_audit` entry documenting the change, actor, effective date, and reason ("Role correction — moving from OM to DFI, effective 2026-06-29").

## One open question

**`participation_start_at`** — currently `2026-03-09`. Two options:

- **A. Leave as 2026-03-09 (recommended).** Her DFI history page shows her full participation timeline; old OM scores still appear in her past weeks (they happened, after all). Cleaner for longitudinal reporting.
- **B. Reset to 2026-06-29.** Treats DFI as a fresh participation start; older OM weeks drop out of accountability calculations. Useful only if leadership wants a clean slate for her DFI metrics.

I'll go with **A** unless you say otherwise.

## The change (single migration / data update)

```sql
UPDATE staff
   SET role_id = 1,
       is_office_manager = false,
       updated_at = now()
 WHERE id = '2000d667-d0ea-4234-a771-cc1aa14e15cd';

DELETE FROM coach_scopes
 WHERE staff_id = '2000d667-d0ea-4234-a771-cc1aa14e15cd';

INSERT INTO staff_audit (staff_id, action, actor_id, details, created_at)
VALUES (
  '2000d667-d0ea-4234-a771-cc1aa14e15cd',
  'role_change',
  <your staff id>,
  jsonb_build_object(
    'from_role_id', 3,
    'to_role_id', 1,
    'cleared_is_office_manager', true,
    'dropped_coach_scope', 'location:f9d29710-36ec-4ab2-89c5-f8808e3f8862',
    'effective_date', '2026-06-29',
    'reason', 'Role correction — OM → DFI'
  ),
  now()
);
```

(Exact `staff_audit` column shape will be matched to the live schema before running.)

## What happens next, from Maria's perspective

- Logs in today → sees the **Front Desk / DFI** Pro Moves for the week of 6/29 (already locked at org level).
- Her past OM submissions remain on her history.
- OM-only surfaces no longer treat her as the OM for the location.

Confirm option A vs B on `participation_start_at` (or just 👍 to proceed with A) and I'll run it.
