
# Office Manager Role: Full Integration Plan

## Overview

This plan expands on the foundational Office Manager role implementation to cover **all the role-specific touchpoints** throughout the application. Office Managers (`role_id=3`) are hybrid participants with their own curriculum who also have view-only access to their location's staff data.

---

## Areas Requiring Role Integration

### 1. Admin Builder - Planner Tabs

**Current State**: AdminBuilder has hardcoded tabs for DFI and RDA planners

**Location**: `src/pages/AdminBuilder.tsx:74-88`
```typescript
<TabsList className="grid w-full grid-cols-4">
  <TabsTrigger value="dfi-planner">DFI Planner</TabsTrigger>
  <TabsTrigger value="rda-planner">RDA Planner</TabsTrigger>
  <TabsTrigger value="onboarding">Onboarding</TabsTrigger>
  <TabsTrigger value="library">Pro-Move Library</TabsTrigger>
</TabsList>
```

**Change Required**:
- Add third tab: "OM Planner"
- Convert to 5-column grid
- Add TabsContent for Office Manager planner

```text
┌────────────┬────────────┬────────────┬────────────┬────────────┐
│ DFI Planner│ RDA Planner│ OM Planner │ Onboarding │  Library   │
└────────────┴────────────┴────────────┴────────────┴────────────┘
```

---

### 2. Admin Builder - Onboarding Section

**Current State**: Onboarding tab has DFI and RDA sections

**Location**: `src/pages/AdminBuilder.tsx:90-117`

**Change Required**:
- Add third Card for "Office Manager Onboarding Builder"
- Pass `roleFilter={3}` to SimpleFocusBuilder

```text
┌─────────────────────────────────────────┐
│ DFI Onboarding Builder                  │
│ SimpleFocusBuilder roleFilter={1}       │
├─────────────────────────────────────────┤
│ RDA Onboarding Builder                  │
│ SimpleFocusBuilder roleFilter={2}       │
├─────────────────────────────────────────┤
│ Office Manager Onboarding Builder  ← NEW│
│ SimpleFocusBuilder roleFilter={3}       │
└─────────────────────────────────────────┘
```

---

### 3. Planner Routes

**Current State**: Two hardcoded routes

**Location**: `src/App.tsx:134-135`
```typescript
<Route path="planner/dfi" element={<PlannerPage roleId={1} roleName="DFI" />} />
<Route path="planner/rda" element={<PlannerPage roleId={2} roleName="RDA" />} />
```

**Change Required**:
- Add third route: `/planner/om`

```typescript
<Route path="planner/om" element={<PlannerPage roleId={3} roleName="Office Manager" />} />
```

---

### 4. Weekly Pro Moves Panel - Role Selector

**Current State**: Hardcoded DFI/RDA dropdown with type `1 | 2`

**Location**: `src/components/admin/WeeklyProMovesPanel.tsx:23, 170`
```typescript
const [roleId, setRoleId] = useState<1 | 2>(2);
...
<SelectItem value="1">DFI</SelectItem>
<SelectItem value="2">RDA</SelectItem>
```

**Change Required**:
- Expand type to `1 | 2 | 3`
- Add third SelectItem for Office Manager

```typescript
const [roleId, setRoleId] = useState<1 | 2 | 3>(2);
...
<SelectItem value="3">Office Manager</SelectItem>
```

---

### 5. Location Skill Gaps - Role Tabs

**Current State**: Hardcoded DFI/RDA tabs

**Location**: `src/components/dashboard/LocationSkillGaps.tsx:60-61, 188-198`
```typescript
const dfiGaps = gaps.filter(g => g.role_name === 'DFI');
const rdaGaps = gaps.filter(g => g.role_name === 'RDA');
...
<TabsTrigger value="dfi">DFI</TabsTrigger>
<TabsTrigger value="rda">RDA</TabsTrigger>
```

**Change Required**:
- Add Office Manager filtering: `const omGaps = gaps.filter(g => g.role_name === 'Office Manager');`
- Add third tab trigger and content
- Conditionally show OM tab only if `omGaps.length > 0` (may not have OM at every location)

---

### 6. Coach Dashboard Role Filter

**Current State**: Dynamic multi-select from staff summaries (auto-includes any role present)

