# Phase 3-5 Implementation Plan
## Detailed Roadmap for Completing weekly_assignments Migration

---

## Phase 3: Frontend Migration
**Goal**: Update all frontend code to use `weekly_assignments` exclusively for onboarding staff

### 3.1: Update Score Loading (Read Operations)

#### 3.1.1: Update `get_my_weekly_scores` RPC
**File**: Database migration (new RPC version)

**Current Issue**: Returns both `assignment_id` and `weekly_focus_id`, but frontend may prioritize wrong one

**Changes Needed**:
```sql
CREATE OR REPLACE FUNCTION get_my_weekly_scores(p_week_of text DEFAULT NULL)
RETURNS TABLE(...) -- same signature
AS $$
DECLARE
  v_staff_record RECORD;
  v_target_monday date;
BEGIN
  -- Get staff record (same as before)
  -- ...existing code...
  
  RETURN QUERY
  WITH 
  -- PRIMARY: Get scores from weekly_assignments
  assignment_scores AS (
    SELECT
      wa.id::text AS assignment_id,
      wa.week_start_date,
      wa.action_id,
      wa.competency_id,
      wa.self_select,
      wa.display_order,
      wa.legacy_focus_id,
      -- ... rest of columns
    FROM weekly_assignments wa
    LEFT JOIN weekly_scores ws
      ON ws.staff_id = v_staff_id
      AND ws.assignment_id = ('assign:' || wa.id)
    WHERE wa.role_id = v_staff_record.role_id
      AND wa.status = 'locked'
      AND (p_week_of IS NULL OR wa.week_start_date = v_target_monday)
      AND (
        -- Priority: Location-specific first
        wa.location_id = v_staff_record.location_id
        OR (wa.location_id IS NULL AND wa.org_id = v_staff_record.organization_id)
        OR (wa.org_id IS NULL AND wa.location_id IS NULL)
      )
  ),
  -- FALLBACK: Legacy weekly_focus for historical data
  focus_scores AS (
    SELECT
      wf.id::text AS assignment_id,
      wf.week_start_date,
      wf.action_id,
      pm.competency_id,
      wf.self_select,
      wf.display_order,
      wf.id AS legacy_focus_id,
      -- ... rest
    FROM weekly_focus wf
    LEFT JOIN weekly_scores ws
      ON ws.staff_id = v_staff_id
      AND ws.weekly_focus_id = wf.id::text
    WHERE wf.role_id = v_staff_record.role_id
      AND (p_week_of IS NULL OR wf.week_start_date = v_target_monday)
      -- CRITICAL: Only include if NOT covered by weekly_assignments
      AND NOT EXISTS (
        SELECT 1 FROM weekly_assignments wa2
        WHERE wa2.week_start_date = wf.week_start_date
          AND wa2.role_id = wf.role_id
          AND wa2.location_id = v_staff_record.location_id
      )
  )
  SELECT * FROM assignment_scores
  UNION ALL
  SELECT * FROM focus_scores
  ORDER BY week_start_date DESC, display_order;
END;
$$;
```

**Validation**:
- Test with Alyssa: Should see C1-C2 scores from `weekly_assignments`
- Test with graduated staff: Should still see historical scores from `weekly_focus`
- Test with staff who switched locations mid-program

---

#### 3.1.2: Update `get_staff_weekly_scores` RPC (Coach Dashboard)
**File**: Database migration

**Changes**: Same pattern as above, but for coach viewing all staff scores

**Key Difference**: Must join to staff's location to determine which `weekly_assignments` apply

**Validation**:
- Coach views onboarding staff → sees their scores
- Coach views graduated staff → sees all historical scores
- No duplicate scores shown
- Performance check: query time < 500ms with 50 staff

---

### 3.2: Update Score Submission (Write Operations)

#### 3.2.1: Update `useReliableSubmission` Hook
**File**: `src/hooks/useReliableSubmission.tsx`

**Current Issue**: Likely hardcodes `weekly_focus_id` when saving scores

