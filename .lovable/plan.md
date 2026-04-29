## Goal

Let clinical directors mark certain doctor Pro Moves as "Conditionally Applicable." When a doctor takes their baseline self-assessment, only those flagged Pro Moves will display an N/A option (so a doctor at a site where the Pro Move is irrelevant — e.g. St. David's documentation — can opt out without skewing scores).

This is a stopgap to avoid building site-based Pro Move targeting.

## Scope & isolation from existing N/A

This change touches **only the doctor self-assessment** (`DomainAssessmentStep.tsx`, used by `BaselineWizard.tsx`, writing to `doctor_baseline_items`).

The clinical director's own baseline assessment of a doctor (`CoachBaselineWizard.tsx`, writing to `coach_baseline_items`) is a separate component that already shows N/A on every Pro Move. **It is not modified** — directors keep full N/A access on every item, exactly as today.

Both flows continue to use score = 0 as the N/A convention, so downstream gap math, recommender filters, and results views are unchanged.

## Changes

### 1. Database (migration)

Add a new boolean column to `pro_moves`:

```sql
ALTER TABLE pro_moves
  ADD COLUMN conditionally_applicable boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN pro_moves.conditionally_applicable IS
  'When true, doctors may mark this Pro Move N/A (score = 0) during their self-assessment. Stopgap for items that do not apply at every site.';
```

No backfill — existing rows default to `false` (current behavior preserved).

### 2. Clinical Director Pro Move editor

File: `src/components/clinical/DoctorProMoveForm.tsx`

- Add a `Checkbox` labeled **"Conditionally applicable"** with helper text: *"Doctors can mark this Pro Move N/A during self-assessment (use for items that do not apply to every site, e.g. St. David's-specific documentation)."*
- Wire into `formData` and include `conditionally_applicable` in insert and update payloads (cast `as any` until Supabase types regenerate).

### 3. Doctor Pro Move library list

File: `src/pages/clinical/DoctorProMoveLibrary.tsx`

- Include `conditionally_applicable` in the `loadProMoves` select.
- Show a small "Conditional" badge on rows where the flag is true so directors can scan the library at a glance.

### 4. Doctor baseline self-assessment (the only place behavior changes)

File: `src/pages/doctor/BaselineWizard.tsx`

- Include `conditionally_applicable` in the `pro_moves` query.
- Pass the flag through into each `ProMoveItem` in the domain group.

File: `src/components/doctor/DomainAssessmentStep.tsx`

- Currently `showNaOption` is an unused prop applied uniformly. Replace with per-row logic:
  - The N/A column header renders if **any** Pro Move in the domain is conditional.
  - The per-row N/A button only renders when `pm.conditionally_applicable === true`. Non-conditional rows render an empty placeholder cell to keep column alignment.
- Drop the now-unused `showNaOption` prop.

### 5. Type regeneration note

`src/integrations/supabase/types.ts` is auto-managed. Until it regenerates, use the project's existing "defensive querying" cast pattern (`(supabase as any)` or `as any` on the payload) in `DoctorProMoveForm.tsx`.

## Out of scope

- Site-based Pro Move targeting (explicitly avoided).
- Coach/Clinical Director baseline assessment of doctors — unchanged.
- Other-staff Pro Move flows.
- Recommender and coaching gap logic — already treats score = 0 as N/A.

## Files touched

- new migration under `supabase/migrations/`
- `src/components/clinical/DoctorProMoveForm.tsx`
- `src/pages/clinical/DoctorProMoveLibrary.tsx`
- `src/pages/doctor/BaselineWizard.tsx`
- `src/components/doctor/DomainAssessmentStep.tsx`