**Location**: `src/pages/coach/CoachDashboardV2.tsx:126-129`
```typescript
const roleOptions = useMemo(() => {
  const roles = Array.from(new Set(summaries.map(s => s.role_name))).sort();
  return roles.map(role => ({ value: role, label: role }));
}, [summaries]);
```

**Change Required**: 
- **None needed** - This already dynamically generates options from whatever roles exist in the data
- Once Office Managers are added with `role_id=3`, they will automatically appear in the filter

---

### 7. Eval Results Filter Bar

**Current State**: Dynamic role filter from database

**Location**: `src/components/admin/eval-results/FilterBar.tsx`

**Change Required**:
- **None needed** - Roles are loaded dynamically from the `roles` table
- Once `role_id=3` exists, it will appear automatically

---

### 8. Eval Results Location Cards

**Current State**: Counts DFI and RDA separately

**Location**: `src/components/admin/eval-results-v2/LocationCardGrid.tsx:138-139`
```typescript
if (row.role_id === 1) loc.dfiCount++;
else if (row.role_id === 2) loc.rdaCount++;
```

**Change Required**:
- Add `omCount` property to location aggregation
- Add display line: "X OM" alongside RDA/DFI counts

```typescript
if (row.role_id === 1) loc.dfiCount++;
else if (row.role_id === 2) loc.rdaCount++;
else if (row.role_id === 3) loc.omCount++;
```

Display: `"X RDA | Y DFI | Z OM"`

---

### 9. Role Definitions Content

**Current State**: Only DFI and RDA content defined

**Location**: `src/lib/content/roleDefinitions.ts`
```typescript
export type RoleType = 'DFI' | 'RDA';
export const ROLE_CONTENT: Record<RoleType, Record<string, DomainContent>> = { ... }
```

**Change Required**:
- Expand type: `'DFI' | 'RDA' | 'OM'`
- Add Office Manager domain content (Clinical, Clerical, Cultural, Case Acceptance descriptions specific to OM role)
- These descriptions power the "My Role" competency blueprint pages

---

### 10. My Role Pages - Role Type Detection

**Current State**: Binary role detection

**Location**: `src/components/my-role/RoleRadar.tsx:28`, `src/pages/my-role/DomainDetail.tsx:36`, `src/pages/my-role/MyRoleLayout.tsx:36-38`
```typescript
const roleType: RoleType = staffProfile?.role_id === 1 ? 'DFI' : 'RDA';
```

**Change Required**:
- Extend to ternary or switch:
```typescript
const roleType: RoleType = 
  staffProfile?.role_id === 1 ? 'DFI' : 
  staffProfile?.role_id === 2 ? 'RDA' : 'OM';
```

- Update subtitle in MyRoleLayout:
```typescript
const roleSubtitle = 
  staffProfile?.role_id === 1 ? 'DFI Competency Blueprint' :
  staffProfile?.role_id === 2 ? 'RDA Competency Blueprint' :
  'Office Manager Competency Blueprint';
```

---

### 11. Pro Move Library - Role Filter

**Current State**: Dynamic role loading from database

**Location**: `src/components/admin/ProMoveLibrary.tsx:60-67`
```typescript
const loadRoles = async () => {
  const { data } = await supabase
    .from('roles')
    .select('role_id, role_name')
    .order('role_name');
  if (data) setRoles(data);
};
```

**Change Required**:
- **None needed** - Roles are loaded dynamically
- Once `role_id=3` exists with Pro Moves, it will appear in the dropdown

---

### 12. CSV Export Filename

**Current State**: Binary role name in exports

**Location**: `src/components/admin/WeeklyProMovesPanel.tsx:82`
```typescript
link.download = `weekly-promoves-${roleId === 1 ? 'dfi' : 'rda'}-${...}.json`;
```

**Change Required**:
- Extend to handle third role:
```typescript
const roleName = roleId === 1 ? 'dfi' : roleId === 2 ? 'rda' : 'om';
link.download = `weekly-promoves-${roleName}-${...}.json`;
```

---

## Implementation Summary Table