**Changes**:
```typescript
// In submission logic
const assignmentRef = assignment.id.startsWith('assign:') 
  ? assignment.id  // Already correct format
  : `assign:${assignment.id}`; // Legacy format, convert

const { error } = await supabase
  .from('weekly_scores')
  .upsert({
    staff_id: staffId,
    week_of: weekStart,
    assignment_id: assignmentRef,  // NEW: Always use assignment_id
    weekly_focus_id: assignment.legacy_focus_id || assignment.id, // Keep for backward compat
    confidence_score: scores.confidence,
    performance_score: scores.performance,
    // ... rest
  });
```

**Risk Mitigation**:
- Keep `weekly_focus_id` populated during transition (Phase 4 will remove)
- Add logging to track which ID format is being used
- Test with onboarding staff immediately after deploy

**Validation Steps**:
1. Onboarding staff submits confidence → verify `assignment_id` is `assign:<uuid>`
2. Onboarding staff submits performance → verify same
3. Check `weekly_scores` table: both `assignment_id` and `weekly_focus_id` populated
4. Graduated staff submits score → still works (uses global assignments)

---

#### 3.2.2: Update `assembleWeek` Function
**File**: `src/lib/locationState.ts`

**Current Logic**: Queries `weekly_focus` for onboarding cycles

**New Logic**:
```typescript
export async function assembleWeek(params: {
  userId: string;
  roleId: number;
  locationId: string;
  cycleNumber: number;
  weekInCycle: number;
}): Promise<Assignment[]> {
  const { userId, roleId, locationId, cycleNumber, weekInCycle } = params;

  // Calculate week_start_date for this location's cycle/week
  const { data: location } = await supabase
    .from('locations')
    .select('program_start_date, cycle_length_weeks')
    .eq('id', locationId)
    .single();

  const weekStartDate = calculateWeekStartDate(
    location.program_start_date,
    location.cycle_length_weeks,
    cycleNumber,
    weekInCycle
  );

  // NEW: Query weekly_assignments first
  const { data: assignments, error } = await supabase
    .from('weekly_assignments')
    .select(`
      id,
      week_start_date,
      action_id,
      competency_id,
      self_select,
      display_order,
      legacy_focus_id,
      pro_moves:action_id (
        action_statement,
        competency:competency_id (
          domain:domain_id (
            domain_name
          )
        )
      )
    `)
    .eq('role_id', roleId)
    .eq('week_start_date', weekStartDate)
    .eq('status', 'locked')
    .or(`location_id.eq.${locationId},and(location_id.is.null,org_id.eq.${orgId}),and(org_id.is.null,location_id.is.null)`)
    .order('display_order');

  if (error) throw error;

  // Transform to Assignment[] format expected by frontend
  return assignments.map(a => ({
    id: `assign:${a.id}`,
    week_of: a.week_start_date,
    action_id: a.action_id,
    action_statement: a.pro_moves?.action_statement || 'Self-Select',
    domain_name: a.pro_moves?.competency?.domain?.domain_name || 'General',
    self_select: a.self_select,
    display_order: a.display_order,
    legacy_focus_id: a.legacy_focus_id,
  }));
}
```

**Fallback Logic** (if no assignments found):
```typescript
// FALLBACK: Query weekly_focus for legacy data
if (assignments.length === 0) {
  const { data: focusRows } = await supabase
    .from('weekly_focus')
    .select('...')
    .eq('cycle', cycleNumber)
    .eq('week_in_cycle', weekInCycle)
    .eq('role_id', roleId);
  
  return transformFocusToAssignments(focusRows);
}
```

**Validation**:
- Onboarding staff loads week → sees `weekly_assignments`
- Graduated staff loads week → sees global assignments
- Staff switches locations → sees correct location assignments
- Performance check: < 200ms load time

---

#### 3.2.3: Update Score Display Logic
**File**: `src/components/coach/StaffDetailV2.tsx` (and similar)

**Change**: Ensure UI correctly displays assignment source

