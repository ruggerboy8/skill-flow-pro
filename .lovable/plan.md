

## Problem

The Regional Command Center calculates submission rates by always including confidence in `totalRequired` — even on Monday morning before anyone's deadline has passed. This means every location shows ~0% and triggers the "<70% participation" signal on day one of the week.

Additionally, the dashboard computes a **single set of submission gates** using the logged-in user's timezone, but each location has its own timezone and deadline offsets (`conf_due_day`, `conf_due_time`, `perf_due_day`, `perf_due_time` on the `locations` table). A location in `America/New_York` could have a different effective deadline than one in `America/Los_Angeles`.

## Fix

### 1. Fetch per-location deadline configs

**File:** `src/pages/dashboard/RegionalDashboard.tsx`

- After fetching `summaries`, query the `locations` table for all relevant location IDs to get `timezone`, `conf_due_day`, `conf_due_time`, `perf_due_day`, `perf_due_time`.
- Build a `Map<locationId, { tz, offsets }>` lookup.

### 2. Compute per-location submission gates

**File:** `src/lib/submissionStatus.ts`

- Add a new function `getPerLocationGates(now, locationConfig)` that uses `getSubmissionPolicy(now, loc.tz, loc.offsets)` to derive gates specific to that location's timezone and deadlines.
- Alternatively, change `calculateLocationStats` to accept per-location gates rather than global ones.

### 3. Change submission rate logic to be deadline-aware

**File:** `src/lib/submissionStatus.ts` — `calculateLocationStats`

Current logic: always counts confidence in `totalRequired`.

New logic:
- **Before confidence deadline:** `totalRequired = 0`, `totalSubmitted = 0` for confidence → rate defaults to 100% (nothing is due yet). Confidence submissions are tracked as `pendingConfCount` (informational).
- **After confidence deadline, before performance opens:** only confidence counts toward rate.
- **After performance deadline:** both confidence and performance count.

This way, the rate only reflects metrics whose deadlines have actually passed.

### 4. Update signals threshold logic

**File:** `src/pages/dashboard/RegionalDashboard.tsx`

- Pass per-location gates when computing stats.
- Signals should only fire when a deadline has actually passed and submissions are missing — not when nothing is due yet.
- When no deadlines have passed for a location, its rate should be 100% (or excluded from signals).

### 5. Update submission gates passed to LocationHealthCard

- Instead of a single global `submissionGates`, pass per-location gates so each card shows contextually correct badges (e.g., "Pending Conf" vs "Late Conf" based on that location's deadline).

### Technical Details

The key data flow change:

```text
Before:
  useLocationTimezone() → single tz → single gates → all locations

After:
  locations table query → per-location { tz, offsets }
  → per-location gates via getSubmissionPolicy()
  → per-location rate calculation
```

The `locations` query is lightweight (one SELECT for all managed locations). The `getPolicyOffsetsForLocation` helper already exists in `submissionPolicy.ts`.

### Files Changed

1. **`src/pages/dashboard/RegionalDashboard.tsx`** — fetch location configs, compute per-location gates, pass to stats calculation
2. **`src/lib/submissionStatus.ts`** — update `calculateLocationStats` to only count metrics whose deadlines have passed in the rate denominator
3. **`src/components/dashboard/LocationHealthCard.tsx`** — minor: accept per-location gate data (interface already supports it)

