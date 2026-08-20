# Mobile Redesign Skeleton (value-first)

**Status:** v1, 2026-08-20. The plan of record for the staff-facing PWA
redesign after the adversarial review pass. Supersedes the IA and value
thinking in `mobile-design-principles.md` where they conflict; keeps that
doc's per-surface layout/token work and its usage principles P1-P8 as
reference. Companions: `pwa-push-notifications.md` (infra, now scoped down,
see §6), `explore-page-plan.md`, `the-alcan-way-*` (journey content),
`ask-alcan-assistant.md` (future).

---

## 0. The one sentence

**Pro Moves has been an input surface — staff put data in, and the value
came back out through meeting facilitators, not the app. This redesign
makes the app itself deliver value to the staff member.**

Everything below follows from that. The adversarial review's sharpest
finding was that today the app "takes honesty from its users and gives them
nothing back, then displays what it took." The redesign's governing rule is
the inverse:

> **Give value back.** A surface that shows a staff member their own data
> should, where it naturally can, hand them something useful in the same
> view — a script or description, a next step, a way to close out an old
> low score.

This is a design instinct, not a mechanical rule to satisfy on every
screen. (John, 2026-08-20: the "give value back" half is the point; do not
force a rigid "every cross-person surface must carry an action + a
disclosure" pattern everywhere — applied universally it reads as a
generated formula rather than a good screen. Use judgment surface by
surface.)

The new value pillars (The Alcan Way, the comms platform, the Ask chatbot)
are how the app grows into a one-stop shop. But **today's focus is the
skeleton plus making the surfaces that already exist earn their place** —
the new pillars only get holding space here, not build-out.

Timing note: the entire mobile shell is still gated to one test user, so
the IA has **zero re-learning cost to change right now**. This is the free
moment to get the structure right, before 68 people learn it.

---

## 1. Tab structure

### Launch (this redesign): three tabs

**Home · Explore · Performance**

Profile, settings, notification controls, and the lead Team surface live
behind a **header avatar menu** (top-right), not a tab. Three content tabs,
each of which must earn its place through the value reframe in §3; a
utility "More/Me" tab is the fallback if the avatar menu tests as too
hidden, but the default is the avatar.

Why three, not the four shipped today: two of the four shipped tabs
(Explore, Performance) are surfaces the design docs themselves admit staff
rarely open unprompted. We are not deleting them — we are betting the value
reframe makes them worth opening. Three real tabs is more honest than four
where one is half-alive. The current "More" tab's contents move to the
avatar menu.

### Reserved growth (holding space, not built now)

John's decision 2026-08-20: the comms platform (Basecamp replacement) earns
its **own tab** — it is too central to the one-stop-shop vision to bury in
the Home feed. That fills the tab bar to its end state:

| Slot | Becomes | When |
|---|---|---|
| 4th tab | **Comms** (Basecamp replacement): company/location announcements, message boards, coach-to-staff notes and threads | when the comms build begins |
| 5th tab | **Ask** (the chatbot / org Q&A) | when the assistant is ready; piloted as a Home card first, promoted to a tab at GA |

**End state: five tabs — Home · Explore · Performance · Comms · Ask — with
zero headroom.** That is the hard ceiling on a phone. Deputy schedule,
recognition, and every other future surface must therefore land as a card
inside an existing tab, never as a sixth tab. §2 maps them.

### The rule that protects the structure

No tab is ever renamed or removed once staff learn it. New features land
**inside an existing tab or in the one reserved Ask slot**, never by
reshuffling. This is the single most important constraint: a later reshuffle
pays a re-learning cost across every staff phone at once, and much of the
usage is anchored to the twice-weekly meeting, so the navigation staff learn
at install should still be the navigation a year from now.

### Rollout (simplified — John, 2026-08-20)

Drop the install/subscribe/ack **tracking dashboard and the three-stage
verification funnel** from `pwa-push-notifications.md` §F, and the
`staff_devices` telemetry table with them. We do not need to track who has
installed the app and who hasn't, or chase people at huddles.

