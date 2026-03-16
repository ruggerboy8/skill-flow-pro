

## Assessment

Our recent deadline-aware changes added deadline gates to both the **reminder recipient counts** and the **reminder button filter logic** in `CoachDashboardV2.tsx`. Specifically, lines 380-398 (counts) and lines 401-443 (button handlers) now skip staff whose location hasn't passed the relevant deadline yet.

You want reminders to remain simple: aggregate **everyone who hasn't submitted**, regardless of deadline state. Managers decide when to send.

## Plan

### Single file change: `src/pages/coach/CoachDashboardV2.tsx`

**Remove deadline gates from reminder counts and recipient filters only** (keep deadline-aware logic for StatusPill display and sort — that stays):

1. **`missingConfCount`** (lines ~380-388): Remove the `if (isCurrentWeek) { gates... }` block. Count = all non-excused staff with `conf_count < assignment_count`.

2. **`missingPerfCount`** (lines ~390-398): Same — remove the deadline gate. Count = all non-excused staff with `perf_count < assignment_count`.

3. **`openConfidenceReminder`** (lines ~401-421): Remove the `if (isCurrentWeek) { gates... }` block so the recipient list includes all non-submitted, non-excused staff.

4. **`openPerformanceReminder`** (lines ~423-443): Same removal.

No other files are affected. The StatusPill display, sort order, and regional dashboard signals all remain deadline-aware as designed.

