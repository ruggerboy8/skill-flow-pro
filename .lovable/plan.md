

# Move Search Bar Outside Filter Dropdown

## Change

In `src/pages/coach/CoachDashboardV2.tsx`, move the `<Input>` search field out of the `<CollapsibleContent>` and place it inline next to the Filters button. This keeps it always visible regardless of whether the filter panel is expanded.

### Current layout
```text
[Filters ▼] [Clear]
  └─ (collapsible) Orgs | Locations | Roles | Search input
```

### New layout
```text
[Filters ▼] [Clear]  [Search input ___________]
  └─ (collapsible) Orgs | Locations | Roles
```

### File: `src/pages/coach/CoachDashboardV2.tsx`

1. Move the `<Input>` (lines 559-564) out of the `<CollapsibleContent>` block
2. Place it inside the existing `<div className="flex items-center gap-2">` row (line 502) that contains the Filters button and Clear button — add it after them, pushed to the right with `ml-auto`
3. Remove it from the collapsible content's flex wrapper
4. Update the `hasActiveFilters` badge count to no longer include the search term (since it's always visible now, counting it as a "filter" in the collapsed badge is less useful)

