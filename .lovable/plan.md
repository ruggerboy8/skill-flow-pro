

# Export Tab -- Final Implementation Plan

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/types/exportConfig.ts` | Create -- types + constants |
| `src/components/admin/eval-results-v2/EvaluationsExportTab.tsx` | Create -- wizard component |
| `src/pages/admin/EvalResultsV2.tsx` | Modify -- add tab trigger + content (3 lines) |

No database migrations. No new RPCs. No edge functions.

---

## 1. Type File: `src/types/exportConfig.ts`

```typescript
export type ExportGrain = 'individual' | 'location' | 'organization';
export type TimeWindow = '3weeks' | '6weeks' | 'all';

export interface ExportConfig {
  grain: ExportGrain;
  includeCompletionRate: boolean;
  includeOnTimeRate: boolean;
  submissionWindow: TimeWindow;
  includeDomainAverages: boolean;
  includeCompetencyAverages: boolean;
  includeObserverAndSelf: boolean;
}

export const EXPORT_FORMAT = {
  version: 'v1',
  percentDecimals: 0,
  meanDecimals: 2,
  nullToken: '',
} as const;

export const MAX_EXPORT_ROWS = 100_000;

// Deterministic column names -- single source of truth
export const COLUMN_NAMES = {
  organization: 'Organization',
  location: 'Location',
  staffName: 'Staff Name',
  role: 'Role',
  staffCount: 'Staff Count',
  completionRate: 'Completion %',
  onTimeRate: 'On-Time %',
  competencyName: 'Competency',
  domainName: 'Domain',
  obsMean: 'Observer Mean',
  selfMean: 'Self Mean',
  obsScore: 'Observer Score',
  selfScore: 'Self Score',
  nItems: 'N Items',
} as const;
```

---

## 2. Component: `EvaluationsExportTab`

Props: `{ filters: EvalFilters; onFiltersChange: (f: EvalFilters) => void }`

### Wizard State
- `currentStep: number` -- 0-based (matches StepBar which uses 0-based index comparison)
- Steps array: `['Report Type', 'Scope', 'Metrics', 'Download']`
- `exportConfig: ExportConfig` with defaults (all false, window '6weeks', grain 'individual')

### Step 0 -- Grain
Radio group: Individual / Location / Organization. Simple RadioGroup from existing UI.

### Step 1 -- Scope
Render `<FilterBar filters={filters} onFiltersChange={onFiltersChange} hidePeriodSelector={false} />`. Already pre-populated from page state.

### Step 2 -- Metrics
Two card groups:

**ProMove Submission** (disabled when period.type === 'Baseline'):
- Checkbox: Completion %
- Checkbox: On-Time %
- ToggleGroup: 3wk / 6wk / all (using existing ToggleGroup component)

**Eval Performance:**
- Checkbox: Domain averages
- Checkbox: Competency averages
- Checkbox: Include observer + self columns (default checked)

Validation: at least one metric must be selected to proceed.

### Step 3 -- Preview and Download
- Summary text: grain, period label, scope description
- Column list preview (built from config + COLUMN_NAMES constant)
- Row count (fetched via lightweight query)
- If count > MAX_EXPORT_ROWS: warning alert, download blocked
- If count === 0: "No rows match current filters"
- "Download CSV" button with loading spinner during assembly
- On successful download: insert audit row

**Mixed wide+long handling:** If both domain averages (wide) and competency averages (long) are selected, produce two separate CSV files with toast explaining both downloads.

### Navigation
- Back/Next buttons at bottom
- Back always allowed
- Next on Step 2 validates at least one metric selected
- Step 3 re-fetches row estimate on entry

---

## 3. Data Adapters

### 3a. Submission Metrics

Pattern: identical to `useOrgAccountability` (proven, batched).

1. Fetch staff for scope: `staff` table filtered by `primary_location_id` in scope locations, `is_participant = true`, `is_paused = false`
2. Batch staff IDs (chunks of 20)
3. Call `supabase.rpc('get_staff_submission_windows', { p_staff_id, p_since })` per staff
4. `p_since`: use `calculateCutoffDate(config.submissionWindow)` -- 21 days for 3wk, 42 days for 6wk, omit for all
5. Filter returned rows to `due_at <= now` (past-due only, matching existing semantics)
6. Per staff: count expected/completed/onTime from filtered rows
7. For individual grain: one row per staff with rates
8. For location/org grain: sum across staff, recompute rates
9. Staff with 0 expected: rates = `null` (exported as empty string per EXPORT_FORMAT.nullToken)

### 3b. Domain Metrics

Use `get_eval_distribution_metrics` RPC with same params as existing V2 components:
```typescript
supabase.rpc('get_eval_distribution_metrics', {
  p_org_id: filters.organizationId,
  p_types: types, // ['Quarterly'] or ['Baseline']
  p_program_year: filters.evaluationPeriod.year,
  p_quarter: filters.evaluationPeriod.quarter,
  p_location_ids: filters.locationIds.length > 0 ? filters.locationIds : undefined,
  p_role_ids: filters.roleIds.length > 0 ? filters.roleIds : undefined,
})
```

- RPC returns per-staff per-domain rows with `obs_mean`, `self_mean`, `n_items`
- Individual grain: pivot domains to columns per staff (wide format). Column per domain: `{DomainName} Observer Mean`, `{DomainName} Self Mean`
- Location grain: group by `location_id` + domain, **weighted mean** = `sum(obs_mean * n_items) / sum(n_items)`
- Org grain: group by domain only, same weighted mean
- If `includeObserverAndSelf === false`: omit self columns

### 3c. Competency Metrics

Query `evaluation_items` joined with `evaluations` (period/scope/status='submitted'):
```typescript
supabase
  .from('evaluation_items')
  .select('competency_id, competency_name_snapshot, domain_name, observer_score, self_score, observer_is_na, self_is_na, evaluation_id, evaluations!inner(staff_id, location_id, role_id, type, quarter, program_year, status, staff!inner(name, primary_location_id))')
  .eq('evaluations.status', 'submitted')
  .eq('evaluations.program_year', year)
  // + type/quarter/location/role filters
