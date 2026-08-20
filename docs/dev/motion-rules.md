# Motion rules (DSN-5c)

The written rule set for animation in the app: the Signal P motion contract
verbatim, what animates and what never does, the discrete-lap convention for
indeterminate waits, token usage, reduced-motion, and where the mark may and
may not appear. Source of truth for the brand side is
`promoves-brand/exports/README.md`; this doc is the app-side companion.

## The motion contract (verbatim, from the kit README)

> Run-once, never loops. rest → release → one lap on the centerline circle →
> deceleration → drawn home. Final frame **bit-identical** to the static
> mark. Easing cubic-bezier(0.50, 0.05, 0.15, 1); ~800–1200ms; no bounce. A
> small outward radial lift (≈2u) is permitted mid-travel; the endpoints are
> law. Direction is free (terminals are neutral). In all layered files,
> `#signal-p-structure` and `#signal-p-dot` are independent — never flatten
> them.

Everything below is the app's application of that contract, not a
reinterpretation of it, except where explicitly flagged.

## What animates

- **Loading states.** An indeterminate wait (auth resolving, data fetching a
  full-page or route-level surface) shows the Signal P mark running its lap,
  per the discrete-lap convention below.
- **Brand moments.** A one-time reveal where the mark itself is the point —
  e.g. a completion or welcome moment — uses `mode="once"`: a single lap on
  mount, then rest.
- Ordinary UI transitions (hover states, dialogs opening, sheets sliding in)
  may use the brand easing token (`ease-brand` / `--ease-brand`) with the
  quick or standard duration steps when it's a trivial, drop-in swap on an ad
  hoc transition. It is optional polish, not a mandate to retime everything
  that currently animates.

## What never animates

- **Data values.** A score, count, or percentage changing on screen updates
  instantly. No counting-up, no tweened bar fill.
- **Charts on update.** A chart re-rendering with new data redraws; it does
  not animate the transition between old and new shapes.
- **Layout reflow.** Content appearing/disappearing that changes page layout
  (e.g. a list item added) does not get a layout animation as part of this
  ticket's scope. (Existing shadcn/Radix component transitions — accordions,
  dialogs — are unaffected; see "What this ticket did not touch" below.)

## The discrete-lap "waiting" convention — flagged for John to veto

The contract says "run-once, never loops," full stop. It doesn't say what an
*indeterminate* wait — one with no known end, like an auth check or a slow
query — should do, since a single one-off lap doesn't cover an open-ended
duration.

This ticket's reading: for `mode="waiting"`, `SignalP` runs one **complete**
lap (full release → travel → deceleration → drawn home, landing bit-
identical to the static mark), rests at home for about 1.5 seconds, then
runs another complete lap, repeating for as long as the surface is actually
waiting. It is never a continuous spin — there is always a visible rest at
the static mark between laps — but over a long wait it reads as "alive"
rather than frozen.

This is an interpretation, not something the contract states outright.
**Flagged here deliberately: John should look at it running (any full-page
loading screen, or `mode="waiting"` in isolation) and veto it if it reads as
too close to a spinner in spirit.** The alternative, if vetoed, is a single
lap followed by a plain static rest for the remainder of the wait — closer
to the letter of "never loops" but silent (visually static) during a long
wait.

## Reduced motion

`SignalP` checks `prefers-reduced-motion: reduce` via `matchMedia` and, when
set, renders the static mark and never runs a lap — in `once` mode and in
`waiting` mode alike. This is not optional per-instance behavior; there is no
prop to override it. If the OS setting changes while a `waiting` instance is
mounted, it stops animating on the next check (the media query listener is
live for the component's lifetime).

## Easing and duration tokens

Defined in `src/index.css` (DSN-5a) and mirrored in `tailwind.config.ts`
(`transitionTimingFunction.brand`):

| Token | Value | Use |
|---|---|---|
| `--ease-brand` (Tailwind: `ease-brand`) | `cubic-bezier(0.50, 0.05, 0.15, 1)` | The contract's easing curve. `SignalP` evaluates it in JS (`BRAND_EASE` in `src/lib/signalPGeometry.ts`) to drive the dot's position every frame; also available as a CSS timing function for ordinary transitions that want the same feel. |
| `--duration-quick` | `200ms` | Small, immediate UI feedback (hover, focus). |
| `--duration-standard` | `400ms` | Ordinary transitions (panel open/close, fades). |
| `--duration-brand` | `1000ms` | The Signal P lap. Matches `SignalP`'s default `duration` prop. Contract range is 800–1200ms; stay inside it if you override. |

`SignalP`'s `duration` prop takes milliseconds directly (not a CSS var
reference) since the easing is evaluated in JS against `performance.now()`,
not via a CSS `transition`. Keep it in sync with `--duration-brand` by not
overriding it unless a specific surface has a reason to.

