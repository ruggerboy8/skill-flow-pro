# DSN-5: Design unification and overhaul (brand into app)

Status: APPROVED by John 2026-08-20
Lane: cross-cutting (this is the umbrella and decomposition; each sub-ticket carries its own lane)
Motion ticket: DSN-5 on the MyProMoves Dev Board
Date: 2026-08-20

## What and why

The Pro Moves brand identity is now locked and lives in `promoves-brand/`:
the Signal P mark, the wordmark, a six-color palette (navy `#113B62`, blue
`#005286`, signal `#4FA8DC`, bone `#F4F1EA`, charcoal `#1A1D21`, gray
`#929497`), Biondi Sans type rules, a motion contract (run-once, ~800 to
1200ms, cubic-bezier(0.50, 0.05, 0.15, 1), no bounce), and every export the
app and website need. The app, meanwhile, has half a design system: Biondi
Sans is loaded, semantic tokens exist for domains, scores, and statuses,
and CLAUDE.md carries icon-size and font-size rules. But the app's
`--primary` is a generic slate, not brand navy; the favicon and PWA icons
are not the new mark; and animation is ad hoc with no shared easing or
duration. This umbrella ticket unifies all of it: one design system,
sourced from the brand kit, expressed as tokens the whole app uses, with
iconography and motion conventions written down and enforced. It also
sequences the four existing DSN tickets (DSN-1 through DSN-4) so the
cleanup work migrates toward the brand system instead of running parallel
to it.

## Current state (verified in the repo and on the board, 2026-08-20)

- `promoves-brand/exports/` holds the SVG masters, all web/app icons
  (favicon.ico, PWA 192/512/maskable, apple-touch-icon, notification
  glyph, OG image), the loader prototype, and a README with token values,
  mark geometry, and the motion contract. Assets regenerate from three
  Python build scripts in the same folder.
- `src/index.css` + `tailwind.config.ts`: Biondi Sans is the app typeface.
  Semantic tokens exist (`--domain-*`, `--score-*`, `--status-*`,
  `--win-*`) and CLAUDE.md forbids hardcoded Tailwind palette classes for
  semantic states. A dark-mode block exists in `index.css`.
- `--primary` is `215 25% 27%` (slate), not brand navy. No `--brand-*`
  tokens exist. Signal blue appears nowhere in the app.
- Icons are lucide-react in ~198 files.
- No motion tokens or animation conventions exist in the app.
- Already on the board, from the codebase assessment, all Todo:
  - **DSN-1** (HIGH): domain colors render wrong in dark mode across 60 files
  - **DSN-2** (HIGH): 36 unlabeled icon buttons + broken heading structure
  - **DSN-3** (HIGH): ~865 hardcoded semantic colors across 97 files to migrate to tokens
  - **DSN-4** (MEDIUM): consolidate hand-rolled status pills into StatusBadge, pull icon/font sizes back onto scale
- In-flight work that must stay coordinated: the mobile redesign (MOB-1
  through MOB-6) and DASH-1 both mandate token-only color. DASH-1 already
  notes it migrates only the widgets it touches and defers the app-wide
  sweep to DSN-3. Landing the token foundation first gives all of them
  brand tokens to build with instead of retrofitting later.

## Locked decisions

- The brand kit in `promoves-brand/` is the source of truth. The app
  design system derives from it, never the reverse. Changes to the mark or
  palette happen in the kit first (via its build scripts), then flow in.
- Semantic tokens (domain, score, status, win) keep their meanings. The
  brand palette does not replace them; it sits underneath as the neutral
  and accent layer (primary actions, chrome, headers, links, focus rings).
- Existing repo rules stand and extend: no hardcoded palette classes, the
  icon size table, `text-2xs` for micro-labels.
- Conservative migration: nothing visual breaks mid-stream. Token wiring
  lands so untouched screens look the same until deliberately updated.

## Ticket breakdown (order matters)

New tickets are 5a through 5d; DSN-1, 3, and 4 slot into the sequence.

**DSN-5a. Brand token foundation (medium, first, alone).** Add the six
brand colors as CSS custom properties and Tailwind tokens (`--brand-navy`,
`--brand-blue`, `--brand-signal`, `--brand-bone`, `--brand-charcoal`,
`--brand-gray`), including dark-mode values per the kit (bone structure on
dark grounds). Remap `--primary` and related shadcn tokens to the brand
layer. Add motion tokens: `--ease-brand` and duration steps. This is the
enabler everything else consumes. Define the dark-mode story for domain
colors here too, so DSN-1's fix has correct target values instead of
guessing.

