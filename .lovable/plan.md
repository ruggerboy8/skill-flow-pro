

## Audit + Adjustments: Staff Detail & Location Detail Pages

### Data Accuracy Audit

**StaffDetailV2 — domain confidence strip (line 162):** Sorts by `a.domain.localeCompare(b.domain)` — alphabetical, which gives Case Acceptance, Clerical, Clinical, Cultural. Wrong order.

**StaffDetailV2 — history scores (line 502):** Sorts by `display_order`, which comes from the RPC. This is correct — it reflects the assignment order set by the plan.

**StaffOverviewTab — domainAvgs (line 51):** Sorts by `a.avg - b.avg` (lowest first). This is intentional for "lowest self-reported domains" but the DomainConfidenceTrend chart uses a hardcoded `DOMAINS` array in the correct order — that's fine.

**LocationDetail:** Data flows from `useStaffWeeklyScores` through `calculateLocationStats` — this is aggregation logic, not domain-ordered. The `LocationSkillGaps` component groups by role, then domain — need to check if it enforces domain order within each role group.

**LocationSubmissionWidget, LocationHealthCard:** These show submission rates, not domain-level data — no domain ordering concern.

### Issues Found

1. **Domain order in StaffDetailV2 confidence strip** — uses `localeCompare` instead of canonical order
2. **Eval pill in history** — shows an "Eval" badge near weeks that have an evaluation within ±14 days. User wants it removed.
3. **EvalCadenceWidget** — user wants it hidden for now

### Plan

#### 1. Fix domain ordering in StaffDetailV2 confidence strip
**File:** `src/pages/coach/StaffDetailV2.tsx` line 162
- Import `getDomainOrderIndex` from `@/lib/domainUtils`
- Change `.sort((a, b) => a.domain.localeCompare(b.domain))` to `.sort((a, b) => getDomainOrderIndex(a.domain) - getDomainOrderIndex(b.domain))`

#### 2. Remove "Eval" pill from history tab
**File:** `src/pages/coach/StaffDetailV2.tsx`
- Remove the `nearbyEval` variable usage (lines 469-474) — the badge rendering
- Remove the `getEvalForWeek` call at line 453
- Keep the `staffEvals` query since it's still used for `evalCount` passed to `StaffOverviewTab`
- Can also remove the `getEvalForWeek` helper function (lines 138-145) and the `ClipboardCheck` icon import

#### 3. Hide EvalCadenceWidget in LocationDetail
**File:** `src/pages/dashboard/LocationDetail.tsx`
- Comment out or remove lines 173-174 (`EvalCadenceWidget` render + import)

#### 4. Verify LocationSkillGaps domain ordering
The `LocationSkillGaps` component groups gaps by role tab, then renders them. Need to confirm if domain order is enforced within each role's gap list — if not, add sorting there too.

