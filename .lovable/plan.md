

## Micro-Celebrations + Mobile Slide Transitions

### Current State

- **PerformanceWizard** has a `showVictory` modal (low-confidence → high-performance detection) but no confetti or enhanced celebration. After final submit, it shows a toast and immediately navigates away.
- **ConfidenceWizard** has an intervention modal but no victory moment at all. After final submit, same pattern — toast + navigate.
- Both wizards use URL-based step navigation (`/confidence/current/step/N`, `/performance/current/step/N`) with `navigate()` calls. Step changes are instant — no slide animation.
- Neither `canvas-confetti` nor `framer-motion` are in the project today.

---

### 3A — Confetti on Celebration Moments

**New dependency:** `canvas-confetti` (~3KB, zero deps)

**Where to fire:**
1. **PerformanceWizard victory modal** — fire confetti burst on `showVictory` becoming `true` (the "That's a Pro Move!" modal). Add a `useEffect` watching `showVictory`.
2. **PerformanceWizard final submit** — after successful submit (non-repair mode), instead of immediately navigating, show a brief completion state with confetti, then navigate after ~2s.
3. **ConfidenceWizard final submit** — same pattern: brief completion celebration before navigating to performance wizard or home.

**Implementation:** Create a small `src/lib/confetti.ts` helper that wraps `canvas-confetti` with a standard burst config (origin center-top, particle count ~80, spread 60, gravity 1.2). Call it from the wizards.

**Files:** `src/lib/confetti.ts` (new), `src/pages/PerformanceWizard.tsx`, `src/pages/ConfidenceWizard.tsx`

---

### 3B — Submit Button Checkmark Animation

**What:** When the user taps "Submit" on the last step, the button text transitions: `Submit` → spinner → `✓` (green check, scale-in animation) → then navigate.

**Implementation:** Add a `submitPhase` state (`idle` | `saving` | `done`) to both wizards. On submit success, set `done` which renders a `<Check>` icon with `animate-scale-in` class. After 1.5s delay, fire confetti and navigate.

**Files:** `src/pages/PerformanceWizard.tsx`, `src/pages/ConfidenceWizard.tsx`

---

### 4A — Mobile Slide Transitions

**New dependency:** `framer-motion` (~50KB gzipped, industry standard)

**How it works with URL-based steps:** Both wizards already derive `currentIndex` from the URL param. The challenge is that step changes happen via `navigate()` which triggers a full re-render, not a local state change.

**Approach:** Wrap the main content area (spine card + question/scale section) in `<AnimatePresence mode="wait">` keyed by `currentIndex`. Track direction via a `useRef` that compares previous vs current index:
- Forward (Next): enter from right (`x: 30 → 0`), exit left (`x: 0 → -30`)
- Backward (Back): enter from left (`x: -30 → 0`), exit right (`x: 0 → 30`)
- Duration: 200ms ease-out

**Scope:** Both `ConfidenceWizard.tsx` and `PerformanceWizard.tsx` render sections. The sticky footer and progress dots stay static — only the card + scale slide.

**Files:** `src/pages/PerformanceWizard.tsx`, `src/pages/ConfidenceWizard.tsx`

---

### Execution Order

1. Install `canvas-confetti` and `framer-motion`
2. Create `src/lib/confetti.ts` helper
3. Add submit phase state + checkmark animation to both wizards
4. Add confetti to victory modal and completion moments
5. Add `AnimatePresence` slide transitions to both wizard step areas

---

### Technical Detail

The `framer-motion` `AnimatePresence` needs a `custom` prop for direction. Pattern:

```tsx
const [direction, setDirection] = useState(1); // 1=forward, -1=back
const variants = {
  enter: (dir: number) => ({ x: dir * 30, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir * -30, opacity: 0 }),
};

// In handleNext: setDirection(1)
// In handleBack: setDirection(-1)

<AnimatePresence mode="wait" custom={direction}>
  <motion.div
    key={currentIndex}
    custom={direction}
    variants={variants}
    initial="enter"
    animate="center"
    exit="exit"
    transition={{ duration: 0.2, ease: "easeOut" }}
  >
    {/* spine card + scale */}
  </motion.div>
</AnimatePresence>
```

The confetti helper:
```ts
import confetti from 'canvas-confetti';
export const fireCelebration = () => confetti({
  particleCount: 80, spread: 60, origin: { y: 0.6 },
  colors: ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b'],
});
```