**DSN-5b. App identity assets (tiny, anytime after 5a).** Copy the kit's
exports into `public/`: favicon set, apple-touch-icon, PWA manifest icons
including maskable, notification glyph, OG image. Update `index.html` head
and the PWA manifest. The wordmark replaces whatever text or logo the app
header and login screen show today.

**DSN-1 (existing, after 5a).** Fix dark-mode domain colors using the
values 5a defines.

**DSN-3 (existing, after 5a).** The ~865 hardcoded colors migrate to the
post-5a token set, so the sweep happens once, against the final palette.
Add a lint or grep check to the kit's QA path so violations cannot
quietly return.

**DSN-4 (existing, after 5a).** StatusBadge consolidation and icon/font
scale enforcement. Extend its scope slightly: standardize lucide stroke
width and write the rule for when icons take brand accent color versus
inherit text color. Lucide stays; 198 files is not worth replacing.

**DSN-5c. Motion system (medium, after 5a).** Adopt the motion contract as
the app's animation language: the Signal P loader (from
`promoves-loader.html`) as the app-level loading indicator, brand easing
and durations for transitions, and a written rule set (what animates, what
never does, run-once discipline, reduced-motion support). Replace the most
visible ad hoc spinners and transitions.

**DSN-5d. The design system doc (tiny, last).** Write
`docs/design-system.md`: one canonical page covering tokens, type scale,
icon rules, motion rules, and component conventions, linking to
`promoves-brand/exports/README.md` for brand-side truth. CLAUDE.md's
design section shrinks to a pointer. Also finish the kit's "not yet built"
items where they touch the app: clear-space and minimum-size rules for the
mark in-product.

DSN-2 (accessibility) is independent of the brand work and can run
anytime; it is listed here only so the series reads complete.

## Decision on the reveal moment (resolved 2026-08-20)

John's call: no special handling. The visible rebrand (navy primary, new
wordmark, new icons) can ship whenever the sub-tickets land; no gating to
the test user and no coordinated "new look" publish required.

## Acceptance script (for John, per sub-ticket, high level)

- After 5a: the app looks essentially unchanged except primary actions.
  Buttons and links across Tier 1 pages render navy, not slate. Nothing
  else moved.
- After 5b: the browser tab shows the Signal P favicon. Installing the PWA
  on a phone shows the new icon. The login screen and header show the
  wordmark. Sharing the site link in a chat shows the OG card.
- After 5c: loading screens show the Signal P draw itself once and settle,
  never looping. With "reduce motion" on in OS settings, animation is gone
  and nothing is broken.
- After DSN-1/3/4: spot-check any three pages in light and dark mode;
  colors come from tokens (the check script passes), status pills are
  StatusBadge, icons sit on the size table.
- After 5d: `docs/design-system.md` exists and a fresh session can answer
  "what color is a primary button and why" from it alone.

## Personas to test as

Participant (mobile PWA), lead, admin (desktop). The rebrand touches every
persona's chrome, so all three walk their usual home surfaces.

## Out of scope

- MyProMoves.com marketing site and the presentation deck (the kit serves
  them directly; separate effort).
- The Alcan co-brand lockup and stacked lockup (kit "not yet built" items
  that do not appear in-app).
- Redesigning page layouts or IA (that is MOB-1 through MOB-6 and DASH-1;
  this work gives them the palette and rules, it does not restyle their
  surfaces for them).
- The-alcan-way experience (separate codebase in `the-alcan-way/`).
- Changing the semantic token meanings (domain, score, status colors).
- DSN-2's accessibility fixes (independent track, unchanged).

## DB impact

None. Frontend and static assets only.

## Docs the builder must read

| Area | Docs |
|---|---|
| Brand truth | `promoves-brand/exports/README.md`, `promoves-brand/brand-brief.md` |
| App conventions | CLAUDE.md design system conventions (icon sizes, text-2xs, token rule) |
| Anything | `docs/system-overview.md` |
| Mobile UI (5b, 5c) | `docs/features/mobile-design-principles.md`, gating via `useMobileShell` |
| Coordination | `docs/specs/mobile-redesign-plan.md`, `docs/specs/dash-1-command-center-color-direction.md`, DSN-1/2/3/4 ticket descriptions on the board |
