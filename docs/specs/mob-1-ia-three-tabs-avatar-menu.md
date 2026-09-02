# Spec: MOB-1, IA restructure to three tabs + role-aware header avatar menu

**Status:** draft, awaiting John's approval
**Lane:** cross-cutting (touches mobile IA + role gating; foundational wave)
**Ticket:** MOB-1 (Motion, MyProMoves Dev Board)
**Branch:** feature/mob-1-ia-three-tabs
**Spec:** this file
**DB change:** none
**Personas to test as:** participant, lead, admin(desktop, unaffected), and a **flagged non-participant on mobile** (coach / office manager / admin) — the review gap this ticket closes
**Depends on:** nothing (the foundation the rest of the redesign hangs on)

## What and why

The mobile shell ships four tabs today — **Home · Explore · Performance · More**
(`src/components/mobile/MobileTabBar.tsx`, the `TABS` array). The skeleton
(`docs/features/mobile-redesign-skeleton.md` §1, decisions log #1) collapses
that to **three content tabs — Home · Explore · Performance** — and moves the
"More" contents (profile, settings, sign out, the lead Team entry) behind a
**header avatar menu** in the top-right. Three real tabs is more honest than
four where one is a junk drawer, and it reserves the 4th/5th tab slots for the
future Comms and Ask tabs (§2) without a reshuffle. The whole shell is still
gated to one test user, so this is the zero-re-learning-cost moment to fix the
structure before 68 people learn it (§0 timing note).

**The confirmed review gap this ticket must close:** the mobile shell is a
participant/lead surface, but the PWA flag (`staff.pwa_enabled`) can be set on
*anyone*. A flagged non-participant — a coach, office manager, or admin — who
opens the app on a phone gets the mobile shell, whose tab bar only offers the
three participant surfaces, and today's `MorePage`
(`src/pages/mobile/MorePage.tsx`) offers only participant/lead rows (My
evaluations, Practice log, Profile, Sign out, and a lead-only Team row). It
carries **no management routes at all**. So a flagged coach/admin on mobile is
stranded: `Index.tsx` renders `RegionalDashboard` for them at Home (line 46),
but there is no navigation to `/coach`, `/facilitate`, `/admin`, `/dashboard`,
`/builder`, or `/admin/evaluations`. The avatar menu must be **role-aware** and
surface exactly the management destinations that user's role already grants on
desktop.

## Scope

**In:**
- Reduce `MobileTabBar` from four tabs to three (drop the `more` tab).
- Add a header avatar (top-right) in the mobile-shell branch of
  `src/components/Layout.tsx` that opens a menu.
- The menu carries the current `MorePage` rows (Profile, Sign out, My
  evaluations, Practice log, and the lead-gated Team entry) **plus** a
  role-aware management section for flagged non-participants.
- Fix `ownerTabFor()` so nested/secondary routes still highlight a surviving
  tab (nothing may map to the now-gone `more`).
- Keep `/more` reachable as a plain route (deep-link/back-path fallback), but
  not as a tab — per the skeleton's "utility More/Me tab is the fallback if the
  avatar menu tests as too hidden."

**Out:**
- The value reframes of Home / Explore / Performance (MOB-3, MOB-6, MOB-7).
- Any Comms or Ask tab (holding space only, §2).
- Desktop participant shell behavior (still an open question — see below).
- Notification history / inbox rows (no backing feature; `MorePage` already
  omits them deliberately).

## Approach (grounded in the real files)

1. **`src/components/mobile/MobileTabBar.tsx`** — remove the `more` entry from
   `TABS` (leaving `home` → `/`, `my-role` → `/my-role` labeled "Explore",
   `performance` → `/performance`). Drop `'more'` from the `TabKey` union and
   from `ownerTabFor()`. Reassign the routes that currently resolve to `more`:
   - `/profile` currently returns `'more'`; the profile lives in the avatar
     menu now, so it should highlight no tab (return `null`) or stay owned by
     Home — recommend `null` (it is a menu destination, not a tab surface).
   - `/more` (if still reached via the fallback route) → `null` likewise.
   - Everything else in `ownerTabFor` is unaffected: `/my-role/evaluations`,
     `/my-role/practice-log`, and `/evaluation/*` already resolve to
     `'performance'`; `/team`, `/confidence`, `/survey`, and the check-out
     wizard already resolve to `'home'`.

2. **`src/components/Layout.tsx`, mobile-shell branch (lines 248–276)** — the
   header today is just the Alcan mark + "Pro Moves" wordmark. Add a trailing
   avatar button (the header is already a `flex justify-between`, so the avatar
   takes the right slot). Use the existing shadcn primitives already in the repo
   (`src/components/ui/avatar.tsx`, `dropdown-menu.tsx`, and/or `sheet.tsx`). A
   bottom **`Sheet`** is the more thumb-reachable pattern on a phone than a
   top-anchored dropdown; recommend a `Sheet` opened from the avatar, rendering
   the menu rows. Show the staff member's initials/photo via `staffProfile`
   (already loaded in `Layout` through `useStaffProfile`).

3. **The menu contents** — reuse `MorePage`'s existing rows as the participant
   base (Profile, Sign out, My evaluations, Practice log; lead-gated Team with
   its `useTeamRowSub` count). The cleanest implementation extracts the row list
   into a shared component the avatar menu renders, and keeps the `/more` route
   pointing at the same content for the fallback. Do **not** duplicate the rows
   in two places that can drift.

4. **The role-aware management section (the gap fix)** — `Layout.tsx` already
   computes the authoritative role-gated destination list in its `navigation`
   array (lines 137–204), derived entirely from `useUserRole()` flags
   (`isSuperAdmin`, `isOrgAdmin`, `isCoach`, `isRegional`, `isOfficeManager`,
   `isClinicalDirector`, `isDoctor`, `canManageUsers`, `canManageLibrary`,
   `canManageAssignments`, `canReviewEvals`, plus the derived `showCoachTabs` /
   `showFacilitate` / `showAdminTab` / `showEvaluationsTab`). The avatar menu
   should render a **management section built from that same derivation** (Coach,
   Facilitate, Command Center, Training, Builder, Admin, Evaluations, Clinical,
   Doctor, My Location) so a flagged non-participant reaches every route their
   role already permits. Reuse the existing logic — do not invent a second,
   divergent role map (the split-brain-permissions trap noted in the domain-model
   memory). The management section renders only when at least one management
   destination is permitted, so a plain participant/lead never sees an empty
   section.

5. **`App.tsx`** — the `/more` route (`MorePage`, line 157) stays as the fallback
   destination; only its tab-bar entry is removed. No route deletions.

## Acceptance criteria (behavioral, testable)

1. As the participant test user on the flagged mobile shell, the bottom tab bar
   shows exactly three tabs — Home, Explore, Performance — with no "More" tab.
2. Tapping the header avatar opens a menu containing Profile, My evaluations,
   Practice log, and Sign out; as a **lead**, it also shows the Team row with
   its "{location} · N teammates" subtitle. Each row navigates to the same
   destination `MorePage` reaches today.
3. As a **flagged coach / office manager / admin on mobile**, the avatar menu
   shows a management section linking to exactly the routes that user's role
   grants on desktop (e.g. a coach sees Coach; an org admin sees Command Center,
   Admin, Evaluations, Builder as applicable), and every link lands on a working
   surface — no dead ends. A plain participant sees **no** management section.
4. Navigating into `/my-role/evaluations`, `/my-role/practice-log`, or
   `/evaluation/:id` highlights the **Performance** tab; `/team`, the check-in
   and check-out wizards, and `/survey/:id` highlight **Home**; `/profile`
   highlights no tab (it is a menu destination). No route highlights a
   nonexistent "More" tab.
5. Desktop (non-mobile-shell) users are byte-unaffected: the sidebar `navigation`
   and desktop header still render exactly as before.
6. The management links in the avatar menu and the desktop sidebar are driven by
   the same role derivation — flipping a role flag changes both consistently
   (verify by masquerade or a role change; `useRoleRefresh` already repaints).

## Files touched

- `src/components/mobile/MobileTabBar.tsx` — drop `more` tab; update `TabKey`
  and `ownerTabFor`.
- `src/components/Layout.tsx` — add the avatar + menu to the mobile-shell header;
  wire the role-aware management section from the existing `navigation`
  derivation.
- `src/pages/mobile/MorePage.tsx` — extract its rows into a shared menu component
  (or keep as the `/more` fallback rendering that shared component).
- Possibly a new `src/components/mobile/AvatarMenu.tsx` (or similar) holding the
  menu rows + management section.
- `src/App.tsx` — no route change beyond confirming `/more` stays as fallback.

## Risks / blast radius

- **Role-map drift is the real risk.** If the avatar menu re-derives management
  links independently instead of reusing `Layout`'s `navigation` logic, the two
  can disagree (exactly the bug the file's own comment on lines 32–36 warns
  about, where the sidebar once read legacy flags while guards read
  `useUserRole`). Mitigation: single derivation, shared by both.
- **Blast radius is confined to the mobile-shell branch** (`useMobileShell()` =
  mobile viewport + PWA flag). Desktop and non-flagged mobile users never enter
  this code path. The change cannot affect the 67 non-flagged staff.
- Removing the `more` tab while leaving `/more` routable means a stale deep link
  or back-path still resolves; confirm it does not highlight a missing tab
  (covered by AC 4).

## Open questions for John

1. **Desktop participants (still open in both source docs — skeleton §4 implies
   it, `mobile-design-principles.md` open question 4).** A participant who opens
   the app on a desktop browser today gets the old sidebar (they are not in the
   mobile shell). This ticket does not change that. Confirm that is acceptable
   for now, or whether desktop participants should get a scaled-up version of
   the new shell later (out of scope here either way).
2. **Menu affordance:** a bottom `Sheet` (thumb-reachable, recommended) vs a
   top-right `DropdownMenu` (more conventional for an avatar). Preference?
3. **Which management destinations belong on a phone at all.** The gap fix gives
   a flagged non-participant *access*, but several management surfaces are Tier 2
   / desktop-intended (`pwa-push-notifications.md` §C). Recommend the menu links
   still point at them (better a working desktop-shaped page than a dead end),
   but confirm you do not want any of them deliberately hidden on mobile.
