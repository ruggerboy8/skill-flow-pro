# Skill Flow Pro — UX & Accessibility Audit

> ⚠️ **STALE — re-run needed.** This ran against the March-6 branch code (~1,529 commits behind
> `main`). Some findings may already be fixed on `main` — re-run against current code before
> acting on anything here.

**Date:** 2026-06-22
**Auditor:** UX Researcher (design-ux-researcher persona)
**Scope:** Information architecture & navigation, accessibility (a11y), core weekly-loop UX (Confidence/Performance wizards), and consistency across V1/V2 surfaces and terminology.
**Method:** Static, code-level pass. Source was read, not run. No app was launched, no live screen reader or contrast tooling was used. Findings that genuinely require a running app are isolated under "Needs live walkthrough" rather than asserted as fact. File references are repo-relative.

> **Important caveat:** This is a code-reading audit. It can reliably catch *structural* a11y problems (clickable `div`s, missing roles, hardcoded colors, broken redirects, wrong `aria-label` logic) because those are visible in source. It **cannot** measure actual contrast ratios, focus-trap behavior in a real browser, or screen-reader announcement order — those are flagged for live verification.

---

## Executive summary

- **The route/persona map is mostly coherent but carries confusing duplication and a few genuinely broken redirects.** `src/App.tsx` has two parallel "my-role" trees (participant `/my-role/*` and doctor `/doctor/my-role/*`) and the legacy-redirect block at lines 116/118 ships a real bug: it redirects to the literal string `/confidence/:week/step/1` instead of interpolating the param.
- **The core rating control has an incorrect `aria-label`.** `src/components/NumberScale.tsx` labels buttons "Confidence" only when the score is `4` and "Performance" for 1–3 — so every screen-reader user hears the wrong context on the single most-used control in the product.
- **Color is the only signal for the four skill domains.** `src/lib/domainColors.ts` + `domain-badge.tsx` + the wizard "spine" encode domain purely as a background color (pastel, low-saturation). The domain *name* is present as text, which helps, but several status cues elsewhere are color-only.
- **Clickable `div`s break keyboard and screen-reader access** in list rows users are expected to open (`src/components/my-role/ProMoveRow.tsx` and the wizard "spine"/progress-dots), with no `role`, `tabIndex`, or key handler.
- **Loading and error states are thin and inconsistent.** Three different loading treatments coexist (bare "Loading..." text, a spinner, and skeletons), and the wizards swallow submission failures silently by design — the user is told "saved" and navigated away even when the immediate write failed.
- **Legacy "cycle/week" language leaks into the participant UI.** The wizard's repair/backfill path renders `Cycle ${cycleNumber}, Week ${weekInCycle}` as a user-facing label (`ConfidenceWizard.tsx:560`), contradicting the glossary's decision that "cycle" is legacy and not meaningful to users.
- **Branding and role labels are hardcoded to Alcan**, which conflicts with the stated multi-tenant direction: the header logo + alt text say "ALCAN" (`Layout.tsx`), and planner routes hardcode `roleName="RDA"`/`"DFI"` instead of resolving the org-specific display name (`App.tsx:169-171`).
- **Console noise and dev artifacts are shipping in the core flow** — `ConfidenceWizard.tsx` contains ~20 `console.log` statements including raw user score data, which is both a polish and a minor privacy concern.

**Finding counts:** IA/Navigation: 5 · Accessibility: 7 · Core-flow UX: 6 · Consistency: 5 (plus 6 SAFE quick wins and 6 live-walkthrough items).

---

## 1. Information Architecture & Navigation

### IA-1 (High) — Broken param interpolation in legacy wizard redirects
`src/App.tsx:116` and `:118` use React Router `<Navigate>` with a literal target path:
```tsx
<Route path="confidence/:week" element={<Navigate to="/confidence/:week/step/1" replace />} />
<Route path="performance/:week" element={<Navigate to="/performance/:week/step/1" replace />} />
```
`:week` is not interpolated by `<Navigate to=...>` — it is treated as a literal segment. Any user or bookmark hitting `/confidence/2024-06-10` lands on a route whose `week` param is the literal string `:week`. In practice the wizards always navigate using `/confidence/current/step/N` (see `ConfidenceWizard.tsx:720`), so this redirect may be effectively dead, but it is still a latent correctness bug.
**Recommendation:** Either delete these redirects if no inbound links use `/confidence/:week`, or replace with a small redirect component that reads `useParams()` and interpolates. Confirm no email/reminder deep-links use the old shape before deleting.

