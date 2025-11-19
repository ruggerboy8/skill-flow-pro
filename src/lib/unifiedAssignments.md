# Unified Assignment Status System

This document describes the consolidated architecture for weekly assignment status across all coach and staff surfaces.

## Week Calculation Formula

**CRITICAL**: Both `get_staff_statuses` and `get_staff_week_assignments` MUST use identical week calculation logic:

```
week_index = weeks_elapsed_since_program_start (0-based)
cycle_number = CASE WHEN week_index = 0 THEN 1 ELSE (week_index / cycle_length)::int + 1 END
week_in_cycle = CASE WHEN week_index = 0 THEN 1 ELSE (week_index % cycle_length)::int + 1 END
```

### Week Calculation Examples (6-week cycle)

| week_index | cycle_number | week_in_cycle | Notes |
|------------|--------------|---------------|-------|
| 0          | 1            | 1             | First week (special case) |
| 1          | 1            | 2             | 1 / 6 = 0 → cycle 1; 1 % 6 = 1 → week 2 |
| 5          | 1            | 6             | 5 / 6 = 0 → cycle 1; 5 % 6 = 5 → week 6 |
| 6          | 2            | 1             | 6 / 6 = 1 → cycle 2; 6 % 6 = 0 → week 1 |
| 11         | 2            | 6             | 11 / 6 = 1 → cycle 2; 11 % 6 = 5 → week 6 |
| 12         | 3            | 1             | 12 / 6 = 2 → cycle 3; 12 % 6 = 0 → week 1 |

**Note**: When `week_index % cycle_length = 0`, it indicates the **last** week of the previous cycle, not the first week of the next cycle.

### Regression Testing

A SQL unit test runs on every migration to verify both RPCs return identical (cycle, week_in_cycle) values for the current week. This prevents formula drift.

## Architecture Overview

All surfaces now use compatible logic that automatically switches between `weekly_focus` (cycles 1-3) and `weekly_plan` (cycles 4+).

### Core Components

1. **Server-Side RPC**: `get_staff_week_assignments(p_staff_id, p_role_id, p_week_start)`
   - Returns: `{ assignments: [...], status: {...}, week_context: {...} }`
   - Handles both `weekly_focus` and `weekly_plan` sources
   - Computes submission status (conf/perf counts, completion flags)
   - Single source of truth for assignment data

2. **Client Hook**: `useWeeklyAssignmentStatus({ staffId, roleId, weekStart })`
   - React Query wrapper with caching
   - Normalizes date formats
   - Provides loading/error states
   - 2-minute stale time, 10-minute cache

### Surface Implementations

#### Staff-Facing (ThisWeekPanel)
- Uses: `assembleCurrentWeek()` → `locationAssembleWeek()` 
- Status: ✅ Handles weekly_plan switch correctly
- Note: Includes rollover logic and simulation overrides
- Can migrate to `useWeeklyAssignmentStatus` hook in future refactor

#### Coach Dashboard (CoachDashboard)  
- Uses: `get_staff_statuses` RPC (batch operation)
- Status: ✅ Handles weekly_plan switch correctly
- Returns status for all staff at once (optimized for dashboard view)
- Uses same cycle/week calculation logic as unified RPC

#### Coach Detail (CoachDetail)
- Uses: `useWeeklyAssignmentStatus` hook → `get_staff_week_assignments` RPC
- Status: ✅ Now handles weekly_plan switch correctly (FIXED)
- Shows individual week details with full assignment list
- Removed hardcoded `weekly_focus` queries

## Participation Start and Onboarding Logic

Staff become eligible for required submissions based on their hire date and onboarding period:

1. **Participation Start**: The Monday following their hire date
   - Formula: `date_trunc('week', hire_date + 1 day) + 7 days`
   - Example: Hired on Wednesday → submissions start the following Monday

2. **Eligibility Window**: Participation start + onboarding buffer
   - Formula: `participation_start_monday + (onboarding_weeks * 7 days)`
   - Example: 2-week onboarding → required submissions start 2 weeks after participation start

3. **Required Submissions Begin**: The later of:
   - `eligible_monday` (hire date + 1 week + onboarding buffer)
   - `location_program_start_monday` (location's program start date)

4. **NULL Handling**:
   - Missing `hire_date` defaults to `created_at::date`
   - Missing `onboarding_weeks` defaults to `0` (no buffer)
   - This ensures all staff have valid participation windows

### Database Fields

- `staff.hire_date`: NOT NULL, defaults to CURRENT_DATE
- `staff.onboarding_weeks`: Nullable integer (0 if NULL)
- `staff.created_at`: Fallback for legacy records

## Last Activity Selection Logic

When determining a staff member's most recent activity, the system:

1. **Filters** to only rows with at least one score (confidence or performance)
2. **Prioritizes** performance submissions over confidence submissions
3. **Orders** by timestamp (most recent first)
4. **Handles** same-timestamp submissions by preferring performance

This ensures that if a staff member submits both confidence and performance at the same time, their "last activity" is always shown as "performance".

## Migration Benefits

1. **Single Cutover Logic**: Cycle 3→4 transition handled in one place (RPC)
2. **Consistent Status Indicators**: All surfaces use same conf/perf completion booleans
3. **Exposed Data Source**: Each response includes `source: 'focus' | 'plan'` for QA verification
4. **Unified Focus IDs**: Consistent `focus_id` format (`uuid` for focus, `plan:<id>` for plan)
5. **Formula Consistency**: Regression tests prevent week calculation drift between RPCs

## Future Improvements

- Migrate `ThisWeekPanel` to use `useWeeklyAssignmentStatus` hook
- Add optimistic updates for score submissions
- Consider caching strategy across navigation between surfaces
