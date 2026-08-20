# Design system

The canonical page for how Pro Moves looks: brand tokens, semantic tokens,
type and icon scales, motion, identity assets, and the pattern for moving a
hardcoded color onto a token. If a fresh session needs to answer "what color
is a primary button and why," this doc plus the two it links to
(`docs/dev/motion-rules.md`, `docs/dev/token-migration-pattern.md`) should be
enough on their own.

This is the app side. The brand itself — the Signal P mark, the wordmark, the
locked palette, mark geometry, the motion contract in the kit's own words —
is owned by `promoves-brand/exports/README.md`. That file is the source of
truth; this doc describes how the app consumes it. If the two ever disagree,
the kit wins and this doc is stale.

All values below are read directly from `src/index.css`, `tailwind.config.ts`,
`src/lib/domainColors.ts`, `src/components/ui/StatusBadge.tsx`,
`src/components/brand/SignalP.tsx`, and `CLAUDE.md` as of DSN-5d
(2026-08-20). Where the app hasn't caught up to a rule yet, that's called out
rather than glossed over.

## 1. Brand tokens (DSN-5a)

The six locked brand colors, added as CSS custom properties in `src/index.css`
and exposed as Tailwind colors (`brand.navy`, `brand.blue`, ...) in
`tailwind.config.ts`. Hex values are the kit's; HSL is the converted form the
app actually uses (do not hand-edit the HSL — re-derive from the hex if the
kit ever changes).

| Token | CSS var | Hex | Tailwind class | Use |
|---|---|---|---|---|
| Navy | `--brand-navy` | `#113B62` | `bg-brand-navy` / `text-brand-navy` | Structure on light grounds; primary brand color |
| Blue | `--brand-blue` | `#005286` | `bg-brand-blue` | Secondary Alcan blue |
| Signal | `--brand-signal` | `#4FA8DC` | `bg-brand-signal` | The Signal P dot; dark-ground accent |
| Bone | `--brand-bone` | `#F4F1EA` | `bg-brand-bone` | Structure on dark grounds |
| Charcoal | `--brand-charcoal` | `#1A1D21` | `bg-brand-charcoal` | Presentation/dark-ground background |
| Gray | `--brand-gray` | `#929497` | `bg-brand-gray` | Alcan 40% gray |

**`--primary` is remapped to brand navy**, not a raw brand color reference:

```css
--primary: var(--brand-navy);
--primary-foreground: var(--brand-bone);
```

In dark mode (`.dark`), it flips: `--primary: var(--brand-bone)` with
`--primary-foreground: var(--brand-charcoal)` — light structure on a dark
ground, following the shadcn convention already in use for every other
token pair.

**Rule (from the DSN-3 token migration pattern): prefer `primary` /
`primary-foreground` over a direct `brand-navy` reference** for anything that
should track the primary brand color generally — most buttons, most
brand-tinted text. Reach for a `brand-*` color directly only for brand chrome
that isn't semantically "the primary action color" (e.g. the wordmark, a
literal Signal P mark, a fixed accent that shouldn't move if the theme is
ever re-pointed). Preferring `primary` keeps a future re-theme a one-line
change instead of a grep-and-replace.

### Motion tokens

Also added in DSN-5a, defined in `src/index.css` and mirrored into
`tailwind.config.ts`'s `transitionTimingFunction.brand`:

| Token | Value | Tailwind |
|---|---|---|
| `--ease-brand` | `cubic-bezier(0.50, 0.05, 0.15, 1)` | `ease-brand` |
| `--duration-quick` | `200ms` | (CSS var only) |
| `--duration-standard` | `400ms` | (CSS var only) |
| `--duration-brand` | `1000ms` | (CSS var only) |

See section 4 for how these are used.

## 2. Semantic tokens

