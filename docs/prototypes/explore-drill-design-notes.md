# Explore drill — design notes

Companion to `explore-drill-prototype.html`. This is the design rationale for
the Explore tab's core job: letting a staff member wander their role from
**domain to competency to Pro Move to learning material**, and making that
wander delightful enough that they keep tapping one more level.

Open the prototype on a phone. It carries real content pulled read-only from
the live DB for the **Dental Assistant** role (role_id 2): 4 domains, 16
competencies, 60 Pro Moves, verbatim action statements and descriptions, and
the real script text for the moves that have it. Nothing is lorem ipsum. Use
"Surprise me" in the top right to jump to a random real move.

## What this is, and what it is not

This is the clean, everyday exploration surface, a drill living inside the
existing app shell (`mobile-shell-prototype.html`). It reuses that shell's
tokens, type scale, domain spines, back-pill pattern, and slide transitions. It
is deliberately **not** the elaborate Alcan Way patient-journey museum. Explore
should feel like a well-organized place you can happily get lost in for two
minutes, not a guided cinematic.

Grading is off this surface on purpose. Scores, levels, coach-vs-self, "still
building" flags all live on the Performance tab. Explore is where the framework
is just interesting on its own terms.

## The navigation model

Four levels, one consistent motion grammar:

1. **Explore landing.** The four domains as *doorways*, not graded squares.
   Each is a large card carrying its domain color as a soft corner-gradient, the
   domain's plain-language one-liner, and two neutral counts ("4 areas", "16 Pro
   Moves"). The invitation is "wander", not "you are 72% done here".
2. **Domain.** A colored hero states what the domain is, then lists its
   competencies. Each competency row leads with its **tagline** (the framework's
   own short, warm handle, like "Room ready, gear clean" or "Overcome no") above
   the formal name, so the list reads like a set of inviting places rather than
   a compliance index.
3. **Competency.** This is the bug fix from today's app, where tapping a
   competency dumps the whole domain. Here a competency page is about *that*
   competency: its name, its friendly description as the lead, the formal
   definition tucked in a quiet box beneath, then its own Pro Moves and nothing
   else.
   On the competency page the real competency **name** is the primary heading,
   its short handle sits just beneath as a quiet subtitle, the **description** is
   the prominent body copy, and the framework's aspirational identity line ("you
   are the patient's advocate in the chair") is set apart as a serif block quote,
   the app describing the person at their best.
4. **Pro Move.** The move's page. Its statement as the headline, its
   description as the teaching content (shown plainly, with no label above it),
   and script/audio/video when they exist.

**Signaling depth and place.** Three devices work together:

- **A traveling domain color.** The moment you enter a domain, its color
  becomes the page's accent and *stays with you* through the competency and the
  move. Case Acceptance is amber the whole way down; Cultural is pink the whole
  way down. You always know which domain you are standing in without reading a
  word.
- **A breadcrumb trail** under the app bar (Explore › Domain › Competency),
  colored to the domain, with every ancestor tappable to jump straight back up.
- **Directional motion.** Going deeper slides content in from the right; going
  back slides from the left; the back control is always a labeled pill naming
  where it returns to ("‹ Case Acceptance"), never a bare chevron. Nothing
  dead-ends.

## How I pushed on delight

- **The doorways earn the first tap.** Serif display type (Fraunces) on the
  domain names gives Explore a slightly editorial, "this is worth reading"
  character that the transactional ritual screens deliberately avoid. The color
  color gradient makes four list items feel like four different rooms.
- **Momentum is built into the move page.** Every move ends with a plain "Next
  move" button that advances to the next Pro Move in the competency, wrapping
  around at the end. The design assumes that once someone is reading one move,
  the cheapest and most valuable thing to offer is the next one. This is the
  "one more tap" engine, kept deliberately quiet: it does not preview the next
  move's text, so the button stays a simple, low-commitment nudge.
- **"Surprise me"** jumps to a random real move, fully in context (breadcrumb
  and back trail intact, so you can climb back up from wherever you land). It
  turns Explore into something you can poke at with no goal, which is exactly
  the low-stakes browsing the tab wants to encourage.
