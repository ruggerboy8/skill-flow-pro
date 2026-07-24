# The Alcan Way — Technical Build Plan

*Status: planning (not yet started). Created 2026-06-25.*
*Source of truth for content and scene structure: the creative brief / PRD
(`the-alcan-way-prd.md`). This document is the engineering and production plan
that turns that PRD into a buildable, shippable web experience.*

This plan is written for two readers:

- **The implementer** — a strong generalist building this with AI help. The
  tech sections are precise and opinionated.
- **Johno** — non-technical product owner who will generate the pixel art and
  click the deploy button. The asset spec (section 10) and deployment
  walkthrough (section 11) are written for you, jargon-light and step-by-step.

---

## 1. Summary and guiding principles

We are building **The Alcan Way**: a standalone, mobile-first, scroll-driven
web experience. As the user scrolls down, a "camera" follows a parent and child
walking left-to-right through a continuous 16-bit pixel-art dental office
(lobby → hallway → exam room → hallway → checkout). Staff characters enter,
act, and exit. Clean sans-serif text overlays teach three Hospitality
Principles: **Own the First Moment**, **Master the Moves**, **Be the Reason**.

It is roughly a five-minute experience, about 5000–7000vh of scroll, no login,
no backend, shareable by URL.

### The north star

**Beautiful and smooth at 60fps on a mid-range phone (iPhone 12 / equivalent
Android).** Everything in this plan exists to protect that. A scroll experience
that stutters feels broken no matter how good the art is. Smoothness is the
feature.

### Architectural principles that protect the north star

1. **Transforms and opacity only.** Every scroll-linked animation drives
   `transform` (translate/scale) and `opacity`. We never animate `top`,
   `left`, `width`, `height`, `margin`, or anything that triggers layout. This
   is the single most important rule in the whole build.
2. **GPU compositing on purpose.** Animated layers get promoted to their own
   compositor layer (`will-change: transform`, or `transform: translateZ(0)`),
   but only while they are actually animating. Too many promoted layers eats
   memory; we promote deliberately, not everywhere.
3. **Preload everything, then start.** All art loads behind a short loading
   screen before the user can scroll. Mid-scroll image pop-in is unacceptable.
4. **No layout thrash.** The stage is built once. We do not add/remove DOM
   nodes or resize elements during scroll. Characters and props exist in the
   DOM from the start and are moved/faded, not created/destroyed.
5. **Data-driven scenes, not hand-coded one-offs.** Scenes are described in a
   config (positions, triggers, copy, timing). The engine reads the config and
   builds timelines. This keeps 11 sections (prologue + 9 scenes + epilogue,
   plus hallway transitions) consistent and tweakable without rewriting code.
6. **Placeholder-first, hot-swappable art.** The whole experience works with
   colored blocks and SVGs before any final art exists. Final pixel-art PNGs
   drop into the same named slots with zero code changes.

---

## 2. Tech stack and scaffolding

### Core

| Tool | Why |
|---|---|
| **Vite** | Fast dev server, tiny modern build, trivial static deploy. The main ProMoves app already uses Vite, so the workflow is familiar. |
| **React + TypeScript** | Component model fits the scene/character/overlay abstraction. TS catches manifest/config typos (a misspelled slot name is a compile error, not a blank sprite). |
| **Tailwind CSS** | Match the main app's conventions for the text/overlay UI layer. Tailwind is for the DOM/text chrome, not for driving animation. |
| **GSAP + ScrollTrigger** | The animation engine. Battle-tested for scroll-pinned, scrubbed timelines and parallax. Best-in-class performance and the most predictable pinning behavior of any option. |
| **Lenis** | Smooth-scroll layer. Normalizes the janky native wheel/touch scroll into a smooth, inertial scroll that GSAP scrubs against. The GSAP + Lenis pairing is the modern standard for this kind of experience. |

### Why GSAP + Lenis specifically (and how they connect)

Lenis intercepts scrolling and produces a smoothed scroll position. GSAP's
ScrollTrigger reads scroll position to drive timelines. We wire them together so
**Lenis is the source of truth and GSAP reads from it** on every frame:

```ts
// scroll/initScroll.ts (shape, not final code)
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const lenis = new Lenis({ smoothWheel: true, syncTouch: true });

// Drive GSAP's ticker from Lenis, and tell ScrollTrigger to update on each Lenis frame
lenis.on('scroll', ScrollTrigger.update);
gsap.ticker.add((time) => lenis.raf(time * 1000));
gsap.ticker.lagSmoothing(0);
```

The result: one animation clock, no fighting between two scroll systems, and
buttery scrubbing.

### Other dependencies (each justified)

| Dependency | Why we add it | Could we skip it? |
|---|---|---|
| `lenis` | Smooth scroll (above). | No — it's a locked decision and core to the feel. |
| `gsap` (incl. ScrollTrigger) | Animation engine (above). | No — locked decision. |
| `clsx` or `tailwind-merge` | Tidy conditional classNames in the overlay UI. | Optional, low cost. |
| `@fontsource/dm-sans` (or self-hosted DM Sans files) | Ship the typeface locally so text renders instantly and offline-safe; no FOUT from a CDN round-trip. | Could use a `<link>` to Google Fonts, but self-hosting is faster and more reliable. |