These predate the brand work and keep their meanings — the brand palette
sits underneath them as the neutral/accent layer, it does not replace them.
All are CSS custom properties in `src/index.css`; none are Tailwind color
utilities except where noted, so most call sites consume them via inline
`style` (`{ color: 'hsl(var(--score-2))' }`) rather than a class.

### Domain colors

Four domains: Clinical, Clerical, Cultural, Case Acceptance. Each has a rich
(saturated) and pastel (background) variant, plus a dark-mode-only "ink"
variant for text sitting on a tinted background.

| Domain | Rich token | Pastel token | Ink token (mobile shell only) |
|---|---|---|---|
| Clinical | `--domain-clinical` | `--domain-clinical-pastel` | `--clinical-ink` |
| Clerical | `--domain-clerical` | `--domain-clerical-pastel` | `--clerical-ink` |
| Cultural | `--domain-cultural` | `--domain-cultural-pastel` | `--cultural-ink` |
| Case Acceptance | `--domain-case-acceptance` | `--domain-case-acceptance-pastel` | `--case-acceptance-ink` |

Both rich and pastel domain tokens have separate dark-mode values in
`.dark` (tuned darker for pastels, lighter/desaturated for rich, so chips
don't glow or turn neon — see `src/index.css`'s DSN-6 comment). Dormant until
a dark-mode toggle ships.

Two access patterns exist in `src/lib/domainColors.ts`, and they are **not
interchangeable**:

- **`getDomainColor()` / `getDomainColorRich()` / `getDomainColorRichRaw()`**
  — static, fallback-only HSL literals baked into the JS file. These
  intentionally do **not** track the CSS vars or dark mode live.
  `DomainDetail.tsx` is the one still-live consumer (it calls
  `getDomainColorRichRaw()` directly for its alpha-blended gradient, which
  needs closer review before migrating — see the comment in
  `domainColors.ts` above `getDomainColorVar()`). `CompetencyAccordion.tsx`
  imports nothing from this file. `RoleRadar.tsx` was already migrated
  under DSN-1 and uses the live var-backed getters below, not these.
- **`getDomainColorVar()` / `getDomainPastelVar()`** — resolve to
  `hsl(var(--domain-*))`, so they track light/dark mode live via the CSS
  cascade. Used by `RoleRadar.tsx` (via `getDomainPastelVar()` /
  `getDomainInk()`) and every other DSN-1-migrated surface. Use these for
  anything new, especially in the mobile shell.

The claim that swapping the static getters for the var-backed ones is a
no-op in light mode today, and becomes correct the day a dark-mode toggle
ships, is DSN-1's finding — see the byte-identical-render constraint in
`docs/features/explore-my-role-build-instructions.md` section G
(Acceptance), not a blanket rule that these three screens can never move.

`getDomainInk()` returns the ink token for text on a domain's pastel
background, falling back to `--foreground` for an unrecognized domain.

### Score colors (1-4 scale)

| Token | Meaning |
|---|---|
| `--score-1` | Lowest |
| `--score-2` | — |
| `--score-3` | — |
| `--score-4` | Highest |

Each has a `-bg` pastel variant (`--score-1-bg` ... `--score-4-bg`) and a
`-ink` variant (`--score-1-ink` ... `--score-4-ink`), defined in both
`:root` and `.dark` with different values, following the same shape as the
domain-ink tokens. Unlike domain-ink (which `getDomainInk()` exposes and
`RoleRadar.tsx` consumes), **no `--score-*-ink` token has any consumer in
`src/` today** — they're defined but unused, not a parallel in-use pattern.
No `bg-score-N` / `text-score-N` Tailwind utilities exist for the base
score tokens either — consume via inline `style`, same pattern as
`DomainDetail.tsx`.

### Status colors

Two status families share the `--status-*` tokens, both rendered through
`<StatusBadge />` (`src/components/ui/StatusBadge.tsx`):

- **`SubmissionStatus`** (weekly check-in/out): `complete`, `missing`,
  `late`, `excused`, `pending`, plus `exempt`/`not_open` (render as a plain
  `—`, no color).
