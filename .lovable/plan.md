

## Phase 1: Canonical Submission Policy -- Consolidation

### Problem

Submission deadline logic is defined independently in 7+ places with conflicting values:

| Source | Conf Open | Conf Due | Perf Open | Perf Due |
|--------|-----------|----------|-----------|----------|
| `centralTime.ts` getAnchors | Mon 09:00 CT | Tue 14:00 CT | Thu 00:00 CT | (none) |
| `centralTime.ts` getWeekAnchors | Mon 00:00 local | Tue 14:00 local | Thu 00:01 local | Fri 17:00 local |
| `v2/time.ts` getWeekAnchors | Mon 00:00 local | Tue 14:00 local (comment says 12:00) | Thu 00:01 local | Fri 17:00 local |
| `coachDeadlines.ts` | (none) | Mon 23:59 local | (none) | Thu 23:59 local |
| `RemindersTab.tsx` inline | (none) | Tue 12:00 local | Thu 00:00 local | (none) |
| SQL view (due_at) | (none) | week_of + 1d 12h | (none) | week_of + 4d 17h |
| SQL (late flag calc) | (none) | week_of + 1d 15h | (none) | week_of + 4d 17h |

### Canonical Values (Phase 1 -- no behavior change)

These are the values the system will agree on. They match what `centralTime.ts getWeekAnchors` and `v2/time.ts` currently implement (the most recent and widely used):

| Threshold | Name | Value |
|-----------|------|-------|
| Confidence open | `checkin_open` | Mon 00:00 local |
| Confidence UI gate | `checkin_visible` | Mon 09:00 local |
| Confidence due / late threshold | `confidence_due` | Tue 14:00 local |
| Performance open | `checkout_open` | Thu 00:01 local |
| Performance due / late threshold | `performance_due` | Fri 17:00 local |
| Week end | `week_end` | Sun 23:59:59 local |

**Semantic clarification**: "due" and "late threshold" are the **same timestamp**. A submission is "late" if `submitted_at > due`. A submission is "missing" if `now > due AND submitted_at IS NULL`. There is no separate "grace period."

**Re: Mon 09:00 (checkin_visible)**: This is a real product gate -- `Confidence.tsx` and `ConfidenceWizard.tsx` both block access before Mon 09:00 with a toast. This is intentionally different from `checkin_open` (Mon 00:00, which is the week boundary). The policy module will expose both: `checkin_open` for week boundary calculations and `checkin_visible` for the UI gate. Current behavior is preserved.

---

### Migration Order (explicit sequencing per your feedback)

```text
Step 1: Create submissionPolicy.ts (no callers yet)
Step 2: Adapt wrappers (centralTime.ts, v2/time.ts) to delegate to policy
Step 3: Adapt all dependents (pages, hooks, status modules)
Step 4: Delete coachDeadlines.ts
Step 5: SQL migration to align view intervals
```

No step breaks callers because wrappers maintain their existing return shapes throughout.

---

### Step 1: Create `src/lib/submissionPolicy.ts`

New file. Single source of truth.

```typescript
// Canonical offset config (Phase 2: these become DB-driven per location)
export const DEFAULT_POLICY_OFFSETS = {
  checkin_open:     { dayOffset: 0, time: '00:00:00' },  // Mon 00:00
  checkin_visible:  { dayOffset: 0, time: '09:00:00' },  // Mon 09:00
  confidence_due:   { dayOffset: 1, time: '14:00:00' },  // Tue 14:00
  checkout_open:    { dayOffset: 3, time: '00:01:00' },  // Thu 00:01
  performance_due:  { dayOffset: 4, time: '17:00:00' },  // Fri 17:00
  week_end:         { dayOffset: 6, time: '23:59:59' },  // Sun 23:59
};

export interface SubmissionPolicy {
  // Resolved UTC timestamps
  checkin_open: Date;
  checkin_visible: Date;
  confidence_due: Date;
  checkout_open: Date;
  performance_due: Date;
  week_end: Date;
  mondayZ: Date;

  // Pure comparator helpers
  isConfidenceVisible(now: Date): boolean;
  isConfidenceOpen(now: Date): boolean;
  isConfidenceLate(now: Date): boolean;
  isPerformanceOpen(now: Date): boolean;
  isPerformanceLate(now: Date): boolean;
  isWeekClosed(now: Date): boolean;
}

export function getSubmissionPolicy(
  now: Date,
  tz: string,
  offsets?: typeof DEFAULT_POLICY_OFFSETS
): SubmissionPolicy { ... }
```

