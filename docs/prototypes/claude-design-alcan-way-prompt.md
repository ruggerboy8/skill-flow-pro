# Claude Design prompt: The Alcan Way learning surface (concept exploration)

**Purpose:** hand this to Claude Design (with repo access) to explore
concepts for The Alcan Way, the narrative learning surface inside the
Explore tab. This is a **problem prompt, not a spec**: it describes what
the surface must accomplish and hands over the raw material, then asks
for divergent concepts to react to. Same usage pattern as
`claude-design-comms-prompts.md`: paste the CONTEXT block, then the
PROMPT, one canvas per session.

**Status note:** v2, 2026-08-21. v1 of this file prescribed the
children's-museum-exhibit concept (`alcan-way-exhibit-concept.md`) and
asked for its execution. John pulled that back: the exhibit stays banked
as one candidate direction, but this exploration starts from the problem
so Claude Design can propose its own answers. Do not paste the exhibit
concept into these sessions.

---

## The design problem (read this even if you never run the prompt)

The Explore tab has two pillars. **My Role** is the encyclopedia:
structure-first, a staff member browsing the competencies and Pro Moves
of their own job. It is designed and building. **The Alcan Way** is the
other pillar, and it is a different species: it teaches what an
excellent patient visit looks, sounds, and feels like, told through one
family's trip through the office. Not "here are your moves" but "here is
the experience all our moves add up to, and the moments where your role
makes it."

The underlying need: Alcan's culture lives in small human moments (the
front desk standing up to greet a family, the assistant crouching to a
child's eye level, the doctor asking a parent what matters most before
talking treatment). New hires currently absorb this slowly, by osmosis
and luck. The company has now authored this material properly (a
five-stage patient journey, roughly 13 concrete beats, each with real
dialogue and the why behind it), and it needs a home in the app that
makes staff *want* to take it in, return to it, and share it.

The content already exists and is not being redesigned. What does not
exist is the form: nobody has settled what kind of thing this surface
is. A story you read? A place you wander? A film you watch? Something
you rehearse? That is the open question this exploration should answer
with concepts, not the question it should assume an answer to.

---

## CONTEXT (paste first)

You are designing for **Pro Moves** (working name; "Skill Flow Pro" in
the repo), a coaching platform for pediatric dental practices, built for
Alcan Pediatric Dental. Read these repo files before designing:

- `promoves-brand/brand-brief.md` — the locked brand kit (colors, type,
  voice). Follow it.
- `src/index.css` — the live design tokens. Use tokens, never ad-hoc hex.
- `CLAUDE.md` § Design system conventions — icon sizes, type scale rules.
- `docs/specs/mob-1-ia-three-tabs-avatar-menu.md` — the mobile IA. This
  surface lives as the second segment of the Explore tab, beside My Role.

Prior concept work on this surface exists in the repo and is
**deliberately withheld**. We want your fresh answer to the problem, not
a refinement of ours. Design from this brief only; if you stumble onto
those files, skip them.

### The material (this is what the surface delivers)

- **One family's visit**, structured as five journey stages: Check-In,
  Transition to Chair, Chair, Return, Checkout. The journey is
  out-and-back: the Chair is the deepest point and the turn, and the
  front desk is one space visited twice.
- **~13 beats** across those stages. A beat is a specific, visible
  moment of hospitality, and each one carries the same authored parts:
  - the visible moment (what a bystander would see)
  - the dialogue, verbatim, as actually said aloud
  - the patient-impact insight (why this lands for the family)
  - the Pro Move behind it, tagged to the role that owns it
  - the principle it embodies
- **Three principles** that thread through everything: Own the First
  Moment, Master the Moves, Be the Reason.
- **The emotional core:** parents arrive braced. What they remember
  about a great visit is "I didn't have to worry." Every insight lands
  on some version of that.

Sample beat, real material, use verbatim in artboards (never invent
additional beats, moves, or dialogue; if a concept needs to show more
beats, block them in as clearly-labeled placeholders):

- **"The Greeting"** (Check-In, role: Front Desk). Moment: the front
  desk person rises from the chair, eye contact, smiles, before the
  family has a chance to feel anxious. Dialogue: "Welcome in, Jessica!
  And this must be Johnny." Insight: the parent decides in this second
  whether they can relax or stay on guard; standing up says "we're glad
  you're here" before a single form is touched. Pro Move: "I always
  stand up and greet every patient and their guardian with a smile."
  Principle: Own the First Moment.

### What must be true (the real constraints, and only these)

