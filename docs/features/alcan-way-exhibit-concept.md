# The Alcan Way as a Museum Exhibit (concept)

**Status:** v1, 2026-08-14. Concept document, agreed direction with John;
this precedes any prototype. Supersedes the three earlier interaction
concepts (`docs/archive/prototypes/alcan-way-explore-concepts.html`), which are
kept as reference; The Floor's station-link idea and The Table Read's
say-it-aloud survive inside this frame. Content source of truth remains
`the-alcan-way-beat-map.md`. Placement: the second pillar of the Explore
tab per `explore-page-plan.md` (stateless, plain-tab entry, both
unchanged).

## The anchor

The Alcan Way is a **children's museum exhibit**: a miniature Alcan
office rendered as a touchable diorama, where staff explore one family's
visit the way a museum visitor works a gallery — poking things, taking
the depth they want, following a suggested route or wandering off it.

Why this anchor is right, and not just cute:

1. **Children's museums teach through pretend play** — the toy grocery
   store, the pretend doctor's office. This exhibit is the pretend Alcan
   office for the staff themselves: a place to rehearse the moves the
   way their patients learn everything.
2. **The medium mirrors the message.** It teaches the way Alcan patients
   are taught, and using it feels the way an Alcan visit should feel.
3. **It gives the visitor hands.** The three prior concepts made the
   staff member an audience (film, theater, map). An exhibit makes them
   a participant.
4. **Museums don't track visitors.** The stateless decision isn't a
   constraint here; it's native. Returning to the same station and doing
   it again is the point.

## Tone (John, 2026-08-14)

**Not delight-forward, but it doesn't take itself too seriously.**
Operating rules:

- Delight lives in the **world**: the diorama, the poke-responses, the
  small things you find by exploring. Content stays **sincere**: the
  moves, the dialogue, and the insights never wink, never gag.
- Warm over whimsical. The register is "built by people who love the
  same things," never "training material dressed as a toy," and never
  content that treats staff as children.
- Humor is allowed in the environment (a fish in the lobby tank that
  reacts to a tap) and rationed in the copy.

## The metaphor map

| Museum | Alcan Way |
|---|---|
| The exhibit | The Way: one family's visit, one miniature office |
| Galleries | The 5 journey stages (Check-In, Transition, Chair, Return, Checkout) |
| Stations | The beats (~13): each a scene you can touch |
| The big touchable thing | The pixel scene; poking it is rewarded |
| The caption | The dialogue: hear it, then say it once out loud |
| The plaque | The why, the role-tagged Pro Move, the principle |
| Suggested route | "Walk it in order" (the linear pass survives as an option) |
| Wandering | Any station, any order, standalone |
| The docent | A lead sending a station link with a note |
| Pretend-play corner | The say-it-aloud ritual at every station with dialogue |
| Exit gift shop | The closing screen: the three principles + "which moment is yours tomorrow?" |

## Design principles (testable rules)

1. **Please touch.** Everything rendered is touchable and no tap is ever
   wasted: it either opens a layer, plays a line, or answers with a
   small world-response.
2. **Titrate, never dump.** Three layers per station — surface (scene +
   one-line moment), caption (dialogue), plaque (why + move +
   principle). The visitor chooses depth; no layer is forced.
3. **Core is one obvious tap.** Exploration rewards are additive.
   The moment, the line, and the move are never hidden behind
   discovery; hunting is for delights only. (This is the 375px guard:
   freedom without wayfinding collapse.)
4. **Stations stand alone; the route is soft.** Every station is
   complete in isolation and linkable; the suggested route exists for
   first-timers and completists.
5. **Two audiences at every station.** The new hire internalizing and
   the lead coaching with it. The station link + coach note is a
   first-class behavior, not a share feature bolted on.
6. **Sincerity in content, play in world** (the tone rule above, applied
   as an accept/reject test on every station).

## The layered content model (authoring spec)

This is the real cost of the concept and the beat map's material maps
onto it well. Per station, to be authored (John co-authoring):

- **Layer 1 — surface:** the scene (pixel art) + one sentence naming the
  visible moment. Glanceable in 5 seconds.
- **Layer 2 — caption:** the dialogue as said aloud (speaker, line,
  audio when we have it) + the say-it-once prompt.
- **Layer 3 — plaque:** the patient-impact insight, the role-tagged Pro
  Move(s) behind the moment, and the principle it embodies.
- **World responses (per scene, small set):** 2-4 poke targets with
  brief, warm reactions. Authored last, cut first when scope demands.

Some beats have no dialogue (the arrival, the walk back); their layer 2
is the sensory caption of the moment instead. The beat map already
carries moment/dialogue/insight/move/principle per beat, so authoring is
largely re-shaping plus writing the world responses.

## MVP: one gallery, built whole

Prove the pattern before multiplying it. **Gallery 1: Check-In**, plus
the exhibit's front door:

1. **Exhibit entry:** the miniature office at a glance — five galleries
   visible as rooms of the diorama, Check-In open, the others rendered
   but quiet (present, explorable later; nothing labeled "coming soon" —
   if a gallery isn't built, its room simply isn't interactive yet and
   carries no promise).
2. **Gallery 1 complete:** its 2-3 stations (from the beat map: the
   greeting, previewing the doctor, plus the arrival as a dialogue-less
   station) with all three layers, say-it-aloud, one or two world
   responses each, and station links.
3. **The station pattern as a reusable component**, so galleries 2-5 are
   content work, not engineering work.

Sequence: (a) content workshop with John on Gallery 1's stations
(layers + world responses, using the beat map), (b) visual/interaction
prototype of the entry + one station for sign-off, (c) build.

## Open questions

1. Delight budget, concretely: are world-responses in scope for MVP, or
   does the pattern-proof ship with layers + say-it-aloud only and add
   poke-responses in a second pass?
2. Audio: layer 2 wants "hear it" per line. Record now (whose voice?) or
   ship MVP text-first and add audio when recorded?
3. Does the desktop `the-alcan-way/` scroll experience continue as its
   own artifact (facilitation/big-screen use), or is the exhibit its
   successor everywhere?
4. Naming inside the app: "The Alcan Way" as the segment label is
   settled; do stations get playful names (The Handoff, The Seam) as the
   beat map already does? (Recommend yes; they're already warm and
   specific.)
