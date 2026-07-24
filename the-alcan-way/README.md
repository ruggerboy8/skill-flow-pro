# The Alcan Way

A standalone, mobile-first, scroll-driven pixel-art experience that walks Alcan
staff through one family's visit, anchored to the three Hospitality Principles.

This is a **self-contained app** (its own `package.json`, build, and deploy
target). It lives inside the `skill-flow-pro` repo for shared version control and
local tooling, but it does not import from or depend on the main app. It is
intended to deploy independently (e.g. `way.mypromoves.com`) and be linked to
from inside ProMoves.

- **Plan:** `../docs/features/the-alcan-way-build-plan.md`
- **Art spec / prompts:** `../docs/features/the-alcan-way-art-prompts.md`
- **Creative brief / PRD:** source of all copy and scene structure.

## Run it

```bash
npm install
npm run dev      # http://localhost:5174
npm run build    # production build to dist/
```

## Stack

Vite + React + TypeScript, Tailwind v4, GSAP ScrollTrigger (pin) + Lenis
(smooth scroll). See the build plan for the why.

## How it works (architecture)

Everything is **a pure function of scroll progress** (`p`, 0..1).

- `src/content/scenes.ts` — THE script as data: camera path, character
  keyframes (mark + pose), and overlay windows. Add scenes / tune timing by
  editing this file.
- `src/content/stage.ts` — the world: zones left-to-right, named marks, parallax
  factors. Units are "zone units" where 1.0 = one viewport width.
- `src/content/copy.ts` — every word on screen (DOM text, never baked into art).
- `src/content/manifest.ts` — asset slots. Placeholder colors today; final PNG
  sprite sheets drop in here later with no other code changes.
- `src/engine/createEngine.ts` — caches the DOM nodes once and `render(p)` writes
  the whole world as `transform` + `opacity` (no layout, no DOM churn).
- `src/engine/Stage.tsx` / `Overlays.tsx` — lay out the DOM (3 parallax layers,
  placeholder characters, overlays). Dumb renderers; the engine drives them.
- `src/scroll/initScroll.ts` — the Lenis + GSAP marriage and the stage pin.

### The single-stage model

One long horizontal stage (zones side by side), three parallax layers (back /
mid / front). Vertical scroll maps to horizontal camera travel; "pinned" beats
are spans where the camera holds while character poses and overlays play. The
whole experience is one pinned stage scrubbed by scroll.

## Status

- **M1 — scaffold + smooth-scroll smoke test:** done.
- **M2 — scene engine + Scene 1 (The Greeting) from config:** done. Prologue
  (arrival + title) and Act 1 / Scene 1 (greeting: front-desk stand-up, cup
  offer, parent relaxes) run end to end on placeholder blocks.
- **M3+** — see the build plan roadmap.

## Dev-only helpers

When running `npm run dev`, the following are exposed on `window` for testing
(guarded by `import.meta.env.DEV`, never shipped):

- `__render(p)` — paint an arbitrary progress 0..1 without scrolling.
- `__lenis` — the Lenis instance (`__lenis.scrollTo(px, {immediate:true})`).
- `__ST` — the GSAP ScrollTrigger class.
