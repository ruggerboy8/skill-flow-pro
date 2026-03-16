

## Problem

On Monday morning (before any deadline), every location card shows **"100% Submitted"** in green — because we made the rate default to 100% when no deadline has passed. While technically correct (nothing is late), it's misleading: a manager sees "100%" and thinks everyone has already submitted, when in reality nobody has.

The fix we need is to **always show the real submission count as a progress measure**, but only apply **color grading and alert signals after deadlines pass**.

## What a manager wants to see at each point in the week

| Timeframe | Big number on card | Color/border | Badges |
|---|---|---|---|
| **Mon morning** (nothing due) | "3 / 10 conf" (raw count) | Neutral (gray) | "Conf due Tue 2pm" |
| **Tue morning** (conf not yet due) | "7 / 10 conf" | Neutral | "3 awaiting conf" |
| **Tue after 2pm** (conf due) | "70% conf" | Green/amber/red based on rate | "3 late conf" |
| **Thu** (perf opens) | "70% conf · 2 / 10 perf" | Color based on conf rate | "3 late conf · 8 awaiting perf" |
| **Fri after 5pm** (both due) | "65% submitted" (combined rate) | Color based on combined rate | "3 late conf · 4 late perf" |

## Plan

### 1. Expand `calculateLocationStats` return type

**File:** `src/lib/submissionStatus.ts`

Add raw counts to the return value so the card can show "X / Y submitted" before deadlines:
- `confSubmittedCount` — staff who have submitted confidence (regardless of deadline)
- `confExpectedCount` — total staff expected to submit confidence
- `perfSubmittedCount` / `perfExpectedCount` — same for performance

The existing `submissionRate` stays as-is (only counts post-deadline metrics). Add a new `rawSubmissionCount` object with these fields.

### 2. Expand `LocationStats` interface and pass raw counts

**File:** `src/components/dashboard/LocationHealthCard.tsx`

Add to interface:
- `confSubmitted: number` / `confExpected: number`
- `perfSubmitted: number` / `perfExpected: number`

### 3. Redesign the card's big number display

**File:** `src/components/dashboard/LocationHealthCard.tsx`

Logic for the prominent metric:
- **Before any deadline passed:** Show `"{confSubmitted}/{confExpected} conf"` in **neutral gray** (no color grading). If perf window is open, also show perf count.
- **After conf deadline but before perf deadline:** Show `"{submissionRate}% conf"` with color grading. If perf window open, show perf raw count below.
- **After both deadlines:** Show combined `"{submissionRate}%"` with full color grading (current behavior).

Border/background color: only apply the red/amber/green treatment when at least one deadline has passed. Before that, use a neutral border.

### 4. Refine badges on the card

Current badges are mostly correct already. Adjustments:
- When no deadline has passed, show a contextual "Conf due {day time}" badge instead of "On Track" (the next-deadline info is already computed in RegionalDashboard — pass it down).
- Keep "Awaiting Conf" / "Late Conf" / "Late Perf" as-is.

### 5. Update RegionalDashboard summary cards + signals

**File:** `src/pages/dashboard/RegionalDashboard.tsx`

- **Avg Completion card:** Before any location's deadline has passed, show raw count instead of "100%" (e.g., "12 / 40 submitted"). After deadlines, show the rate.
- **Signals:** Already gated behind `anyDeadlinePassed` — no change needed.
- Pass `nextDeadlineLabel` per-location to cards for the contextual badge.

### 6. Wire up in RegionalDashboard

**File:** `src/pages/dashboard/RegionalDashboard.tsx`

- Pull `confSubmitted/confExpected/perfSubmitted/perfExpected` from the expanded `calculateLocationStats` return.
- Pass them through to `LocationHealthCard` via the expanded `LocationStats` interface.
- Compute per-location next deadline label and pass to card.

### Files Changed

1. `src/lib/submissionStatus.ts` — add raw submission counts to return type
2. `src/components/dashboard/LocationHealthCard.tsx` — redesign big number (progress vs rate), conditional color grading, deadline context badge
3. `src/pages/dashboard/RegionalDashboard.tsx` — pass raw counts + per-location deadline labels to cards, update summary card

