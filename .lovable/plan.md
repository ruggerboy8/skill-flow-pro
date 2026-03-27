

# Fix Lead RDA Dual-Panel and My Role Views

## Problem Summary

Two bugs affecting Lead Dental Assistants:

1. **Home screen (ThisWeekPanel)**: The dual-panel logic checks the staff's `role_id` (2 = regular DA, archetype `dental_assistant`), which has `dualPanel: false`. It never discovers the lead-specific assignments because Lead DAs are identified by `is_lead: true` on the staff table, not by having `role_id: 11`. The system needs to detect `is_lead` and resolve the lead role (role_id 11) to show the lead-specific pro move.

2. **My Role tab**: `useDomainDetail` and `RoleRadar` only query competencies for the staff's `role_id` (2). Lead DAs also need to see competencies and pro moves from their lead role (role_id 11), since that's where lead-specific content lives.

## Root Cause

The dual-panel detection path is:
```text
staff.role_id (2) → roles.archetype_code ("dental_assistant") → dualPanel = false → NO parent lookup
```

But it should be:
```text
staff.is_lead = true → find lead role for this practice_type → show lead assignments
```

## Plan

### 1. Fix ThisWeekPanel dual-panel detection (~lines 105-136)

**Current**: Looks up archetype of staff's role_id, checks `dualPanel`.
**New**: When `staff.is_lead === true`, find the `lead_dental_assistant` role for the same practice type, then:
- The **parent panel** ("Team Pro Move") shows the regular DA assignments (role_id 2) — this already works since `assembleCurrentWeek` uses `staff.role_id`.
- The **lead panel** ("Lead Pro Move") shows assignments for the resolved lead role_id (11).

This is actually the **inverse** of the current label logic. Currently the code labels parent as "Team" and own as "Lead" — but since the staff's `role_id` is the DA role, the own assignments ARE the team assignments. The lead-specific ones need to be fetched separately.

**Implementation**:
- Replace the archetype-based detection with an `is_lead` check on the staff profile
- Query `roles` for `archetype_code = 'lead_dental_assistant'` matching the org's `practice_type`
- Fetch lead role assignments via `assembleCurrentWeek` with the lead role_id
- Store those as the "lead" panel assignments
- Swap the label logic: the main assignments (role_id 2) are "Team Pro Moves", the lead ones are "Lead Pro Move"

### 2. Fix My Role Overview (RoleRadar) to include lead competencies

**File**: `src/components/my-role/RoleRadar.tsx`

When `staffProfile.is_lead === true`, resolve the lead role_id (same practice_type lookup), then on the domain detail pages, fetch competencies from BOTH role_id 2 AND role_id 11.

### 3. Fix Domain Detail to include lead pro moves

**File**: `src/hooks/useDomainDetail.ts`

When the staff member `is_lead`, query competencies for both the staff's role_id AND the lead role_id. This surfaces lead-specific competencies and their pro moves within the existing domain cards.

### 4. Fix MyRoleLayout subtitle

**File**: `src/pages/my-role/MyRoleLayout.tsx`

Add a "Lead RDA" subtitle option when `is_lead` is true.

### Technical Details

**Lead role resolution helper** (new utility, ~10 lines):
```typescript
async function resolveLeadRoleId(practiceType: string): Promise<number | null> {
  const { data } = await supabase
    .from('roles')
    .select('role_id')
    .eq('archetype_code', 'lead_dental_assistant')
    .eq('practice_type', practiceType)
    .eq('active', true)
    .maybeSingle();
  return data?.role_id ?? null;
}
```

This will be used in ThisWeekPanel, RoleRadar, and useDomainDetail.

**Files to modify**:
- `src/components/home/ThisWeekPanel.tsx` — fix dual-panel detection
- `src/components/my-role/RoleRadar.tsx` — no changes needed (domains are the same for DA and Lead DA)
- `src/hooks/useDomainDetail.ts` — fetch competencies from both roles when `is_lead`
- `src/pages/my-role/MyRoleLayout.tsx` — update subtitle for lead

