

# Evaluation Progress Tracking & Visibility System

This plan introduces a comprehensive system for tracking evaluation progress and controlling when participants can see their results.

---

## Overview

The new system will:
1. Add a **Delivery** tab to the Evaluations admin page for monitoring submission progress
2. Allow admins to navigate to **any evaluation period** (even future ones with no data)
3. Add a **visibility flag** to evaluations that defaults to "not visible"
4. Enable admins to **"deliver" results** per-location via an action menu
5. Filter participant-facing views to **only show visible evaluations**

---

## Database Changes

### New Column: `evaluations.is_visible_to_staff`

Add a boolean column to control whether participants can see their evaluation results.

```sql
ALTER TABLE public.evaluations 
ADD COLUMN is_visible_to_staff boolean NOT NULL DEFAULT false;

-- Create index for efficient filtering
CREATE INDEX idx_evaluations_visible ON public.evaluations(is_visible_to_staff) 
WHERE is_visible_to_staff = true;
```

Default is `false`, meaning evaluations are hidden until explicitly released.

---

## Page Structure

### Tab Layout for `/admin/evaluations`

```text
+--------------------------------------------------+
| Evaluations                                       |
|                                                   |
| [Results]  [Delivery]                            |
+--------------------------------------------------+
```

- **Results Tab**: Existing evaluation results view (OrgSummaryStrip, LocationCardGrid, etc.)
- **Delivery Tab**: New progress tracking table with visibility controls

---

## Delivery Tab Design

### Filter Bar

Reuse the existing organization selector, but replace the period picker with a **full period dropdown** that includes:
- Baseline (if exists)
- Q4 2026, Q3 2026, Q2 2026, Q1 2026, Q4 2025, ... (descending order)
- Generate periods programmatically even if no evals exist

### Progress Table

| Location | Total Staff | Drafts | Submitted | Coverage | Visible | Actions |
|----------|-------------|--------|-----------|----------|---------|---------|
| McKinney | 8 | 2 | 5 | 62% | No | [...] |
| Lake Orion | 12 | 0 | 12 | 100% | Yes | [...] |

**Columns:**
- **Location**: Location name
- **Total Staff**: Count of active participants (RDA + OM + DFI roles) at this location
- **Drafts**: Number of evaluations in "draft" status for this period
- **Submitted**: Number of evaluations in "submitted" status
- **Coverage**: (Submitted / Total Staff) as percentage
- **Visible**: Badge showing whether results are visible to staff (Yes/No)
- **Actions**: Dropdown menu with visibility controls

### Action Menu Options

```text
[ ... ]
├─ Make Visible (if currently hidden)
├─ Hide Results (if currently visible)  
└─ Submit All Complete Drafts
```

---

## File Changes Summary

| File | Change |
|------|--------|
| `supabase/migrations/[new].sql` | Add `is_visible_to_staff` column to evaluations |
| `src/pages/admin/EvalResultsV2.tsx` | Add Tabs component with Results and Delivery tabs |
| `src/components/admin/eval-results-v2/DeliveryTab.tsx` | **New** - Progress tracking table |
| `src/components/admin/eval-results-v2/EvalPeriodSelector.tsx` | **New** - Full period dropdown (generates all periods) |
| `src/hooks/useEvalDeliveryProgress.tsx` | **New** - Fetch progress data per location |
| `src/lib/evaluations.ts` | Add `setEvaluationVisibility` and `bulkSetVisibility` functions |
| `src/pages/stats/StatsEvaluations.tsx` | Filter to only show `is_visible_to_staff = true` |
| `src/components/my-role/RoleRadar.tsx` | Skip non-visible evaluations |
| `src/hooks/useDomainDetail.ts` | Skip non-visible evaluations |
| `src/pages/EvaluationViewer.tsx` | Block participant access to non-visible evals |

---

## Technical Implementation

### 1. Database Migration

```sql
-- Add visibility column with default false
ALTER TABLE public.evaluations 
ADD COLUMN is_visible_to_staff boolean NOT NULL DEFAULT false;

-- Index for efficient queries
CREATE INDEX idx_evaluations_visible 
ON public.evaluations(is_visible_to_staff) 
WHERE is_visible_to_staff = true;

-- Update existing submitted evaluations to be visible (optional: discuss)
-- UPDATE public.evaluations SET is_visible_to_staff = true WHERE status = 'submitted';
```

Note: Existing evaluations will default to NOT visible. You can choose to make all existing submitted evals visible as part of migration, or leave them hidden.

### 2. Period Generator Utility

Create a utility function to generate all possible evaluation periods:

```typescript
// src/lib/evalPeriods.ts
export function generateEvalPeriods(startYear: number, endYear: number): EvaluationPeriod[] {
  const periods: EvaluationPeriod[] = [];
  
  for (let year = endYear; year >= startYear; year--) {
    // Add quarterly periods in reverse order (Q4, Q3, Q2, Q1)
    for (const quarter of ['Q4', 'Q3', 'Q2', 'Q1'] as Quarter[]) {
      periods.push({ type: 'Quarterly', quarter, year });
    }
    // Add baseline for this year
    periods.push({ type: 'Baseline', year });
  }
  
  return periods;
}
```

### 3. Delivery Progress Hook

