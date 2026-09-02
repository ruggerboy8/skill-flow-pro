# Mobile Build Plan (PWA + mobile shell)

**Status:** v1, 2026-08-13. The plan of record for turning the agreed
prototype into shipped product. Sources: `pwa-push-notifications.md`
(infrastructure, rollout, funnel), `mobile-design-principles.md`
(usage model, principles, five addenda of decisions), and the clickable
prototype at `docs/archive/prototypes/mobile-shell-prototype.html`.

**Where things stand.** PWA Phase 1 is built and committed (`ff86312b`):
manifest, app-shell service worker, per-user activation gating via
`staff.pwa_enabled` (live column, Testing Tester flagged), install banner
with delete-your-old-icon instructions, update toast, shared-device
opt-out. Nothing is active for anyone else. The prototype is agreed
through v6.

---

## Sequencing at a glance

| Phase | What ships | Gate to start |
|---|---|---|
| 0 | Test-user validation of what is already built | none, ready now |
| 1 | Mobile shell: tab bar + Home | Phase 0 passes |
| 2 | Ritual polish: check-in/out wizards on mobile | Phase 1 merged |
| 3 | Performance tab | glow/grow pipeline decision |
| 4 | Lead Team surface | Phase 1 merged |
| 5 | Push infrastructure + launch funnel | Phases 1-2 stable |
| 6 | Org-wide rollout | Phase 5 funnel green on pilot |

Phases 3 and 4 are independent of each other and can run in either order.

---

## Phase 0: validate what exists (half a day, no new code)

Publish current `main` through Lovable, then on a real iPhone and a real
Android, signed in as Testing Tester:

1. Delete any existing Pro Moves home-screen icon.
2. Install from the banner; confirm standalone launch, icon, no browser
   chrome.
3. Sign in inside the installed app; confirm the session persists after
   force-quit and across a day.
4. Walk every Tier 1 route (`pwa-push-notifications.md` section C) and
   record what breaks: dead ends, keyboard overlap, export behavior.
5. Confirm the update toast appears after the next Lovable publish.

**Blocking prerequisite:** Testing Tester currently has zero assignments
and zero evaluations, so most surfaces render empty. Give them a real
current-week assignment set and run one evaluation through the real
capture and release flow (do not seed evaluation rows by hand — that is
what produced the hollow-evals incident).

Output: a punch list. Anything found here feeds Phase 1.

## Phase 1: the mobile shell (the core of Track B)

**Scope:** a bottom tab bar and a rebuilt Home for participants and
leads on phones. Desktop keeps the current sidebar layout.

1. **Responsive shell.** In `Layout.tsx`, branch on `useIsMobile()`:
   phones get `<MobileTabBar />` and no sidebar; desktop is untouched.
   Tabs: Home, My Role, Performance, More. Route ownership per the
   prototype's `TAB_OWNER` map. Gate the whole mobile shell behind
   `staff.pwa_enabled` initially so it rolls out on the same lever.
2. **Design tokens.** Add the missing paired `-ink` tokens and
   `--muted-tint` to `src/index.css`, and fix the `.dark` block so
   `-pastel` and `-score-bg` values actually darken (existing production
   bug, see addendum 5). No token renames.
3. **Home rebuild.** One primary card: the week's Pro Moves (capped at 4
   with a "+N more" expander) with the week-state CTA directly beneath,
   using the existing `buildWeekBanner` copy unchanged. Then task cards
   (survey, eval-ready) in their existing trigger order, then win/focus
   cards, then lead cards at the bottom, then the deadline disclaimer.
4. **Safe areas and back affordances.** `env(safe-area-inset-bottom)` on
   the tab bar; every mobile route reachable backward; the existing
   `RouteErrorBoundary` already supplies Reload.
5. **Interaction polish from the design pass:** press states on all rows,
   44px minimum targets, tab crossfade vs drill-down slide.

**Acceptance:** every Tier 1 route walked installed on iOS and Android
with no dead ends; Home renders correctly in all five week states and for
lead and non-lead.

## Phase 2: the ritual on mobile

