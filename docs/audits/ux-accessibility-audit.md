# Skill Flow Pro — UX & Accessibility Audit

**Date:** 2026-06-22
**Branch:** `claude/security-and-baseline` (current with `main` — the live code)
**Auditor:** UX Researcher (design-ux-researcher persona)
**Scope:** Information architecture & navigation, accessibility (a11y), core weekly-loop UX
(Confidence/Performance wizards, forms, dialogs/drawers), and consistency across V1/V2 surfaces,
terminology, and multi-tenant branding.

**Method:** Static, code-level pass against the **current** code on this branch. Source was read,
not run. No app was launched; no live screen reader, contrast tooling, or keyboard walkthrough was
performed. This audit *replaces* the prior stale audit (which ran against the March-6 branch,
~1,529 commits behind `main`).

> **Update 2026-06-25 — most SAFE quick wins addressed.** Fixed on `main`: A1 (NumberScale
> `metric` prop), A2 (Lead card `onKeyDown`), A3 (ProMoveRow keyboard), A4 (header icon
> `aria-label`s), N1 (the broken `:week` redirects), B1 (neutral wordmark fallback so non-Alcan
> orgs stop seeing Alcan's logo — *header only; `Welcome`/`SetupPassword` still hardcode the Alcan
> image, see below*), B3 (deleted `Index.backup.tsx` + legacy `Confidence`/`Performance`), C1
> (Skeleton loading + recovery action in both wizards), A5 (domain spine now uses rich color, not
> white-on-pastel — still wants a live contrast measurement), and the C2 console noise (masquerade
> PII block removed; ConfidenceWizard logs gated to dev). **Still open:** `Welcome.tsx`/
> `SetupPassword.tsx` org-logo fallback, the broader `cursor-pointer`-on-`div` sweep (A3 tail), and
> everything under "Needs live walkthrough."

> **What a code-reading audit can and cannot do.** It reliably catches *structural* a11y problems —
> clickable `div`s without keyboard handlers, missing roles, color-only signaling, wrong `aria-label`
> logic, broken redirects. It **cannot** measure real contrast ratios, focus-trap behavior, or
> screen-reader announcement order. Those are isolated under "Needs live walkthrough" rather than
> asserted as fact.

---

## Executive summary

- **The core rating control still carries an incorrect `aria-label`.** `NumberScale.tsx:51` labels
  every button "Confidence" only when the score equals `4`, and "Performance" for 1–3. On the single
  most-used control in the product, screen-reader users hear the wrong context on 3 of 4 buttons —
  regardless of whether they're in the Confidence or Performance wizard. This is unchanged from the
  prior audit and remains the highest-impact a11y defect.
- **A real, shipping routing bug:** the legacy redirects in `App.tsx:120` and `App.tsx:122` navigate
  to the literal string `/confidence/:week/step/1` (and `/performance/:week/step/1`) instead of
  interpolating the `:week` param. Anyone hitting an old `/confidence/123` link lands on a route with
  a literal colon in the URL.
- **Clickable-`div` keyboard gaps persist in places, but the main weekly-loop card was fixed.** The
  primary "This Week" Pro Move card (`ThisWeekPanel.tsx:460`) now has `role="button"`, `tabIndex`,
  and `onKeyDown` — a genuine improvement. But the **Lead Pro Move** card right below it
  (`ThisWeekPanel.tsx:568`) has `role`/`tabIndex` but **no `onKeyDown`**, so keyboard users can focus
  it and not activate it. `ProMoveRow.tsx:15` (My Role domain lists) is still a bare clickable `div`
  with no role, tabIndex, or keyboard handler.
- **Domain identity is encoded primarily by color** (`domainColors.ts`), and the wizard/“spine” cards
  render the domain name as **white text on a pastel background** (`ConfidenceWizard.tsx:1131-1140`,
  `ThisWeekPanel.tsx:486-496`). The domain name *is* present as text (good — not purely color), but
  white-on-pastel is a probable contrast failure that needs live measurement.
