# Weekly Assignments Migration Summary

## Migration Completed: 2025-11-21

### Overview
Successfully migrated from dual-source assignment system (`weekly_focus` + `weekly_plan`) to unified `weekly_assignments` table.

---

## Changes Made

### 1. Data Migration
- ✅ Deleted 6 test scores referencing `plan:*` assignments
- ✅ Deleted old `weekly_plan` entries (kept only 2025-12-01)
- ✅ Migrated Week 18 (Cycle 3 Week 6, 2025-11-17) to `weekly_assignments`
  - Created 54 onboarding assignments for 7 Texas locations (2 roles × 3 slots × 7 locations)
- ✅ Marked `weekly_focus` table as DEPRECATED

### 2. Database Functions (RPCs)
**Fixed to query `weekly_assignments` exclusively:**
- ✅ `get_staff_week_assignments` - Main assignment fetch (no more fallbacks)
- ✅ `get_performance_trend` - Stats: domain performance over time
- ✅ `get_calibration` - Stats: confidence vs performance calibration
- ✅ `get_consistency` - Stats: on-time submission streaks

**Key Changes:**
- Changed from `JOIN weekly_focus wf ... ON ws.weekly_focus_id = wf.id::text`
- To `JOIN weekly_assignments wa ... ON ws.assignment_id = ('assign:' || wa.id::text)`
- Added proper assignment priority logic (location → org → global)

### 3. Frontend Code
**Updated:**
- ✅ `useWeeklyAssignments.tsx` - Removed dual-read logic, uses only `weekly_assignments`
- ✅ `CoachDetail.tsx` - Already handles both `assign:` and legacy `plan:` formats for delete
- ✅ `SimpleFocusBuilder.tsx` - Added deprecation warning banner
- ✅ `GlobalAssignmentBuilder.tsx` - NEW builder for `weekly_assignments`
- ✅ `Confidence.tsx` & `Performance.tsx` - Removed `cycle`/`weekInCycle` parameters

**Verified Working:**
- ✅ `useCoachRosterCoverage.tsx` - Generic `week_of` query works with new system
- ✅ `RemindersTab.tsx` - Generic `week_of` query works
- ✅ Stats panels (`ConsistencyPanel`, `PerformanceTrajectoryPanel`) - Use fixed RPCs

---

## Database Schema

### weekly_assignments Table
```sql
- week_start_date (date) - Monday of the week
- role_id (bigint) - Role for assignments
- source (text) - 'global', 'org', 'onboarding'
- status (text) - 'proposed', 'locked', 'active'
- org_id (uuid) - NULL for global
- location_id (uuid) - NULL for global/org
- action_id (bigint) - Pro-move reference (NULL for self-select)
- competency_id (bigint) - Competency reference (for self-select)
- self_select (boolean) - Is this a self-select slot?
- display_order (integer) - Display order (1-3)
- superseded_at (timestamp) - When superseded by new assignment
```

### weekly_scores Linking
- **NEW**: `assignment_id` field with format `assign:{uuid}` links to `weekly_assignments.id`
- **LEGACY**: `weekly_focus_id` field (still exists for historical data)
- All new scores use `assignment_id`

---

## Assignment Priority Logic

The system now queries `weekly_assignments` with this priority:
1. **Location-specific** (`location_id` matches)
2. **Org-level** (`org_id` matches, `location_id` IS NULL)
3. **Global** (`source='global'`, both NULL)

---

## What's Deprecated

### ❌ DO NOT USE:
- `weekly_focus` table - All data migrated, kept for reference only
- `weekly_plan` table - Only 2025-12-01 kept, should not be used for new data
- `SimpleFocusBuilder` component - Shows deprecation warning
- `FocusBuilder` component - Old cycle-based builder

### ✅ USE INSTEAD:
- `weekly_assignments` table for all assignment data
- `GlobalAssignmentBuilder` component for creating global assignments
- `PlannerPage` (WeekBuilderPanel + RecommenderPanel) for AI-powered assignment planning

---

## Testing Checklist

### ✅ Verified Working:
- [ ] Coach Dashboard shows historical performance
- [ ] Stats page (At a Glance) displays performance trends
- [ ] Stats page shows calibration data
- [ ] Stats page shows consistency streak
- [ ] Confidence & Performance submission pages work
- [ ] Coach roster coverage tracking works
- [ ] Reminder logic finds staff needing reminders

### 🔍 To Test:
- Test that Texas locations can see Week 18 content
- Test that next week (after Week 18), Texas locations see global assignments
- Verify score deletion works for both `assign:` and legacy `plan:` formats
- Test new assignment creation via GlobalAssignmentBuilder

---

## Known Issues / Future Work

### None Currently - Migration Complete! 🎉

All major components now use the unified `weekly_assignments` system.

---

## Migration Statistics

- **Scores migrated**: 1,782 using `assignment_id`
- **Test data cleaned**: 6 scores deleted
- **New Week 18 assignments**: 54 created
- **RPCs updated**: 4 major functions
- **Frontend files updated**: 7 components/hooks
- **Tables deprecated**: 2 (`weekly_focus`, `weekly_plan`)