**Add Debug Info** (temporary):
```typescript
{__DEV__ && (
  <div className="text-xs text-muted">
    Source: {assignment.id.startsWith('assign:') ? 'weekly_assignments' : 'weekly_focus'}
    {assignment.legacy_focus_id && ' (with legacy link)'}
  </div>
)}
```

---

### 3.3: Testing Checklist for Phase 3

**Automated Tests** (if test suite exists):
- [ ] Unit test: `assembleWeek()` returns correct assignments
- [ ] Unit test: `useReliableSubmission` saves with `assignment_id`
- [ ] Integration test: Submit confidence → verify DB record
- [ ] Integration test: Submit performance → verify DB record

**Manual Tests**:
- [ ] Onboarding staff (Alyssa): Load week, see 3 assignments
- [ ] Onboarding staff: Submit confidence, verify saves
- [ ] Onboarding staff: Submit performance, verify saves
- [ ] Coach: View onboarding staff detail, see scores
- [ ] Graduated staff: Load week, see global assignments
- [ ] Graduated staff: Submit scores, verify saves

**SQL Validation Queries**:
```sql
-- Check all new scores use assignment_id
SELECT 
  COUNT(*) as total_new_scores,
  COUNT(assignment_id) as with_assignment_id,
  COUNT(weekly_focus_id) as with_focus_id
FROM weekly_scores
WHERE created_at >= NOW() - INTERVAL '1 day';
-- Expected: total_new_scores = with_assignment_id

-- Check no orphaned scores
SELECT COUNT(*) 
FROM weekly_scores ws
WHERE ws.assignment_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM weekly_assignments wa
    WHERE ('assign:' || wa.id) = ws.assignment_id
  );
-- Expected: 0
```

---

## Phase 4: Type & Schema Hygiene
**Goal**: Clean up database schema and enforce new patterns

### 4.1: Regenerate Supabase Types
**File**: `src/integrations/supabase/types.ts` (auto-generated)

**Command**: 
```bash
# After all Phase 3 changes deployed
npx supabase gen types typescript --project-id yeypngaufuualdfzcjpk > src/integrations/supabase/types.ts
```

**Validation**: TypeScript compilation succeeds with no errors

---

### 4.2: Add NOT NULL Constraint on `assignment_id`
**File**: Database migration

**CRITICAL**: Only run after 100% of writes use `assignment_id`

**Pre-check Query**:
```sql
-- Verify NO scores in last 30 days are missing assignment_id
SELECT COUNT(*)
FROM weekly_scores
WHERE created_at >= NOW() - INTERVAL '30 days'
  AND assignment_id IS NULL;
-- Expected: 0 (or only very old historical data)
```

**Migration**:
```sql
-- Step 1: Backfill any remaining NULL assignment_ids for historical data
UPDATE weekly_scores ws
SET assignment_id = COALESCE(
  -- Try to find matching assignment
  (SELECT ('assign:' || wa.id)
   FROM weekly_assignments wa
   WHERE wa.week_start_date = ws.week_of
     AND wa.legacy_focus_id::text = ws.weekly_focus_id
   LIMIT 1),
  -- Fallback: keep focus_id format for truly legacy data
  ws.weekly_focus_id
)
WHERE assignment_id IS NULL
  AND week_of IS NOT NULL;

-- Step 2: Add NOT NULL constraint
ALTER TABLE weekly_scores
ALTER COLUMN assignment_id SET NOT NULL;

-- Step 3: Add index for performance
CREATE INDEX IF NOT EXISTS idx_weekly_scores_assignment_id 
ON weekly_scores(assignment_id);
```

**Rollback Plan**:
```sql
ALTER TABLE weekly_scores
ALTER COLUMN assignment_id DROP NOT NULL;
```

---

### 4.3: Add Health Monitoring Queries
**File**: New admin page or cron job

