# Facilitator Presentation — Premium Design Review

*Reviewer: UI Designer. Date: 2026-06-22. Target file:
`src/pages/facilitate/FacilitatePage.tsx` (data in `facilitatorData.ts`). Scope: visual polish only,
implementable in one editing pass with Tailwind + existing CSS tokens + shadcn. No new dependencies,
no gradients or heavy shadows that fight the brand, no em dashes in copy.*

## North star recap

A calm, spacious, high-class teaching surface that Ariana screen-shares over Google Meet. It must
read cleanly when projected (large type, generous whitespace, high contrast) and feel smooth as she
clicks through it. Today it works but reads like a wireframe: default system font, hairline gray
borders everywhere, no brand color, no glass surfaces, and a content area that floats top-left and
leaves the right two-thirds of a wide screen empty.

## House-style cues this page is currently ignoring

- **Brand font.** The app loads `'Biondi Sans'` but the page renders in the default sans. Headlines
  should be Biondi Sans for the premium, on-brand voice.
- **Glass surfaces.** The app's signature card is `bg-glass-gradient backdrop-blur-md border-white/40
  shadow-glass rounded-xl` (see `src/components/ui/card.tsx`). The page uses bare `rounded-xl border`.
- **Pill buttons + brand color.** `Button` is already `rounded-full bg-brand-600`; the page uses it
  but everything else (rail, chips) is neutral gray, so the brand never shows up at rest.
- **Domain spine.** `ThisWeekPanel` expresses domain with a saturated color. The pro-move card only
  uses domain color on a tiny label.

---

## P1 — Must-haves for the premium feel

### P1-1. Constrain and center the content column (fixes the emptiness/balance problem)
**Where:** `<main>` at line 116, and the `Section` wrapper.
The content is pinned to the top-left with `px-12 py-10`, so on a 16:9 projected screen the right
side is dead space. Give the column a comfortable measure and center it vertically and horizontally.
- Change `<main>` to: `flex-1 min-w-0 overflow-y-auto` and add an inner centering wrapper:
  `<div className="mx-auto w-full max-w-4xl px-12 py-12 min-h-full flex flex-col justify-center">`.
- Vertical centering is what removes the "floating in the corner" feel. Steps with little content
  (Question, Confidence) will now sit in the optical center; long content still scrolls.
- Bump the measure to `max-w-4xl` (was implicit; cards were `max-w-3xl`) so the hero card and the
  scale fill more of the width without becoming a long line.

### P1-2. Make headlines Biondi Sans and lift the type scale
**Where:** Question text (line 119), Glows/Grows headers (167, 182), ScaleReference (231), card
statement (217).
Apply the brand font and a more deliberate scale. Add `font-[\'Biondi_Sans\']` to display text.
- Question of the day: `text-5xl leading-[1.1] font-semibold font-[\'Biondi_Sans\'] tracking-tight`
  (was `text-4xl font-medium`). This is the single biggest "premium" lever for screen-share.
- Pro-move statement: `text-4xl leading-snug font-semibold font-[\'Biondi_Sans\']` (was `text-3xl
  font-medium`).
- Glows/Grows prompts and the scale lead-in (`Everyone, rate your...`): `text-3xl
  font-semibold font-[\'Biondi_Sans\']` (was `text-2xl font-medium`).
- Keep body/secondary copy in the default font at `text-base`/`text-sm` for contrast of voice.

### P1-3. Upgrade the section eyebrow into a real header band
**Where:** `Section` component (lines 194-205).
The current eyebrow is a faint `text-xs` muted row, which makes every screen open weak. Make it a
calm but confident header.
- Eyebrow row: keep uppercase tracking but use `text-[13px] font-semibold tracking-[0.12em]
  text-muted-foreground` and color the icon with the step's accent (primary, or domain on pro moves).
- Wrap the icon in a soft chip: `<span className="flex h-9 w-9 items-center justify-center
  rounded-full bg-primary/10 text-primary">`. This gives each step a consistent, branded anchor
  point instead of a lone gray glyph.
- Add `mb-8` below the eyebrow for breathing room (was `mb-5`).

### P1-4. Make the pro-move card the hero moment (glass + domain spine)
**Where:** `ProMoveCard` (lines 207-225).
This is the centerpiece of the Check-in and deserves to look like it. Adopt the house glass card and
let the domain color carry the identity.
- Card shell: `relative overflow-hidden rounded-2xl bg-glass-gradient backdrop-blur-md
  border border-white/50 shadow-glass p-10`. Drop the bare `border`.
- Add a left domain spine: an absolutely-positioned `w-1.5 inset-y-0 left-0` bar filled with
  `hsl(var(--domain-*))` (reuse `domainVar[pm.domain]`). This echoes `ThisWeekPanel` and instantly
  reads as "this is a Clinical / Cultural / etc. move."
- Domain label: turn the tiny text into a pill: `inline-flex items-center rounded-full px-2.5 py-1
  text-xs font-semibold` with `background: hsl(var(--domain-*-pastel))` and `color:
  hsl(var(--domain-*))`. Use the `-pastel` token for the fill so it stays calm when projected.
- "x of n": right-align as `text-sm font-medium text-muted-foreground` (slightly larger so it is
  legible on a shared screen).
- "Open scripting" button: keep `variant="outline"` but `size="default"` (the `sm` reads timid for a
  hero). Add `mt-8`.

### P1-5. Give the left rail a quieter, more finished treatment
**Where:** `<nav>` (lines 96-113).
Today the rail is the same flat white as content with a hairline divider; active state is a faint
`bg-primary/10`. Make it a calm sidebar that frames the stage.
- Rail surface: `w-56 shrink-0 border-r bg-muted/40 p-4 flex flex-col gap-1.5`. The subtle tint
  separates navigation from the teaching stage without a hard line.
- Add a small section label above the steps: `<p className="px-3 pb-2 text-[11px] font-semibold
  uppercase tracking-[0.12em] text-muted-foreground">Meeting flow</p>`.
- Active item: `bg-card shadow-sm text-primary font-medium` (a raised "card" chip reads more premium
  than a flat tint). Inactive: `text-muted-foreground hover:bg-card/60`.
- Step number badge: when active, fill it: `bg-primary text-primary-foreground border-transparent`;
  inactive keep the outlined version. This gives a clear "you are here" without color noise.
- Increase row size slightly for projection: `px-3 py-3 text-[15px]`.

### P1-6. Polish the top bar so it reads as a calm chrome, not a form
**Where:** `<header>` (lines 64-92).
- Left brand lockup: make `ProMoves` `font-[\'Biondi_Sans\'] font-semibold text-[15px]` and render
  "live session" as a small dot-prefixed status: a `h-2 w-2 rounded-full bg-positive` dot plus
  `text-xs text-muted-foreground`. Reads as "we are live" rather than a label.
- Give the bar the faintest lift: `bg-card/60 backdrop-blur-sm border-b` and `h-16` (was `h-14`) so
  it matches the glass language and gives the dropdowns room.
- Group the two selects in one bordered cluster so they read as one control set: wrap Meeting + Role
  in `<div className="flex items-center gap-2 rounded-full border bg-card/60 px-2 py-1">` and drop
  the loose inline label text in favor of the `SelectValue` placeholders, or keep labels as
  `text-[11px] uppercase tracking-wide text-muted-foreground`.

### P1-7. Redesign the scale reference as a premium, color-anchored row stack
**Where:** `ScaleReference` (lines 227-247).
The scale is a teaching reference projected to a room, so the numbers should feel substantial and
the meaning unmistakable.
- Each row becomes a soft card: `flex items-center gap-5 rounded-xl border border-white/50
  bg-glass-gradient backdrop-blur-sm p-4`.
- Number tile: enlarge to `h-14 w-14 rounded-xl text-2xl font-semibold font-[\'Biondi_Sans\']`,
  keep the `--score-n-bg` fill and `--score-n` text. Order top-to-bottom as 4, 3, 2, 1 (as coded) so
  "mastery" leads.
- Definition text: `text-lg text-foreground` (not muted) so it carries across a shared screen.
- Widen to `max-w-3xl` and `gap-3.5` between rows.

---

## P2 — Nice-to-haves that raise the finish

### P2-1. Motion on step and carousel changes
**Where:** content render in `<main>`; pro-move card.
- Add a keyed fade/translate on step change: wrap the active step body in a div with
  `key={step}` and Tailwind `animate-in fade-in slide-in-from-bottom-2 duration-300` (tailwindcss-
  animate is already present via shadcn). Same on the pro-move card keyed by `pmIndex` for a gentle
  cross-step feel as Ariana advances.
- Respect reduced motion: the global `transition: all 150ms` already exists; keep new motion to
  `motion-safe:` variants if you want to be strict.

### P2-2. Carousel dots and controls refinement
**Where:** pro-move nav (lines 142-156).
- Make the active dot a pill: active `h-2 w-6 rounded-full bg-primary`, inactive `h-2 w-2 rounded-
  full bg-border`, with `transition-all`. This is a small, recognized "premium carousel" cue.
- Center the prev/next/dots row under the card (`justify-center`) so it reads as part of the hero
  rather than left-aligned debris.

### P2-3. Journey explorer as a calm map, not a button grid
**Where:** `JourneyExplorer` (lines 249-287).
- Stage tiles: give each a faint numbered chip and connect them visually. Use
  `bg-card/60 border-white/50 shadow-sm rounded-xl py-4`, active = `ring-2 ring-primary bg-primary/5`
  (ring reads cleaner than a doubled border). Add the stage index as a small circle so it reads as a
  journey, left to right.
- Stage detail panel: lift it into a glass card (`bg-glass-gradient backdrop-blur-sm rounded-xl
  border border-white/50 p-5`) instead of a bare top border, so the drill-down feels like opening a
  layer.
- Pro-move chips: tint by the journey/role context using `bg-muted` is fine, but add `border
  border-border/60` and `text-foreground` for legibility on screen.

### P2-4. Idle / empty states with warmth
**Where:** Glows before journey is opened (line 165), Grows (line 180), and any future no-data path.
- The right side of Glows/Grows is empty until Ariana acts. Add a soft, centered helper illustration
  zone: a large muted icon in a `rounded-full bg-muted/50 h-20 w-20` halo above the prompt, so the
  step looks composed before interaction rather than top-left text.
- Custom-question input (line 129): style it to match the brand. `h-12 rounded-xl border bg-card/60
  px-4 text-lg` and a small helper line. Right now it is a thin default input that breaks the premium
  feel the instant Ariana types her own question.

### P2-5. One-line "what to do here" nudge per step (spec asks for it)
**Where:** under each `Section` eyebrow.
The spec (Access and nudges) calls for a short cue per step. Pro moves already has one (the italic
line). Add the same calm `text-sm text-muted-foreground` cue under Question ("Pick a warm-up, or
write your own."), Confidence/Performance, Glows, Grows. Keeps the voice human and the surface
self-documenting for any coach.

### P2-6. Consistent spacing rhythm
**Where:** whole page.
Standardize vertical rhythm on an 8px scale: eyebrow `mb-8`, prompt to control `mt-8`, secondary
copy `mb-6`. The current mix of `mb-2`, `mb-5`, `mb-6`, `mt-8` reads slightly arbitrary; tightening
to one rhythm is most of what separates "fine" from "considered."

---

## Quick win order (single pass)

1. P1-1 center + constrain the column (biggest perceived change).
2. P1-2 + P1-3 type scale and section header.
3. P1-4 hero pro-move card.
4. P1-5 + P1-6 rail and top bar.
5. P1-7 scale rows.
6. P2-1 motion, then the remaining P2 polish as time allows.

All changes use existing tokens (`--domain-*`, `--domain-*-pastel`, `--score-n` / `--score-n-bg`,
`--primary`, `--positive`, `--border`, `--muted`), the `bg-glass-gradient` / `shadow-glass` utilities
already in the app, the `'Biondi Sans'` face, and shadcn `Button` / `Select`. No new dependencies.