- **`DeliveryStatus`** (eval hand-off workflow, added DSN-4): `no_eval`,
  `draft`, `not_released`, `released`, `viewed`, `reviewed`, `focus_set`.
- **`TrackStatus`** (assessment track progress, added DSN-4): `not_started`,
  `in_progress`, `completed`, `locked`.

Base tokens: `--status-complete`, `--status-missing`, `--status-late`,
`--status-excused`, `--status-pending`, `--status-released` (each with a
`-bg` variant). Several `DeliveryStatus`/`TrackStatus` values deliberately
**reuse** an existing status token rather than getting their own — e.g.
`draft` and `viewed` both reuse `--status-late`'s amber as a general
"warning/in-progress" color, not literally about lateness. `no_eval` and
`not_released` use a shared `NEUTRAL_FILLED` style
(`hsl(var(--muted))` / `hsl(var(--muted-foreground))`) rather than a
`--status-*` token, since "nothing to report" isn't really a status color.
See `StatusBadge.tsx`'s `statusConfig` for the full, current mapping — it is
the single source of truth, this doc is a summary of it.

**Always render a status through `<StatusBadge status="..." />`** rather
than hand-rolling a pill. If you need the raw token outside a badge context,
use the `--status-*` CSS var directly via inline style.

### Win banner colors

| Token | Use |
|---|---|
| `--win-growth` (+ `-bg`, `-border`) | Growth-framed win |
| `--win-perfect` (+ `-bg`, `-border`) | Perfect-score win |

Both have dark-mode-tuned values in `.dark` (darkened background, lightened
foreground/border) so the Recognition/Recent Win cards don't glow
near-white on dark backgrounds.

### The rule

**Never hardcode a Tailwind palette class** (`bg-emerald-100`,
`text-red-800`, ...) for something that means domain, score, status, or win.
Always go through the token or its helper. See section 5 for the full
decision tree when you're not sure which bucket a color falls into.

## 3. Typography

- **Typeface**: Biondi Sans, loaded via `@font-face` in `src/index.css`
  (`/fonts/BiondiSans-Variable.woff2`, weight range 100-900) and set as the
  Tailwind `sans` stack in `tailwind.config.ts`
  (`['"Biondi Sans"', 'ui-sans-serif', 'system-ui']`).
- **Micro text**: `text-2xs` (0.625rem / 10px, 0.875rem line-height) is a
  custom Tailwind size added in `tailwind.config.ts`. Use it for
  micro-labels, timestamps, and metadata. **Never use `text-[10px]`** — it's
  the same pixel value but bypasses the named scale.
- **Headings**: `h1`, `h2`, `h3` get `letter-spacing: -0.025em` globally
  (`src/index.css` base layer) — no per-component override needed.

## 4. Icon sizes

Four sizes, all lucide-react (the app's only icon library, ~198+ files —
DSN-5 kept lucide rather than replacing it):

| Context | Size | Tailwind class |
|---|---|---|
| Inline with text (labels, badges, list items) | 16px | `h-4 w-4` |
| Standalone / buttons / interactive | 20px | `h-5 w-5` |
| Section headers / empty states | 24px | `h-6 w-6` |
| Page-level headers | 32px | `h-8 w-8` |

`StatusBadge`'s own icons follow this scale (`h-4 w-4`, inline-with-text
context).

**Not yet standardized**: a consistent lucide stroke-width value and a
written rule for when an icon takes the brand accent color versus inheriting
`currentColor`/text color. Only 4 files in `src/` currently override
`strokeWidth` at all, and no color-vs-inherit convention is written down
anywhere in the code as of this doc. This was named as an extension to
DSN-4's scope in the DSN-5 umbrella spec but was not implemented in the
DSN-4 commits that shipped — flagging here rather than inventing the rule
in a docs-only ticket. Candidate for a small follow-up ticket.

