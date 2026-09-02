# Mobile Redesign — master ticket breakdown

**Status:** draft, awaiting John's approval
**Lane:** cross-cutting (this is the decomposition; each ticket carries its own lane)
**Source of truth:** `docs/features/mobile-redesign-skeleton.md` (v1, 2026-08-20).
**Supporting:** `docs/features/mobile-design-principles.md` (P1–P8, per-surface
layout), `docs/features/pwa-push-notifications.md` (infra, now scoped down),
`docs/features/explore-page-plan.md` (Explore pillars).

This doc is the ticket list. Three foundational tickets have full specs
alongside it (`mob-1-*`, `mob-2-*`, `mob-3-*`); the rest are at breakdown level
here and get full specs once the foundation is agreed and built.

## The thesis every ticket serves

Pro Moves has been an **input** surface — staff put honest data in and the value
came back out through meeting facilitators, not the app. This redesign makes the
app itself deliver value to the staff member: **mirror out, tool in.** Every
surface that shows a staff member their own data must hand them something in the
same view. Acceptance criteria across these tickets are written to that standard,
not to "the screen renders."

Timing: the whole mobile shell is still gated to one test user
(`staff.pwa_enabled`, plus the `pwa_v1` dev flag), so the IA has zero
re-learning cost to change right now. That is why the foundation goes first.

## Grounding facts (verified in the repo, 2026-08-20)

- Mobile shell gate: `useMobileShell()` = mobile viewport (`useIsMobile`) AND
  PWA-flagged (`isPwaActive`). Everything below is confined to that branch;
  desktop and non-flagged users are untouched.
- Tabs today: `src/components/mobile/MobileTabBar.tsx` renders four —
  Home · Explore (`/my-role`) · Performance (`/performance`) · More (`/more`).
  `ownerTabFor()` maps nested routes to a tab.
- Home: `src/pages/Index.tsx` (`isMobileShell` branch) + `ThisWeekPanel.tsx`
  (`MobileMovesAndBanner`). `CurrentFocusCard.tsx` already resolves the focus move.
- Performance: `src/pages/performance/PerformancePage.tsx` (focus hero →
  coach-vs-self calibration table → `ConfidenceCard` with a client-side
  "Moves you're still building" list → `OnTimeRateWidget`). **No persisted
  "flagged" concept and no lifecycle/clear action exist** — "still building" is
  just a `confidence_score <= 2` filter over the window.
- Explore: `src/pages/my-role/*` (`MyRoleLayout`, `CraftAtlasOverview`,
  `CraftAtlasArea`, `DomainDetail`, `PracticeLog`). Graded tiles via
  `levelForScore()`; resources via `ProMoveDrawer` (`pro_move_resources` types
  script/audio/video/link, audio from the `pro-move-audio` storage bucket).
  **No "Alcan Way" code exists anywhere — it is net-new holding space.**
- Rituals: `ConfidenceWizard.tsx` and `PerformanceWizard.tsx` are ~1200-line
  **copy-paste siblings**, not a shared shell. Check-out reuses check-in's
  structure and copy. Both use `useReliableSubmission` + localStorage.
