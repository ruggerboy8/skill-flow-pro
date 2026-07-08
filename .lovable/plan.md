
## What Alex is experiencing

When she's mid-flow in the Clinical portal (editing a Pro Move, composing an agenda, viewing a doctor's thread) and briefly flips to her email tab to copy something, coming back "resets" the page — collapsed sections re-collapse, filters snap back to All, the doctor she was on stays but the sub-panel she'd expanded closes, and any half-open edit form is gone.

Root cause: all of that UI state lives in local `useState` inside the page/component and nothing writes it to the URL or sessionStorage. As soon as anything remounts the tree (auth re-check on window focus, React Query refetches, a Sheet closing, a navigation back-and-forth), the defaults win. On top of that, back/forward navigation between Clinical → DoctorDetail → Clinical currently loses all filters and scroll position.

## Goal

Make the Clinical section (and its neighbors) "sticky": whatever you had selected, expanded, or opened stays that way when you tab away and come back, refresh, or navigate back from a detail page.

## Scope (Clinical + directly connected surfaces)

Pages/components whose state resets today and will become persistent:

1. **`src/pages/clinical/DoctorManagement.tsx`** — status filter (`all | invited | active | inactive`).
2. **`src/pages/clinical/DoctorProMoveLibrary.tsx`** — `selectedDomain`, `selectedCompetency`, `searchTerm`, `showActiveOnly`, `editingProMove` (open edit sheet), `showAddForm`, `selectedProMoveId`.
3. **`src/pages/clinical/DoctorDetail.tsx`** — `assessmentsOpen`, `expandedAssessment` (which results sheet is open), `showCoachWizard`.
4. **`src/components/clinical/DoctorDetailThread.tsx`** — `expandedId` (which coaching session card is expanded), `prepSessionId`, `inviteSessionId`, `captureSessionId` (which composer/drawer is active).
5. **Scroll position** — restore vertical scroll on DoctorManagement and DoctorProMoveLibrary when navigating back from a detail page.

Out of scope: no business-logic changes, no query changes, no DB changes. Same components, same features — just remembered state.

## Approach

### 1. New utility: `useUrlState`

Add `src/hooks/useUrlState.ts` — a thin wrapper over `react-router-dom`'s `useSearchParams` that behaves like `useState` but writes the value to a URL query param (with `replace: true` so it doesn't pollute browser history). Signature:

```ts
useUrlState<T extends string>(key: string, defaultValue: T): [T, (v: T) => void]
useUrlState<T>(key: string, defaultValue: T, opts: { serialize, parse }): [T, (v: T) => void]
```

Why URL over sessionStorage as the primary store:
- Survives tab-away/return (the URL is still there).
- Survives back/forward — the browser restores the exact query string.
- Shareable/deep-linkable (Alex can send a coworker the URL of a filtered library view).
- No stale-state risk across different doctors — each `staffId` route has its own URL.

### 2. New utility: `useSessionState`

Add `src/hooks/useSessionState.ts` for state that shouldn't live in the URL (large blobs, non-shareable UI toggles like `assessmentsOpen`). Backed by `sessionStorage` with a namespaced key so it's per-tab and clears on tab close. Same `useState`-shaped API.

### 3. Scroll restoration

Add `src/components/ScrollRestoration.tsx`: on route change, records `window.scrollY` for the outgoing path in `sessionStorage`; on mount for a path with a saved value, restores it after the first paint. Mount it once inside the Clinical layout so it only affects that section (avoids surprising behavior elsewhere).

### 4. Wire the pages

- **DoctorManagement**: `filter` → `useUrlState('status', 'all')`.
- **DoctorProMoveLibrary**: convert `selectedDomain`, `selectedCompetency`, `searchTerm`, `showActiveOnly` to `useUrlState` (`domain`, `competency`, `q`, `activeOnly`). Convert `editingProMove` / `showAddForm` / `selectedProMoveId` to `useUrlState('edit', ...)` / `?new=1` / `?view=<id>` — the drawer reopens after tab-return or refresh. `editingProMove`'s full object is re-fetched from `proMoves` by ID rather than serialized.
- **DoctorDetail**: `assessmentsOpen` → `useSessionState` (per-doctor key). `expandedAssessment` → `useUrlState('sheet', null)`. `showCoachWizard` → `useUrlState('wizard', '0')`.
- **DoctorDetailThread**: `expandedId` → `useUrlState('session', null)`. `prepSessionId` / `inviteSessionId` / `captureSessionId` → `useUrlState('action', null)` + `?actionSession=<id>` (single active composer at a time; already the case in the UI).
- **Clinical layout**: mount `<ScrollRestoration scopeKey="clinical" />`.

### 5. Safety net: prevent unnecessary remounts on window refocus

Audit `useAuth`'s `onAuthStateChange`. It already skips `TOKEN_REFRESHED`; also short-circuit `SIGNED_IN` when `session.user.id` matches the currently loaded user so returning to the tab does not re-run `checkUserStatus` and cascade a re-render that closes non-persisted UI in other parts of the app. This is a small hardening step so persistence isn't fighting an unnecessary reset.

## Technical details

- Query param encoding: booleans as `'1'`/`'0'`, `null` as absent key, strings as-is (URL-encoded by `URLSearchParams`).
- All URL writes use `setSearchParams(next, { replace: true })` so the browser back button still takes Alex back to the previous page, not through each filter change.
- `useUrlState` reads once per render from `useSearchParams()`, so multiple hooks on the same page stay in sync automatically.
- Session-storage keys are namespaced: `clinical:<path>:<key>` to avoid collisions.
- Scroll restoration uses `requestAnimationFrame` after data has loaded (guarded by a `data-ready` sentinel on the list container) so we don't scroll before the list has rendered.

## Files touched

- Add: `src/hooks/useUrlState.ts`, `src/hooks/useSessionState.ts`, `src/components/ScrollRestoration.tsx`
- Edit: `src/pages/clinical/ClinicalLayout.tsx`, `src/pages/clinical/DoctorManagement.tsx`, `src/pages/clinical/DoctorProMoveLibrary.tsx`, `src/pages/clinical/DoctorDetail.tsx`, `src/components/clinical/DoctorDetailThread.tsx`, `src/hooks/useAuth.tsx` (SIGNED_IN dedupe only)

## Verification

- Open a doctor → expand a coaching session → switch to another browser tab → return → session is still expanded.
- Filter the doctor Pro Move library by domain + search "prep" → open a Pro Move to edit → refresh the page → same filters, same edit sheet open.
- From DoctorManagement filtered to "Invited", click a doctor, hit back → filter still Invited, scroll position restored.
- URLs remain shareable: pasting a filtered library URL into a new tab lands on the same view.
