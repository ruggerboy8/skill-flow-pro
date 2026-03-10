

# Fix Recorder Pill: Stick to Active Pro Move Card

## Problem
The floating recorder pill sits at `fixed top-1/2` (viewport center) and relies on an IntersectionObserver with a narrow `-40% 0px -40% 0px` root margin. The top pro-move cards never enter that center band, so they're never highlighted. The pill feels disconnected from the content.

## Solution
Replace the fixed-center positioning with **dynamic vertical tracking** — the pill's `top` follows the active pro-move card's position in the viewport, with a CSS transition for smooth "resistance" sliding.

### 1. Replace IntersectionObserver with scroll-based tracking (`CoachBaselineWizard.tsx`)
- On scroll (via `requestAnimationFrame`), iterate `proMoveRefs` and find the card whose top edge is closest to ~30% from viewport top (a natural reading line).
- Only switch active card when a new card has been closest for 150ms (debounce = resistance).
- On record start, immediately set first pro-move as active — no change needed here, already works.

### 2. Pass pill position from wizard to `FloatingRecorderPill`
- Add a new prop `anchorTop?: number` to `FloatingRecorderPill`.
- When provided, pill uses `top: anchorTop` (in px) instead of `top-1/2 -translate-y-1/2`.
- Add `transition: top 0.4s ease-out` inline for the smooth sliding effect.
- The wizard calculates `anchorTop` from the active card's `getBoundingClientRect().top`.

### 3. Remove the narrow-band IntersectionObserver
- Delete the current `useEffect` that creates the IntersectionObserver (lines 54-92).
- Replace with a scroll listener that runs the proximity check above.

### Files Changed
- `src/components/clinical/CoachBaselineWizard.tsx` — swap observer for scroll listener, compute `anchorTop`, pass to pill
- `src/components/coach/FloatingRecorderPill.tsx` — accept `anchorTop` prop, use dynamic positioning with transition