Instead: **anyone still on the old (browser, non-standalone) site always sees
a small persistent "Install the app" affordance** that teaches them to set it
up properly (delete the old home-screen icon, re-add from Safari, etc.). It is
self-serve, always available, and carries no roster or telemetry. When the app
detects it is already running standalone, the affordance disappears. This
replaces the funnel entirely. (The install-help copy and the delete-old-icon
instruction from the PWA doc §B/§D still apply; only the tracking goes away.)

---

## 2. Where the planned features land (holding space)

The review flagged that Ask and the comms/Basecamp layer were competing for
one slot. John's call (2026-08-20) resolves it by giving **comms its own
tab** (the 4th), distinct from Ask (the 5th, chatbot-only):

- **Comms tab = the Basecamp replacement**: company/location announcements,
  message boards, and coach-to-staff notes and threads. Human communication.
- **Ask tab = the chatbot only**: org Q&A, AI answers. The "warm handoff to
  a human" the assistant escalates to becomes a thread in Comms.
- **Home stays the personal hub**: the weekly ritual, outstanding tasks, and
  the recognition card (§3) — your stuff, not the company's broadcast.

So the mapping for every planned feature, decided now (● = primary home):

| Planned feature | Home | Explore | Performance | Comms | Ask |
|---|---|---|---|---|---|
| The Alcan Way (journey learning) | | ● | | | |
| Craft Atlas / role scripts+audio | | ● | | | |
| Chatbot (Ask Alcan) | | | | | ● |
| Comms — announcements/message boards | | | | ● | |
| Comms — coach notes / threads | (card link) | | | ● | |
| Recognition (glows to staff) | ● | | ● | | |
| Deputy schedule | ● (card) | | | | |
| Lead Team surface | (card, escalates near meeting day) | | | | |
| Notification history / archive | (under Home) | | | | |

Profile, settings, notification controls, and the lead Team entry live
behind the **header avatar menu**, off the tab bar entirely.

This table is the holding space. It means: when the comms layer is built in
18 months, it has a home already, and the tab bar does not move.

---

## 3. The value reframe of the EXISTING surfaces (today's real work)

This is the heart of the redesign. Each existing surface today is either an
**input** (staff put data in) or a **mirror** (the app shows staff their own
numbers). The job is to pair every one with a **tool** — something the staff
member gets, not just gives or sees.

### Home — from "status board that nags" to "the feed that gives before it asks"

- Keep the single glanceable week-state element and the one ritual CTA (P3).
- **Add one value card inside the card budget, pulled from the staff member's
  focus move.** Prefer a script or short audio when the move has one; **fall
  back to the move's text description when it doesn't** (John, 2026-08-20: not
  every pro move has a script, but every one should have a description, so the
  card always has something real to show). This is the cheapest reciprocity
  lever and the reason to open the app on a Tuesday.
  - **Prerequisite before building this:** audit what resources actually exist
    per pro move (script/audio coverage is uneven, and description coverage
    needs confirming). Resource→pro-move *tagging/recommendation* of other
    platform-housed material is a future capability, not available today, so
    v1 uses only what `pro_move_resources` + the move description already hold.
- Rewrite the "marked late" footnote in the coaching voice, naming the
  audience plainly ("your coach sees it, so they can check in").
- Home is where broadcast comms and coach-recognition cards will later land
  (§2), so build it as a ranked feed now, with the ritual hero pinned first.
- (No secrecy machinery. An earlier draft proposed hiding self-scores behind a
  tap for over-the-shoulder privacy; John, 2026-08-20: people are not walking
  past reading each other's phones, so that would just be a headache — show the
  scores normally.)

### Check-in / Check-out — from "pure input" to "input that returns help"

- The rating stays (it is the fuel). But **close the loop with value:** on
  completion, alongside the celebration, surface something useful for the move
  the staff member just rated lowest — a script/audio if it has one, else the
  move's description. (Don't assume audio; "here's what this one sounds like"
  only applies when a recording exists.) The moment of honest disclosure
  becomes a moment of getting help. Depends on the same resource audit as Home.
