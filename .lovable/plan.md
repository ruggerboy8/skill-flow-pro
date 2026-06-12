
## Goal

The Pro Move Library currently appears in two places for org admins, both rendering the same `OrgProMoveLibraryTab` component:

- `/admin?tab=pro-moves` — Admin page tab
- `/builder` — last tab on the Admin Builder page

Per your call, keep it only under **Builder** (it's adjacent to the per-role planner tabs, which is where authoring custom moves is most useful).

## Changes

1. **`src/pages/AdminPage.tsx`**
   - Remove the `"pro-moves"` tab definition (and the `OrgProMoveLibraryTab` import).
   - If the default landing tab was `pro-moves`, fall back to the first remaining tab.

2. **`src/App.tsx`**
   - Add a redirect so any existing `/admin?tab=pro-moves` deep link bounces to `/builder` with the Library tab selected. Implementation: a small effect on AdminPage that detects `?tab=pro-moves` and `navigate('/builder?tab=library', { replace: true })`. (No router-level change needed.)

3. **`src/pages/AdminBuilder.tsx`**
   - Read `?tab=` from the URL so deep links can land on `library` directly. Keep the existing default behavior (first role tab) when no `?tab=` is present.

4. **Sidebar / navigation (`src/components/Layout.tsx` and anywhere "Pro Moves" is linked from Admin)**
   - Audit for direct links to `/admin?tab=pro-moves`. Update them to `/builder?tab=library`. (No new nav entry — Builder is already in the sidebar.)

## Out of scope

- Platform Console → Pro Moves tab (super-admin global catalog) stays as-is.
- Doctor / Clinical pro move library (`/clinical/pro-moves`) is a separate audience — untouched.
- No database, RLS, or component-internal changes. `OrgProMoveLibraryTab` itself is unchanged.

## Verification

- As an org admin: `/admin` no longer shows a "Pro Moves" tab; Builder still shows it as the last tab and "New Custom Move" works.
- Old link `/admin?tab=pro-moves` redirects to `/builder?tab=library`.
- Super admin's Platform Console "Pro Moves" tab is unaffected.