### IA-2 (Medium) — Two parallel "my-role" trees with divergent structure
Participants get `/my-role` (tabs: overview / practice-log / evaluations, `App.tsx:99-110`) while doctors get a structurally different `/doctor/my-role` + `/doctor/my-team/role/:roleSlug/...` tree (`App.tsx:143-154`). The label "My Role" means two different information designs depending on persona. This is defensible (doctors are a separate track per the glossary) but the naming collision makes the route map hard to reason about and risks coaches/admins who masquerade getting confused about which "My Role" they are in.
**Recommendation:** Keep the separation but document it in `architecture.md`'s route section, and consider a distinct label for the doctor surface (e.g. "My Development") to reduce the collision.

### IA-3 (Medium) — Nav labels diverge from route names and from each other
`Layout.tsx` builds the sidebar with labels like **"Command Center"** → `/dashboard` (line 89) and **"Evaluations"** → `/admin/evaluations` (line 86), while `AppSidebar.tsx`'s `isActive()` still special-cases the **dead** route `/admin/eval-results-v2` (lines 40-42), which `App.tsx:160` redirects away. So the sidebar contains active-state logic for a route that can never be the current path.
**Recommendation:** Remove the `/admin/eval-results-v2` branch from `AppSidebar.isActive`. Align the active-state logic in `Layout.tsx` and `AppSidebar.tsx` (they each reimplement `isActive` with slightly different rules).

### IA-4 (Medium) — `NotFound` is a dead-end with a full-page-reload link and no theme support
`src/pages/NotFound.tsx` uses a raw `<a href="/">` (forces a full document reload, dropping SPA state) and hardcoded `bg-gray-100` / `text-gray-600` / `text-blue-500` that ignore the app's dark-mode token system. It also offers only "Return to Home" with no context about what the user was looking for or persona-appropriate next steps.
**Recommendation:** Use React Router `<Link to="/">`, swap hardcoded grays for `bg-background`/`text-muted-foreground`/`text-primary` tokens, and consider routing the user to their `homeRoute` (already computed in `useUserRole`) rather than always `/`.

### IA-5 (Low) — Large legacy-redirect block is undocumented in-file
`App.tsx:158-176` has multiple legacy redirect clusters (eval-results, builder/:roleId variants, admin/organizations). They are individually commented but there is no single note on *why* they must be preserved. CLAUDE/architecture docs say "preserve these" but the file itself gives a future editor no signal about which are load-bearing.
**Recommendation:** Add a one-line header comment pointing to `architecture.md`, or annotate each with the date it was deprecated so stale ones can eventually be pruned safely.

---

## 2. Accessibility (a11y)

### A11Y-1 (High) — `NumberScale` aria-label is logically wrong
`src/components/NumberScale.tsx:54`:
```tsx
aria-label={`${score === 4 ? 'Confidence' : 'Performance'} ${score} – ${tooltipText[...]}`}
```
The control is shared by **both** wizards, but the label hardcodes "Confidence" only for the `4` button and "Performance" for `1/2/3`. A screen-reader user on the Confidence wizard hears "Performance 1", "Performance 2", "Performance 3", "Confidence 4". This is the single most-used interactive control in the product (used on every Pro Move, twice a week, per participant).
**Recommendation:** Pass the metric ("confidence" | "performance") in as a prop and build the label from it. Also include the question context ("How confident are you") rather than guessing from the score value.

### A11Y-2 (High) — Clickable `div` rows are not keyboard/AT accessible
`src/components/my-role/ProMoveRow.tsx:15-18` is a `<div onClick={onClick}>` styled with `cursor-pointer` that opens the `ProMoveDrawer`. It has no `role="button"`, no `tabIndex={0}`, and no `onKeyDown` for Enter/Space. Keyboard-only and screen-reader users cannot open Pro Move study content. The comment on line 48 even calls the affordance "hints at future clickability," signaling the interaction model is under-specified.
**Recommendation:** Make it a real `<button>` (or add `role="button"`, `tabIndex={0}`, and an Enter/Space handler) with an accessible name like "Open {action_statement}". Audit other `onClick` `div`s the same way.