We deliberately **do not** add: a state-management library (scene state lives in
config + refs), an image CDN/SDK (assets are static files), or a UI component
kit (the only UI is text overlays and a couple of buttons).

### GSAP licensing status for this use case

As of late 2024, **GSAP including ScrollTrigger is free to use**, including the
former "Club" plugins, under a standard no-charge license (GSAP is now
maintained under Webflow). For a standard website/web app like this one, there
is no fee and no commercial-license purchase required. **Action for Johno:**
confirm the current GSAP license terms on the official GSAP site at build time
and keep a note of it in the repo (`LICENSES.md`), since licensing terms can
change. Nothing in our plan depends on a paid plugin.

---

## 3. Project structure

A standalone repo (separate from skill-flow-pro). Suggested tree:

```
the-alcan-way/
├─ index.html
├─ package.json
├─ vite.config.ts
├─ tailwind.config.ts
├─ tsconfig.json
├─ LICENSES.md                 # note GSAP/Lenis/font licenses
├─ public/
│  └─ assets/
│     ├─ characters/           # final character sprite sheets (PNG) drop here
│     ├─ environment/          # final environment layer PNGs drop here
│     ├─ props/                # standalone props (cup, mirror, review card…)
│     └─ ui/                   # title art, icons, scroll prompt
├─ src/
│  ├─ main.tsx                 # React root, mounts <App/>
│  ├─ App.tsx                  # loading screen → Experience, reduced-motion gate
│  ├─ scroll/
│  │  ├─ initScroll.ts         # Lenis + GSAP wiring (section 2)
│  │  └─ useScrollProgress.ts  # helpers/hooks if needed
│  ├─ engine/
│  │  ├─ Stage.tsx             # the single long horizontal stage + parallax layers
│  │  ├─ Scene.tsx             # generic scene renderer (reads scene config)
│  │  ├─ buildTimeline.ts      # turns a scene config into a GSAP timeline
│  │  ├─ Character.tsx         # sprite renderer + animation state
│  │  └─ Overlay.tsx           # principle title / insight / dialogue / pro-move
│  ├─ content/
│  │  ├─ scenes.ts             # THE data file: all scenes described as config
│  │  ├─ copy.ts               # all text (principles, insights, dialogue, pro moves)
│  │  └─ manifest.ts           # asset slot → file path map (placeholder & final)
│  ├─ components/
│  │  ├─ LoadingScreen.tsx
│  │  ├─ ReadAsText.tsx        # linear text fallback for a11y / reduced motion
│  │  └─ ScrollPrompt.tsx
│  ├─ lib/
│  │  ├─ preload.ts            # preload all manifest assets, report progress
│  │  └─ pixel.ts              # image-rendering: pixelated helpers, scale math
│  └─ styles/
│     └─ index.css             # Tailwind + global pixel/letterbox rules
└─ README.md
```

What each area holds:

- **`scroll/`** — owns the Lenis/GSAP marriage. Nothing else touches scroll
  setup.
- **`engine/`** — generic, content-free machinery. `Stage` lays out the world;
  `Scene` + `buildTimeline` turn config into animation; `Character` and
  `Overlay` are dumb renderers driven by props.
- **`content/`** — where the experience actually lives. `scenes.ts` is the
  script. `copy.ts` is every word on screen (accessibility requirement: text is
  data, never baked into art). `manifest.ts` maps named slots to files.
- **`components/`** — the non-stage UI: loading screen, scroll prompt, the
  "read as text" fallback.
- **`lib/`** — preloading and pixel-rendering utilities.

---

## 4. Scroll and scene architecture (the core)

This is the heart of the build. The goal: the prologue, 9 scenes, hallway
transitions, and epilogue are **all the same kind of thing** — a `Scene`
described by data — not a pile of bespoke components.

### The single-stage model (recommended)

We model the office as **one long horizontal stage** (3–4 "screens" wide at
native art resolution), composed of stacked parallax layers. We do **not** pan
each scene independently. Instead:

- The stage is a wide element with three layers: **back** (walls, windows,
  ceiling), **mid** (furniture, fixtures), **front** (characters, interactive
  props).
- Vertical scroll progress maps to a horizontal `translateX` of the stage. As
  you scroll down, the world slides left, so the camera appears to move right.
- Parallax = each layer translates at a different rate. Back layer moves
  slowest, front fastest. One scroll input, three translate outputs.

Why single-stage over per-scene panning: it gives the **continuous,
never-cuts** feeling the PRD demands (the family walks one unbroken path), the
hallways become real connective space rather than transition tricks, and
parallax is trivial because it's just three coefficients on one scroll value.
Per-scene panning would force us to re-stitch backgrounds at every boundary and
risk visible seams.

### Pinning: how a scene "holds" while things happen

The continuous horizontal slide is interrupted by **pinned beats**. A pinned
scene is one where the stage stops translating (the camera holds still) while
scroll progress instead drives an internal timeline — a character stands up,
text fades in, a tool is shown. ScrollTrigger's `pin: true` handles this: the
stage is fixed in place for a span of scroll, and `scrub` ties the timeline's
playhead directly to scroll position inside that span.

