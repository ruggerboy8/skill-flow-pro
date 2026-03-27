

# Update AdminBuilder to Match PlannerPage Layout

## What changed and why it's not showing

The `PlannerPage.tsx` was updated to default the recommender to **hidden** with a toggle button, giving the week builder full width. However, `AdminBuilder.tsx` — the page you're actually using at `/builder` — still has the old side-by-side layout with the recommender always visible at 50% width.

No other recent changes appear to be missing from the builder view. The role display name fix is correctly wired in both `ProMoveList` and `OrgProMoveLibraryTab`.

## Plan

### Update `PlannerTabContent` in `AdminBuilder.tsx`

Replace the hardcoded 50/50 split with the same toggle pattern from `PlannerPage`:

1. Add `showRecommender` state (default `false`)
2. Add a toggle button (`BarChart2` icon) in each planner tab
3. Conditionally render `RecommenderPanel` in a fixed-width sidebar
4. Give `WeekBuilderPanel` full width by default

**Single file change**: `src/pages/AdminBuilder.tsx`

### Technical detail

The `PlannerTabContent` component (lines 145-171) will gain a `useState(false)` toggle and render the recommender conditionally, matching the exact pattern already working in `PlannerPage.tsx` (lines 17, 30-31, 41-57).