- **Audience one:** every staff member, but especially the new hire in
  their first weeks, internalizing what this place is. Users are dental
  office staff on their phones (installed PWA, 390pt artboards), often
  in stolen moments between patients. Assume 90 seconds as a meaningful
  session, while rewarding longer stays.
- **Audience two:** the lead or coach who uses this material to teach,
  points a teammate at one specific moment, and references it in
  huddles. Sharing a specific spot should be possible and natural.
- **No tracking, no completion pressure.** No progress bars, streaks,
  checkmarks, or "80% complete." Returning to the same moment twice is
  a feature. This comes from the product ethos: growth, never
  surveillance or compliance.
- **Sincere content, warm delivery.** The moves, dialogue, and insights
  are presented sincerely, never winking, and never in a register that
  treats staff as children. Where the delivery itself is playful, the
  play must serve the warmth.
- **Role relevance without role walls.** Every beat belongs to a role,
  and a staff member should feel "that one is mine," but the whole
  journey is for everyone; the point is seeing how the roles hand off
  to each other.
- **The structure should be felt.** The five-stage, out-and-back shape
  of the visit is part of the teaching. A visitor should come away
  sensing the journey's shape, not just having read 13 disconnected tips.
- Voice: warm, plain, no em dashes. Light mode primary, tokens only.

Everything else is open: the metaphor, the interaction model, the entry
experience, the role of motion, sound, or illustration, whether it reads
linear or spatial or something else entirely, and what the first five
seconds feel like.

---

## PROMPT: three concepts for the learning surface

Given the problem, the material, and the constraints in the context
block: propose **three genuinely divergent concepts** for what The Alcan
Way is. Divergent means different answers to "what kind of thing is
this," not three skins on one layout. If two of your concepts could
share a wireframe, replace one.

For each concept, deliver a small artboard set (3 to 5 boards) plus
annotations:

1. **The thesis, in one sentence.** "The Alcan Way is a ___." Name the
   experience it borrows its soul from (a film, a picture book, a
   walking tour, a rehearsal room, whatever it is) and why that fits a
   braced parent's story told to dental staff.
2. **The first five seconds.** What a brand-new staff member sees when
   they tap the segment for the first time, and what invites the first
   interaction.
3. **One beat, fully experienced.** Use "The Greeting" verbatim. Show
   how a visitor encounters the moment, the dialogue, the insight, the
   Pro Move, and the principle in this concept, and how much of that
   depth is chosen versus delivered.
4. **The shape of the whole.** How the five-stage out-and-back journey
   is felt, and how a visitor moves between beats: the second visit as
   well as the first (what does someone come back for?).
5. **The coach move.** How a lead points a teammate at one specific
   moment in this concept.
6. **Honest tradeoffs.** Where this concept is weak: build cost,
   content-authoring burden beyond what exists, risk of feeling like
   training-material-in-a-costume, whatever is true.

Do not blend the three into a recommended hybrid and do not pick a
winner; the founder will react to the spread. It is fine to note which
concept you find strongest in one sentence at the end, no more.

---

## GRILL ME FIRST (paste with the prompt)

Before you design, interview me. I am the founder; the brief above is
the problem as I understand it, and your questions should test it. Ask
me at minimum:

1. **The walk-away.** After a first two-minute visit, what should a new
   hire be able to say, feel, or do that they couldn't before? What
   about after ten visits?
2. **The return trip.** Why does someone come back next week? Is this a
   place you revisit, a thing you finish, or a reference you consult?
   My answer constrains which concepts survive.
3. **The register.** How far toward playful can the delivery go before
   it stops feeling like us? What is an example of delight I love, and
   one that would make me cringe?
4. **Media reality.** What actually exists today: illustration, audio,
   video, photography? What am I willing to commission, and what must
   the concepts work without?
5. **The lead's ritual.** Concretely, how do I picture a lead using
   this in a real week: huddle screen? a link in a text? side-by-side
   coaching? This shapes the sharing model.
6. **Success and failure.** How will we know this surface worked six
   months in, given that we refuse to track completion? And what is the
   failure mode I most fear?
7. **Relationship to My Role.** When a beat names a Pro Move, how hard
   should this surface pull the visitor across into the encyclopedia,
   versus staying inside the story?
8. **Anything I know that you don't.** What has changed lately, what
   have I seen elsewhere that I loved or hated, and what would make me
   reject a concept on sight?

Do not start designing until I have answered. Where my answers conflict
with the constraints above, say so and make me choose.