## 5. The token migration pattern (DSN-3)

Full decision tree, `dark:` pair handling, and the hardcoded-color guard
script live in **`docs/dev/token-migration-pattern.md`** — read that before
migrating any hardcoded color. Summary of the decision order:

1. Does it mean domain / score / status / win? → the matching token family
   (section 2).
2. Is it brand chrome (primary actions, wordmark, header accents, links,
   focus rings)? → `primary`/`primary-foreground` first, a direct `brand-*`
   color only if it shouldn't track a future re-theme.
3. Is it generic UI chrome (borders, muted backgrounds) with no
   color-specific meaning? → the shadcn tokens already in
   `tailwind.config.ts` (`border`, `muted`, `accent`, `secondary`, `card`).
4. Is it genuinely decorative? → leave it, say so in the PR.
5. Doesn't fit any locked scale but clearly means something? → nearest
   existing token, documented inline, flagged for a future ticket. Don't
   invent a new semantic token in a migration slice.

The guard, `scripts/check-hardcoded-colors.mjs` (`npm run check:colors`,
part of `npm run check`), ratchets the count of raw Tailwind palette classes
in `src/**/*.{ts,tsx}` down over time and fails the build if it goes up.

A known gap flagged by that doc and still open: no `--status-info` token
exists for the blue "informational notice" pattern used in at least three
files. Don't invent it in a docs-only or migration ticket — it's a token
design decision for its own ticket.

## 6. Motion (DSN-5c)

Full rules — what animates, what never does, the discrete-lap "waiting"
convention, reduced-motion behavior, and where the Signal P mark may and may
not appear — live in **`docs/dev/motion-rules.md`**. Summary:

- The brand motion contract (verbatim from the kit): run-once, never loops,
  `cubic-bezier(0.50, 0.05, 0.15, 1)`, 800-1200ms, no bounce, final frame
  bit-identical to the static mark.
- **`<SignalP />`** (`src/components/brand/SignalP.tsx`) is the app's
  loading indicator and brand-moment component. Three modes: `static` (no
  animation), `once` (single lap on mount, for brand moments), `waiting`
  (discrete complete laps with a rest pause between them, for indeterminate
  loads — never a continuous spin). Currently used in `src/App.tsx` (the
  auth gate, `mode="waiting" size={48}`) and `src/pages/LandingPage.tsx`
  (`mode="once" size={96}`).
- Sizes ≤24px automatically switch to the kit's "icon" geometry build
  (wider bowl gap, larger dot) via `buildForSize()` in
  `src/lib/signalPGeometry.ts` — never hand-pick a build.
- `prefers-reduced-motion: reduce` forces the static mark in every mode,
  unconditionally — no prop can override it.
- Colors always come from `--brand-navy` (`variant="light"`, default) or
  `--brand-bone` (`variant="dark"`) for structure, `--brand-signal` for the
  dot. Never a hardcoded hex, never a color outside the kit palette.
- `--ease-brand` / `--duration-quick` / `--duration-standard` are available
  for ordinary UI transitions that want the same feel as a trivial, visually
  identical swap — not a mandate to retime every existing animation.
  `OrgMark.tsx`'s pending-to-resolved fade is the one example in the
  codebase today (`animate-in fade-in-0 duration-200 ease-brand
  motion-reduce:animate-none`).
- Button-level/inline-row spinners (`Loader2` + `animate-spin`) and the
  Skeleton-based route-loading pattern were deliberately left alone by
  DSN-5c — they are not full-page loading surfaces.

## 7. Identity assets

Source of truth: `promoves-brand/exports/README.md` and its `build_assets.py`
/ `build_rasters.py` / `build_loader.py` scripts. What's actually deployed
into the app, verified against `public/`, `public/brand/`, and `index.html`:

| Asset | Path | Used for |
|---|---|---|
| Favicon (SVG, preferred) | `public/brand/promoves-p-icon.svg` | `<link rel="icon" type="image/svg+xml">` |
| Favicon (ICO fallback) | `public/favicon.ico` | `<link rel="icon" sizes="48x48">` |
| Favicon 32px | `public/favicon-32.png` | `<link rel="icon" type="image/png" sizes="32x32">` |
| Apple touch icon | `public/apple-touch-icon.png` | `<link rel="apple-touch-icon">` |
| PWA icon 192 | `public/pwa-192.png` | PWA manifest (`vite.config.ts`) |
| PWA icon 512 | `public/pwa-512.png` | PWA manifest |
| PWA maskable icon 512 | `public/pwa-maskable-512.png` | PWA manifest, `purpose: 'maskable'` |
| Notification glyph | `public/notification-glyph-96.png` | Shipped in DSN-5b; push-notification wiring is separate, later work |
| OG/share card | `public/og-1200x630.png` | `og:image` / `twitter:image` in `index.html` |
| Wordmark (SVG) | `public/brand/promoves-wordmark.svg` | `<ProMovesLogo />` (`src/components/ProMovesLogo.tsx`) |

The PWA manifest icon array is defined in `vite.config.ts` (search
`manifest:`), not a static `manifest.json` file.

### In-app components

- **`<ProMovesLogo />`** (`src/components/ProMovesLogo.tsx`) — the generic
  product wordmark. Em-sized (`h-[1.5em]`), so existing text-size classes
  (`text-base`, `text-xl`, `text-3xl`) control its scale. Light-ground only
  today; the kit's `-reversed` master exists for when a dark chrome ships.
  Use wherever there's no org context (pre-auth screens) or as the fallback
  when an org has no logo.
- **`<OrgMark />`** (`src/components/OrgMark.tsx`) — the org-identity half
  of the header's marquee slot, shared by desktop and mobile headers so
  they never drift apart. Its cascade, in `src/lib/orgMark.ts`
  (`resolveOrgMarkKind()`), is **four branches, in a locked priority
  order** (the file's own comment: "DSN-8: this priority order is locked —
  do not reorder it"):
  1. the org's own uploaded logo (`orgLogoUrl`), if set
  2. otherwise, the hardcoded Alcan mark — but only when
     `organizationId === ALCAN_ORG_ID`, so a future non-Alcan org can never
     see it
  3. otherwise, the org's display name as plain text
  4. otherwise, the caller's `fallback`

  DSN-8's spec (not yet committed to `main` as of this doc — spec pending
  commit, DSN-8) is where this rule was decided: **the org logo/mark keeps
  the top marquee spot**; Pro Moves branding gets guaranteed secondary
  placements instead (desktop header secondary wordmark, avatar menu
  footer, the mobile header wordmark pairing, and every loading state via
  `SignalP`).
- **`<SignalP />`** — see section 6.

### Clear space and minimum size

Interim rule from the kit's "Not yet built" list (a full brand sheet with
this worked out visually hasn't been built yet): clear space around the
mark is one dot diameter (12 of the mark's own 100-unit viewBox units) from
any other ink; minimum size is 16px standalone, 18px cap height in a
wordmark lockup. In the app today, the smallest `SignalP` usage is 48px
(the auth-gate loader), well above the floor — nothing currently renders at
or near the 16px minimum, so this rule is a ceiling on future shrinkage, not
a fix for an existing violation.

## 8. What's out of scope here

Page-layout and IA design (owned by the mobile redesign and DASH tickets),
the MyProMoves.com marketing site, the Alcan co-brand lockup, and
`the-alcan-way/` (a separate codebase) are not covered by this doc. See
`docs/specs/dsn-5-design-unification.md` for the full umbrella scope and
history if you need it — but note that file describes the plan as approved,
not necessarily everything as built; this doc and the source files it
verifies against are the record of what actually landed.