| Component | Location | Change Type |
|-----------|----------|-------------|
| AdminBuilder tabs | `AdminBuilder.tsx` | Add OM Planner tab |
| AdminBuilder onboarding | `AdminBuilder.tsx` | Add OM Onboarding card |
| Planner routes | `App.tsx` | Add `/planner/om` route |
| WeeklyProMovesPanel | `WeeklyProMovesPanel.tsx` | Add OM to role dropdown |
| LocationSkillGaps | `LocationSkillGaps.tsx` | Add OM tab |
| CoachDashboardV2 | `CoachDashboardV2.tsx` | None (dynamic) |
| FilterBar | `FilterBar.tsx` | None (dynamic) |
| LocationCardGrid | `LocationCardGrid.tsx` | Add OM count |
| roleDefinitions | `roleDefinitions.ts` | Add OM content |
| RoleRadar | `RoleRadar.tsx` | Extend role detection |
| DomainDetail | `DomainDetail.tsx` | Extend role detection |
| MyRoleLayout | `MyRoleLayout.tsx` | Extend role detection |
| ProMoveLibrary | `ProMoveLibrary.tsx` | None (dynamic) |
| CSV exports | `WeeklyProMovesPanel.tsx` | Extend filename logic |

---

## Technical Flow Diagram

```text
                     ┌─────────────────────────────────────────────────────────┐
                     │                   DATABASE LAYER                        │
                     │  roles: INSERT (3, 'Office Manager')                    │
                     │  staff: is_office_manager column                        │
                     │  coach_scopes: location scope for OM                    │
                     └─────────────────────────────────────────────────────────┘
                                              │
              ┌───────────────────────────────┼───────────────────────────────┐
              ▼                               ▼                               ▼
     ┌─────────────────┐            ┌─────────────────┐            ┌─────────────────┐
     │  ADMIN BUILDER  │            │    MY ROLE      │            │  COACH VIEWS    │
     │                 │            │                 │            │                 │
     │ • OM Planner tab│            │ • roleType=OM   │            │ • OM in filters │
     │ • OM Onboarding │            │ • OM blueprint  │            │ • OM counts     │
     │ • /planner/om   │            │ • OM domains    │            │ • OM skill gaps │
     └─────────────────┘            └─────────────────┘            └─────────────────┘
```

---

## Office Manager Domain Content (Draft)

The Office Manager role will need domain-specific content for the "My Role" pages. Here's a suggested starting point:

| Domain | Description | Value Prop |
|--------|-------------|------------|
| **Clinical** | Understanding clinical workflows, supporting procedure scheduling, and ensuring patient care coordination across the practice. | Your oversight ensures clinical operations run smoothly and patients receive timely, coordinated care. |
| **Clerical** | Managing practice operations, overseeing scheduling efficiency, coordinating staff coverage, and maintaining accurate financial records. | Your organizational leadership keeps the practice running efficiently and profitably. |
| **Cultural** | Fostering a positive team environment, mentoring staff, and serving as the primary point of contact for patient escalations. | You set the tone for the practice culture and model professional excellence. |
| **Case Acceptance** | Supporting treatment presentation, understanding financial options, and coaching staff on effective patient communication. | Your guidance helps the team convert treatment plans into accepted care. |

*Note: These descriptions should be reviewed and customized based on actual Office Manager responsibilities in Alcan practices.*

---

## Implementation Phases (Updated)

### Phase 1: Database Foundation (from original plan)
- Add `role_id=3` to roles table
- Add `is_office_manager` column to staff
- Create RLS helper functions

### Phase 2: Admin/Invite Flow (from original plan)
- Update InviteUserDialog
- Add EditUserDrawer preset
- Update admin-users edge function

### Phase 3: Curriculum Infrastructure
- Add roleDefinitions.ts content for OM
- Update AdminBuilder with OM tabs
- Add /planner/om route
- Update WeeklyProMovesPanel role selector

### Phase 4: UI Role Detection
- Update RoleRadar, DomainDetail, MyRoleLayout role detection
- Update LocationSkillGaps with OM tab
- Update LocationCardGrid with OM counts
- Fix CSV export filenames

### Phase 5: Routing and Navigation (from original plan)
- Add isOfficeManager to useUserRole
- Create /my-location route
- Add navigation item for Office Managers

### Phase 6: Content Population
- Create Office Manager Pro Moves in library
- Set up onboarding assignments for role_id=3
- Populate competencies with OM-specific skills
