

# Remove Competency Code Field

## Changes

### 1. `src/components/platform/CompetencyFormDrawer.tsx`
- Remove `code` from `FormValues` interface and default values
- Remove the Code input field from the form
- Remove `code` from the submit payload (set to `null`)

### 2. `src/components/platform/CloneCompetenciesDialog.tsx`
- Stop rewriting code prefixes during clone — just pass through `code` as-is (or set to `null`)

### 3. `src/hooks/useDomainDetail.ts`
- Remove `code` from the competencies select query
- Remove `code` from `CompetencyDetail` interface
- Stop mapping `code` in the result builder

### 4. `src/hooks/useDoctorDomainDetail.ts`
- Same cleanup: remove `code` from select, interface, and mapping

### 5. `src/components/platform/PlatformRolesTab.tsx`
- Remove `code` from the competencies query select and `Competency` interface if not used in display