- **Design check-out as its own ritual, not check-in's clothes.** Check-out
  is the documented leak (25-30% lower completion) and the prototype never
  actually designed it — it reused the check-in flow and copy. Give it its
  own question framing and its own completion moment, one step easier than
  check-in.
- **The check-out leak is very likely per-location in most cases** (John,
  2026-08-20): the location's check-out meeting doesn't happen, is rushed, or
  is skipped. There are also genuine individual cases, and a scheduling
  dimension — some staff simply aren't at work on the location's check-out day
  (Thursday/Friday), so they can't check out in the meeting. This means the fix
  is partly facilitation/ops (per-location), and any future reminder must be
  schedule-aware (Deputy-gated) so we never nag someone on a day off. See §5.

### Explore — from "report card wearing a library's name" to "what to actually say"

- Today the learning tab opens by **grading** the staff member (eval-average
  squares) before it teaches anything. Flip it: **lead with the tools** —
  the scripts, audio, and descriptions that tell someone what to actually do
  and say. (Same resource-availability caveat as Home: coverage is uneven, so
  audit what exists first; description is the universal fallback.)
- De-emphasize the graded squares; they belong to Performance, not the
  learning surface.
- **Break Explore (the "museum" / Craft Atlas and The Alcan Way) into smaller
  iterative pieces — it is NOT a one-shot build (John, 2026-08-20).** Before
  building, John wants a dedicated design conversation about what the museum
  actually looks like; expect to build it in stages, not from a single spec.
  So this pass reserves Explore's identity and does the low-risk reorder
  (lead-with-tools), but the fuller atlas/Alcan-Way build is its own
  iterative track, specced in sections after that conversation.
- **The Alcan Way is Explore's second pillar** (per `explore-page-plan.md`):
  the patient-journey narrative, mobile swipe-first — holding space here, part
  of the iterative Explore track above, not built in this pass.

### Performance — from "museum of every time I was honest" to "growth tool"

- Today a low score has a quarter-long half-life on this surface: rate
  yourself a 1 in July and it sits there, amber, until the quarter ends. The
  rational response is to stop being honest. **Give flagged / "still
  building" items a lifecycle:** a one-tap "I've grown here" that clears the
  item and is logged as a *positive* signal to the coach. Honesty must stop
  being the most expensive thing a user can do.
- Lead with the focus move + the coach's next step + a learning resource
  (the "what am I working on and how do I get better" question), not the
  calibration table.
- **Keep the coach-vs-self comparison; reframe how it's shown (John,
  2026-08-20).** It is an important self-awareness check and stays on the
  Performance surface. Present it **neutrally and two-directionally** — a staff
  member may rate themselves *lower* than their coach as often as higher, and
  both directions are useful signal — rather than as a "you're overconfident"
  callout. Coach and Self numbers side by side as information, not judgment (no
  amber/red gap styling); a gap in either direction is a calibration insight,
  not a failing.
- Performance's focus hero had no `staff_quarter_focus` for ~75% of evaluated
  staff. **Investigated against live DB (2026-08-20): it's a real ADOPTION
  gap, not a backfillable data bug.** Two mechanisms were being conflated:
  - **The self-score DID change to an aggregation** (since 2026-04-21 it's the
    average of the staff member's weekly performance scores per competency, not
    an interview self-rating) — and that is populating fine (~83% of items). The
    coach-vs-self card has solid data.
  - **Focus is a separate staff choice** — pick 1-3 moves after reviewing the
    eval. Only 20 of 59 evals were ever opened by the staff member, and 14 of
    those chose a focus. Nothing can backfill a choice never made. So the focus
    hero gap is filled by **adoption**, not migration: make focus selection
    expected in the review flow (mirrors the glow-expected decision), a
    coach-set default, or a nudge. The page already has an honest no-focus
    state, so it is not "broken," just empty for the un-chosen.