So the experience alternates:

- **Travel beats** — stage translates horizontally (walking through hallways,
  approaching the desk).
- **Pinned beats** — stage holds; an internal timeline of character actions and
  text plays, scrubbed by scroll.

### Scrubbed timelines mapped to scroll progress

Every pinned beat is a GSAP timeline with `scrub` so it is 100% scroll-linked
(nothing autoplays — locked PRD requirement). Scroll forward = timeline plays
forward; scroll back = it reverses. We place actions on the timeline by
**fraction of the scene**, not by seconds, so they always line up with the
scroll span no matter how long that span is.

### Characters: entrances, exits, trigger-actions

Characters live on the front layer from load (no DOM churn). Each character's
appearance in a scene is described as a set of keyframed properties on that
scene's timeline:

- **Entrance** — translate from off-stage to a mark, while the sprite plays its
  walk cycle.
- **Hold/idle** — at the mark, sprite switches to idle (or seated).
- **Action** — at a timeline fraction, sprite swaps to an action frame
  (stand-up, crouch, present, hand-off) and may translate slightly.
- **Exit** — translate off-stage with walk cycle, or fade if they simply leave
  frame.

The sprite "frame" shown at any moment is itself a function of scroll progress
(see section 5), so walk cycles animate as the character moves.

### Text overlays: fade in, persist, fade out per zone

Overlays are DOM elements (section 6) positioned over the stage. Each overlay
has a scroll window: fade in at its start fraction, persist (full opacity)
through its hold, fade out before the next beat. Principle titles get a longer
hold and a backing scrim; insight text is shorter and lighter. Because overlays
are tied to scene fractions, they reverse cleanly when the user scrolls back up.

### Blending, not hard cuts

Adjacent scenes overlap their scroll windows (the PRD's "overlap is
intentional"). A travel beat's end fades into the next pinned beat's intro; the
stage keeps a little momentum into the pin so the stop feels eased, not abrupt.
Environment color-temperature shifts (warm lobby → cool exam room → warm
checkout) are driven as a tween on an overlay tint layer across the hallway
transitions, so zones melt into each other.

### A scene described as data (pseudo-config)

This is roughly how **Scene 1 — The Greeting** looks in `scenes.ts`. It is
illustrative shape, not final API:

```ts
{
  id: 'act1-scene1-greeting',
  scroll: { start: 0.10, end: 0.22 },     // % of total scroll (from PRD table)
  pin: true,                              // camera holds on the lobby
  cameraX: 'lobby-desk',                  // named mark on the stage
  characters: [
    { slot: 'parent', at: 'lobby-desk-left',  pose: 'tense',  enter: false },
    { slot: 'child',  at: 'lobby-desk-left',  pose: 'idle',   enter: false },
    {
      slot: 'frontdesk', at: 'desk',
      keyframes: [
        { at: 0.15, pose: 'seated' },
        { at: 0.35, pose: 'standup' },    // KEY animation: rises to standing
        { at: 0.45, pose: 'idle' },
        { at: 0.60, prop: 'cup', action: 'offer' },
      ],
    },
    { slot: 'parent', keyframes: [{ at: 0.55, pose: 'relaxed' }] }, // posture shift
  ],
  overlays: [
    { type: 'dialogue', copy: 'greeting.welcome',   window: [0.30, 0.55] },
    { type: 'insight',  copy: 'greeting.insight1',  window: [0.40, 0.70] },
    { type: 'insight',  copy: 'greeting.insight2',  window: [0.65, 0.95] },
  ],
}
```

`buildTimeline.ts` reads this and produces a GSAP timeline: places the
character keyframes at their fractions, registers the overlay fade windows, and
attaches the ScrollTrigger with `pin`, `scrub`, and the `start/end` derived
from the scroll percentages. Add a scene by adding an object; tune timing by
editing numbers.

### Mapping the PRD scroll table to the abstraction

| PRD section | Scroll % | Scene config behavior |
|---|---|---|
| Prologue (title, arrival) | 0–10% | Travel beat: stage enters; title overlay; scroll prompt; parent+child walk into lobby. |
| Scene 1 — Greeting | 10–22% | Pinned lobby; front-desk stand-up keyframe; 2 insight overlays. |
| Scene 2 — Doctor preview | 22–28% | Same pin continues; dialogue + insight + first Pro Move callout. |
| Scene 3 — Handoff | 28–40% | Assistant entrance (walks in from right), crouch-to-child keyframe, group exits right. |
| Hallway 1 transition | 38–42% | Travel beat; principle-1 recap overlay; window-to-outside parallax; warm→cool tint begins. |
| Scene 4 — Tell/Show/Do | 42–52% | Pinned exam room; child seated; assistant show-mirror keyframe; insight + Pro Move. |
| Scene 5 — Warm handoff | 52–62% | Doctor entrance from left; assistant present keyframe (stays in room); two insights. |
| Scene 6 — Doctor's question | 62–70% | Doctor turn-to-parent keyframe; insight + Pro Move. |
| Transition to Act 3 | 68–72% | Travel beat; principle-2 recap; cool→warm tint begins. |
| Scene 7 — Small moment | 72–80% | Pinned; intimate action (blanket/prize/reassure); insight. |
| Scene 8 — Walkout + checkout | 80–90% | Travel beat through hallway 2 to desk; front-desk greet keyframe; goodbye dialogue; family exits. |
| Scene 9 — Review | 90–95% | Stage fades; phone + Google-review card overlay; insight + final challenge. |
| Epilogue | 95–100% | Empty-office frame (lights on); three principles overlay; back-to-top link. |

---

## 5. Character and sprite system

### Sprite sheets

Each character is one PNG **sprite sheet**: a grid of equal-size frames (idle,
walk frames, seated, action poses). One image, many frames, loaded once.

A character is a `<div>` sized to one frame, with the sprite sheet as its
`background-image`. We show a given frame by setting `background-position` to
that frame's cell. The whole element is scaled up with nearest-neighbor
rendering (`image-rendering: pixelated`) to keep crisp pixels, and moved on
stage via `transform: translate3d(...)`.

```ts
// conceptual: show frame N of a sheet with `cols` columns and frame size fw×fh
const col = n % cols;
const row = Math.floor(n / cols);
el.style.backgroundPosition = `-${col * fw}px -${row * fh}px`;
```

### Animation states

- **Idle** — single frame (or a tiny 2-frame breathe).
- **Walk** — 2–4 frame loop. While a character is translating across the stage,
  we advance the walk frame as a function of distance/scroll, so footsteps sync
  to motion. Because all motion is scroll-linked, the walk cycle advances when
  the user scrolls and freezes when they stop — which actually looks correct.
- **Seated** — single frame (child in chair, front desk seated).
- **Action poses** — discrete frames triggered at timeline fractions: front
  desk **stand-up**, assistant **crouch** / **hold-mirror** / **present**,
  doctor **enter** / **turn**, parent **relaxed**↔**tense**.

The current frame is chosen by the scene timeline: keyframes set "which pose,"
and within a walking pose the frame index is derived from scroll progress.

### Positioning on the stage

Characters are absolutely positioned within the front layer using named marks
(e.g. `desk`, `lobby-desk-left`, `chair`). Marks are defined per zone as x/y
coordinates in stage space, so `at: 'desk'` resolves to a real position. Moving
a character = tweening its `translate3d`.

### Placeholder → final swap (mechanically)

The manifest (`content/manifest.ts`) maps each **slot** (e.g.
`frontdesk.sheet`) to a file path and the sheet's geometry (frame size,
columns, frame index for each named pose). In development the path points at a
placeholder asset and the geometry might be a simple 1-row strip of flat-color
blocks. When Johno delivers `frontdesk.png`, we drop it in
`public/assets/characters/`, update that one manifest entry's path (and confirm
its frame size/columns/pose-indices match the spec in section 10), and
everything else — positions, timelines, overlays — is unchanged. **No component
code changes to swap art.** This is why the asset spec locks frame sizes and
pose order up front: the manifest and the art must agree on the grid.

