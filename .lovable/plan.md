

# Fix: Coach Rating Column & Filters in DirectorPrepComposer

## Root Cause

There are **two** `coach_baseline_assessments` for this doctor (from two different coaches). The query uses `.maybeSingle()` which fails silently when multiple rows exist, returning `null`. This means:
1. `coachRatingMap` is always empty — no coach ratings display
2. All coach-related filters ("Low Coach", "Gap") filter everything out since every item has `null` coach score

## Changes

### `src/components/clinical/DirectorPrepComposer.tsx`

**Fix 1: Coach baseline query** — Change `.maybeSingle()` to filter by the current coach's `staff_id` (from `myStaff.id`), so we get the correct coach's assessment. If none exists for the current coach, fall back to the latest completed assessment.

```ts
// Current (broken):
.from('coach_baseline_assessments')
.select('id')
.eq('doctor_staff_id', doctorStaffId)
.maybeSingle();

// Fixed: filter by current coach first, fallback to latest completed
.from('coach_baseline_assessments')
.select('id')
.eq('doctor_staff_id', doctorStaffId)
.eq('coach_staff_id', myStaff.id)
.maybeSingle();
// If null, try latest completed:
.from('coach_baseline_assessments')
.select('id')
.eq('doctor_staff_id', doctorStaffId)
.eq('status', 'completed')
.order('completed_at', { ascending: false })
.limit(1)
.maybeSingle();
```

**Fix 2: Conditionally show coach column** — Only render the coach `ScoreCircle` when `session?.session_type === 'baseline_review'` (as requested by user). Apply this in both the picker list and the "Selected for Discussion" card.

**Fix 3: Conditionally show coach filters** — Hide the "Low Coach" and "Gap" filter badges when session type is not `baseline_review`, and reset those filter states if session type changes.

### Files to modify
- `src/components/clinical/DirectorPrepComposer.tsx` — all three fixes in one file