- **Loading and empty states are inconsistent.** The wizards and the auth gate fall back to a bare
  `"Loading..."` string (`App.tsx:85`, `ConfidenceWizard.tsx:1055`, and a dead-end "Focus item not
  found" at `ConfidenceWizard.tsx:1063`), while the home surfaces use polished `Skeleton` shells
  (`Index.tsx:28`, `ThisWeekPanel.tsx:322`, `Layout.tsx:160`). The product reads as two different
  apps depending on where you land.
- **Submission feedback is solid and a clear strength.** The wizards have explicit
  `idle → saving → done` phases with a spinner, a green checkmark, and confetti
  (`ConfidenceWizard.tsx:1219-1238`), plus a background-retry queue surfaced by `SubmissionStatus.tsx`.
  This is good UX and should be the template for other flows.
- **Terminology is broadly consistent with the glossary**, but the product still hard-codes Alcan
  branding as the fallback identity: `Layout.tsx:2` imports `alcan-logo.png` and uses it as the
  default header logo (`Layout.tsx:196`); `Welcome.tsx` and `SetupPassword.tsx` import
  `alcan-logo-full.jpg` with a `TODO` and **no** org fallback. A non-Alcan org sees Alcan's logo —
  on the set-password and welcome screens, the very first thing a new hire sees.
- **Legacy/dead UX surfaces linger in the tree.** `pages/Confidence.tsx` and `pages/Performance.tsx`
  exist while the non-wizard routes redirect to the wizard versions (`App.tsx:120-123`), and
  `pages/Index.backup.tsx` is committed. These are confusion/rot risks, not user-facing bugs.

---

## Findings by theme (ranked by impact within each)

### 1. Accessibility — controls & keyboard

**A1 (High) — Wrong `aria-label` on the primary rating buttons.**
`src/components/NumberScale.tsx:51`:
```
aria-label={`${score === 4 ? 'Confidence' : 'Performance'} ${score} – ${tooltipText[...]}`}
```
The label word is chosen from the *score value*, not from which wizard is rendering it. So a screen
reader announces button "4" as "Confidence 4 …" and buttons 1–3 as "Performance 1 …", in **both** the
Confidence and Performance wizards. This is the most-used control in the app.
**Fix:** pass a `metric: 'confidence' | 'performance'` prop into `NumberScale` from each wizard and use
it for the label; drop the `score === 4` heuristic entirely. (Both `ConfidenceWizard.tsx:1193` and
`PerformanceWizard` render `<NumberScale>` and can pass the right value.)

**A2 (High) — Lead Pro Move card is focusable but not keyboard-activatable.**
`src/components/home/ThisWeekPanel.tsx:568-585` sets `role="button"` and `tabIndex={0}` on the Lead
Pro Move card but, unlike the primary card above it (`:460-483`), has **no `onKeyDown`** handler.
Keyboard users can tab to it and press Enter with no effect.
**Fix:** add the same `onKeyDown` (Enter/Space) handler used on the primary card, or extract a single
`<ClickableCard>` so the two cannot drift.

**A3 (Medium) — Bare clickable `div` with no keyboard affordance.**
`src/components/my-role/ProMoveRow.tsx:15` is a `div` with `onClick` and `cursor-pointer` but no
`role`, `tabIndex`, or key handler. It's used in the My Role domain-detail lists. Keyboard and
screen-reader users cannot open a Pro Move row.
**Fix:** make it a `<button>` or add `role="button"` + `tabIndex={0}` + `onKeyDown`. ~40 files use
`cursor-pointer` on non-button elements (mostly admin/platform/eval surfaces); ProMoveRow is the
participant-facing one and should be prioritized — the rest are admin-only and lower impact but worth
a sweep.

**A4 (Low) — Sparse `aria-label` coverage overall.** Only ~11 files use `aria-label`/`aria-labelledby`
and only ~4 use keyboard handlers across `src/`. Icon-only buttons in the header (`Layout.tsx:208`
sim-console gear, `Layout.tsx:214` profile) have no `aria-label`; they render only a Lucide icon.
**Fix:** add `aria-label` to all icon-only buttons (profile and sim buttons in `Layout.tsx`, and audit
`components/ui` wrappers).

### 2. Accessibility — color & contrast

**A5 (Medium, needs live verification) — White text on pastel domain background.**
The domain "spine" renders `text-white` over `getDomainColor(domain)` which returns the **pastel**
HSL (`domainColors.ts:21-26`, e.g. Clinical `211 100% 92%` — a near-white light blue).
See `ConfidenceWizard.tsx:1135-1140` and `ThisWeekPanel.tsx:491-496`. White-on-pastel is very likely
below the 4.5:1 (or 3:1 large-text) WCAG threshold.
**Fix:** use the *rich* domain color (`getDomainColorRich`) for any colored background carrying white
text, or switch the spine text to a dark foreground. Measure with a contrast tool once running.

**A6 (Low) — Domain conveyed by color first.** `domainColors.ts` is the single source of truth for
domain identity and is used as background fills throughout. The domain **name is present as text** on
the cards (good — this is not a pure color-only failure), but status/delta cues elsewhere
(`ConfPerfDelta.tsx`, the `--score-N-bg` selected-button colors in `NumberScale.tsx:35-39`) lean on
color.
**Fix:** ensure every color-coded status also has text or an icon; verify in a live pass.

### 3. Information architecture & navigation

**N1 (High) — Broken legacy redirects (literal param).**
`src/App.tsx:120` and `:122`:
```
<Route path="confidence/:week" element={<Navigate to="/confidence/:week/step/1" replace />} />
<Route path="performance/:week" element={<Navigate to="/performance/:week/step/1" replace />} />
```
`<Navigate to>` does **not** interpolate `:week`; the user is sent to a URL containing a literal
`:week`. Note the wizards themselves navigate to `/confidence/current/step/N` (e.g.
`ConfidenceWizard.tsx:754`), so the canonical path uses `current`, not a week number — these redirects
are both broken *and* pointing at a stale URL shape.
**Fix:** replace with a small redirect component that reads `useParams().week` and navigates to
`/confidence/${week}/step/1`, or redirect to `/confidence/current/step/1` if week-number paths are dead.

**N2 (Medium) — Two parallel "my-role" trees.** Participant `/my-role/*` (`App.tsx:103-114`) and
doctor `/doctor/my-role/*` (`App.tsx:149-150`) are separate subtrees with separate components
(`MyRoleLayout`/`RoleRadar` vs `DoctorMyRole`/`DoctorDomainDetail`). This is intentional (the doctor
track is a distinct flow per the glossary) but is a divergence risk — confirm the two stay in sync on
shared concepts (domain-detail layout, Pro Move rows).

**N3 (Low) — Persona-derived nav has many conditional branches.** `Layout.tsx:95-146` builds the
sidebar from a chain of role booleans (pure-doctor / super-admin / standard, then per-capability
spreads). It's readable but fragile: the home target differs by persona (`Index.tsx:41-48` redirects
admins to `RegionalDashboard`, doctors to `/doctor`), and `isOrgAdmin` hides both "My Role" and "Home"
(`Layout.tsx:114-122`). Worth a live walkthrough per persona to confirm no one lands on an empty or
wrong home.