---

## 6. Text overlay and content system

**All copy lives in `content/copy.ts` and renders into the DOM** — never baked
into pixel art. This is the accessibility backbone (screen readers, the
read-as-text fallback, future localization) and it lets us tune wording without
regenerating art.

Overlay types (each a small React component, styled with Tailwind, DM Sans):

| Type | Look | Behavior |
|---|---|---|
| **Principle title** | Large, centered, high contrast, semi-transparent scrim behind for readability over art. The "chapter card." | Longer hold; fades in at act start, recaps in the hallway. |
| **Insight** | Smaller, to the side/below the action, lighter/italic weight, subtle backing. The reflective "why this matters." | Fades in, persists through the beat, fades out. |
| **Dialogue** | See recommendation below. | Appears with the speaking character's beat. |
| **Pro Move callout** | Small lightning-bolt icon + one line, low-key chip in a corner. Feels like "bonus content," not the main lesson. | Brief, subtle fade; never competes with the insight. |

### Dialogue: speech bubbles vs captions — recommendation

**Use clean UI captions as the default, with an optional small pixel-art
bubble tail pointing at the speaker.** Reasoning: captions are far more readable
on a 380px phone, they keep all dialogue in selectable DOM text (accessibility),
and they let us use DM Sans consistently with the rest of the type. A tiny
pixel "tail" or a character-tinted left border on the caption preserves "who is
speaking" and a touch of immersion without sacrificing legibility. Full
pixel-art bubbles risk illegible text and force copy into awkward shapes. (This
is a soft recommendation; see Open Questions — worth a quick side-by-side once
the first scene is built.)

### Type

DM Sans (self-hosted), per the PRD. Titles bold and large; insights regular or
light, slightly smaller; captions a notch smaller again. The deliberate
contrast between crisp clean type and chunky pixel art is the intended polished
look — we keep it.

---

## 7. Responsive strategy

Mobile-first. Primary target ~380px wide.

- **Mobile (< 480px)** — full-width stage; the camera framing is tuned so one
  character beat fills the viewport comfortably. Text overlays sit below or over
  the action with high-contrast backing scrims. This is the canonical
  experience; we design every beat to read here first.
