# Phase 2 QA: Dual-Read Feature Flag Validation

## Implementation Summary
Phase 2 introduces feature-flagged dual-read functionality for `weekly_assignments` while maintaining legacy behavior as default.

### Changes Made
1. **Feature Flag**: Added `VITE_USE_WEEKLY_ASSIGNMENTS` (default: `false`)
   - Location: `src/lib/featureFlags.ts`
   - Export: `useWeeklyAssignmentsV2Enabled`

2. **Hook Updates**: `src/hooks/useWeeklyAssignments.tsx`
   - When flag ON: Queries `weekly_assignments` table
   - When flag OFF: Uses legacy `weekly_plan` → `weekly_focus` fallback
   - IDs prefixed: `assign:<uuid>` when V2 enabled

3. **Page Updates**: `src/pages/Week.tsx`
   - Same dual-read pattern as hook
   - Shared processing logic after data fetch
   - Logging to identify which source was used

### Environment Configuration
- `.env`: `VITE_USE_WEEKLY_ASSIGNMENTS="false"` (production default)
- `.env.local`: Can override for local testing

## Validation Steps (Staging)

### 1. Source Parity Check
```bash
# Enable flag in staging
VITE_USE_WEEKLY_ASSIGNMENTS=true

# Check console logs for:
# - "🚀 Using weekly_assignments V2 (feature flag ON)"
# - Assignment IDs should start with "assign:"
# - Compare returned count/content vs legacy path
```

### 2. Score Binding Test
```sql
-- After submitting confidence in staging with flag ON
SELECT 
  id,
  assignment_id,
  weekly_focus_id,
  confidence_score,
  created_at
FROM weekly_scores
WHERE staff_id = '<test_user_id>'
ORDER BY created_at DESC
LIMIT 5;

-- Expected:
-- - assignment_id should be populated: 'assign:<uuid>'
-- - weekly_focus_id still present (for backward compat)
```

### 3. Fallback Safety Test
```bash
# Disable flag
VITE_USE_WEEKLY_ASSIGNMENTS=false

# Check console logs for:
# - "📚 Using legacy weekly_plan/weekly_focus (V2 flag OFF)"
# - Assignment IDs should be "plan:<id>" or UUID format
# - Behavior identical to pre-Phase-2
```

### 4. Network Comparison
With flag ON vs OFF, compare:
- Number of assignments returned
- Assignment content (action_statement, domain_name)
- Display order
- Self-select flags

## Rollback Plan
If issues found:
1. Set `VITE_USE_WEEKLY_ASSIGNMENTS=false` in all environments
2. Deploy updated .env
3. Verify logs show legacy path
4. No database rollback needed (Phase 2 is read-only)

## Phase 3 Preparation
Once validated:
- Confirm assignment_id coverage on weekly_scores is >99%
- Run side-by-side comparison reports
- Document any edge cases discovered
- Prepare Phase 3 cutover plan