## Where SignalP may appear

- Full-page and route-level loading states (auth gate, route-level data
  loading) in `mode="waiting"`.
- One-time brand moments in `mode="once"`.
- Always via the CSS brand vars (`--brand-navy`, `--brand-bone`,
  `--brand-signal`) — never a hardcoded hex, and never a color outside the
  kit palette. `variant="dark"` swaps structure to bone for dark grounds; the
  dot is always signal blue in both variants.
- Sizes ≤24px automatically use the kit's icon build (wider bowl gap, larger
  dot) per `promoves-brand/exports/README.md`; sizes above that use the
  master build. This is handled by `buildForSize()` in
  `src/lib/signalPGeometry.ts` — don't hand-pick a build.

## Where SignalP may not appear

- **Never looping.** No prop or configuration produces a continuous spin.
  `waiting` mode's discrete laps are the only indeterminate-duration option,
  and even they always rest at the static mark between laps.
  Do not build a "spin forever" variant even for a "spinner replacement"
  request — extend the discrete-lap convention instead, or raise it as a
  contract question.
- **Never flattened.** Do not merge the structure and dot layers, give them
  the same fill, or otherwise render the mark as a single flattened shape.
- **Never recolored outside the kit palette.** No arbitrary hex, no theme
  color that isn't `--brand-navy`/`--brand-bone`/`--brand-signal`.
- Not as a button-level or inline-row spinner. Those stay as they are (see
  below); `SignalP` is for full-page/route-level surfaces and deliberate
  brand moments, not a general-purpose spinner replacement.

## What this ticket touched, and what it deliberately left alone

**Replaced:** the app-level auth gate in `src/App.tsx` (`AppRoutes`, the
`if (loading)` branch) — the one true full-page spinner div in the app
(`animate-spin rounded-full border-2 ...`) shown before a session is known.
Now renders `<SignalP mode="waiting" size={48} />`.

**Left alone, deliberately:**

- **Button-level and inline-row spinners** (`Loader2` + `animate-spin` inside
  buttons, badges, and save-status indicators — e.g. the "Saving..." badge in
  `ConfidenceWizard.tsx` / `PerformanceWizard.tsx`, the "Setting up..." button
  state in `SetupPassword.tsx`, and the ~50 other files using `Loader2` /
  `animate-spin` for in-context busy states). These are not full-page loading
  surfaces; swapping them for a 48px brand mark would be a visual downgrade
  in a tight inline context, and the ticket scopes this out explicitly.
- **The Skeleton-based page loading pattern.** Every route-level "loading
  placeholder" the app actually has (`Layout.tsx`'s role-loading gate,
  `MyRoleLayout.tsx`, `DoctorLayout.tsx`, `ClinicalLayout.tsx`,
  `AuthCallback.tsx`, and the per-domain pages under `my-role/` and
  `doctor/`) uses `<Skeleton />` shapes that preview the page's actual
  layout, not a spinner. That is a deliberate, consistent pattern already in
  use across the app — not the "ad hoc" spinners this ticket targets — so it
  was left untouched. Whether skeleton screens should eventually carry a
  Signal P accent is a design call for a future ticket, not this one.
- **The Command Center** (`RegionalDashboard` and its widgets) — explicitly
  owned by the DASH tickets per the ticket's scope.
- **shadcn/Radix component transitions** (dialogs, sheets, drawers, toasts,
  accordions). These already animate; per the ticket, they were not rewritten
  to use the brand easing.
- **Sweeping transition retiming.** No app-wide swap of `transition-all` /
  `transition-colors` onto `ease-brand` was made. The shadcn `Button`
  component's base `transition-colors` was considered and rejected as a
  candidate: it underlies effectively every button in the app, so changing
  its easing is a global visual change, not the "trivial, visually identical"
  swap the ticket calls for — it would need its own visual QA pass, not a
  drive-by edit here.

## Tests

The pure geometry and easing math lives in `src/lib/signalPGeometry.ts`
(`onPath`, `bezier`/`BRAND_EASE`, `radialOffset`, `getDotRestPoint`,
`getLapPoint`, `getBowlPathD`, `buildForSize`), unit tested in
`src/lib/signalPGeometry.test.ts`: the easing curve's endpoints and
monotonicity, the radial lift being zero at both endpoints and positive
mid-travel, a lap landing back at the dot's exact rest position, and the
icon-vs-master build parameters matching the kit README. `SignalP.tsx` itself
is thin wiring (a `requestAnimationFrame` loop and reduced-motion detection)
over those tested functions and was not additionally unit tested.
