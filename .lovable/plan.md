

# Add Clinical Director as a Formal Admin Role Preset

## Summary

Add "Clinical Director" as a selectable role in the Edit User drawer. A Clinical Director will behave like a Regional Manager (non-participant, coach powers, scoped to org/locations) but additionally gets `is_clinical_director = true`, granting access to the Clinical tab.

## Changes

### 1. Edge Function: `admin-users/index.ts`

Update the `clinical_director` preset (already exists at line 479) to mirror `regional_manager` behavior:

```typescript
clinical_director: {
  is_participant: false,
  is_lead: false,
  is_coach: true,           // was false — needs coach powers like regional
  is_org_admin: true,        // was false — needs admin powers like regional
  is_super_admin: false,
  is_clinical_director: true,
  is_doctor: false,
  coach_scope_type: null,
  coach_scope_id: null,
  home_route: '/clinical',
},
```

Also update the scope-sync block (~line 553) to include `clinical_director` alongside `regional_manager` so scopes get written to `coach_scopes` and synced to the staff table.

### 2. Frontend: `EditUserDrawer.tsx`

- Add `'clinical_director'` to the `selectedAction` type union (line 61)
- Add a radio option for "Clinical Director" between Regional Manager and Super Admin (around line 429)
- Include `clinical_director` in all scope-related conditionals (lines 120, 160, 255, 438) so it requires scope selection like regional_manager
- Update `getCurrentStatusBadge` to show a Clinical Director badge
- Update `getLiveSummary` with a clinical_director case
- Update the `useEffect` initialization to detect `is_clinical_director` and set `selectedAction('clinical_director')`

### 3. Frontend: `useUserRole.tsx`

Clinical directors with `is_coach` and `is_org_admin` will now naturally derive `isRegional`, `isCoach`, `showRegionalDashboard`, and `canAccessAdmin` from existing logic. The `canAccessClinical` check already works via `isClinicalDirector || is_super_admin`. No changes needed here.

### 4. Frontend: `Layout.tsx`

No changes needed. Navigation already shows the Clinical tab when `isClinicalDirector || isSuperAdmin`, and coach/admin tabs when `isCoach`/`canAccessAdmin`. The new flags on the clinical director preset will naturally surface these nav items.

## What This Achieves

- Admins can promote any user to "Clinical Director" from the Edit User drawer
- Clinical Directors get: coach dashboard, admin/builder access, command center, **and** the Clinical tab
- Scoped to specific orgs/locations like a regional manager
- No hardcoded user checks needed

