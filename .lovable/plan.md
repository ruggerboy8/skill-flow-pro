
# Consolidate Eval Results → "Evaluations"

## Overview

Remove the original Eval Results page and rename Eval Results 2.0 to simply "Evaluations".

---

## Changes Required

### 1. Remove Original Eval Results Route

**File**: `src/App.tsx`

- Remove import: `import EvalResults from "@/pages/admin/EvalResults";`
- Remove route: `<Route path="admin/eval-results" element={<EvalResults />} />`
- Keep the V2 route but change path from `/admin/eval-results-v2` to `/admin/evaluations`

### 2. Update Navigation

**File**: `src/components/Layout.tsx`

Replace:
```typescript
{ name: 'Eval Results', href: '/admin/eval-results', icon: TrendingUp },
{ name: 'Eval Results 2.0', href: '/admin/eval-results-v2', icon: TrendingUp }
```

With:
```typescript
{ name: 'Evaluations', href: '/admin/evaluations', icon: TrendingUp }
```

### 3. Update Page Title

**File**: `src/pages/admin/EvalResultsV2.tsx`

Change the h1 from "Evaluation Results" to "Evaluations" (line 122)

### 4. Add Legacy Redirect (Optional)

To handle any bookmarks or shared links, add a redirect from the old paths:
```typescript
<Route path="admin/eval-results" element={<Navigate to="/admin/evaluations" replace />} />
<Route path="admin/eval-results-v2" element={<Navigate to="/admin/evaluations" replace />} />
```

---

## Summary

| Item | Before | After |
|------|--------|-------|
| Nav items | 2 ("Eval Results", "Eval Results 2.0") | 1 ("Evaluations") |
| Routes | `/admin/eval-results`, `/admin/eval-results-v2` | `/admin/evaluations` |
| Page title | "Evaluation Results" | "Evaluations" |

The original `EvalResults.tsx` file will no longer be imported but can remain in the codebase for reference until you decide to delete it.
