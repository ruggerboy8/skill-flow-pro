# Mobile Design Principles (PWA Track B foundation)

**Status:** v0.2, 2026-08-13. v0.1 was the design research pass; John's
first review landed the same day and his IA direction supersedes section
7's recommendation. See the addendum at the bottom ("John's first review
pass") before reading section 7. Prototyping is underway from a blank-slate
usage model rather than a slot-the-existing-features exercise. Companion
docs: `pwa-push-notifications.md` (section C is the Tier 1 surface this
designs for) and `ask-alcan-assistant.md` (the future chat surface this IA
must leave room for). Written after reading the system overview, glossary,
management model, both feature docs, and the Tier 1 code (`Index.tsx`,
`ThisWeekPanel.tsx`, `LeadFocusHomeCard.tsx`, `ConfidenceWizard.tsx`,
`MyRoleLayout.tsx`, `Layout.tsx`, and the token system in `index.css` /
`tailwind.config.ts`).

---

## 1. The usage model: who opens this on a phone, when, and why

The app's phone audience is participants (RDAs, front desk, office
managers) and lead RDAs. That is roughly 68 active people across 12
locations today, per the July live-data pass in `management-model.md`.
These are people standing in an operatory or at a front desk, not sitting
at a keyboard. Admin, coach, facilitation, and clinical surfaces stay
desktop (Tier 2) and are out of scope here.

Their use of the app is not browsing. It clusters into three kinds of
moments, and almost every session is one of them:

**Ritual moments (twice a week, 2 to 5 minutes, seated or huddled).**
The weekly loop is the product: check in on confidence early in the week,
check out on performance at the end, scores due the day of the location's
Check In/Out meeting (the home page says exactly this today). These
sessions are predictable, calendar-anchored, and often happen in or
around the facilitated meeting itself. One known fact shapes everything:
check-ins run near 100% while check-outs run 25 to 30% lower (807 vs 579
in June 2026). The end-of-week ritual is the leak, so the mobile design
should make check-out the easiest thing in the entire app, not merely
equal to check-in.

**Pocket moments (30 seconds, standing, one thumb, interruptible).**
Between patients, someone glances at the app to answer one question:
"what is my move this week?", "did my score save?", "what did Ariyana set
for our location?". These sessions end abruptly when a patient arrives;
the phone goes back in the pocket mid-thought, and whatever was in
progress has to still be there next time.

**Lookup moments (1 to 3 minutes, seated, curious or prompted).**
Reading a released evaluation, scanning the practice log, checking the
role radar, taking a survey. In the one-stop-shop future this bucket
grows: asking the assistant a policy question, checking a Deputy
schedule, reading a coach's note that arrived as a push. Lookups are
prompted more often than spontaneous, usually by a notification or a
meeting, which is why notification-to-surface continuity (P5) matters so
much.

What phones are *not* used for here: managing, configuring, or evaluating
anyone. Those stay on desktop. The mobile app is the participant's side
of the coaching relationship, full stop.

## 2. The principles

### P1. Built for the pocket, not the desk

*Everything a thumb needs is reachable by a thumb, and nothing assumes a
second hand or a mouse.*

The current shell is a desktop idiom: a collapsible left sidebar
(`AppSidebar` in `Layout.tsx`) behind a hamburger. On a phone held
one-handed, the top-left corner is the hardest place to reach, and the
PWA removes the browser chrome that used to provide back and reload. The
installed app must carry its own navigation grammar, and on phones that
grammar is a bottom tab bar plus large in-content buttons.

Implications:
- Primary navigation moves to a bottom tab bar (section 3) for Tier 1
  users on phones; the sidebar remains for Tier 2 desktop surfaces.
- The single weekly CTA (the `buildWeekBanner` button in `ThisWeekPanel`)
  stays a full-width button in the lower half of the home screen, where it
  already effectively is; the redesign should protect that placement, not
  bury it under new content.
- Every mobile screen needs an in-app way backward (already flagged as
  PWA consequence B3); wizards and drawers keep their own close
  affordances, and nothing may dead-end.

### P2. One ritual, one action per screen

*During check-in and check-out, each screen asks exactly one question and
offers exactly one primary action.*