### A11Y-3 (High) — Domain is signaled primarily by color
`src/lib/domainColors.ts` defines four pastel domain colors; the wizard "spine" (`ConfidenceWizard.tsx:1056-1068`) and `domain-badge.tsx` render the domain as a colored block. The domain *name* text is present (good — this is not pure color-coding), but the pastel palette is low-contrast against the white card, and the rich palette is used decoratively. Users with color-vision deficiency relying on the spine/badge color alone to distinguish Clinical/Clerical/Cultural/Case Acceptance get little differentiation.
**Recommendation:** Keep the name text everywhere (already mostly done), verify the badge text/background pairs meet 4.5:1 (the pastel `211 100% 92%` blue with `text-foreground` likely passes; confirm live), and consider a small per-domain icon to add a non-color channel.

### A11Y-4 (Medium) — Decorative emoji and icons lack consistent labeling
The intervention modal (`ConfidenceWizard.tsx:1186`) and victory modal (`PerformanceWizard.tsx:1015`) render emoji (💡, 🚀) inside otherwise meaningful content. The 💡 is marked `select-none` but not `aria-hidden`; the 🚀 is the only content in its container. Screen readers may announce "light bulb" / "rocket" mid-sentence.
**Recommendation:** Add `aria-hidden="true"` to purely decorative emoji/icons. (Radix `AlertDialogTitle`/`Description` already provide the accessible name for these dialogs, which is good.)

### A11Y-5 (Medium) — Header logo alt text is a brand string, and icon-only buttons rely on title/tooltip
`Layout.tsx:126` sets `alt="ALCAN"` (a11y-wise acceptable as the logo, but see Consistency C-1 for the multi-tenant problem). The profile and sim-console buttons (`Layout.tsx:135,141`) are icon-only `<Button size="icon">` with no `aria-label` — they rely on the visual icon alone. Sidebar items handle this correctly via the `tooltip` prop and `sr-only` span (`AppSidebar.tsx:74,81`), so the pattern exists but isn't applied in the header.
**Recommendation:** Add `aria-label="Profile"` / `aria-label="Open sim console"` to the icon-only header buttons.

### A11Y-6 (Medium) — Progress is conveyed by visual dots only
The wizard step indicator (`ConfidenceWizard.tsx:1027-1041`, mirrored in `PerformanceWizard.tsx`) is a row of `<div>` dots with width/opacity differences and no text alternative — no `aria-label`, no "Step 2 of 5" live region. A screen-reader user has no sense of position in the wizard.
**Recommendation:** Add an `aria-label` like "Step {currentIndex+1} of {weeklyFocus.length}" on the container (or a visually-hidden live region), and ideally `aria-current` on the active dot.

### A11Y-7 (Low) — Loading text is not announced
Bare "Loading..." (`App.tsx:82`, `ConfidenceWizard.tsx:998`) and the spinner-only states (`Layout.tsx:106-110`) are not wrapped in an `aria-live`/`role="status"` region, so AT users may not learn the app is busy.
**Recommendation:** Wrap loading indicators in `role="status"` with an accessible text label; this also covers the spinner-only `Layout` state which has no text at all.

---

## 3. Core-flow UX (the weekly Confidence/Performance loop)

### CF-1 (High) — Submission failures are silently swallowed; user is told "saved"
In `ConfidenceWizard.handleSubmit` (`ConfidenceWizard.tsx:922-964`), when `submitWithRetry` returns falsy the code explicitly does **not** show an error, navigates the user away anyway, and relies on background retries:
```tsx
if (success) { toast({ title: "Confidence saved", ... }); }
else { /* Don't show error toast ... Data will eventually be saved. */ }
...
navigate('/'); // always
```
This matches the docs' note that the flow lacks real error states. The risk: a participant who lost connectivity gets positive-feeling navigation home with no confirmation their scores actually landed, and no surfaced way to know if the background retry ultimately failed. For a *measurement* product, silent data loss undermines the core value.
**Recommendation:** Surface a persistent, non-blocking indicator when a submission is queued-but-not-confirmed (the `pendingCount` from `useReliableSubmission` is already available — `PerformanceWizard.tsx:909` shows a "Saving..." badge but only transiently). Distinguish "saved" from "queued" in the success toast.