Also exports SQL-aligned interval constants for documentation:
```typescript
export const SQL_CONF_DUE_INTERVAL = '1 day 14 hours';
export const SQL_PERF_DUE_INTERVAL = '4 days 17 hours';
```

### Step 2: Adapt wrappers

**`src/lib/centralTime.ts`**
- `getWeekAnchors(now, tz)` delegates to `getSubmissionPolicy()` internally, maps output to existing return shape (including legacy aliases `tueDueZ`, `thuStartZ`, `monCheckInZ`, etc.)
- `getAnchors(now)` becomes `getWeekAnchors(now, CT_TZ)` with the same return shape
- `nowUtc()`, `nextMondayStr()`, `CT_TZ` unchanged
- Remove duplicate offset math (the `ctUtcFor` / `ctUtcForTz` helpers stay as timezone utilities but are no longer used for deadline definitions)

**`src/v2/time.ts`**
- `getWeekAnchors(now, tz)` delegates to `getSubmissionPolicy()`, maps to `V2Anchors` shape
- Fix comment drift: `checkin_due` comment says "Tue 12:00" but implementation is 14:00 -- comment will now be auto-correct since it delegates to policy
- `V2Anchors` interface kept for backward compat

### Step 3: Adapt dependents

**`src/lib/submissionStatus.ts`**
- Change `WeekAnchors` input type to accept `SubmissionPolicy` or a compatible shape (keep backward compat by accepting either)
- `getSubmissionGates` uses `policy.isConfidenceLate(now)` and `policy.isPerformanceOpen(now)`

**`src/lib/locationState.ts`**
- `getLocationWeekContext` already calls `v2/time.ts getWeekAnchors` -- no change needed (it gets policy via the wrapper)
- `computeWeekState` deadline comparisons (`checkin_due`, `checkout_open`, `checkout_due`) come from anchors which now delegate to policy -- no direct change needed

**`src/lib/siteState.ts`** -- same pattern, no direct changes needed since it consumes v2/time anchors

**`src/lib/backlog.ts`**
- `areSelectionsLocked()` currently uses `getAnchors().tueDueZ` -- replace with `getSubmissionPolicy(nowUtc(), CT_TZ).confidence_due`

**`src/pages/Confidence.tsx`**
- Replace `getAnchors(now)` with `getSubmissionPolicy(now, CT_TZ)`
- `beforeCheckIn` becomes `!policy.isConfidenceVisible(now)`
- `afterTueNoon` becomes `policy.isConfidenceLate(now)`
- Toast message: replace hardcoded "9:00 a.m. CT" with formatted `policy.checkin_visible`

**`src/pages/ConfidenceWizard.tsx`**
- Same pattern: replace `getAnchors(effectiveNow)` with `getSubmissionPolicy(effectiveNow, tz)`
- Uses location timezone when available (currently hardcoded to CT -- this is an improvement)

**`src/pages/Performance.tsx`**
- Replace `getAnchors(now).thuStartZ` with `policy.checkout_open`
- Preserve current behavior: Performance page currently does NOT hard-block access (shows message only). This will NOT change.

**`src/pages/PerformanceWizard.tsx`**
- Replace anchor references with policy
- Preserve existing "app_kv performance_time_gate_enabled" check behavior

**`src/pages/coach/RemindersTab.tsx`**
- Delete inline `deadlinesForWeek()` function
- Replace with `getSubmissionPolicy(mondayDate, tz)` import
- Aligns reminder filtering from Tue 12:00/Thu 00:00 to canonical Tue 14:00/Thu 00:01

**`src/pages/dashboard/LocationDetail.tsx`**
- Replace `getWeekAnchors(now)` from centralTime with `getSubmissionPolicy(now, CT_TZ)` or keep using the wrapper (no functional change since wrapper delegates)

**`src/pages/dashboard/RegionalDashboard.tsx`** -- same pattern

**`src/v2/weekCta.ts`**
- Currently reads `anchors.checkin_due` / `anchors.checkout_due` -- these come from `v2/time.ts` which will delegate to policy. No direct change needed.