- **Tablet (480–1024px)** — same scroll mechanic and same stage, given more
  breathing room: the stage is centered with margins, insights can sit beside
  the action rather than under it.
- **Desktop (> 1024px)** — centered with a max-width; optional cinematic
  letterboxing (the PRD allows this) so the pixel art doesn't over-stretch.
  `image-rendering: pixelated` keeps the upscale crisp at any size.

Implementation note: because the stage scales as a whole via `transform`, "scale
up" across breakpoints is mostly choosing a stage scale factor and overlay
layout per breakpoint, not rebuilding scenes. Character marks are in stage
space, so they follow the scale automatically.

---

## 8. Accessibility and reduced motion

- **`prefers-reduced-motion`** — when set, we **do not** run the scrubbed
  scroll experience. Instead we render a static, vertically-stacked version: one
  representative still per scene (the key action frame) with its principle
  title, insight, dialogue, and Pro Move as plain text beneath. The user scrolls
  normally through a clean illustrated article. Same content, no motion.
- **"Read as text" fallback** — a persistent, easy-to-find link
  (`ReadAsText.tsx`) that opens a purely linear, text-first version of the whole
  script: principles, every insight, every line of dialogue, the review, the
  challenge. This is the screen-reader path and a respectful option for anyone
  who just wants the words.
- **DOM-based text** — because all copy is real DOM text (section 6), screen
  readers get everything even in the full experience.
- **Focus and scroll considerations** — Lenis must not trap keyboard users;
  ensure keyboard scrolling (space/arrows/Page Down) still advances the
  experience, and that the read-as-text link and back-to-top are reachable by
  tab. Provide a visible skip/"read as text" affordance early so nobody is
  forced to scroll 6000vh to reach content.
- Respect that some users land on desktop with a mouse wheel — the experience
  must be completable by wheel, trackpad, touch, and keyboard.

---

## 9. Performance plan

### Budget

- **< 2MB total assets** (all sprite sheets + environment layers + props + UI),
  per the PRD. Pixel art compresses extremely well as PNG-8 with a limited
  palette, so this is very achievable. Track the running total in the manifest.
- **60fps scroll** on iPhone 12 / equivalent Android.
- **No layout shift** during scroll (CLS ~0). The stage is built once.

### Loading strategy

- A **loading screen** preloads every asset in the manifest before scroll is
  enabled, showing a simple percentage or pixel progress bar (`lib/preload.ts`).
  Scroll is disabled (Lenis stopped) until preload completes, so there is never
  mid-scroll pop-in.
- Keep the loading screen on-brand and short; with a <2MB budget it should be a
  second or two on a normal connection.

### Rendering discipline

- `image-rendering: pixelated` on all upscaled pixel art (with `-webkit-`
  fallback) so nearest-neighbor scaling preserves crisp edges.
- Sprite sheets and environment layers sized so the browser upscales cleanly
  (integer-ish scale factors avoid shimmer).
- **`will-change: transform` discipline** — apply it to the parallax layers and
  to characters only while they're in their active scene window; remove it
  otherwise. Promoting everything permanently wastes GPU memory and can *hurt*
  performance on phones. ScrollTrigger callbacks (`onEnter`/`onLeave`) are good
  hooks for toggling this.
- Animate only `transform` and `opacity`. (Restating the cardinal rule because
  it's the one that most often gets violated under deadline pressure.)

### How to profile

- Chrome DevTools **Performance** panel with CPU throttling (4–6x) and the FPS
  meter, plus the **Rendering** tab's "Paint flashing" and "Layer borders" to
  confirm we're not repainting or creating surprise layers during scroll.
- Test on a **real mid-range phone** early and often — emulation lies about
  scroll feel. Lenis + GSAP behavior on real touch hardware is the only honest
  signal.
- Watch the layers count and JS heap; if scroll stutters, the usual culprits are
  (a) a non-transform property sneaking into a tween, (b) too many promoted
  layers, or (c) an oversized environment image forcing huge composited
  surfaces.

---

## 10. Asset manifest and production spec

**This section is for Johno.** It lists every piece of art the experience needs.
You can generate these with AI tools (notes at the end) and hand them back as
PNG files with the exact names listed. Treat it as a checklist — when every box
is filled, the experience has its final look.

A few conventions used throughout:

- **Native resolution** = the small pixel size the art is actually drawn at.
  Pixel art is created small and scaled up in the browser, so "32×48" means a
  32-pixel-wide, 48-pixel-tall little figure. The browser blows it up crisply.
- **Scale-up factor** = how much the browser enlarges it on screen. We plan
  around roughly **4–6×** (so a 48-tall character shows ~200–290px tall on a
  phone). You don't need to do the scaling — just draw at native size.
- **Format** = **PNG** with a **transparent background** for anything that sits
  on top of the scene (characters, props). Environment layers can be PNG too;
  back layers may be opaque, mid/front layers need transparency where the layer
  behind should show through.
- **Sprite sheet** = one PNG image containing several frames laid out in a grid.
  For each character below, all its poses go in **one** sheet, each frame the
  same size, arranged left-to-right in the order listed. Keep the order exactly
  as written so the code can find each pose.

### 10a. Characters (5)

Each character is **one sprite sheet PNG**. Recommended native frame size and
the frames it must contain are below. Lay frames out in a single row (or wrap to
a second row if it gets very wide — just keep the listed order). Transparent
background. File goes in `public/assets/characters/`.

> **Frame size guidance:** child ≈ **32×48**; adults (parent, front desk,
> assistant, doctor) ≈ **48×64**. Every frame in a given character's sheet must
> be the **same** size.

| Slot (filename) | Frames needed (in this order) | Frame size | Notes |
|---|---|---|---|
| `child.png` | idle, walk-1, walk-2, walk-3, walk-4, seated, touch-reach (reaching to touch the mirror/prize), wave | 32×48 | Bright shirt, small. Maybe a backpack/toy. |
| `parent.png` | idle-tense, idle-relaxed, walk-1, walk-2, walk-3, walk-4, seated, seated-relaxed | 48×64 | Taller, muted colors. Tense vs relaxed = shoulder/posture shift. |
| `frontdesk.png` | seated, standup, idle-standing, walk-1, walk-2, offer (holding a cup/gesture), wave | 48×64 | Distinct uniform (e.g. blue/teal top). Stand-up is the key pose. |
| `assistant.png` | idle, walk-1, walk-2, walk-3, walk-4, crouch (down to child height), hold-mirror, present (gesturing toward family during handoff), comfort (placing blanket / reassuring) | 48×64 | Different uniform (e.g. green/sage scrubs). The busiest character — appears in all three acts. |
| `doctor.png` | enter-walk-1, enter-walk-2, idle, turn-to-family, turn-to-parent | 48×64 | White coat / professional attire. Only in the exam room. |

> **Pose count reality check:** these counts are generous. If generating all
> poses is hard, the **minimum viable** set per character is: idle, a 2-frame
> walk, and that character's one signature action (front desk stand-up,
> assistant show-mirror, doctor enter, parent relaxed/tense, child seated).
> Everything else can reuse idle at first.