- Glow intake: `src/pages/coach/EvaluationCapture.tsx` ("Polish into glow &
  grow"). **Glow is optional** — only Score is required. Saves via
  `saveCaptureItem()` → direct `evaluation_items.update` (no RPC).
  `evaluation_items.observer_glow` / `observer_grow` are plain nullable text; a
  glow's only source attribution is the parent `evaluations.evaluator_id`.
  **There is no per-item source column** — extensibility is a schema question.
- EvaluationViewer: `src/pages/EvaluationViewer.tsx` uses a fixed
  `grid-cols-12` (7/2/3) with **no responsive breakpoints** — it crushes on a
  phone.
- PWA build: `vite.config.ts` uses `VitePWA` with the default **`generateSW`**
  (Workbox, app-shell-only). No custom service worker file; no push handler.
- BackPill (`src/components/mobile/BackPill.tsx`) defaults to `navigate(-1)` —
  the cold-start dead-end this plan fixes.

---

## Wave 0 — Foundation (full specs written)

Everything downstream hangs on the tab structure, the persistent install path,
and the ranked-feed Home container. These three go first and can run in
parallel, though MOB-2's persistent entry point is cleanest once MOB-1's avatar
menu exists.

### MOB-1 — IA restructure to three tabs + role-aware header avatar menu  → `mob-1-ia-three-tabs-avatar-menu.md`
Collapse the tab bar from four to three (Home · Explore · Performance) and move
the "More" contents behind a top-right **header avatar menu**. Critically, make
that menu **role-aware**: a flagged non-participant (coach / office manager /
admin) on mobile currently has no path to their management routes — the tab bar
is participant-only and `MorePage` carries no management rows. The menu must
surface exactly the destinations the user's role already grants, reusing the
authoritative `navigation` derivation in `Layout.tsx` (no second role map).
Cross-cutting; the confirmed review gap closes here. **Depends on:** nothing.

### MOB-2 — Persistent self-serve "Install the app" affordance  → `mob-2-persistent-install-affordance.md`
Replace the dropped install/subscribe/ack tracking funnel and the
`staff_devices` telemetry (never actually built) with a small, always-reachable,
telemetry-free install affordance for non-standalone users, disappearing once
standalone. Mechanically a reframe of `InstallBanner.tsx` from a
dismiss-and-re-nag banner into persistent, self-serve help (best home: a menu
row in MOB-1). Keeps the delete-old-icon and iOS-Safari-only copy and the
shared-device opt-out. **Depends on:** MOB-1 (soft).

### MOB-3 — Home value reframe (feed that gives before it asks)  → `mob-3-home-value-reframe.md`
Turn Home from a status board into a ranked feed that hands the staff member
value: add a script/30-second-listen value card pulled from the focus move
(`staff_quarter_focus` → `pro_move_resources`, reusing the existing drawers),
hide raw self-scores on the public glance behind a tap (color/status stays),
rewrite the "marked late" line in the coaching voice naming the audience (P8),
and codify Home as a ranked feed with the ritual hero pinned first so recognition
and comms cards can join later by rank. **Depends on:** nothing; establishes the
card budget and feed slot MOB-5 fills.

---

## Wave 1 — Recognition spine (intake before surfacing)

The single highest-value change in the redesign, and a strict two-step: you
cannot surface glows before they exist. Recognition is starved at intake (9
glows vs 125 grows across 864 items; zero glows since June), so the intake fix
must land before the Home/Performance surfacing, or the surfaces read as broken.

### MOB-4 — Recognition intake: make a glow expected at eval capture, source-extensible
Today glow is optional in `EvaluationCapture.tsx` (only Score is required) and is
coerced to `null` when empty. John's decision (2026-08-20): make a glow
**expected at eval capture** so the positive channel actually gets fed. Change
the capture flow to expect a glow **per competency** (John, 2026-08-20 —
resolved: per-competency, not per-eval; that granularity is what lets MOB-5
select a glow by domain), alongside grow, without hard-blocking on the AI split.
**Add a glow-source field now** (John, 2026-08-20 — resolved): today a glow's
only attribution is the parent `evaluations.evaluator_id` and there is no
per-item source column, so add a source field so a glow records *who* gave it
(evaluator now; regional/office managers and Lead RDAs later). Keep it loose —
future glows may not come from eval capture at all, so the field must not assume
an evaluator. Do not build the multi-source *flows* now; just add the field so
nothing is re-modeled later. **Depends on:** nothing. **DB:** capture-flow change
+ a glow-source column (decided). **Lane:** cross-cutting (capture + schema).

### MOB-5 — Home recognition card + generic-encouragement fallback, and Performance glow history
Surface glows to the staff member: a recognition card on Home ("Ariyana noticed
your hand-off with the Nguyen family") and a glow history on Performance. Per
John (2026-08-20), the Home card **always has something warm** — when a real
glow exists it shows that; when none exists yet it shows generic encouragement
rather than sitting empty, so the surface never reads as broken during the intake
ramp. Reads `evaluation_items.observer_glow` (surfaced today only inside the
review components, not on Home). **Surface only one glow, chosen well (John,
2026-08-20):** the Home card features the single glow in the staff member's
**lowest-confidence domain** (recognition where they feel weakest), not a stack
of every glow — competency → domain gives the handle, and MOB-4's per-competency
capture makes it possible. Fallback order: glow in a low-confidence area →
any recent glow → generic encouragement. Slots into the MOB-3 ranked feed by
rank. **Depends on:** MOB-4 (real glows + per-competency source) and MOB-3 (the
feed slot + card budget). **Lane:** medium.

---

## Wave 2 — Surface reframes (each existing tab earns its place)

These make Explore and Performance worth opening and give check-out its own
ritual. They depend on the foundation (tab structure) and, for Performance, on
the recognition spine.

### MOB-6 — Explore reframe: lead with tools, de-emphasize graded squares
Flip Explore from a report card wearing a library's name into "what to actually
say." Lead with the scripts and audio (`pro_move_resources` via `ProMoveDrawer`)
— the most valuable and most buried asset — instead of opening on the graded
`levelForScore` tiles in `CraftAtlasOverview`. De-emphasize the graded squares
(grading belongs to Performance). **The Alcan Way is holding-space only** — no
such code exists today; the segment stays hidden until its module is built (E3
in `explore-page-plan.md`), so this ticket does not build it, only notes and
reserves it. **Depends on:** MOB-1 (tab identity). **Lane:** medium.

### MOB-7 — Performance reframe: growth tool, with an "I've grown here" lifecycle
Give flagged / "still building" items a lifecycle. Today a low confidence score
sits amber on Performance with a quarter-long half-life and no way to clear it,
so the rational response is to stop being honest — and there is **no persisted
flag at all**, just a `confidence_score <= 2` filter in `ConfidenceCard`. Add a
one-tap "I've grown here" that clears the item from the "still building" list and
is logged as a **positive** signal to the coach (a new persisted concept — this
needs a small data model for the cleared/grown state, since none exists). Lead
the page with the focus move + coach's next step + a learning resource. Fold in
the recognition glow history (MOB-5). **Keep the coach-vs-self comparison (John,
2026-08-20 — resolved):** it stays on Performance as a self-awareness check, but
**reframe the display to be neutral and two-directional** — a staff member may
rate themselves lower than their coach as often as higher, and both are useful
signal — Coach and Self side by side as information, not an "overconfident"
callout (no amber/red gap styling). Performance
only earns its tab if the recognition work lands — hence its dependency.
**Depends on:** MOB-4/MOB-5 (recognition), MOB-1. **DB:** a "grown here" state.
**Lane:** cross-cutting.

### MOB-8 — Check-out as its own ritual
Check-out is the documented leak (25–30% lower completion) and the shipped code
never designed it — `PerformanceWizard.tsx` is a copy-paste sibling of
`ConfidenceWizard.tsx`, reusing its structure and copy. Give check-out its own
question framing and its own completion moment, one step easier than check-in,
and close the loop with value on completion (surface a resource for the move
just rated lowest). The two wizards being physically separate files means this
is real design work per surface, not a config flag. Whether the leak is
individual or per-location is an open data question (skeleton §5) that changes
who reminders target but not this "make check-out its own easy ritual" work.
**Depends on:** MOB-3 (value-card / resource-drawer patterns reused). **Lane:**
medium.

---

## Wave 3 — Delivery capability + confirmed review fixes

Independent of the value work; can run in parallel with Waves 1–2. Grouped last
because none of them block the value reframe.

### MOB-9 — PWA notification-DELIVERY-CAPABILITY only (injectManifest + stub handler)
Migrate the service worker from `vite-plugin-pwa`'s **`generateSW`** to
**`injectManifest`** with a custom SW file carrying a **stub `push` and
`notificationclick` handler**, so push *can* be delivered later. That is the
entire scope: **no subscription flow, no `push_subscriptions` /
`notification_log` tables, no `send-push` function, no VAPID keys, no launch
funnel** — all deferred per skeleton §6. The SW must preserve the current
app-shell-only, network-first, no-runtime-caching behavior and the existing
update-toast reload path (`registerPwaServiceWorker` / `applyPendingUpdate` in
`src/lib/pwa.ts`) so nothing regresses for the flagged user. **Depends on:**
nothing; must not regress MOB-2's install path. **Lane:** cross-cutting (build
config + SW).

### MOB-10 — EvaluationViewer mobile layout fix
`src/pages/EvaluationViewer.tsx` lays its competency tables out on a fixed
`grid-cols-12` (7/2/3 for name/observer/self) with no responsive breakpoints
(lines ~493, ~502, ~526), so on a phone the columns crush together. Add a
stacked / breakpoint-gated layout for narrow screens (the file already has a
`isBaseline` data-mode variant to model the pattern, but no viewport variant).
Confirmed review fix. **Depends on:** nothing. **Lane:** medium (bug-adjacent).

### MOB-11 — Cold-start deep-link back paths fall back to the owning tab root
`BackPill` defaults to `navigate(-1)`. On a cold start (a push deep-link, a fresh
launch, a refresh mid-session) there is no history entry to go back to, so
`navigate(-1)` dead-ends — and standalone iOS has no browser back button (PWA doc
B3). Fall back to the owning tab root (via `ownerTabFor`) when there is no
in-app history to pop. Confirmed review fix; pairs naturally with MOB-1 since it
reuses `ownerTabFor`. **Depends on:** MOB-1 (`ownerTabFor` shape). **Lane:**
medium.

---

## Sequencing rationale

1. **Foundation before value (Wave 0 first).** The tab structure is the one
   thing with a re-learning cost across every phone, and the single-user gate
   makes now the free moment to set it (skeleton §0). Home's ranked-feed
   container (MOB-3) has to exist before the recognition card (MOB-5) has a slot,
   and the avatar menu (MOB-1) is where both the management routes and the
   persistent install affordance (MOB-2) live. So all three foundation tickets
   are prerequisites for later waves even though they can be built in parallel.
2. **Intake before surfacing (Wave 1 ordering is strict).** MOB-5 cannot precede
   MOB-4 — surfacing glows that do not exist produces an empty or fake surface.
   The generic-encouragement fallback softens the ramp but does not remove the
   dependency.
3. **Performance waits on recognition.** MOB-7's tab only earns its place if the
   recognition work lands (skeleton §3, Performance) and its glow history is part
   of MOB-5, so Wave 2's Performance ticket sits after Wave 1.
4. **Review fixes and delivery capability float (Wave 3).** MOB-9/10/11 touch
   disjoint code (build config, one viewer, one back-path helper) and block
   nothing, so they parallelize with the value work. MOB-11 is grouped after
   MOB-1 only because it reuses `ownerTabFor`.
5. **Check-out (MOB-8) after MOB-3** so it can reuse the value-card / resource-
   drawer pattern when it closes the loop on completion.

## Explicitly deferred (scope stays honest — skeleton §6, §2)

- **The actual push notifications** — subscription flow, `push_subscriptions` /
  `notification_log` tables, `send-push` sender, VAPID keys, reminder policy, and
  the launch verification funnel. MOB-9 makes the build *capable* of delivery and
  nothing more.
- **The Ask chatbot** (the reserved 5th tab) — holding space only.
- **The Comms / Basecamp-replacement tab** (the reserved 4th tab) — holding space
  only; coach notes/threads land there when it is built.
- **Deputy schedule integration** — holding space (a future Home card), not built.
- **The Alcan Way build** — no code exists; the Explore segment stays hidden
  until its module ships (MOB-6 reserves it, does not build it).
- **The lead nudge action** — waits for the comms/notification layer; MOB-era
  lead work is limited to reordering the staff-detail page and disclosure copy
  (not specced here; skeleton §3 "Lead Team surface").
- **The staff-research gate** — the light staff pass (skeleton §5) is a gate
  before *org-wide* rollout, not before this build; the single-user test does not
  wait on it.

## Resolved (John, 2026-08-20)

- **Recognition-source (MOB-4)** — add a glow-source field now, kept loose
  (evaluator today, extensible; must not assume an evaluator).
- **Glow granularity (MOB-4)** — per competency, so MOB-5 can select by domain.
- **Glow surfacing (MOB-5)** — feature one glow, the one in the lowest-confidence
  domain; no clutter.
- **Coach-vs-self comparison (MOB-7)** — keep it as a self-awareness check;
  reframe the display neutral and two-directional, not an "overconfident" callout.

## Open questions still carried into the tickets

1. **Desktop participants** — a participant on a desktop browser still gets the
   old sidebar; this plan does not change that (skeleton §4;
   `mobile-design-principles.md` Q4). Confirm that is acceptable for now.
2. **Staff-research gate (MOB-rollout)** — run the light staff pass before
   org-wide rollout, or proceed on the founder + data basis? (Skeleton decisions
   log #5, still open.)
