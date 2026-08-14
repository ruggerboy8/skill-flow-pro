# Mobile Shell Adjustments, Round 3

**Status:** v1, 2026-08-13. Executor spec, from John's second on-device
test. The **Ground rules** of `docs/features/mobile-build-instructions.md`
apply unchanged. Four items; do not expand beyond them.

## 1. Blank duplicate competencies in the domain drill

**Symptom (lead accounts):** each competency appears twice in
`/my-role/domain/:slug`; one copy is blank, one has the Pro Moves.
**Root cause (verified against live data):** `useDomainDetail.ts`
deliberately merges competencies from the staff member's base role AND
the lead role (`useLeadRoleId`) for leads. The Lead Dental Assistant
role (role_id 11) still carries 16 competencies but only **1** active
Pro Move (leftovers from the retired lead panel), so its competencies
render as empty near-duplicates of the base role's.

**Fix:** in `src/hooks/useDomainDetail.ts`, after assembling
`competencies[].proMoves`, drop any competency whose `proMoves` array is
empty (filter at the hook level so counts and averages stay consistent).
This is not mobile-gated; it fixes the same blank rows on desktop. Keep
the lead-role merge itself — the one lead competency that still has an
active move must continue to appear. Add a one-line comment naming the
lead-role data situation so the filter isn't "simplified" away later.

## 2. My Role sub-tabs on mobile: overview only

**Symptom:** the My Role tab still shows the Practice log and
Evaluations sub-tabs, though both surfaces moved to the Performance tab.

**Fix:** in `src/pages/my-role/MyRoleLayout.tsx`, when `useMobileShell()`
is true, render NO internal tab strip — the My Role tab is the overview
(RoleRadar) only. The routes `/my-role/practice-log` and
`/my-role/evaluations` stay registered and functional (they are reached
from Performance's "All weeks", Performance's "All evaluations", and
More), but on mobile shell they render with a `BackPill` (existing
component, `src/components/mobile/BackPill.tsx`) targeting
`/performance`, labeled "Performance", in place of the tab strip.
Desktop keeps today's tabs untouched.

## 3. Tab ownership for practice log

**Symptom:** tapping "All weeks" on Performance opens the practice log
with the **My Role** tab highlighted.

**Fix:** in `ownerTabFor()` (`src/components/mobile/MobileTabBar.tsx`),
add `/my-role/practice-log` to the Performance-owned exceptions, next to
the existing `/my-role/evaluations` case. Update the comment.

## 4. Mobile route sweep (verify, fix only the small stuff)

John's meta-observation: some routes still assume the old shell. Walk
every route reachable inside the mobile shell and check three things:
(a) no leftover desktop chrome (sub-tab strips, sidebar remnants,
breadcrumbs) renders when `useMobileShell()` is true;
(b) every non-tab-root screen has a `BackPill` (or an equivalent close
affordance for sheets/drawers);
(c) `ownerTabFor()` returns the right tab for it.
Routes to walk: `/`, `/more`, `/performance`, `/my-role`,
`/my-role/domain/:slug`, `/my-role/practice-log`,
`/my-role/evaluations`, `/evaluation/:evalId`, `/team`,
`/team/:staffId`, `/profile`, `/survey/:id`, `/confidence/current/step/1`,
`/performance/current/step/1`.
Fix only gaps of types (b) and (c) — one-line BackPill additions and
ownership-map entries. Anything of type (a) beyond items 1-3, or
anything structural, goes in the report as a finding, not a fix.

## Operational rules (same as prior rounds)

One local commit per item, prefixed "Mobile shell fix: ". `npm run build`
green after each. NEVER push; never run supabase commands or touch any
database. Final report: per-item commits, the route-sweep findings table
(route → checks a/b/c → fixed or flagged), anything unverifiable.