### 10b. Environment zones (parallax layers)

The office is one continuous strip, left → right: **lobby → hallway 1 → exam
room → hallway 2 → checkout**. Each zone is delivered as **up to three layered
PNGs** (back / mid / front) so we can parallax them. If three layers per zone is
too much to start, deliver a **single combined PNG per zone** and we'll split
later — but separate layers look noticeably better.

> **Sizing:** draw each zone roughly **one screen wide at native res** (target
> ~**320–384 px wide** native, scaled up ~4–6×), full viewport tall. The five
> zones placed side by side make the ~3–4-screen-wide world.

| Zone | Layer | Filename | Contents |
|---|---|---|---|
| Lobby | back | `lobby-back.png` | Walls, ceiling, window(s) to outside, welcome sign. Warm colors. |
| Lobby | mid | `lobby-mid.png` | Front desk counter, waiting chairs, plants, beverage station. |
| Lobby | front | `lobby-front.png` | Play-area toys, foreground plant/edge details. |
| Hallway 1 | back | `hall1-back.png` | Narrower walls, a window to outside (trees/sky). |
| Hallway 1 | mid | `hall1-mid.png` | Wall art (kid drawings, Alcan branding), a bench maybe. |
| Exam room | back | `exam-back.png` | Cooler-temperature walls, cabinetry, calm not clinical. |
| Exam room | mid | `exam-mid.png` | Dental chair (center), overhead light, equipment tray, corner chair for parent. |
| Exam room | front | `exam-front.png` | Foreground tray/edge detail. |
| Hallway 2 | back | `hall2-back.png` | Shorter connecting hallway, warming back toward lobby tones. |
| Hallway 2 | mid | `hall2-mid.png` | Light wall detail. |
| Checkout | back | `checkout-back.png` | Front-desk area again, warm tones (can reuse lobby palette). |
| Checkout | mid | `checkout-mid.png` | Desk/counter, scheduling area. |

> **Color temperature:** lobby + checkout warm; exam room cooler/calmer;
> hallways transition between. If you can, keep a consistent floor line and
> ceiling height across all zones so they tile into one continuous wall when
> placed side by side.

### 10c. Props and fixtures (standalone, transparent PNGs)

These are small separate images we attach to characters or place in scenes.
File goes in `public/assets/props/`.

| Filename | What it is | Approx native size |
|---|---|---|
| `prop-cup.png` | Beverage cup the front desk offers | ~12×16 |
| `prop-mirror.png` | Tiny dental mirror the assistant shows | ~12×16 |
| `prop-blanket.png` | Small blanket for the "small moment" | ~24×16 |
| `prop-treasure.png` | Prize/treasure chest (optional small-moment variant) | ~24×24 |

### 10d. The phone / Google-review card (Scene 9)

For the review moment the office fades and a phone with a review appears. File
goes in `public/assets/ui/`.

| Filename | What it is | Notes |
|---|---|---|
| `review-phone.png` | A pixel-art phone outline/frame, OR leave this empty and we render a clean UI card | ~120×220 native if pixel-art. The ★★★★★ stars and review text are **DOM text on top**, not baked in (accessibility). |
| `icon-star.png` (optional) | A single pixel star if you want pixel stars instead of font stars | ~16×16 |

### 10e. UI and title elements

File goes in `public/assets/ui/`.