```typescript
// src/hooks/useEvalDeliveryProgress.tsx
interface LocationProgress {
  locationId: string;
  locationName: string;
  totalStaff: number;
  draftCount: number;
  submittedCount: number;
  visibleCount: number;
  coveragePercent: number;
}

export function useEvalDeliveryProgress(
  organizationId: string,
  period: EvaluationPeriod
): { locations: LocationProgress[]; isLoading: boolean }
```

This hook will:
1. Get all locations for the organization
2. For each location, count staff, drafts, submitted evals, and visible evals
3. Calculate coverage percentages

### 4. Visibility Functions

```typescript
// src/lib/evaluations.ts

export async function setEvaluationVisibility(evalId: string, visible: boolean) {
  const { error } = await supabase
    .from('evaluations')
    .update({ is_visible_to_staff: visible })
    .eq('id', evalId);
  if (error) throw new Error(`Failed to update visibility: ${error.message}`);
}

export async function bulkSetVisibilityByLocation(
  locationId: string,
  period: EvaluationPeriod,
  visible: boolean
) {
  let query = supabase
    .from('evaluations')
    .update({ is_visible_to_staff: visible })
    .eq('location_id', locationId)
    .eq('status', 'submitted')
    .eq('program_year', period.year);
  
  if (period.type === 'Quarterly' && period.quarter) {
    query = query.eq('quarter', period.quarter).eq('type', 'Quarterly');
  } else {
    query = query.eq('type', 'Baseline');
  }
  
  const { error } = await query;
  if (error) throw new Error(`Failed to update visibility: ${error.message}`);
}
```

### 5. DeliveryTab Component

```typescript
// src/components/admin/eval-results-v2/DeliveryTab.tsx

export function DeliveryTab({ 
  organizationId, 
  period, 
  onPeriodChange 
}: DeliveryTabProps) {
  const { locations, isLoading } = useEvalDeliveryProgress(organizationId, period);
  
  return (
    <div className="space-y-4">
      <EvalPeriodSelector 
        value={period} 
        onChange={onPeriodChange}
        showEmpty={true}  // Show periods even without data
      />
      
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Location</TableHead>
            <TableHead className="text-center">Total Staff</TableHead>
            <TableHead className="text-center">Drafts</TableHead>
            <TableHead className="text-center">Submitted</TableHead>
            <TableHead className="text-center">Coverage</TableHead>
            <TableHead className="text-center">Visible</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {locations.map(loc => (
            <TableRow key={loc.locationId}>
              {/* ... table cells with data ... */}
              <TableCell>
                <DropdownMenu>
                  {/* Make Visible / Hide Results / Submit Drafts */}
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

### 6. Participant-Facing Visibility Filtering

#### StatsEvaluations.tsx

Update the RPC call to filter by visibility:

```typescript
// Option A: Modify the RPC to accept a visibility filter
const { data } = await supabase.rpc('get_evaluations_summary', { 
  p_staff_id: staffProfile.id,
  p_only_submitted: true,
  p_only_visible: true  // New parameter
});

// Option B: Filter client-side after fetching
// Filter to only include visible evaluations
const visibleEvals = evals.filter(e => 
  isCoach || isSuperAdmin || e.is_visible_to_staff
);
```

Option B is simpler for initial implementation but requires adding the visibility field to the RPC return. 

#### RoleRadar.tsx & useDomainDetail.ts

Similar filtering - only consider visible evaluations when determining "most recent" scores for participants.

#### EvaluationViewer.tsx

Add visibility check after access validation:

```typescript
// After checking if evaluation exists and user has access
if (evalData.staff_id === staff.id && !evalData.is_visible_to_staff) {
  setError("This evaluation is not yet available for viewing.");
  return;
}
```

### 7. RPC Modification

Update `get_evaluations_summary` to support visibility filtering:

```sql
CREATE OR REPLACE FUNCTION get_evaluations_summary(
  p_staff_id uuid,
  p_only_submitted boolean DEFAULT false,
  p_only_visible boolean DEFAULT false
) RETURNS TABLE (...)
-- Add: AND (NOT p_only_visible OR e.is_visible_to_staff = true)
```

---

## Empty State Handling

When navigating to a period with no evaluations:

```text
+--------------------------------------------------+
| Q2 2026                                          |
|                                                  |
|  No Q2 2026 evaluations yet.                     |
|                                                  |
|  Use the progress table below to track           |
|  submission status once evaluations begin.       |
+--------------------------------------------------+
```

The Delivery tab will still show all locations with 0/0/0 counts.

---

## Workflow Example

1. **Coaches submit evaluations** - All new evals default to `is_visible_to_staff = false`
2. **Admin opens Delivery tab** - Sees progress across locations
3. **Admin selects Q1 2026** - Views which locations have completed their evaluations
4. **Admin clicks "Make Visible" on McKinney** - All submitted Q1 2026 evals for McKinney become visible
5. **McKinney staff** can now see their Q1 2026 evaluation results
6. **(Future)** Admin can trigger a notification to those staff members

---

## Testing Checklist

1. Create a new evaluation - verify `is_visible_to_staff` defaults to false
2. Open Delivery tab - verify locations and progress stats are accurate
3. Navigate to a period with no data - verify empty state displays properly
4. Click "Make Visible" on a location - verify all submitted evals become visible
5. Log in as a participant - verify hidden evals don't appear in:
   - Stats → Evaluations list
   - My Role → Overview scores
   - My Role → Domain Detail
   - Direct URL access
6. Log in as coach/admin - verify they can still see all evals regardless of visibility

