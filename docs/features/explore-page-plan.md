# The Explore Page (plan)

**Status:** v1, 2026-08-13. Direction set by John after reviewing the
three exploration concepts (`docs/prototypes/my-role-exploration-concepts.html`).
Companions: `mobile-design-principles.md` (addenda), `mobile-build-plan.md`,
`the-alcan-way-beat-map.md` (journey content source of truth).

## The decision

The third tab stops being "My Role" and becomes **Explore: every resource
about how to be the best at my job.** Two content pillars now, one
placeholder relationship for later:

1. **My Craft (role atlas).** Search-free browsing of the ~60 Pro Moves
   for your role. **The Craft Atlas concept is the baseline design**: all
   ~16 competencies as level-painted tiles grouped in the four domain
   bands, drilling into an area page (competency description + the
   coach's eval note for that area + its moves), then the move study
   view. This is an encyclopedia, deliberately: oriented around the
   structure of the craft, mirroring the quarterly evaluation.
2. **The Alcan Way (patient journey).** The expression of what an
   excellent patient experience looks like, and the role-specific moves
   and actions that make that excellence possible (John's framing,
   2026-08-13; note that "parents arrive braced / I didn't have to
   worry" is one example insight from one beat, not the anchor of the
   experience). The material: the 5-stage journey (Check-In →
   Transition to Chair → Chair/Exam → Return → Checkout), its hero
   beats (visible moment + dialogue + patient-impact insight, each tied
   to the role whose move it is), and the three principles (Own the
   First Moment, Master the Moves, Be the Reason). The existing
   `the-alcan-way/` prototype (scroll-driven, pixel-art, GSAP/Lenis,
   M1+M2 built) was designed for a desktop browser scroll; the mobile
   expression is probably **swipe-through**, and is being concepted by a
   design agent now (`docs/prototypes/alcan-way-explore-concepts.html`
   when it lands).
3. **Ask (later).** The Shelves concept is banked, not discarded: its
   search-first, curated-rows thinking maps to the future Ask surface
   (or an Ask + Performance merge). Nothing is built for Ask now; see
   `ask-alcan-assistant.md`.

## Why this split is right

Explore answers "teach me"; Performance answers "how am I doing"; Ask
(future) answers "I have a question." The atlas is structure-first
because encyclopedias are for orientation and coach-directed study; the
Alcan Way is narrative-first because the journey is a story you
internalize, not a list you consult. Both live behind one tab because
they are the same job: getting better at the craft.

## Entry screen

The Explore tab lands on a simple two-door screen (working shape, to be
refined with the Alcan Way concepts):

- **My Craft** door: the atlas snapshot (level counts, e.g. "Mastery ×3")
  leading into the domain-banded tile map.
- **The Alcan Way** door: the journey invitation (stage progress if we
  track it, e.g. "You've walked 3 of 5 stages") leading into the
  swipe experience.

If the Alcan Way concepting suggests a stronger unified entry (e.g. the
journey as the spine with moves hanging off it), that supersedes this.

## Build phases

| Phase | What | Depends on |
|---|---|---|
| E1 | Rename tab My Role → Explore; entry screen with the two doors (Alcan Way door hidden until E3 ships — no coming-soon states) | nothing |
| E2 | Atlas build: rework `/my-role` overview + domain screens to the Craft Atlas design (tiles with levels, area page with eval note + moves, existing study drawer stays) | E1 |
| E3 | Alcan Way mobile module: build from the winning concept; reuse the beat map / Phase C copy and pixel art where the concept calls for it | concept review with John |
| E4 | Search across moves (and later the Way) | fits naturally when Ask work begins; not before |

Conservative practice as always: E2 reworks existing surfaces behind the
mobile shell gating first; desktop follows once John signs off.

## Open questions for John

1. Entry screen: two doors, or one unified spine? (Park until the Alcan
   Way concepts land.)
2. Does the atlas keep the "My Role" name inside its own header (tab says
   Explore, atlas says "My Craft" or similar), or does "My Role"
   disappear entirely as a term?
3. Alcan Way progress tracking: is "walked stages" worth persisting per
   user (a small table), or is the Way stateless reading material?
4. Does the desktop app get Explore too, or does desktop keep the
   current My Role until the mobile version proves out?