| Filename | What it is | Notes |
|---|---|---|
| `title-mark.png` (optional) | A pixel-art "The Alcan Way" logo/sign, if desired | Title can also be pure DM Sans text; art is optional flourish. |
| `scroll-prompt.png` (optional) | A small animated-feel arrow / "scroll to begin" chevron | Can be CSS instead. |
| `icon-promove.png` | The small lightning-bolt for Pro Move callouts | ~16×16, or use an emoji/SVG. |

### 10f. How to generate these (tooling notes)

- **AI pixel-art generation:** image models can produce 16-bit/SNES-style
  characters and rooms. Prompt for "16-bit SNES-style pixel art, [subject],
  transparent background, side view, clean limited palette." Generate each pose
  separately, keeping the character's colors/outfit consistent across poses
  (reference the previous image / use the same seed where the tool allows).
- **Cleaning up + transparency:** AI output often needs the background removed
  and pixels tidied. **Aseprite** (paid, the standard pixel-art editor) or the
  free **Piskel** (piskelapp.com, browser-based) are ideal for cleaning frames,
  fixing palettes, and ensuring crisp pixels. **Photopea** (free, browser
  Photoshop clone) is good for background removal.
- **Assembling sprite sheets:** the cleanest path is to place each pose as an
  equal-size frame in a row. Aseprite exports sprite sheets directly (File →
  Export Sprite Sheet) with a fixed grid — use it and tell the implementer the
  exact frame size and column count it produced. If you'd rather not, a free
  online "sprite sheet packer" (e.g. TexturePacker free tier, or
  `spritesheet.js` tools) can pack named frames; share the resulting JSON/layout
  with the implementer.
- **Non-PNG needs:** none required. Everything here is PNG. We only reach for a
  sprite-sheet packer or Aseprite if hand-aligning frames in Piskel gets
  tedious — both are warranted once you have more than a few poses per
  character.
- **Consistency matters more than detail.** Same palette, same lighting, same
  outline weight across all art reads as "intentional and polished" even if any
  single sprite is simple. When in doubt, keep it simpler and consistent.

### 10g. Asset checklist (tick as delivered)

- [ ] `child.png` sheet (8 frames)
- [ ] `parent.png` sheet (tense/relaxed + walk + seated)
- [ ] `frontdesk.png` sheet (stand-up key pose)
- [ ] `assistant.png` sheet (crouch / hold-mirror / present / comfort)
- [ ] `doctor.png` sheet (enter / turns)
- [ ] Lobby layers (back/mid/front)
- [ ] Hallway 1 layers (back/mid)
- [ ] Exam room layers (back/mid/front)
- [ ] Hallway 2 layers (back/mid)
- [ ] Checkout layers (back/mid)
- [ ] Props: cup, mirror, blanket, (treasure)
- [ ] Review phone (or confirm "render as UI card")
- [ ] Pro Move icon (or confirm emoji/SVG)
- [ ] Title + scroll-prompt art (optional)

---

## 11. Deployment and hosting walkthrough

**This section is for Johno.** It assumes no prior deployment experience and
walks through getting the experience live at its own address under
**mypromoves.com**.

### Recommended host: Vercel

For a static Vite site, **Vercel** is the simplest good choice: it builds
directly from a GitHub repo, gives free HTTPS, redeploys automatically whenever
you push a change, and makes custom-domain/subdomain setup very easy. (Netlify
is essentially equivalent — either is fine. We'll describe Vercel.)

### Recommended subdomain

Use **`way.mypromoves.com`**. It's short, memorable, and reads naturally
("the Alcan Way" lives at "way"). The main app stays at `mypromoves.com` and
links over to it.

### Step 1 — Put the code on GitHub

The implementer pushes the finished repo to a GitHub repository (e.g.
`the-alcan-way`). You just need to be an owner/collaborator so you can connect
it to Vercel.

### Step 2 — Create the Vercel project

1. Go to vercel.com and sign in with GitHub.
2. Click **Add New → Project**, pick the `the-alcan-way` repo.
3. Vercel auto-detects Vite. Confirm: **Build command** `npm run build`,
   **Output directory** `dist`. Click **Deploy**.
4. After a minute you get a live `*.vercel.app` URL. Open it on your phone to
   confirm the experience works. This is the experience, just not on the pretty
   domain yet.

### Step 3 — Connect the `way.mypromoves.com` subdomain

1. In the Vercel project: **Settings → Domains → Add**, enter
   `way.mypromoves.com`.
2. Vercel shows you a DNS record to add. For a subdomain it's almost always a
   **CNAME**:
   - **Type:** CNAME
   - **Name / Host:** `way`
   - **Value / Target:** `cname.vercel-dns.com` (Vercel shows the exact value)
3. Go to wherever **mypromoves.com**'s DNS is managed (your domain registrar —
   GoDaddy, Namecheap, Cloudflare, etc.; this is the same place you bought or
   manage the domain). Add that CNAME record exactly as Vercel specifies.
4. Save. DNS can take a few minutes to a couple of hours to propagate. Vercel's
   Domains page shows a green check when it's verified.

### Step 4 — HTTPS