**`src/lib/progressTracking.ts`** -- deprecated file, already delegates to centralTime. No change needed.

**`src/components/stats/ConsistencyPanel.tsx`** -- reads `confidence_late` / `performance_late` from DB scores, does not compute deadlines. No change needed.

**`src/pages/admin/SequencerTestConsole.tsx`** -- dynamic imports `v2/time.ts` for Monday calculation only. No deadline logic. No change needed.

### Step 4: Delete `src/utils/coachDeadlines.ts`

- Confirmed zero imports outside the file itself (search returned matches only in the file's own definition)
- Safe to delete

### Step 5: SQL migration

Recreate `view_staff_submission_windows` with aligned intervals:

**Current (wrong)**:
- Confidence due_at: `week_of + INTERVAL '1 day' + INTERVAL '12 hours'` (Tue 12:00 -- should be 14:00)
- Performance due_at: `week_of + INTERVAL '4 days' + INTERVAL '17 hours'` (Fri 17:00 -- correct)

**New**:
- Confidence due_at: `(week_of + INTERVAL '1 day 14 hours') AT TIME ZONE timezone` (Tue 14:00 local)
- Performance due_at: `(week_of + INTERVAL '4 days 17 hours') AT TIME ZONE timezone` (Fri 17:00 local -- unchanged)

Also verify: the `get_staff_all_weekly_scores` function computes `confidence_late` as `confidence_date > (week_start_date + INTERVAL '1 day 15 hours')` (Tue 15:00). This is wrong and will be aligned to `1 day 14 hours` (Tue 14:00).

The view does NOT have `SECURITY DEFINER` (confirmed -- it's a plain CREATE VIEW). The function `get_staff_submission_windows` does use `SECURITY DEFINER` which is standard for RPCs and will be kept.

---

### Files Summary

| Action | File | Notes |
|--------|------|-------|
| Create | `src/lib/submissionPolicy.ts` | Canonical policy, offsets, helpers |
| Edit | `src/lib/centralTime.ts` | Delegate to policy, keep return shapes |
| Edit | `src/v2/time.ts` | Delegate to policy, fix comment drift |
| Edit | `src/lib/submissionStatus.ts` | Accept policy type |
| Edit | `src/lib/backlog.ts` | Use policy for lock check |
| Edit | `src/pages/Confidence.tsx` | Use policy |
| Edit | `src/pages/ConfidenceWizard.tsx` | Use policy |
| Edit | `src/pages/Performance.tsx` | Use policy |
| Edit | `src/pages/PerformanceWizard.tsx` | Use policy |
| Edit | `src/pages/coach/RemindersTab.tsx` | Delete inline deadlines, use policy |
| Delete | `src/utils/coachDeadlines.ts` | Dead code, zero imports |
| Migration | SQL | Align view intervals to Tue 14:00 / Fri 17:00; align late flag calc to Tue 14:00 |

### What Does NOT Change

- No new admin UI or settings (Phase 2)
- No schema changes to `locations` table (Phase 2 adds custom offsets)
- Historical `confidence_late` / `performance_late` values already in `weekly_scores` are untouched
- Product behavior stays identical: Mon 09:00 visibility gate, Tue 14:00 confidence late, Thu 00:01 performance open, Fri 17:00 performance late
- `locationState.ts`, `siteState.ts`, `weekCta.ts` get policy values indirectly through updated wrappers -- no direct edits needed

### Acceptance Criteria

1. One canonical computation path exists (`submissionPolicy.ts`)
2. No page-level hardcoded day/time assumptions remain
3. SQL "late" flags in the view align with client-side late status (both use Tue 14:00 / Fri 17:00)
4. `coachDeadlines.ts` deleted, inline `deadlinesForWeek` removed
5. `getAnchors()` and both `getWeekAnchors()` delegate to the policy module
6. `checkin_visible` (Mon 09:00) is explicitly documented as a UI gate distinct from `checkin_open` (Mon 00:00 week boundary)

### Phase 2 Preview (not in scope)

- Add `conf_due_day_offset`, `conf_due_time`, `perf_due_day_offset`, `perf_due_time` columns to `locations` table
- `getSubmissionPolicy` reads from location record, falls back to `DEFAULT_POLICY_OFFSETS`
- Admin UI to configure per-location deadlines
- SQL view joins location config for per-location due_at computation

