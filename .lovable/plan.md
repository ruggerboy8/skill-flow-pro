

## Premium Polish — Tier 1 & 2 Implementation Plan

### 1A — Smooth Transitions on Interactive Elements

**Current state:** Most interactive elements already have `transition-colors` (buttons, toggles, sortable heads). Cards and table rows are mixed — some have `transition-shadow` or `transition-all`, many don't.

**Changes:**
- **`src/index.css`** — Add a `@layer base` rule for global interactive smoothing:
  ```css
  button, [role="button"], a, [data-state] { transition: all 150ms ease-out; }
  ```
- **`src/components/ui/card.tsx`** — Add `transition-shadow` to the base Card class so all cards get smooth shadow transitions on hover without per-instance overrides.
- **`src/components/ui/tabs.tsx`** — The TabsTrigger already has `transition-all`; no change needed.
- No per-component sweeps needed — the global rule covers buttons/links, and card.tsx covers cards.

**Files:** `src/index.css`, `src/components/ui/card.tsx`

---

### 1B — Typography Refinement

**Current state:** `tracking-tight` used in only 9 files (mostly shadcn defaults). `leading-relaxed` barely used. `font-medium` is the default weight almost everywhere — headings and body text share the same weight, flattening hierarchy.

**Changes:**
- **`src/index.css`** — Add base typography rules:
  ```css
  h1, h2, h3 { letter-spacing: -0.025em; } /* tracking-tight */
  body { line-height: 1.625; } /* leading-relaxed */
  ```
- **Targeted component sweeps** (class changes only):
  - Page headings (`text-3xl font-bold` → add `tracking-tight`)
  - Card titles: already `font-semibold` via shadcn — no change
  - Body text in wizard flows: ensure `leading-relaxed` on question/description text
  - Downgrade `font-medium` → `font-normal` on body copy where it's used as default weight (table cells, descriptions)

**Files:** `src/index.css`, wizard pages, coach dashboard (targeted class tweaks)

---

### 1C — Consistent Focus Ring System

**Current state:** shadcn components (button, input, textarea, switch, checkbox, tabs) all use `focus-visible:ring-2 focus-visible:ring-ring`. Custom elements (clickable cards, table rows, inline divs with onClick) have no focus ring at all.

**Changes:**
- **`src/index.css`** — Add global fallback:
  ```css
  :focus-visible {
    outline: 2px solid hsl(var(--ring));
    outline-offset: 2px;
    border-radius: var(--radius);
  }
  ```
  shadcn components already suppress `outline` via `focus-visible:outline-none` and use their own ring, so this only catches unhandled elements.

**Files:** `src/index.css`

---

### 2A — Skeleton Loading States (Replace Spinners)

**Current state:** 13 files use `<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary">` as the loading indicator. Another ~20+ use `<Loader2 className="animate-spin" />` (these are mostly in-button spinners which are fine to keep).

**Changes:**
- Replace the **full-page/section spinner pattern** (`animate-spin rounded-full h-8 w-8 border-b-2`) with content-shaped skeleton layouts using shadcn's existing `<Skeleton />` component.
- Target the highest-traffic views:
  - **`Layout.tsx`** (app shell loading) — skeleton sidebar + content area
  - **`CoachDashboardV2.tsx`** — already has skeleton for loading state, just refine shape
  - **`DoctorLayout.tsx`**, **`ClinicalLayout.tsx`** — skeleton page shell
  - **`BaselineWizard.tsx`**, **`CoachBaselineWizard.tsx`** — skeleton card
  - **`DoctorDetail.tsx`**, **`DoctorReviewPrep.tsx`** — skeleton card layout
  - **`LearningDrawer.tsx`**, **`DoctorProMoveLibrary.tsx`**, **`DoctorManagement.tsx`** — skeleton list items
- Keep `<Loader2 className="animate-spin" />` inside buttons (submitting states) — that pattern is correct.

**Files:** ~13 files with the `border-b-2` spinner pattern

---

### 2B — Toast Positioning + Iconography

**Current state:** ToastViewport is `top-0` on mobile, `bottom-0 right-0` on desktop. No icons on any toasts. The app uses the radix-based toast system (not sonner). 69 files call `toast({...})`.

**Changes:**
- **`src/components/ui/toast.tsx`** — Update `ToastViewport` classes: `bottom-0` on mobile (remove `top-0`), keep `sm:bottom-0 sm:right-0` on desktop. Center on mobile with `left-1/2 -translate-x-1/2`.
- **`src/components/ui/toaster.tsx`** — Add automatic icon rendering based on `variant`:
  - `default` → `CheckCircle2` (green)
  - `destructive` → `XCircle` (red)  
  - Add a new `warning` variant → `AlertTriangle` (amber)
- **`src/components/ui/toast.tsx`** — Add `warning` variant to `toastVariants` CVA config.
- No changes to the 69 toast call sites — icons are auto-added in the `Toaster` renderer based on existing variant prop.

**Files:** `src/components/ui/toast.tsx`, `src/components/ui/toaster.tsx`

---

### 2C — Hover State on Clickable Rows/Cards

**Current state:** Many clickable elements already have `cursor-pointer hover:bg-muted/50` (51 files use `cursor-pointer`). The coach dashboard table rows already have `hover:bg-muted/50`. Main gaps are clickable cards without hover elevation and some onClick divs missing `cursor-pointer`.

**Changes:**
- Audit and add `hover:shadow-md hover:-translate-y-0.5 transition-all` to standalone clickable cards:
  - `LocationCardV2.tsx` — already has `hover:shadow-md`, add subtle lift
  - `LocationHealthCard.tsx` — already has `hover:shadow-md`, add subtle lift
  - `PlatformRolesTab.tsx` role cards — add hover elevation
  - `CompetencyPicker.tsx` — already has `hover:bg-muted/50`, add cursor
- Scan for `onClick` on `div`/`tr` elements missing `cursor-pointer` and add it.
- This is a targeted sweep, not a global rule — only elements with onClick handlers.

**Files:** ~5-8 component files needing hover class additions

---

### Execution order

1C first (single CSS block), then 1A (CSS + card.tsx), then 1B (CSS + targeted classes), then 2B (toast system), then 2A (skeleton replacements), then 2C (hover sweep).