Nothing to do. Vercel automatically issues and renews a free SSL certificate
once the domain verifies. `https://way.mypromoves.com` will just work and show
the padlock.

### Step 5 — Updating the site later (redeploy flow)

Whenever the implementer pushes a change to GitHub (new art, copy tweak, scene
fix), **Vercel rebuilds and redeploys automatically.** No manual step. For
art-only swaps you (or they) drop the new PNGs into `public/assets/...` with the
same filenames, commit/push, and the live site updates in ~a minute. To roll
back a bad change, Vercel's dashboard lets you click a previous deployment and
"Promote to Production."

### Step 6 — Link from the ProMoves app

In the existing ProMoves app, add a simple menu **tile/link** (e.g. on the
pro-moves home surface) labeled something like **"The Alcan Way"** with a short
subtitle ("Follow one family through their visit"). It links to
`https://way.mypromoves.com` and **opens in a new tab** (`target="_blank"
rel="noopener"`), since it's a separate standalone experience. That's the whole
integration — a link out. No shared code, no shared auth, nothing that could
slow the main app or the experience down. Keep it simple.

---

## 12. Phased build roadmap

Each milestone is independently demonstrable, so progress is visible the whole
way.

### M1 — Scaffold + smooth-scroll smoke test
Stand up the Vite + React + TS + Tailwind repo. Wire Lenis + GSAP ScrollTrigger
(section 2). Build one tall dummy page with a couple of colored boxes that pin
and parallax on scroll.
**Demo:** scroll feels smooth and a box pins/moves correctly on a real phone.
This proves the engine pairing before any content exists.

### M2 — Scene engine with placeholders
Build `Stage`, `Scene`, `buildTimeline`, `Character`, `Overlay`, and the
`scenes.ts`/`manifest.ts`/`copy.ts` data files. Implement the single-stage
horizontal model with three parallax layers using flat-color placeholder
rectangles. Get **one** real scene (Scene 1 — Greeting) fully data-driven:
front-desk stand-up keyframe, character marks, two insight overlays.
**Demo:** one scene plays end-to-end from config, scrubbed by scroll, with
placeholder blocks. Proves the abstraction.

### M3 — All scenes wired with placeholder art + real copy
Fill in `scenes.ts` for the prologue, all 9 scenes, hallway transitions, and
epilogue. Drop in all real copy from `copy.ts` (principles, insights, dialogue,
Pro Moves, review, challenge). Everything runs on colored-block/SVG
placeholders.
**Demo:** the entire ~5-minute experience is scrollable start to finish with
correct text, timing, and choreography — just no final art. This is the moment
the whole thing "works."

### M4 — Responsive + reduced-motion + accessibility
Tune breakpoints (mobile/tablet/desktop), implement the `prefers-reduced-motion`
static version, the "read as text" fallback, and keyboard/focus handling.
**Demo:** the experience reads well at 380px, 768px, and desktop; reduced-motion
shows the clean stacked version; the text fallback link works.

### M5 — Final-art swap + polish + performance pass
As Johno delivers PNGs (section 10), drop them into the manifest slots. Tune
parallax coefficients, color-temperature tints, blend overlaps, and overlay
timing. Run the performance pass: profile on a real phone, enforce the <2MB
budget, fix any non-transform tweens, tune `will-change`.
**Demo:** the real, beautiful, 60fps experience on a mid-range phone.

### M6 — Deploy + link from ProMoves
Push to GitHub, set up Vercel, connect `way.mypromoves.com`, confirm HTTPS, add
the linking tile in the ProMoves app.
**Demo:** anyone can open `https://way.mypromoves.com` and the ProMoves menu
tile takes them there.

---

## 13. Open questions and risks

Real items that need Johno's input or a decision during the build (not invented
blockers):

1. **Exact subdomain name.** Plan assumes **`way.mypromoves.com`**. If you'd
   prefer `thealcanway.mypromoves.com` or `experience.mypromoves.com`, say so
   before M6 — it's a one-line change but it's yours to pick.
2. **Dialogue: captions vs speech bubbles.** Recommendation is **clean captions
   with a subtle pixel tail** (section 6), for readability and accessibility.
   Worth a quick side-by-side once Scene 1 exists (M2/M3) to confirm the feel
   before committing all scenes.
3. **Art style reference locking.** The single biggest quality risk is
   *consistency* across AI-generated sprites and zones (palette, outline weight,
   lighting, character proportions). Recommend locking a small **style
   reference** (one character + one room you're happy with) early, then matching
   everything to it. Inconsistent art is what would make this feel amateurish
   rather than polished — worth the upfront discipline.
4. **Scene 7 "small moment" choice.** The PRD offers three options (blanket /
   prize from treasure chest / reassuring the parent). Pick one to build first
   (plan assumes **blanket**, simplest to animate). Rotating between them is a
   nice later enhancement but not needed for v1.
5. **GSAP license confirmation.** Believed free for this use (section 2);
   confirm current terms at build time and record them in `LICENSES.md`. Low
   risk, just don't skip the check.
6. **Final copy readiness.** Insight/reflection copy and the Google-review text
   are still "needs writing" per the PRD. M3 needs the real words; placeholder
   copy is fine through M2 but the experience can't ship without final text.