**Create Monitoring RPC**:
```sql
CREATE OR REPLACE FUNCTION get_assignment_health()
RETURNS TABLE(
  metric text,
  value bigint,
  status text
) AS $$
BEGIN
  RETURN QUERY
  -- Check 1: All active locations have onboarding assignments
  SELECT 
    'locations_missing_assignments'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) = 0 THEN 'healthy' ELSE 'error' END
  FROM locations l
  WHERE l.active = true 
    AND l.onboarding_active = true
    AND NOT EXISTS (
      SELECT 1 FROM weekly_assignments wa
      WHERE wa.location_id = l.id
        AND wa.source = 'onboarding'
    )
  
  UNION ALL
  
  -- Check 2: Recent scores have assignment_id
  SELECT 
    'recent_scores_without_assignment'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) = 0 THEN 'healthy' ELSE 'error' END
  FROM weekly_scores
  WHERE created_at >= NOW() - INTERVAL '7 days'
    AND assignment_id IS NULL
  
  UNION ALL
  
  -- Check 3: No orphaned assignment_ids
  SELECT 
    'orphaned_assignment_ids'::text,
    COUNT(*)::bigint,
    CASE WHEN COUNT(*) = 0 THEN 'healthy' ELSE 'warning' END
  FROM weekly_scores ws
  WHERE ws.assignment_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM weekly_assignments wa
      WHERE ('assign:' || wa.id) = ws.assignment_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM weekly_focus wf
      WHERE wf.id::text = ws.assignment_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Schedule Weekly Health Check**:
```sql
-- Run every Monday at 6 AM
SELECT cron.schedule(
  'weekly-assignment-health-check',
  '0 6 * * 1',
  $$
  SELECT net.http_post(
    url:='https://yeypngaufuualdfzcjpk.supabase.co/functions/v1/assignment-health-alert',
    headers:='{"Authorization": "Bearer [ANON_KEY]"}'::jsonb
  );
  $$
);
```

---

## Phase 5: Cutover & Deprecation
**Goal**: Fully sunset `weekly_focus` for onboarding use cases

### 5.1: Remove `weekly_focus` Query Branches
**File**: All RPCs and frontend code

**Changes**:
```sql
-- Example: get_my_weekly_scores
-- REMOVE the focus_scores CTE entirely
-- REMOVE the UNION ALL branch
-- Keep ONLY assignment_scores CTE
```

**Frontend**:
```typescript
// Remove fallback logic in assembleWeek()
// Remove legacy focus_id handling
// Simplify to single code path
```

**Validation**:
- All tests still pass
- No 404 or missing assignment errors
- Performance improves (fewer queries)

---

### 5.2: Add Triggers to Reject New `weekly_focus` Writes
**File**: Database migration

**Purpose**: Prevent accidental use of deprecated table

**Migration**:
```sql
-- Create trigger to block INSERT on weekly_focus
CREATE OR REPLACE FUNCTION prevent_weekly_focus_writes()
RETURNS TRIGGER AS $$
BEGIN
  -- Allow writes for cycles 1-3 ONLY (onboarding templates)
  IF NEW.cycle <= 3 THEN
    RETURN NEW;
  ELSE
    RAISE EXCEPTION 'weekly_focus is deprecated for cycle 4+. Use weekly_assignments instead.';
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER block_new_weekly_focus_writes
BEFORE INSERT OR UPDATE ON weekly_focus
FOR EACH ROW
EXECUTE FUNCTION prevent_weekly_focus_writes();
```

**Validation**:
```sql
-- Test: Try to insert C4 row (should fail)
INSERT INTO weekly_focus (cycle, week_in_cycle, role_id, action_id, self_select)
VALUES (4, 1, 2, 1, false);
-- Expected: ERROR: weekly_focus is deprecated for cycle 4+

-- Test: Try to insert C1 row (should succeed - templates still needed)
INSERT INTO weekly_focus (cycle, week_in_cycle, role_id, action_id, self_select)
VALUES (1, 1, 2, 1, false);
-- Expected: Success
```

---

### 5.3: Mark `weekly_focus` as Deprecated in Code
**File**: Multiple locations

**Changes**:

1. **Add deprecation comment to types**:
```typescript
// src/types/assignments.ts
/**
 * @deprecated Legacy table - use weekly_assignments instead
 * Only retained for C1-C3 templates. Do NOT use for new features.
 */
