# Claude Design prompt pack: Pro Moves communications surfaces

**Purpose:** hand these prompts to Claude Design (with repo access) to
prototype the future comms surfaces. Grounded in
`docs/features/pro-moves-comms-theory-of-case.md` (2026-08-21). Three
surfaces, one shared backbone: announcements, recognition, and the Ask
outbound/recommendations surface.

**How to use:** start each Claude Design session by pasting the SHARED
CONTEXT block, then ONE surface prompt. One surface per canvas keeps the
iterations focused. Expect multiple artboards per prompt (mobile first,
then desktop where asked).

## What context to give it (decided approach)

Give it **repo access, but curated attention**: connect the repo, and let
the SHARED CONTEXT block point it at the five files that matter. Do NOT
ask it to study the whole codebase. The reasoning:

- **Whole codebase** = convergent output. It will imitate the screens that
  already exist and hand back a slightly rearranged version of the current
  app. The code also drowns the signal; 99% of the repo is irrelevant to a
  design exploration.
- **Nothing** = generic output. Pretty, but off-brand, wrong IA, wrong
  audience, and it burns your iterations re-teaching who Alcan is.
- **The middle** is the useful setting: identity is constrained (brand kit,
  tokens, voice, IA, the ethos), form is free (layout, form factor,
  interaction). The prompts are written to enforce exactly this: each one
  demands divergent directions on the form-factor axis while pinning the
  brand axis.

**One deliberate exception:** for Prompt 3 (the outbound surface, the true
unknown), consider running it TWICE in separate canvases: once as written
(grounded), and once "blue sky" where you paste only the brand-voice
paragraph and the example items, withholding the IA and token files. If
the blue-sky run finds a form factor the grounded run wouldn't, fold it
back in as the wildcard. Inspiration is cheap to buy on that one surface;
on announcements and recognition, grounded is simply correct because they
must live inside the existing app.

---

## SHARED CONTEXT (paste first, every time)

You are designing for **Pro Moves** (working product name; "Skill Flow Pro"
in the repo), a coaching and training platform for pediatric dental
practices, built for Alcan Pediatric Dental. Read these repo files before
designing:

- `promoves-brand/brand-brief.md` — the locked brand kit (colors, type,
  voice). Follow it.
- `src/index.css` — the live design tokens (domain colors, status colors,
  score colors). Use tokens, never ad-hoc hex.
- `CLAUDE.md` § Design system conventions — icon sizes, font scale rules.
- `docs/specs/mob-1-ia-three-tabs-avatar-menu.md` — the mobile IA: three
  tabs + avatar menu. New surfaces must state where they live in this IA.
- `docs/features/pro-moves-comms-theory-of-case.md` — why these surfaces
  exist and what they replace.

Non-negotiable product truths:
- Users are dental office staff: DFIs (front desk), RDAs, office managers,
  doctors, regional coaches. Mobile-first (installed PWA), used in
  stolen moments between patients. Warm, human, people-first.
- The ethos is growth, NOT surveillance or compliance. Nothing should feel
  like being watched or nagged. No corporate-intranet gray.
- Voice: warm, plain, no em dashes, like a helpful colleague. Founders Tim
  and Dr. Alex set the tone: exclamatory, personal, script-loving.
- Audience scoping comes free from the data model: company-wide, per-role,
  per-location. Design assumes real targeting, not channels people join.
- Push notifications exist (PWA push initiative), so surfaces may assume a
  "lands on the lock screen" moment plus an in-app home.

Deliver: mobile-first artboards (390pt width), light mode primary (match
token palette), annotated with interaction notes. Show real, plausible
Alcan content in every state (no lorem ipsum; invent realistic pediatric
dental announcements, names, shoutouts).

---

## PROMPT 1: Announcements + Vitals (the feed and the composer)

Design the announcements surface that replaces Basecamp message boards.
Evidence to honor (from the theory-of-case doc): 542 messages over 4.5
years, half written by the two founders; 45% of posts get comments, so
replies are load-bearing, not decoration; the Vitals newsletter (45 issues)
is a distinct, beloved format that deserves its own visual treatment.

Design BOTH sides:

A. **The staff-facing feed.** Where announcements live in the three-tab IA
   (propose placement). States: unread vs read, comment threads, a pinned
   or must-see treatment for critical posts (new sedation policy) vs
   ambient posts (fall festival photos). A Vitals issue should feel like
   receiving a little magazine, not a wall of text. Show: feed view,
   single-post view with comments, a Vitals issue view, and the push
   notification → post landing moment.

B. **The founder composer.** Adoption lives or dies on whether Tim and
   Dr. Alex actually post here instead of Basecamp, so the composer must
   be the most delightful part. Audience picker built on the real org
   model (company / role / location), simple rich text, photo drop,
   and a "how many people will see this" affordance. Show: compose flow,
   audience picker, and what "posted" feedback looks like (delivery/read
   counts presented warmly, NOT as surveillance metrics — think "reached
   the team" not "23% open rate").

Explore 2 visual directions for the feed before committing: one closer to
a social feed, one closer to a briefing/inbox. Recommend one and say why.

---

## PROMPT 2: Recognition (glows, milestones, culture posts)

Design the recognition surface. Context: shoutouts, milestones, and
birthday posts are a meaningful share of Alcan's message traffic today, and
`docs/specs/mob-5-recognition-card.md` already sketches a recognition card
on the mobile home surface; read it and build outward from there rather
than contradicting it.

Design:
- The recognition card/moment as it appears in a feed or on home (glow
  received, milestone hit, work anniversary).
- The giving flow: a staff member or coach sends a shoutout in under 15
  seconds on a phone. Who can give, who it's visible to, and how it feels
  celebratory without being performative.
- An archive/wall: "the good stuff" over time for a location or a person
  (their own trophy shelf, private-ish; a location's wall, communal).
- How recognition coexists with announcements: same feed with distinct
  visual language, or its own space? Take a position and show it.

Constraint: recognition is culture infrastructure, and it must never read
as gamification-for-compliance. Confetti yes; leaderboards no.

---

## PROMPT 3: The Ask outbound surface (recommendations inbox)

Design the form factor for the Ask assistant's OUTBOUND surface: the place
where the system proactively hands a staff member something worth their
time. Context: the Ask chatbot (pull, question-answering) exists at /ask.
This is its sibling: push-ish, personal, contextual. The form factor is
explicitly undecided (founder's open question: "inbox of messages vs
gamified tiles"), so this is a true exploration, not a refinement.

What arrives here (realistic examples to design with):
- "You rated 'offer coffee to families' low this week. Here's the 90-second
  script Tim recorded for exactly this."
- "Three people at your office asked Ask Alcan about sedation fasting this
  month. Here's the current policy, in case it helps at the desk."
- "New Vitals issue mentions your location's glow."
- A gentle follow-up: "Last month you said the coffee machine was the
  blocker. Did that get sorted?"

Explore THREE distinct form factors, one artboard set each:
1. **Inbox**: a quiet list of personal messages, read/unread, dismissible.
2. **Tiles/cards**: a small hand of swipeable cards on home, max 2-3 at a
   time, each one actionable (watch, read, reply, dismiss).
3. **Wildcard**: your own third form factor that fits the brand better
   than either. Surprise us.

For each: where it lives in the IA, the empty state (most days there is
nothing, and that must feel fine, not broken), the arrival moment (with
and without push), and how a user acts on an item. Recommend one form
factor and defend the choice. Hard constraints: recommendations are
private to the recipient; never show anyone else's; no streaks, no
pressure mechanics, no red badges screaming for attention.
