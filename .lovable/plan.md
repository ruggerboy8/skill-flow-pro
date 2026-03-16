

## Problem

The deadline-aware logic we just added to `RegionalDashboard` only fixed the **rate calculation**. The actual **status badges** and **signals** across the system still misrepresent state at various points during the week. Here's what happens now:

**Regional Command Center:**
- Cards show "Pending Conf" badges before the confidence deadline (good), but the label/semantics could be clearer — "Pending" implies something is wrong when really it's just "not due yet."
- After the confidence deadline passes but before performance opens, cards correctly show "Late Conf" for missing staff. But performance shows nothing — which is correct but there's no positive indicator either.
- The "Avg Completion" summary card shows 100% before any deadline, which is technically correct but could confuse someone who expects it to reflect actual submissions.

**Coach Dashboard (`CoachDashboardV2`):**
- **No deadline awareness at all.** On Monday morning, every staff member without submissions shows `StatusPill → "Missing"` for both Confidence and Performance — even though neither deadline has passed.
- The `missingConfCount` / `missingPerfCount` used for Reminder buttons count all non-submitted staff regardless of deadlines, inflating the numbers.
- The default sort puts "missing both" at top, which on Monday means everyone.

**Staff Detail (`StaffDetailV2`):**
- Same issue: `StatusPill` for the current week shows "Missing" for unsubmitted metrics regardless of whether the deadline has passed.

### Week timeline scenarios (default deadlines):

```text
Mon 00:01  ─ Confidence opens
Tue 14:00  ─ Confidence due (late threshold)
Thu 00:01  ─ Performance opens
Fri 17:00  ─ Performance due (late threshold)
Sun 23:59  ─ Week closes
```

| Time of week | Correct Conf status (not submitted) | Correct Perf status (not submitted) |
|---|---|---|
| Mon morning | **Pending** (window open, not due) | **—** (window not open) |
| Tue morning | **Pending** | **—** |
| Tue after 14:00 | **Missing** | **—** |
| Wed | **Missing** | **—** |
| Thu | **Missing** | **Pending** |
| Fri before 17:00 | **Missing** | **Pending** |
| Fri after 17:00 | **Missing** | **Missing** |

Currently the Coach Dashboard shows "Missing" for everything from Monday onward.

## Plan

### 1. Add a `not_open` status to StatusBadge

Add a new status value `not_open` that renders as a neutral dash or "—" (similar to `exempt`). This is for Performance before Thursday — the window isn't open, so no badge should alarm anyone.

**File:** `src/components/ui/StatusBadge.tsx`

### 2. Make Coach Dashboard deadline-aware

**File:** `src/pages/coach/CoachDashboardV2.tsx`

- Fetch per-location deadline configs (same pattern as RegionalDashboard).
- Compute per-location submission gates using `getLocationSubmissionGates()`.
- Update `StatusPill` logic per staff row:
  - **Confidence:** If `!isPastConfidenceDeadline` and not submitted → `pending`. If past deadline and not submitted → `missing`.
  - **Performance:** If `!isPerformanceOpen` → `not_open` (dash). If open but `!isPastPerformanceDeadline` and not submitted → `pending`. If past deadline → `missing`.
- Update `missingConfCount` / `missingPerfCount` for Reminder buttons to only count staff at locations past the relevant deadline.
- Update default sort to deprioritize "pending" rows (they're not actionable yet).

### 3. Make Staff Detail deadline-aware

**File:** `src/pages/coach/StaffDetailV2.tsx`

- For the **current week only**, apply the same deadline-aware StatusPill logic. Historical weeks remain as-is (their deadlines have long passed).
- Fetch the staff's location config and compute gates for the displayed week.

### 4. Refine Regional Dashboard card labels

**File:** `src/components/dashboard/LocationHealthCard.tsx`

- Rename "Pending Conf" badge to "Awaiting Conf" or keep "Pending" but add a subtle clock icon to distinguish from "Missing."
- When performance window hasn't opened yet, don't show any perf badge at all (current behavior is correct, just confirming).
- When **no deadlines have passed** for a location, show an "On Track" badge with context like "Conf due Tue 2pm" instead of a bare 100%.

### 5. Refine Regional Dashboard signals + summary

**File:** `src/pages/dashboard/RegionalDashboard.tsx`

- The "Submissions Status" summary card currently shows "All on track!" when no deadlines have passed. Add a contextual subtitle like "Next deadline: Conf due Tue 2pm" so the admin knows why it's calm.
- Signals are already gated behind `anyDeadlinePassed` (from the last fix) — no change needed there.

### Files Changed

1. `src/components/ui/StatusBadge.tsx` — add `not_open` status
2. `src/pages/coach/CoachDashboardV2.tsx` — fetch location configs, deadline-aware StatusPill + reminder counts
3. `src/pages/coach/StaffDetailV2.tsx` — deadline-aware StatusPill for current week
4. `src/components/dashboard/LocationHealthCard.tsx` — clearer badge labels, contextual info
5. `src/pages/dashboard/RegionalDashboard.tsx` — next-deadline context in summary card