### CF-2 (High) — Generic, non-actionable error toasts dominate the load path
`ConfidenceWizard.loadData` shows `{ title: 'Error', description: 'Failed to load Pro Moves' }` then `navigate('/week')` (lines 547-554) — note `/week` is not a defined route in `App.tsx`, so this likely lands on `NotFound`. Several other error branches navigate to `/setup` (line 189), also not a defined route (the route is `/setup-password`).
**Recommendation:** Fix the dead navigation targets (`/week`, `/setup`). Replace generic "Error" toasts with specific, recoverable messaging and an in-place retry rather than navigating away.

### CF-3 (Medium) — No true empty state in the wizards
If `assignments` is empty the wizard treats it as an error (`ConfidenceWizard.tsx:547`) rather than a legitimate "nothing assigned this week" empty state. A participant with no current Pro Moves sees a destructive error toast and gets bounced to a broken route.
**Recommendation:** Distinguish "no assignments (empty)" from "failed to load (error)". For empty, show a calm explanatory state ("No Pro Moves assigned this week — check back Monday") with a link home.

### CF-4 (Medium) — "Focus item not found" is a bare dead-end
`ConfidenceWizard.tsx:1003-1009` renders centered text "Focus item not found" with no navigation. A user who deep-links to `/confidence/current/step/9` (beyond the assignment count) is stranded.
**Recommendation:** Add a "Back to start / Home" action, or clamp the step param to the valid range and redirect.

### CF-5 (Medium) — Inconsistent "submitting" feedback between the two wizards
ConfidenceWizard gates its in-flow "Saving..." badge on local `submitting` state (`:1046`), while PerformanceWizard gates the equivalent badge on `pendingCount > 0` (`:909`). Same visual element, two different trigger semantics — they will behave differently under retry/offline conditions.
**Recommendation:** Standardize on one submission-status source across both wizards (prefer `pendingCount` so queued retries stay visible).

### CF-6 (Low) — Post-submission feedback copy is friendly but loses backfill nuance
The success toast for backfill says "Confidence backfilled / Scores updated for past week" (`ConfidenceWizard.tsx:929-930`) — good. But the normal-path toast "Great! Come back later to rate your performance" assumes the weekly cadence and would be wrong/confusing for any non-weekly context the multi-tenant product may introduce.
**Recommendation:** Keep for now; revisit copy when cadence becomes org-configurable.

---

## 4. Consistency (V1/V2 surfaces, terminology, copy)

### C-1 (High) — Hardcoded Alcan branding & role labels conflict with multi-tenant direction
- Header logo + alt text are `alcanLogo` / `alt="ALCAN"` (`Layout.tsx:2,126`).
- Planner routes hardcode display role names: `roleName="DFI"`, `"RDA"`, `"Office Manager"` (`App.tsx:169-171`). The glossary (and improvement-backlog item D1) is explicit that roles must resolve org-specific labels via `resolve_role_display_name()` — a UK org should see "Dental Nurse", not "RDA".
**Recommendation:** Source the logo and role display names from org config / `resolve_role_display_name()`. This is a known backlog item (D1) but it surfaces directly in routing and chrome, so it affects UX immediately for any non-Alcan tenant.

### C-2 (High) — Legacy "Cycle / Week" language is shown to participants
`ConfidenceWizard.tsx:560`: `let weekLabel = \`Cycle ${cycleNumber}, Week ${weekInCycle}\`;` is used as a user-facing label in repair mode. The glossary marks *cycle* and *week-in-cycle* as **legacy / no longer meaningful to the product**. Showing "Cycle 4, Week 2" to a user contradicts the documented terminology decision.
**Recommendation:** Replace with the "Week of {date}" label the same function already computes for the non-repair path (`:570`). Audit other surfaces for "Cycle N" strings.

