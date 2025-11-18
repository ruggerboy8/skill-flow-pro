# Unified Assignment Status System

This document describes the consolidated architecture for weekly assignment status across all coach and staff surfaces.

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

## Migration Benefits

1. **Single Cutover Logic**: Cycle 3→4 transition handled in one place (RPC)
2. **Consistent Status Indicators**: All surfaces use same conf/perf completion booleans
3. **Exposed Data Source**: Each response includes `source: 'focus' | 'plan'` for QA verification
4. **Unified Focus IDs**: Consistent `focus_id` format (`uuid` for focus, `plan:<id>` for plan)

## Future Improvements

- Migrate `ThisWeekPanel` to use `useWeeklyAssignmentStatus` hook
- Add optimistic updates for score submissions
- Consider caching strategy across navigation between surfaces