The wizards already have the right bones: `/confidence/:week/step/:n`
shows one Pro Move per step with a 1 to 4 `NumberScale`, animated
transitions, and confetti on completion. That per-step structure is
load-bearing, because a ritual works when it has a rhythm: read the move,
feel the answer, tap, next. Anything else on the screen (repair-mode
selectors, intervention text, cycle badges) is secondary or noise during
the ritual moment.

Implications:
- Wizard steps stay one Pro Move per screen; the redesign may add swipe
  between steps (a standalone-app pattern noted in PWA doc H) but must
  not consolidate steps into a scrolling form.
- The score scale becomes the dominant tap target on the step, sized for
  thumbs (section 4), with the move's action statement above it and
  nothing competing below it.
- Completion keeps its celebration: the confetti is the weekly version
  of the peak-end moment the eval philosophy already uses deliberately.

### P3. Glanceable before it is readable

*The home screen answers "what does this week need from me?" in under
three seconds, before a single word is read.*

Pocket moments do not have time for prose. Today's home page is a stack
of five-plus cards (backfill alert, eval-ready, win banner, lead cards,
this-week panel, current focus, deadline disclaimer), and "am I done this
week?" is answered by per-move `ConfPerfDelta` chips plus a banner. The
pieces exist; the hierarchy does not. A glance should resolve state
through position and color (the tokens already encode complete / missing
/ late / pending) with text as confirmation, not as the carrier.

Implications:
- The home screen leads with a single week-state element: where you are
  in the loop, what is done, what is due, one button. Everything else
  ranks below it.
- Status is shown with the existing status tokens and `StatusBadge`
  semantics, so "done" is always the same green and "late" always the
  same amber, everywhere, including in push-adjacent surfaces.
- Card count on home has a budget. If a new feature wants a home card, it
  must displace or merge with one, not append (the one-stop-shop future
  makes this rule existential; see P6).

### P4. Never lose a half-finished check-in

*Backgrounding the app, losing signal, or getting pulled to a patient
mid-ritual costs nothing; the app resumes exactly where the thumb left
off.*

This is the reality of a clinical workplace, and the code already
half-believes it: `ConfidenceWizard` persists scores and selections to
`sessionStorage` keyed by user and week, and `useReliableSubmission`
retries failed submissions with a pending count. The PWA sharpens the
need: an installed app gets backgrounded and killed by the OS far more
casually than a browser tab, and there is no reload button on iOS.

Implications:
- In-progress ritual state survives app death, not just navigation:
  promote the wizard's persistence from `sessionStorage` to
  `localStorage` (scoped by user and week), so a mid-check-in
  interruption on Monday morning resumes at lunch.
- Submission always shows a visible truth state: saved, saving, or will
  retry. The `useReliableSubmission` pending state graduates from
  plumbing to a designed element; nobody wonders if the pocket ate a
  score.
- If a ritual is half done, the home's primary element says so and
  offers to resume at the exact step.

### P5. Every tap on a notification lands on the thing it names

*A push is a promise: tap it, and you are looking at the thing it
described, one tap deep, with zero navigation required.*