The wizards already have the right bones; this is polish plus one real
durability fix.

1. **Persistence upgrade:** move in-progress wizard state from
   `sessionStorage` to `localStorage`, scoped by user and week, so a
   check-in interrupted by a patient survives the OS killing the app.
2. **Submission truth state:** surface `useReliableSubmission`'s pending
   state visibly (saving / saved / will retry) on the Next button.
3. **Step polish:** scale buttons as the dominant target with press
   feedback and `aria-label` from the existing tooltip copy; step advance
   fade; hint area fixed height so the button never jumps under a thumb.
4. Keep confetti; it is the peak-end moment of the weekly loop.

## Phase 3: the Performance tab

**Gate: decide the glow/grow pipeline first.** Live coverage is 9
`observer_glow` and 125 `observer_grow` across 864 released items, zero
glows since June. Two options, pick one before building:

- **(a) Intake guarantee (recommended).** Capture requires a glow and a
  grow per staff member before release. Durable, no generation, and it
  improves the evaluation itself.
- **(b) Generate from notes.** 290 items carry `observer_note` (avg 208
  chars) and 25 of 56 evals carry `evaluator_note`; an edge function
  drafts glow/grow for evaluator approval. Backfills history, adds a
  review step and a model dependency.

Then build, in prototype order:

1. **Focus hero** from `staff_quarter_focus` → the chosen move, plus
   "Ariyana's next step" from `observer_grow` on that move's competency
   item (fallback `evaluator_note`, else hide), plus a link to the move's
   resources. No numeric tracking. Handle the no-focus state (42 of 56
   staff today) and the new-hire state.
2. **Evaluation scores** as a domain-level Coach vs Self table labeled
   with the period, plus View full evaluation and All evaluations.
3. **Confidence + still building**, one card, one shared window
   (3w/6w/Quarter), numeric only, chips colored on the score scale.
   Rows link into the move's learning resources.
4. **Participation**, quiet, at the bottom, linking to the existing
   week-by-week history.
5. **All-evaluations list** (`/my-role/evaluations` or `/evaluations`),
   also linked from More.

## Phase 4: the lead Team surface

Reuses Phase 3 components; almost no new data work.

1. **Roster** at `/team`: location summary ("N of M checked in this
   week") and one row per teammate with a single status pill derived
   from the existing submission-status logic. Lead-gated by
   `staff.is_lead`; entry from the Home lead card and a More row.
2. **Staff detail** at `/team/:staffId`: this-week status, Participation,
   Latest evaluation with View full evaluation, then the same
   Confidence + still-building card with the subject switched. No focus
   hero.
3. **Permissions:** leads read only their own location's staff. Verify
   RLS covers this before shipping; do not rely on UI gating alone.

The existing coach dashboard stays untouched for administrators.

## Phase 5: push infrastructure and the launch funnel

Per `pwa-push-notifications.md` sections E and F, unchanged: subscription
and log tables, VAPID keys in edge function secrets, the `send-push`
function with dead-subscription pruning, the notification permission
prompt after login, the three-stage admin funnel (installed → subscribed
→ acked), and the "say hi to Johno" hello push. First real notification
kind: eval released (fully backed today). Check-in reminders come after
the Deputy-gated policy pass.

## Phase 6: rollout

Testing Tester → all locations, flipping `staff.pwa_enabled` per the
funnel. Comms: delete the old icon, install, sign in, allow
notifications. Watch the funnel at huddles.

---

## Decisions still open

1. **Glow/grow pipeline:** intake guarantee or generation. Blocks Phase 3.
2. **Copy:** keep "Moves you're still building" or revert to "What you've
   flagged"; and settle "Pro Moves" vs "ProMoves" across production copy.
3. **Deputy-gated reminder policy** (cadence, and what a ghost week gets).
   Blocks the check-in reminder kind only.
4. **Real app icon art** before org-wide rollout; the current icons are a
   placeholder letter A.
5. **My Role:** the build follows the existing production design made
   mobile-friendly, not the prototype's version. Confirm the drill
   (domain → competency → move → resources) and its transitions.
