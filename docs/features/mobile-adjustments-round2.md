# Mobile Shell Adjustments, Round 2

**Status:** v1, 2026-08-13. Executor spec for the follow-up pass after the
round-1 build (commits `a3f50a24`..`9ffe24c1`) and John's first on-device
test. The **Ground rules** section of
`docs/features/mobile-build-instructions.md` applies unchanged (gating,
do-not-touch list, no new DB objects, verbatim copy, 44px targets,
lucide icons). Audit context: the round-1 build was verified faithful to
the prototype; this round is three defects plus one doc touch-up. Do not
expand beyond these items.

## 1. Pin the tab bar (John-reported, root cause confirmed)

**Symptom:** the bottom tab bar scrolls away with the page.
**Root cause:** the mobile branch of `src/components/Layout.tsx` uses a
`min-h-screen flex flex-col` container, which GROWS with content, so the
document itself scrolls and the in-flow tab bar rides along.

**Fix, in the mobile-shell branch of `Layout.tsx` only:**
1. The outer column becomes a fixed-height viewport: replace
   `min-h-screen` with `h-[100dvh]` (dvh so the iOS URL bar collapse
   doesn't leave a gap) plus `supports-[height:100dvh]:h-[100dvh] h-screen`
   fallback if arbitrary-value support is uncertain — simplest accepted
   form: `className="h-screen supports-[height:100dvh]:h-[100dvh] bg-background flex flex-col"`.
2. `<main>` becomes the ONLY scroller: `flex-1 overflow-y-auto` (it has
   `overflow-auto` today; make it `overflow-y-auto overflow-x-hidden`).
3. Header and `<MobileTabBar />` stay `flex-none`; remove `sticky top-0`
   from the mobile header (unnecessary in a fixed column and it creates a
   stacking context for no reason).
4. **Scroll reset:** because scrolling moves from the window to `<main>`,
   any existing route-change scroll restoration no longer applies. Give
   the `<main>` element a ref and `scrollTo(0, 0)` on `location.pathname`
   change (a small `useEffect` in the mobile branch). Verify: navigating
   Home → Performance → back lands at the top of each page, and deep
   pages (Team staff detail, evaluation viewer) open scrolled to top.
5. Desktop branch: untouched.

**Acceptance:** at mobile viewport with the flag on, scroll a long page
(Performance): the tab bar and header stay put; only the content scrolls.
No double scrollbars; no horizontal scroll; wizards still scroll and
submit normally (they render inside the same `<main>`).

## 2. Install banner: browser-aware, iOS is Safari-only

**Symptom:** the banner behaved correctly in iOS Safari but not in iOS
Chrome. Product fact: **on iOS, only Safari can install a PWA** — Chrome,
Firefox, and Edge on iOS cannot create a standalone home-screen app, so
share-sheet instructions are wrong there and the right guidance is "open
this in Safari."

`src/lib/pwa.ts` already contains the needed helper (`isIosSafari()`,
just added; do not reimplement it). Update
`src/components/pwa/InstallBanner.tsx` to a four-way branch:

1. **iOS + Safari** (`isIosSafari()`): the existing three-step
   share-sheet instructions, unchanged.
2. **iOS + any other browser** (`isIos() && !isIosSafari()`): replace the
   steps with: a sentence — "On iPhone and iPad, Pro Moves can only be
   installed from Safari." — then a full-width secondary button
   "Copy link for Safari" that writes `window.location.origin` to the
   clipboard via `navigator.clipboard.writeText` (fall back to a visible
   selectable URL text if the clipboard call throws), with the button
   label flipping to "Link copied — now paste it in Safari" for ~3s after
   success. Keep the delete-the-old-icon paragraph above it.
3. **Android/other with `beforeinstallprompt` captured**: existing
   "Install Pro Moves" button, unchanged.
4. **Fallback**: existing generic menu instruction, unchanged.

Also add a short comment in the component noting the iOS restriction, and
verify there is no code path that returns `null` in iOS Chrome besides
the standard gates (mobile, dismissed, standalone) — the banner must
render there.

**Acceptance:** unit-of-work check by forcing user agents in devtools
emulation: CriOS UA shows branch 2; Safari iOS UA shows branch 1; Android
Chrome shows branch 3. Build green.

## 3. Team roster pill contrast

`src/pages/team/TeamPage.tsx` renders status pill text in the
full-strength status colors (`--status-missing`, `--status-late`,
`--status-complete`), which fail contrast on their `-bg` tints (~3:1).
Round-1 section A added darker ink tokens for exactly this. Change the
pill map to pair each `-bg` with its `-ink`:
`--status-missing-bg`+`--missing-ink`, `--status-late-bg`+`--late-ink`,
`--status-complete-bg`+`--complete-ink`. If `TeamStaffPage.tsx` or any
other new file reuses the same pattern, fix it there too (grep for
`--status-` in the new mobile/team/performance files). Dark mode follows
automatically from the tokens.

## 4. Doc touch-up: install instructions say Safari

In `docs/features/pwa-push-notifications.md`, section B1 (the
delete-and-re-add instructions) and the Phase 1 install-banner item:
add one sentence each stating that on iOS the install must be done in
Safari (other iOS browsers cannot install PWAs), matching the new banner
behavior. Do not restructure the doc.

## Operational rules (same as round 1)

Work through items in order; one local commit per item, message prefixed
"Mobile shell fix: ". `npm run build` must pass after each. NEVER push,
never run supabase commands, never touch the live DB. Final report:
per-item commit hashes, what you verified and how, anything you could not
verify, and any `TODO(build-review)` left.