### C-3 (Medium) — Two duplicated rating controls / wizard implementations
`ConfidenceWizard.tsx` (1207 lines) and `PerformanceWizard.tsx` (1043 lines) duplicate the spine card, progress dots, sticky footer, submitting badge, and AlertDialog patterns nearly verbatim, and there are older `Confidence.tsx`/`Performance.tsx` (V1) pages still in the tree though not routed in `App.tsx`. Divergence has already started (see CF-5).
**Recommendation:** Extract the shared wizard shell (spine card, progress dots, footer, NumberScale section) into one component so a11y/UX fixes apply once. Delete or clearly archive the unrouted V1 `Confidence.tsx`/`Performance.tsx` to avoid future editors fixing the wrong file.

### C-4 (Medium) — Three different loading idioms across surfaces
Bare text "Loading..." (`App.tsx`, `ConfidenceWizard`), border-spinner (`Layout.tsx:108`), and Skeleton blocks (`Index.tsx:28-36`, `ProMoveDrawer.tsx:146-150`). The skeleton approach is the best UX (least layout shift); the bare-text one is the weakest.
**Recommendation:** Standardize on Skeleton for content regions and a single labeled spinner component for full-page gates.

### C-5 (Low) — "Backfill" terminology still referenced in code after nav removal
`AppSidebar.tsx:21,69` keep `backfillMissingCount` and a "Backfill" nav-highlight branch even though the comment says backfill nav was removed, and `Layout.tsx:79` comments the nav out. User-facing copy mixes "Backfill" (`Index.tsx:57`) with "repair mode" (wizard query param `mode=repair`) for the same concept.
**Recommendation:** Pick one user-facing term ("Backfill") and remove the dead `backfillMissingCount` plumbing from `AppSidebar`.

---

## SAFE quick wins (low-risk, no core-behavior change)

1. **Fix `NumberScale` aria-label** to derive from a metric prop (A11Y-1). Pure label change; no behavior impact.
2. **Add `aria-label` to icon-only header buttons** in `Layout.tsx` (Profile, Sim console) (A11Y-5).
3. **Add `aria-hidden="true"` to decorative emoji/icons** in the two wizard modals (A11Y-4).
4. **Swap `NotFound`'s `<a href>` for `<Link>` and hardcoded grays for theme tokens** (`NotFound.tsx`, IA-4).
5. **Remove the dead `/admin/eval-results-v2` branch** from `AppSidebar.isActive` (IA-3) — it can never match.
6. **Strip the ~20 `console.log` statements (incl. raw score data) from `ConfidenceWizard.tsx`** — polish + minor privacy (Exec summary).

Each is isolated, testable by inspection, and does not alter the weekly-loop data path.

---

## Needs live walkthrough (verify against the running app)

1. **Contrast ratios** of the pastel domain palette (`domainColors.ts`) against `text-foreground` on the badge and against white on the wizard spine — confirm 4.5:1 (A11Y-3). Can't be measured from source.
2. **Focus trapping / focus return** in the intervention and victory `AlertDialog`s (and `ProMoveDrawer` Sheet). Radix should handle this, but the custom `p-0` layouts and `asChild` descriptions warrant a real keyboard/AT pass.
3. **Whether the broken `/confidence/:week` redirect (IA-1) is reachable** in production — check reminder emails / `coach-remind` deep-link formats for the old URL shape before deleting.
4. **Actual behavior of silent submission failure (CF-1)** under offline/throttled network: does the background retry truly land, and does the user ever find out if it doesn't?
5. **Dead navigation targets `/week` and `/setup` (CF-2)** — confirm in-app that these resolve to NotFound and aren't masked by some catch-all.
6. **Screen-reader announcement order** through a full Confidence wizard run (spine domain label written vertically via `writing-mode`, progress dots, NumberScale, sticky footer) — vertical text + decorative spine may read oddly.

---

*Prepared as a static code review. Recommendations are prioritized High → Low within each theme. Where a fix is a known backlog item (e.g. role display names, cycle retirement), it is cross-referenced to `improvement-backlog.md`.*