The PWA plan already commits to this ("every notification deep-links to
the exact surface it references", section G) and the funnel depends on it
(the hello push opens an ack route). Extend the promise to every kind: an
eval-released push opens `/evaluation/:evalId`, a check-in reminder opens
the wizard at step 1, a coach note opens that note. And because pushes
are ephemeral, every notified thing must also be findable later inside
the app; `notification_log` is the natural spine for an in-app inbox.

Implications:
- Every notification kind ships with its destination route as part of
  its definition; a notification without a deep link is not built.
- An in-app inbox (backed by `notification_log`) exists from the first
  real notification kind, so "I dismissed the push" never means "I lost
  the thing".
- Deep-link destinations must render correctly when arrived at cold
  (fresh launch, session refresh in flight): a testable acceptance item
  per route.

### P6. Navigation that will not need re-learning

*The tab structure staff learn at install must still be the tab structure
after the assistant, the inbox, and the schedule arrive.*

Pro Moves is becoming Alcan's one-stop employment shop: push
notifications now, the Ask Alcan assistant next, Deputy schedule
visibility later, production data eventually. The management-model doc
already flags the current IA as "frankensteined" (gap G8). If the
assistant's arrival forces a tab reshuffle, we pay the re-learning cost
across every staff phone at once. So the IA is designed now for the app
this will be in 18 months, with growth slots named in advance (section 3).

Implications:
- Pick a tab set with an explicit "where future features land" mapping
  before prototyping; additions land inside existing tabs or in one
  pre-reserved slot, never by reshuffling.
- Home is a feed of cards with a ranking rule, so new content types
  (coach notes, schedule glances) join as cards without new navigation.
- Role-conditional content (lead cards today, OM views later) renders
  within the shared structure rather than forking it (see the lead
  discussion in section 3).

### P7. The lead layer rides along; it does not fork the app

*A lead RDA's app is the participant app plus a small team layer, never a
second app.*

Leads are participants first: they do their own check-in and check-out
like everyone else. Their lead content is deliberately lightweight and
already lives as home cards, not routes: `LeadFocusHomeCard` ("This week
at your location, from Ariyana") and `LeadMeetingRequestCard`. The old
dual-panel Lead Pro Move stream was retired precisely because a second
parallel stream confused the loop. What the app owes a lead on the phone
is their coaching material at a glance, in the same surface where they
live as participants.

Implications:
- Lead content stays inside the shared IA (home cards in the recommended
  option below), gated by `staff.is_lead`, so the test user "testing
  tester" exercises both layers in one shell.
- Future signal-routing (management-model Phase 1: low-confidence
  signals surfaced to the lead) lands as a home card and a notification
  kind, not a new tab, until its volume proves it needs more.
- If the lead surface ever grows past glanceable (a real coaching
  queue), that is a deliberate IA decision John makes then (open
  question 3), not drift.

### P8. A growth tool in your hand, never a surveillance tool

*Every screen speaks as the coach in your corner; nothing in the mobile
app watches, ranks, or shames.*

The whole system runs on psychological safety: honest low confidence
scores are the fuel, and the philosophy reframes moves around the patient
("every Pro Move has a patient on the other side of it"), not around
compliance. An app on a personal phone that sends push notifications is
one bad sentence away from feeling like an ankle monitor. The existing
copy mostly gets this right ("Lead performance is late, add it now to
wrap things up" reads as help, not citation); the mobile pass codifies
that voice.

Implications:
- Late is a status, not a judgment: amber, matter-of-fact, always paired
  with the action that resolves it. No streak-shaming, no red-badge
  guilt mechanics, no peer comparison on any participant surface.
- Push copy is written in the coaching voice and reviewed like coaching
  material (open question 6); reminders respect scheduling reality (the
  Deputy-aware policy exists so we never nag someone on a day off).
- Wins stay louder than gaps: `RecentWinBanner` and the completion
  celebration carry the system's reinforcement side and keep at least
  their current prominence.

## 3. Information architecture: bottom-nav candidates

Constraints: the Tier 1 surface is home, the two wizards, My Role
(overview / practice log / evaluations, plus domain detail and the eval
viewer), surveys, and profile. Wizards and surveys are flows, not
destinations, so they launch from cards and notifications rather than
holding tabs. The PWA doc's sketch ("Home / Check-in / My Role /
History") spends two tabs wrong: Check-in is a time-gated ritual, not a
place you visit on a Wednesday, and History already lives inside My Role
as the practice log.

### Option A: Loop-first, four tabs (recommended)

**Home | My Role | Inbox | Me**

- **Home**: the week-state element (P3), the ritual CTA, lead cards, win
  banner, eval-ready card, pending surveys. The card feed with a ranking
  rule.
- **My Role**: today's `/my-role` (overview, practice log, evaluations)
  restyled for touch; the eval viewer opens from here and from pushes.
- **Inbox**: the notification log as a browsable list (P5): coach notes,
  survey invitations, eval releases. Ships thin but exists from day one
  so pushes always have a durable home.
- **Me**: profile, install/notification settings, the "don't subscribe
  this device" affordance, sign out.

Future features land without reshuffling: the **assistant** joins as a
fifth center tab ("Ask") when it ships, the one pre-planned addition,
announced as a feature rather than a rearrangement. **Schedule** (Deputy)
lands as a Home card ("you're in Tuesday 8 to 5") with a detail view
reachable from that card and from Me. **Coach notes** land in Inbox. Lead
content: home cards, unchanged position, per P7.

Rationale: four tabs match what exists today (participants currently see
essentially two sidebar items, Home and My Role), Inbox is the only
genuinely new destination and it is the PWA's own companion, and the
reserved fifth slot makes the assistant's arrival an event rather than a
disruption.

### Option B: One-stop shop declared on day one, five tabs

**Home | My Role | Ask | Inbox | Me**

Same as A, but the Ask tab ships immediately, initially opening a simple
"coming soon / ask your OM meanwhile" surface or the earliest assistant
pilot. Lead content: home cards, as in A.

For: the IA never changes; staff learn the final shape once. Against: a
dead or half-alive center tab spends the app's credibility in week one,
the assistant pilot is super-admin gated at first (per its rollout plan)
so the tab would be invisible or broken for everyone else, and five tabs
is the ceiling, leaving zero headroom.

### Option C: Minimal three tabs

**Home | My Role | More**

Inbox, profile, settings, and later the assistant and schedule all live
under More. Lead content: home cards.

For: maximum simplicity at launch. Against: More-tab IAs age badly for
exactly this product; every future feature lands behind the junk-drawer
tab, recreating the "important surfaces buried" G8 problem on mobile, and
notifications would deep-link into a tab staff never otherwise open,
weakening P5.

**Recommendation: Option A.** It is honest about today, structurally
identical to the end state (B minus the not-yet-real tab), and it gives
the assistant, the schedule, and lead content each a named landing
place. In all three options leads stay card-based on Home; only a future
decision to grow the lead surface would change that (open question 3).

## 4. Visual language on mobile

This is layout and hierarchy work, not a rebrand. What carries over
unchanged:

- **All color tokens.** Domain colors (`--domain-clinical`, `-clerical`,
  `-cultural`, `-case-acceptance` and pastels), score colors
  (`--score-1` through `--score-4` with `-bg` variants), status colors
  and `StatusBadge`, win banner tokens. This is the app's semantic
  vocabulary and staff already read it.
- **The domain spine.** The vertical color rail on Pro Move cards in
  `ThisWeekPanel` is a genuinely good mobile pattern (color identity at
  almost no width cost) and becomes the standard Pro Move card treatment
  on mobile.
- **Per-org theming.** `Layout.tsx` injects the org's `brand_color` into
  `--primary` and swaps logos; the mobile shell keeps doing this, and
  the manifest theme color comes from the same tokens (PWA doc D1).
- **Icon size conventions** from CLAUDE.md (16px inline, 20px
  standalone, 24px section, 32px page) map to mobile as-is.

What changes or gets stricter on small screens:

- **Touch targets: 44px minimum, 48px for the ritual.** Several current
  targets miss this (the Learn pill in `ThisWeekPanel`, wizard chevrons,
  drawer close buttons need auditing). The 1 to 4 score scale in the
  wizards deserves the most generous targets in the app.
- **`text-2xs` (10px) is metadata-only.** It stays for timestamps and
  micro-labels (the spine's rotated label works because it is identity,
  not reading matter), but nothing a participant must read to act may
  render at 10px. Body stays 14px+ and the wizard's action statement
  displays larger than its current `text-sm`.
- **Glass effects earn their keep or go.** The `md:` gated glass-gradient
  and backdrop-blur treatments already fall back to plain surfaces on
  mobile; treat that plain surface as the design, not a degraded desktop.
- **Safe areas by intent.** The default viewport (no `viewport-fit=cover`)
  is the accepted start per PWA doc B4; a bottom tab bar adds
  `env(safe-area-inset-bottom)` padding on home-indicator phones, the
  one piece of safe-area CSS Track B will certainly need.
- **Legacy vocabulary stays off phones.** The "Cycle N • Week N" badge
  (still in `ThisWeekPanel`'s empty state) is legacy framing per the
  glossary and should not appear on any new mobile surface.

## 5. Open questions for John

1. **IA sign-off.** Is Option A (Home, My Role, Inbox, Me, with "Ask"
   reserved as the future fifth tab) the structure to prototype, or do
   you want B's declare-it-now approach despite the dead-tab risk?
2. **Check-out bias.** The loop leaks at check-out. Are you comfortable
   letting the design favor it asymmetrically, for example the home
   screen switching to a check-out-first takeover from Thursday until
   submitted? It trades some calm for closing the 25 to 30% gap.
3. **The lead surface's ceiling.** When Phase 1 signal-routing ships
   (low-confidence flags surfaced to leads), does that stay a home card
   and Inbox item per P7, or do you foresee a lead "Team" tab soon enough
   that the prototype should sketch one now?
4. **Desktop participants.** Does a participant who opens the app on a
   desktop browser get the new bottom-nav shell scaled up, the old
   sidebar, or a simple centered layout? (Tier 2 admin surfaces keep the
   sidebar regardless; this is only about Tier 1 users on big screens.)
5. **Inbox scope.** Should the Inbox merge everything that can prompt a
   staff member (notifications, pending surveys, eval-ready, coach notes)
   into one list, or stay strictly a notification history while surveys
   and evals keep their own home cards?
6. **Voice ownership.** Push copy carries the Alcan voice onto lock
   screens. Who approves it: you directly, or you plus Ariyana as the
   reference coach? And is there content (individual performance?) that
   must never appear in a push?
7. **The deadline story.** Today the home page footnote says scores are
   due the day of the meeting and anything else is late. On mobile, do
   you want an explicit per-location countdown ("check-out opens
   Thursday"), or keep deadlines soft and social (the meeting is the
   deadline) with the app staying quiet about clocks?
8. **Ritual persistence scope.** P4 proposes half-finished check-ins
   surviving app restarts for the whole week. Any reason to expire
   drafts sooner (for example, at the submission deadline), given repair
   mode already exists for missed weeks?

---

Next step once these are answered: fold decisions into v0.2, then build
the clickable prototype for the recommended IA and the two ritual flows,
per the process locked in `pwa-push-notifications.md` section I.

---

## Addendum: John's first review pass (2026-08-13)

John's direction after reading v0.1, which supersedes the section 7 IA
recommendation:

1. **No Inbox tab.** Anticipated notification traffic does not justify a
   dedicated tab. Notification history lives under More; the day-one
   in-app log (backed by `notification_log`) is still built, it just isn't
   a tab.
2. **The v1 tab set is three: Home | My Role | More.** The fourth tab,
   when it arrives, is **Ask**, not Inbox.
3. **My Role's purpose is redefined as learning and reference
   exploration.** The name stays for now, but the flag on the tent is:
   this is where you browse and discover the Pro Moves and resources for
   your role. Honest usage read: staff rarely open it unprompted today
   (mostly at a coach's urging in a coaching conversation), and the most
   common self-directed reason is finding an evaluation. Ask (future) is
   for specific questions; My Role is for exploration. The two complement
   rather than compete.
4. **My Role slims down: Overview stays; Practice Log and Evaluations
   relocate** (working assumption: under More, with evaluations also
   reachable through Home cards and push deep links at the moments they
   matter). Staff are unlikely to browse practice logs or meeting
   participation rates unprompted now that attendance is healthy.
5. **Method change: design from a blank slate, not from the current
   feature list.** First imagine how staff will use the app given the
   one-stop-shop vision, then audit each existing feature against that
   model: slots in cleanly / belongs but needs renaming, retooling, or
   relocating / not actually important to keep surfaced.

The clickable prototype iterates from this direction; decisions get folded
back here as they harden.

## Addendum 2: John's second review pass (2026-08-13, prototype v1 → v2)

1. **Copy correction:** "Explore your craft" is too frou-frou. Plain
   language throughout; copy gets worked bit by bit.
2. **The meeting context reframes Home.** Roughly 90% of logins happen
   inside a Pro Moves meeting, with everyone doing check-in or check-out
   together. Independent use is the exception (catching up after a missed
   meeting), and the deadlines exist to give that flexibility, not to
   pressure. So the home hero is not a nag for the diligent; its two real
   states are "you're in the meeting, here's the button everyone is
   pressing right now" and "you missed it, here's your catch-up path,
   kindly." The Thursday takeover concept survives but as the catch-up
   state, framed warm.
3. **No "coming soon" language anywhere.** Features don't exist until the
   day they exist. (Schedule card concept is liked; the placeholder is
   cut.)
4. **Fourth tab: Performance** (placeholder name). The job is "see how
   I'm doing," and it is bigger than evaluations: reflect the patterns in
   staff's own Pro Move submissions back to them (domain by domain, recent
   low-rated moves, confidence vs performance), plus evaluation
   highlights. Long-discussed and never built; the submission data is
   rich and unused. Future: a natural-language reflection surface could
   feed this tab.
5. **Outstanding tasks live on Home** (acknowledge an evaluation, take a
   survey, catch up on a missed check-in), not in a notifications area.
6. **Method for v2:** every prototype surface must be grounded in data
   and UI that actually exists in the codebase/database, verified before
   building, so the prototype shows what the real system can back.

Data verification for v2 (live DB, 2026-08-13): `weekly_scores` holds
confidence_score / performance_score / week_of / late flags per staff per
move (5,957 check-in rows vs 4,705 check-out rows, the ~21% gap).
Domain-level truth: end-of-week performance scores come in above
start-of-week confidence in every domain (Clinical 3.18→3.45, Clerical
2.94→3.25, Cultural 2.92→3.27, Case Acceptance 2.97→3.24). John's framing
note (2026-08-13): both numbers are self-reported, so this is *felt*
growth, not evidence they outperform their predictions; marking yourself
a 2 on Monday biases you toward believing you improved by Friday. The
reflection copy celebrates the growth feeling ("you end the week
stronger") and must not claim measured outperformance. `evaluations` already has viewed_at
and acknowledged_at (ack task card is backed), summary_feedback and
extracted_insights; `evaluation_items` has observer_glow / observer_grow
per competency (highlight material, warm coaching prose ~110-250 chars).
`staff_quarter_focus` records the staff member's chosen focus Pro Move
from their eval. `survey_assignments.status` backs a survey task card.
`pro_move_resources` types: audio, script, video, link.

## Addendum 3: v3 revisions from John's prototype review (2026-08-13)

1. **Home order:** the week's ProMoves list is the top card, with the
   Rate Confidence / Rate Performance CTA directly beneath it inside the
   same card. Lead cards ("This week at your location", "Need to talk
   something through?") are second-tier and sit at the bottom.
2. **Performance page must have an opinion.** v2 was a buffet. v3 leads
   with one question: "What am I working on, and is it moving?" The hero
   is the staff member's quarterly focus move, its confidence trend, and
   the coach's next step, with a direct link to that move's learning
   resources. Everything else (trends, flagged items, latest evaluation,
   participation) is reference material below.
3. **"You end the week stronger" is cut.** Even reframed, self-reported
   conf-to-perf lift doesn't tell staff much. Growth celebration stays in
   the toast/win-banner layer, not as an analytical claim.
4. **Domain rows become confidence-only trend lines** with a 3w / 6w /
   Quarter toggle (mirrors the real OnTimeRateWidget lookback pattern).
5. **Flagged items link to that move's learning resources** and back.
6. **Back buttons must read as buttons** (restyled as pill buttons).
7. **Trend lines are wanted broadly** (John reaffirmed).
8. My Role: fine as-is; pull real domain names in the build; design the
   domain → competency → move → resource drill with smooth transitions.

Data coverage checks behind these decisions (live DB, 2026-08-13):
- `staff_quarter_focus` covers 14 of 56 released evals, so the Performance
  hero needs a fallback when no focus is chosen (e.g. lowest-trending
  domain), and the eval review flow should keep nudging focus selection.
- `observer_glow` / `observer_grow`: 9 glows and 125 grows across 864
  released items; zero glows since June. The What's-working / Next-step
  module therefore requires either an intake change (evaluators always
  provide both, John's preference to consider) or generation from notes:
  `observer_note` exists on 290 of 864 items (avg 208 chars) and
  `evaluator_note` on 25 of 56 evals. Do not build the module before
  settling this pipeline.

## Addendum 4: v4 revisions (2026-08-13, cadence reality)

1. **Sparklines removed everywhere.** Staff rate individual Pro Moves that
   happen to belong to domains, on an infrequent cadence, so per-domain or
   per-move trend lines render as jagged noise. Domain confidence is
   numeric only, with a chip colored on the 1-4 score scale and the
   3w/6w/Quarter toggle retained.
2. **The focus hero drops numeric tracking.** It is now: the move you
   chose, plus your last formal feedback ("Your evaluator's next step" +
   the evaluator's overall note), plus a learning-resources link. The
   no-focus fallback states plainly that no focus was chosen after the
   last evaluation and offers "Choose your focus."
3. **"Next step" data lineage (John's question, answered):** it renders
   from `observer_grow` on the evaluation item whose competency contains
   the chosen focus move (`staff_quarter_focus.action_id` →
   `pro_moves.competency_id` → `evaluation_items.observer_grow`), falling
   back to `evaluations.evaluator_note`, else the module hides. Grow is
   also the better-populated column today (125 vs 9 glows), and because
   the focus is chosen from the eval, its competency's grow usually
   exists when a focus does. The intake guarantee (addendum 3) still
   applies.
4. **Evaluation scores brought forward** as a domain-level Coach vs Self
   table directly under the focus hero, labeled with the eval period.
   Rationale: observer scores are the only calibrated signal on the page,
   and the coach/self *pair* surfaces calibration gaps that today are
   buried in the eval detail grid. Page order: focus hero → eval scores →
   what you've flagged → confidence (numeric) → participation.

## Addendum 5: v6 — lead surfaces, past evaluations, design polish (2026-08-13)

**New: the lead Team surface.** Leads are the direct line of intervention
to a staff member, and today's coach panel serves administrators, not
leads. Two screens, both mobile-first:

- **Team roster** (`scr-team`): location header, a "N of 7 checked in"
  summary for the week, then one row per teammate with a single status
  pill (In / Open / Missing). A lead's question is "who needs a nudge
  before Thursday," and the roster answers it without a table.
- **Staff detail** (`scr-staffdetail`): mirrors the Performance page
  minus the focus hero, per John's spec. Order: this-week status →
  Participation → Latest evaluation (with View full evaluation) →
  Confidence merged with the moves they're still building. The same
  confidence component serves both surfaces with a different subject.

**Entry points, and why not a fifth tab.** The tab bar must hold four
today and five when Ask arrives, so Team is reached by tapping the Home
lead card (primary, since it already reads "5 of 7 checked in") and from
a More row (secondary). Both are lead-gated.

**New: past evaluations.** Staff had no way to reach older evaluations.
Added `scr-evals` (list by period, newest first) reachable from More and
from an "All evaluations" button on the Performance evaluation card.

**Design polish integrated** (from the design review pass):
- Domain colors are now reserved exclusively for domain identity; survey,
  lead, and callout rails use neutral or primary.
- Domain spines render at full strength (pastel-on-white was ~1.15:1 and
  effectively invisible at arm's length).
- **Score 1 is orange, never the missing-red.** An honest 1 is the fuel of
  the system and must not be painted as failure.
- The on-time check-out CTA no longer uses the "late" amber; amber is
  reserved for genuinely missed weeks. Check-in and check-out get a
  primary-bordered "attention" hero instead.
- Type hierarchy split: task headings 17px, reference headings 15px.
- Touch targets: time toggle, back pills, and small buttons all ≥44px.
- Contrast fixes on level badges, delta arrows, win badge, and muted text
  on tinted cards (new `--muted-tint` token).
- Motion: press states everywhere, wizard step fade, scale-button press,
  value fade when the confidence window changes, tab crossfade vs
  drill-down slide.
- Week list caps at 4 moves with a "+N more" expander so the CTA stays
  above the fold; the CONF/PERF arrow slot always renders so columns
  never go ragged.
- Emoji replaced with inline 16px icons; resource tags are now 36px chips.
- Tokens restructured as bare HSL triplets with paired `-ink` tokens,
  which is the precondition for dark mode later.
- New-hire Performance state added (no evaluation, warm framing).

**Copy changes to confirm with John:**
- "What you've flagged" → "Moves you're still building" (the review
  argued "flagged" is surveillance vocabulary; John liked the module, so
  this is a label change he should veto or keep).
- "Your evaluator's next step" → "Ariyana's next step".
- The no-focus state is no longer accusatory.
- Prototype-invented copy standardizes on "Pro Moves"; verbatim
  production strings (the deadline disclaimer's "ProMove scores") are
  untouched, so production has a real inconsistency to settle.

**Flagged upward, production bug:** `src/index.css` `.dark` does not
darken the `-pastel` or `-score-bg` values, so pastel chips and score
pills will glow near-white on dark backgrounds in the live app today.