- **A gentle discovery marker.** Competency rows show small dots for how many
  of their moves you have opened. This rewards wandering without grading it: the
  dots use the domain accent, never the score or status colors, and there is no
  target, no percentage, no "incomplete" language. (An earlier per-move
  checkmark was removed in review because it overlapped the move text and read
  as a to-do checkbox; the domain-page dots are the surviving, quieter signal.)
- **Motion and press feedback** on every tappable surface, plus a
  `prefers-reduced-motion` path that turns all of it off.

## The description-only move (the important one)

Coverage reality from the live DB: about 97% of active moves have a
description, but only ~16% have any script/audio/video, and that media skews to
front-desk and assistant roles. So for most moves, the description *is* the
learning material. The design makes that feel intentional, not empty:

- The description is the visual centerpiece: a generous 16px, domain-tinted
  card, shown with **no label above it**. It is simply the heart of the move
  ("here is the patient on the other side of this"), not a section that has to
  announce itself.
- When script/audio *do* exist, they appear below the description with no
  section labels either. A script shows the real verbiage in a serif quote box;
  if the move also has audio, a **small speaker** sits under the quote (tap to
  hear). A move with audio but no stored script shows just that speaker. The
  prototype shows real script text on the moves that have it (for example the
  "uncertain parent" objection move) and never invents verbiage.
- **Absent content is omitted, never announced.** This is a general principle
  applied everywhere: a move with no script/audio simply ends after its
  description, with no "that's the whole move" reassurance and no empty
  "Resources" header. There is one genuinely empty-description move in the data
  (the "affirm positive behaviors" move); its page shows the statement and the
  Next move button and nothing in between, rather than a placeholder. Inserting
  a stand-in where a value would otherwise appear only calls attention to the
  gap; omitting it reads as finished.

Net effect: a description-only page and a fully-loaded page feel like the same
species of page at two lengths, not "complete" versus "missing".

## What is deliberate

- **No search here.** Search is a separate surface; Explore is for wandering,
  and adding a search box would quietly turn it back into a lookup tool.
- **No scores, levels, or trends anywhere on this drill.** That is the whole
  point of separating Explore from Performance.
- **Domain color is reserved for domain identity only** (matching the shell's
  v6 design-polish rule). The discovery dots and accents all derive from the
  current domain color; nothing borrows the score or status palette.
- **Real taglines and friendly descriptions carry the voice.** The framework
  already contains warm, plain-language handles for competencies and moves; the
  design leans on those rather than inventing chrome copy. A few of the DB
  strings contain em dashes; those are shown verbatim as real product content.
  The prototype's own chrome copy avoids them.
- **Theme-aware.** Light and dark are both defined; the screenshots happen to
  be dark because that was the test device's setting. (Note: the live app's
  `.dark` block still has the known pastel/score-bg bug flagged in the shell
  doc; this prototype defines its own dark values and is not affected, but the
  real app fix is still outstanding.)

## Open questions for you

1. **The discovery dots.** The per-competency dots (how many moves you have
   opened) survived the review; the per-move checkmark did not. Do the dots
   still feel like a fun wander-tracker, or even they the first whiff of the
   completion pressure we want to keep off this surface? Options: keep as is,
   or cut them entirely and let Explore be truly stateless.
2. **The aspirational quote's voice.** The identity line is now a block quote
   ("you are the patient's advocate in the chair"). Read as the app describing
   the person, it is warm; read literally it makes a claim about someone who may
   be new to the competency. Is second-person aspiration the right voice here,
   or should it be framed as "what this looks like at its best" rather than "you
   are"?
3. **Where Explore lives in the tab bar.** The prototype frames Explore as its
   own tab, but the shell's current v6 direction folds role exploration into
   "My Role". Is Explore a standalone fourth tab, or the redesigned insides of
   My Role? The drill itself is identical either way; this is only about the
   flag on the tent and the bottom-nav slot.

## Grounding notes

- Content: live DB, project `yeypngaufuualdfzcjpk`, read-only SELECT, role_id 2.
  Tables: `domains`, `competencies`, `pro_moves` (action_statement,
  description), `pro_move_resources` (type, content_md).
- The prototype is a single self-contained HTML file (inline CSS/JS, Google
  Fonts the only external dependency, with a system-serif fallback). It matches
  the shell's domain color tokens from `src/index.css`.
- All 60 moves and 16 competencies are the real framework; only the audio
  playback is simulated (the player animates but loads no file).