### Recognition — the missing surface the existing system should provide

- The system already has a positive channel ("glows"), but it is **starved
  at intake: 9 glows vs 125 grows across 864 items, zero glows since June.**
  A "Ariyana noticed your hand-off with the Nguyen family" is the single
  most powerful reason a staff member would voluntarily open this app, and
  today the data to send it barely exists.
- This is a "what the existing system should provide but doesn't" item:
  **fix glow intake** (John confirmed 2026-08-20: make a glow **expected at
  eval capture**), then surface glows to staff on Home (a card) and
  Performance (a history). This is arguably the highest-value single change
  in the redesign, and it is mostly a capture-flow + surfacing change, not
  new infrastructure.
- **The Home recognition card always has something warm.** When a real coach
  glow exists it shows that ("Ariyana noticed…"); when none exists yet it
  shows generic encouragement rather than sitting empty (John, 2026-08-20).
  So the surface never reads as broken during the intake ramp.
- **Glow source: provide for it now (John, 2026-08-20).** Add a source field
  to recognition so a glow records *who gave it* — the evaluator today
  (Ariyana, Lauren, the current single input vector), and regional managers,
  office managers, or Lead RDAs later (e.g. a future nudge to a lead, "send
  so-and-so some warm fuzzies this week"). Keep it loose: future glows may not
  come from eval capture at all, so the field should not assume an evaluator.
  Don't build the multi-source *flows* now — just add the field so nothing has
  to be re-modeled later.
- **Surface one glow, chosen well — no clutter (John, 2026-08-20).** Don't show
  every glow. Feature the single most-worth-showing one: **the glow in the
  staff member's lowest-confidence domain** (recognition lands where they feel
  weakest, which is where it means the most). If no glow exists in a
  low-confidence area, fall back to any recent glow, then to the generic
  encouragement above. Glows stay captured per competency (competency → domain
  gives the selection its handle).

### Lead Team surface — lower priority this pass (entangled with comms)

- The lead surface's whole job funnels to an action that doesn't exist
  (nudge a teammate) — the app manufactures the urge and exports it to SMS.
  A real nudge needs the comms/notification layer, which is paused. **So
  this pass:** reorder the staff-detail page from compliance-stats-first to
  coaching-first, and fix the Thursday headline that currently counts
  check-ins instead of check-outs. The nudge action waits for comms.
- Team stays a Home-owned drill-down (lead card that escalates toward
  meeting day) plus an avatar-menu row — not a tab. Leads are ~10 of ~68
  users; a tab is the scarcest resource in the IA.
- **Role-structure distinction (John, 2026-08-20): the "lead" relationship is
  role-based, not universal.** RDAs have Lead RDAs. **DFIs (front desk) do NOT
  have a lead** — a DFI's "lead," functionally, is the **office manager or
  regional manager.** So the Team/lead layer, the recognition-source options
  (who can glow whom), and the role-aware avatar menu must not assume every
  staff member reports to a peer lead; the supervising role differs by staff
  role. Worth verifying against the actual role/scope model before building the
  Team surface and the recognition-source field.

---

## 4. What changes for the shipped code (skeleton-level, not full tickets yet)

- **Tab bar: 4 → 3**, "More" contents move to a header avatar menu; Ask
  reserved.
- **Home: card → ranked feed** with a pinned ritual hero and a value card.
- **Explore: reorder** to lead with tools; add The Alcan Way pillar.
- **Performance: lifecycle on flagged items**; focus-first; calibration-table
  decision.
- **Recognition: glow intake fix + staff-facing surfacing.**
- **Check-out: its own ritual.**
- The confirmed review fixes fold in here too (role-aware avatar menu so
  flagged non-participants keep their management routes; cold-start
  deep-link back paths; the timezone and hollow-eval bugs on Team/Performance).

Each becomes a spec'd ticket after the structure is agreed. This doc is the
skeleton they hang on.

---

## 5. Cheap questions to settle with real data / staff before building far