### 4. Core-flow UX (wizards)

**C1 (Medium) — Inconsistent loading/empty states.** Bare strings: `App.tsx:85` (`Loading...`),
`ConfidenceWizard.tsx:1055` (`Loading...`), `ConfidenceWizard.tsx:1063` (`Focus item not found`).
Polished skeletons elsewhere: `Index.tsx:28-36`, `ThisWeekPanel.tsx:322-335`, `Layout.tsx:160-180`.
The wizard "Focus item not found" is a dead-end with no recovery action.
**Fix:** standardize on `Skeleton` shells for loading; give error/empty states a heading + a way out
(e.g. "Back to home"), matching `ThisWeekPanel`'s empty state (`ThisWeekPanel.tsx:409-433`).

**C2 (Medium) — Production `console.log` noise in the core flow.** `ConfidenceWizard.tsx` logs
extensively on every load and submit (raw URL params, scores, submission payloads — e.g. `:101`,
`:128`, `:824-826`, `:949-956`), and `ThisWeekPanel.tsx:87-101` logs a "MASQUERADE DEBUG" block
including `staff.id`, role, location, and org IDs to the browser console on every render for real
participants. Not a visual bug, but it leaks identifiers and clutters the console.
**Fix:** gate behind a debug flag or remove.

**C3 (Low, strength) — Submission feedback is well done.** Keep as the pattern: `idle/saving/done`
phases (`ConfidenceWizard.tsx:69`), spinner + green check + confetti (`:1219-1238`, `:977`), and a
background retry queue with a pending badge (`SubmissionStatus.tsx`). The "Unsure? That's okay"
intervention dialog on low scores (`ConfidenceWizard.tsx:1243-1284`) is a thoughtful piece of
supportive UX.

**C4 (Low) — Wizards still carry self-select / cycle / repair machinery.** ConfidenceWizard has heavy
branching for `self_select`, `weekly_focus` vs `weekly_assignments` vs `weekly_plan`, and repair mode
(`:248-558`), and still renders a self-select dropdown (`:1153-1177`). Per the glossary/backlog these
are legacy (self-select "won't adopt"; cycle is legacy). Not broken, but it's surface area users can
hit that the product no longer intends. Confirm self-select slots are never assigned in current data.