export interface WeeklyFocus {
  id: string;
  cycle: number;
  week_in_cycle: number;
  // ...
}
```

2. **Add ESLint rule** (if using custom rules):
```javascript
// .eslintrc.js
rules: {
  'no-restricted-imports': ['error', {
    patterns: [{
      group: ['**/weekly_focus*'],
      message: 'weekly_focus is deprecated. Use weekly_assignments instead.'
    }]
  }]
}
```

3. **Update documentation**:
```markdown
# docs/database-schema.md

## Deprecated Tables

### `weekly_focus`
**Status**: Deprecated as of 2025-12-01  
**Replacement**: `weekly_assignments`  
**Current Use**: C1-C3 templates only  
**Migration Path**: See docs/weekly-assignments-migration-summary.md
```

---

### 5.4: Update `sync-onboarding-assignments` Edge Function
**File**: `supabase/functions/sync-onboarding-assignments/index.ts`

**Enhancement**: Add cleanup of stale assignments

```typescript
// After generating assignments, check for stale ones
const { data: staleAssignments } = await supabase
  .from('weekly_assignments')
  .select('id, week_start_date, location_id')
  .eq('source', 'onboarding')
  .lt('week_start_date', new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)) // 1 year old
  .not('id', 'in', recentlyUsedIds);

if (staleAssignments && staleAssignments.length > 0) {
  console.log(`🧹 Found ${staleAssignments.length} stale assignments to archive`);
  // Don't delete - just mark for review
}
```

---

## Rollback Plans

### If Phase 3 Breaks Production:
1. Revert RPCs to previous versions (keep both read paths)
2. Update frontend to use `weekly_focus_id` for writes
3. No data loss - both IDs are populated

### If Phase 4 Constraint Fails:
1. Drop NOT NULL constraint immediately
2. Investigate which writes are missing `assignment_id`
3. Re-run Phase 3 fixes

### If Phase 5 Breaks Historical Data Access:
1. Re-add `weekly_focus` read branches to RPCs
2. Remove trigger temporarily
3. Investigate which legacy data is still being accessed

---

## Timeline Estimate

- **Phase 3**: 2-3 days
  - Day 1: RPC updates + testing
  - Day 2: Frontend updates + testing
  - Day 3: Deploy + monitor + fix issues
  
- **Phase 4**: 1 day
  - Morning: Type regeneration + testing
  - Afternoon: Constraint addition + monitoring setup

- **Phase 5**: 1 day
  - Morning: Remove fallback logic + testing
  - Afternoon: Add triggers + documentation

**Total**: 4-5 days end-to-end

---

## Success Metrics

### Phase 3:
- ✅ 100% of new scores use `assignment_id`
- ✅ Zero 404 or missing assignment errors
- ✅ Coach dashboard loads in < 500ms
- ✅ Onboarding staff can submit scores successfully

### Phase 4:
- ✅ TypeScript compiles with no errors
- ✅ NOT NULL constraint added successfully
- ✅ Health monitoring shows all green

### Phase 5:
- ✅ All tests pass without `weekly_focus` reads
- ✅ Trigger blocks accidental writes
- ✅ Documentation updated
- ✅ Code review confirms no `weekly_focus` imports

---

## Risk Assessment

**High Risk**:
- Phase 3.2: Score submission changes (core user flow)
- Phase 4.2: Adding NOT NULL constraint (irreversible without rollback)

**Medium Risk**:
- Phase 3.1: RPC changes (affects all users, but read-only)
- Phase 5.2: Trigger addition (blocks writes, but only to deprecated table)

**Low Risk**:
- Phase 4.1: Type regeneration (compile-time only)
- Phase 5.3: Documentation updates (no code changes)

**Mitigation**:
- Deploy during low-traffic hours
- Enable verbose logging temporarily
- Keep rollback scripts ready
- Monitor error rates closely for 24 hours post-deploy
