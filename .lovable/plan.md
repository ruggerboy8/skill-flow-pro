

## Fix: Count submitted-but-not-yet-due windows in completion rate

### Problem
`calculateSubmissionStats` in `src/lib/submissionRateCalc.ts` filters windows with `new Date(w.due_at) <= now` (line 39). This means on Monday morning, a staff member who has already submitted confidence scores for the current week shows 0% because the confidence deadline (Tuesday) hasn't passed yet. Only historical (past-due) windows are counted, and if those are all missing, the rate is 0%.

### Root cause
The filter assumes "only count windows whose deadline has passed." But a window where `status === 'submitted'` and `due_at > now` represents a valid early completion that should count positively.

### Solution
Change the filter in `calculateSubmissionStats` to include windows that are **either** past-due **or** already submitted. This is a one-line change:

```typescript
// Before:
const pastDueWindows = windows.filter(w => new Date(w.due_at) <= now);

// After:
const countableWindows = windows.filter(w => 
  new Date(w.due_at) <= now || w.status === 'submitted'
);
```

Then rename `pastDueWindows` → `countableWindows` in the loop below.

### Why this is correct
- **Submitted before deadline**: Already done — should count as completed (and on-time)
- **Pending (not yet due)**: Still excluded — no penalty for not-yet-due work
- **Missing (past due)**: Still included — correctly penalized

This matches the user's expectation: if you've done the work, it counts, regardless of whether the deadline has technically passed.

### Files changed
1. **`src/lib/submissionRateCalc.ts`** — Update the filter on line 39 and rename the variable for clarity

### No other changes needed
- `OnTimeRateWidget`, `useStaffSubmissionRates`, `LocationSubmissionWidget` all call `calculateSubmissionStats` — they'll automatically pick up the fix.
- The SQL view/RPC already returns current-week windows with `status = 'submitted'` and correct `on_time` values, so no DB changes needed.

