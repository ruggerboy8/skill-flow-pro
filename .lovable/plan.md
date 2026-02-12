

## "My Team" Tab for Doctors

A new navigation tab that gives doctors visibility into what their staff is focused on each week and lets them explore role expectations for DFIs, RDAs, and Office Managers.

### What the Doctor Will See

**New "My Team" tab in the doctor sidebar navigation** (between "My Role" and "Coaching History")

The tab has a sub-tabbed interface with two sections:

**1. "This Week" sub-tab (default)**
- Shows the current week's Pro Moves assigned to staff at the doctor's location
- Three collapsible sections: DFI, RDA, Office Manager (role_id 1, 2, 3)
- Each section lists the locked weekly assignments for that role, showing the Pro Move statement with domain color spine (reusing the same visual pattern from `ThisWeekPanel`)
- Read-only -- no CTA buttons, no scores, no confidence/performance deltas
- Shows "Week of [date]" header
- If no assignments exist for a role, shows a subtle "No assignments this week" message

**2. "Role Guides" sub-tab**
- Three cards/buttons: "DFI", "RDA", "Office Manager"
- Tapping a role opens a read-only version of the RoleRadar/domain overview for that role
- From there, the doctor can drill into domain detail pages to see competencies and pro moves
- This reuses the existing `RoleRadar` component logic but parameterized by role_id instead of reading from the doctor's own staff profile

### Technical Details

**New files:**
- `src/pages/doctor/DoctorMyTeam.tsx` -- Main page with "This Week" / "Role Guides" sub-tabs
- `src/components/doctor/TeamWeeklyFocus.tsx` -- Fetches and displays weekly assignments for all 3 roles at the doctor's location (uses `useWeeklyAssignments` hook for each role_id)
- `src/components/doctor/TeamRoleExplorer.tsx` -- Shows 3 role cards; clicking one navigates to a read-only domain overview
- `src/pages/doctor/DoctorTeamRoleDetail.tsx` -- Read-only role overview page (reuses domain data fetching from `useDomainDetail` but for a specified role_id, no scores)
- `src/pages/doctor/DoctorTeamDomainDetail.tsx` -- Read-only domain detail page showing competencies and pro moves for the selected role

**Modified files:**
- `src/components/Layout.tsx` -- Add "My Team" nav item for doctors (icon: `Users`)
- `src/App.tsx` -- Register routes: `/doctor/my-team`, `/doctor/my-team/role/:roleSlug`, `/doctor/my-team/role/:roleSlug/domain/:domainSlug`

**Data flow for "This Week":**
- Get doctor's `primary_location_id` from `useStaffProfile`
- For each role (DFI=1, RDA=2, OM=3), call `useWeeklyAssignments({ roleId })` to get the current week's locked global assignments
- Display in read-only spine cards grouped by role

**Data flow for "Role Guides":**
- Reuse `ROLE_CONTENT` from `roleDefinitions.ts` for descriptions
- Fetch competencies and pro moves from `competencies` and `pro_moves` tables filtered by role_id
- No scores or evaluation data shown -- purely structural/educational content

**Route structure:**
```text
/doctor/my-team                              -- Main page (This Week + Role Guides tabs)
/doctor/my-team/role/dfi                     -- DFI domain overview (read-only RoleRadar)
/doctor/my-team/role/rda                     -- RDA domain overview
/doctor/my-team/role/om                      -- OM domain overview
/doctor/my-team/role/:roleSlug/domain/:domainSlug  -- Domain detail (competencies + pro moves)
```