None of these block starting the value reframe; they sharpen it.

0. **Resource availability — audited 2026-08-20 (live DB).** For the fallback
   chain script/audio → description → statement:
   - **Script or audio: only ~16% of the 339 active pro moves**, and **only for
     Front Desk (role 1) and Dental Assistant (role 2).** Office Managers get
     **description only**; Doctors have a separate `doctor_*` content system
     (~94% covered) that the card could treat as their "script" tier.
   - **Description: 96.8%**, and the short `action_statement` is **100%** — so
     the card should fall back script/audio → description → statement and will
     **always render something real.** Audio is genuinely populated (real TTS
     files), not aspirational.
   - **No resource→move tagging system exists** beyond `pro_move_resources`
     (one-to-many by `action_id`); John's "tag platform-housed resources to pro
     moves and recommend them" is confirmed a future capability. v1 uses only
     `pro_move_resources` + the move's description/statement.
   - Implication for design: **expect a real script/audio card only ~1 in 6
     times, mostly for front desk and assistants**; for everyone else the value
     card is the move's description, well-written. That is fine, but the card's
     copy/label must not promise "listen"/"script" when it's showing text.
1. **Is the check-out leak individual or per-location?** John's read
   (2026-08-20): **very likely per-location in most cases** — the location's
   check-out meeting doesn't happen or gets skipped — with some genuine
   individual cases and a scheduling dimension (staff not at work on the
   check-out day). Confirmable with two read-only queries on `weekly_scores`
   (per-location check-out completion; whether submissions cluster in
   meeting-shaped windows). Determines how much of the fix is ops/facilitation
   vs app, and means any reminder must be schedule-aware (Deputy-gated).
2. **What do staff actually want on their phone** (schedule, pay,
   recognition, ask-a-question, progress)? A five-item forced-rank across
   ~15 staff settles the reserved-tab question (Ask vs Deputy) and the
   one-stop-shop order. No staff member has touched this design yet; ten
   15-minute conversations is the whole cost.
3. **Where and how do staff read their evaluations today** — alone on a
   phone, or in a coaching conversation? Bears on the eval-on-phone
   duty-of-care question and on whether eval-release should ever be a
   lock-screen push later.

Recommendation: treat a light staff-research pass as a gate before
*org-wide* rollout, not before starting the build. The single-user test
does not wait on it.

---

## 6. Explicitly deferred (so scope stays honest)

- **All push notification features are paused.** The only notification work
  in scope is making the build *capable* of delivering push — i.e. the
  service-worker architecture that can carry a push handler
  (`generateSW` → `injectManifest` with a stub handler). No subscription
  flow, no `push_subscriptions` / `notification_log` tables, no `send-push`
  function, no launch funnel. Those resume after the value redesign.
- The RAG/Ask chatbot and the Basecamp/comms build-out: holding space only
  (§2), not built.
- The lead nudge action: waits for comms.
- Deputy schedule integration: holding space only.

---

## 7. Decisions log

**Settled with John 2026-08-20:**
1. **Tab structure:** launch three tabs (Home · Explore · Performance),
   profile/settings/Team behind a header avatar menu. ✓
2. **Comms gets its own tab** (the 4th), the Basecamp replacement; **Ask is
   the 5th, chatbot-only.** End state five tabs, zero headroom. ✓
3. **Recognition:** glow is expected at eval capture (per competency);
   **add a glow-source field now** (evaluator today, extensible to
   regional/office managers + leads later); recognition card on Home with a
   generic-encouragement fallback; **surface only one glow — the one in the
   staff member's lowest-confidence domain** — to avoid clutter. ✓
4. **Coach-vs-self comparison:** **keep it** on Performance as a self-awareness
   check; reframe the display to be neutral and two-directional (self-lower
   happens too), not an "overconfident" callout. ✓

**Still open:**
5. **Staff-research gate:** run the light staff pass (§5) before org-wide
   rollout, or note it and proceed on the current (founder + data) basis?