### 5. Consistency, terminology & branding

**B1 (High for multi-tenant) — Hardcoded Alcan branding as the default identity.**
`Layout.tsx:2` `import alcanLogo from '@/assets/alcan-logo.png'` and `Layout.tsx:196`
`src={orgLogoUrl ?? alcanLogo}` — every org without an uploaded logo shows **Alcan's** logo in the
app header. `Welcome.tsx:7` and `SetupPassword.tsx:10` import `alcan-logo-full.jpg` with a
`// TODO: Replace with org-specific logo` and have **no** org fallback at all (`Welcome.tsx:83`,
`SetupPassword.tsx:143`) — a UK/other-org new hire sees Alcan's logo on the very first screen
(set-password) and on welcome.
**Fix:** use a neutral ProMoves default logo as the fallback, and wire `Welcome`/`SetupPassword` to the
same org-branding lookup `Layout.tsx:32-49` already performs. Tracks with backlog C2.

**B2 (Low) — Brand name spelling.** The app brand is "ProMoves" in `AppSidebar.tsx:60`, `Login.tsx:50`,
and `ThisWeekPanel.tsx:441`, but logo `alt` text is "Pro-Moves" (hyphenated) in `Layout.tsx:198` and
`Welcome.tsx:84`. Pick one spelling.

**B3 (Low) — Committed dead/backup files.** `pages/Index.backup.tsx` and the legacy
`pages/Confidence.tsx` / `pages/Performance.tsx` (superseded by the wizards per `App.tsx:120-123`)
remain in the tree. Cleanup candidates; no user impact.

---

## SAFE quick wins

Low-risk, high-confidence, localized:

1. **Fix the `NumberScale` aria-label** — add a `metric` prop and use it (`NumberScale.tsx:51`, passed
   from `ConfidenceWizard.tsx:1193` and the matching line in `PerformanceWizard`). (A1)
2. **Fix the two broken redirects** in `App.tsx:120` and `:122` (interpolate `:week`, or point at
   `/confidence/current/step/1`). (N1)
3. **Add `onKeyDown` to the Lead Pro Move card** at `ThisWeekPanel.tsx:568` to match the primary card.
   (A2)
4. **Add `aria-label`** to the icon-only header buttons in `Layout.tsx:208` and `:214`. (A4)
5. **Add `role="button"` + `tabIndex` + `onKeyDown`** (or convert to `<button>`) on `ProMoveRow.tsx:15`.
   (A3)
6. **Use a neutral ProMoves fallback logo** in `Welcome.tsx:83` and `SetupPassword.tsx:143` (and as the
   `??` fallback in `Layout.tsx:196`) so non-Alcan orgs aren't shown Alcan branding. (B1)
7. **Remove/guard the debug `console.log`s** in `ConfidenceWizard.tsx` and the masquerade block in
   `ThisWeekPanel.tsx:87-101`. (C2)
8. **Delete `pages/Index.backup.tsx`** and confirm the legacy `Confidence.tsx`/`Performance.tsx` can be
   removed. (B3)

---

## Needs live walkthrough

Cannot be settled from source alone:

- **Contrast measurement** of white domain-name text on pastel spine backgrounds
  (`ConfidenceWizard.tsx:1135`, `ThisWeekPanel.tsx:491`) and the `--score-N-bg` selected-button colors
  (`NumberScale.tsx:35-39`). (A5/A6)
- **Focus-trap and focus-return** of the AlertDialog intervention (`ConfidenceWizard.tsx:1243`), the
  `LearnerLearnDrawer` (`ThisWeekPanel.tsx:635`), and the various admin drawers/dialogs — does focus
  move into the dialog on open and return to the trigger on close?
- **Screen-reader announcement order** through a full Confidence → Performance loop, including the
  progress dots (`ConfidenceWizard.tsx:1090-1104`, presentational `div`s with no `aria-current`/label —
  likely silent to AT).
- **Per-persona home routing** — confirm participant, office manager, coach, regional/org admin, super
  admin, doctor, and clinical director each land somewhere sensible given the `Index.tsx:41-48` /
  `Layout.tsx:95-146` branching, and that the broken `:week` redirect isn't reachable from any live link.
- **Repair/backfill flow** end-to-end (`ConfidenceWizard.tsx:248-558`) — heavy branching that's hard to
  validate statically.
- **Org-branding application** — does an org with `logo_url`/`brand_color` (`Layout.tsx:42-48`) actually
  re-skin the header, and does the `--primary` override hold across navigation?