```

- Individual grain: wide format -- one row per staff, columns per competency
- Location/org grain: **long format** -- one row per grouping + competency with averaged scores. Columns: `Organization, Location, Competency, Domain, Observer Mean, Self Mean, N Items`
- Multiple evals per staff in period: average all submitted items per competency
- If `includeObserverAndSelf === false`: omit self columns
- Use explicit FK hint for competency->domain joins if needed (per architecture memory)

---

## 4. CSV Assembly

### Row Sort Order (deterministic)
- Individual: organization name, location name, staff name, role
- Location: organization name, location name
- Organization: organization name

### Formatting
- Rates: `Math.round(rate)` -- integer, no % symbol
- Means: `.toFixed(2)` -- 2 decimal places
- Nulls: empty string `''` (not em dash)
- Column order follows `COLUMN_NAMES` constant order

### File Naming
- Domain/submission: `eval_export_{grain}_{periodLabel}_{YYYY-MM-DD}.csv`
- Competency (separate file): `eval_export_{grain}_competencies_{periodLabel}_{YYYY-MM-DD}.csv`

### Download
Use existing `downloadCSV()` from `lib/csvExport.ts`. It already handles null/undefined as empty string, comma escaping, and blob download.

---

## 5. Audit Trail

After successful download, insert via client:
```typescript
const { data: myStaff } = await supabase
  .from('staff')
  .select('id')
  .eq('user_id', user.id)
  .single();

await supabase.from('admin_audit').insert({
  action: 'evaluations_export_downloaded',
  changed_by: myStaff.id,   // staff UUID, not auth UUID
  staff_id: myStaff.id,     // self-action, same staff
  scope_organization_id: filters.organizationId || null,
  scope_location_id: null,
  new_values: {
    exportVersion: 'v1',
    grain: config.grain,
    period: filters.evaluationPeriod,
    filtersApplied: { locationIds: filters.locationIds, roleIds: filters.roleIds },
    metricFlags: config,
    rowCount,
    filename,
  },
});
```

RLS: `admin_audit` has INSERT policy `WITH CHECK (true)` for authenticated users, so client-side insert works.

---

## 6. Query Keys (primitive-based, stable)

```typescript
// Row estimate
['export-row-estimate', grain, orgId, year, quarter, type, sortedLocationIds, sortedRoleIds, ...metricFlags]

// Submission data (only fetched during export build, not cached long)
['export-submission-build', sortedStaffIds, submissionWindow]

// Domain data
['export-domain-build', orgId, year, quarter, type, sortedLocationIds, sortedRoleIds]

// Competency data
['export-competency-build', orgId, year, quarter, type, sortedLocationIds, sortedRoleIds]
```

---

## 7. UX Guardrails

- Download button disabled until: org selected AND at least one metric checked AND row estimate resolved AND count > 0 AND count <= MAX_EXPORT_ROWS
- Loading state with spinner during CSV assembly
- If both domain + competency selected: two sequential downloads with toast: "2 files downloaded: metrics and competencies"
- Empty state: "No rows match current filters" with specific reason
- Submission metrics disabled for Baseline periods (no submission windows exist)
- Step 3 revalidates (re-fetches row estimate) on entry

---

## 8. Integration into EvalResultsV2.tsx

Three lines:
1. `import { EvaluationsExportTab } from '@/components/admin/eval-results-v2/EvaluationsExportTab';`
2. `<TabsTrigger value="export">Export</TabsTrigger>` in TabsList
3. `<TabsContent value="export" className="space-y-6"><EvaluationsExportTab filters={filters} onFiltersChange={setFilters} /></TabsContent>`

---

## Implementation Order

1. Create `src/types/exportConfig.ts` (types + constants)
2. Create `EvaluationsExportTab.tsx` -- wizard UI shell with StepBar, grain selector, metric checkboxes, preview panel (no data wiring yet, disabled download)
3. Wire submission metrics adapter (reuse `get_staff_submission_windows` + `calculateSubmissionStats` pattern from `useOrgAccountability`)
4. Wire domain metrics adapter (reuse `get_eval_distribution_metrics` call pattern from `OrgSummaryStrip`)
5. Wire competency metrics adapter (query `evaluation_items` + `evaluations`)
6. CSV assembly with deterministic column order + formatting rules
7. Audit trail insert on successful download
8. Add Export tab to `EvalResultsV2.tsx`

