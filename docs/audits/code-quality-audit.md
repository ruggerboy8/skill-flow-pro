# Skill Flow Pro — Code-Quality Audit

> ⚠️ **STALE — re-run needed.** This ran against the March-6 branch code (~1,529 commits behind
> `main`). Some findings may already be fixed on `main` — re-run against current code before
> acting on anything here.

**Date:** 2026-06-22
**Reviewer:** Engineering Code Reviewer (persona: `.claude/agents/engineering-code-reviewer.md`)
**Branch:** `claude/codebase-assessment-hq6Pn` (working branch)

## Scope & method

- **Scope:** `src/` (~330 TS/TSX files), build config, lockfiles. Read-only audit. No source files were modified.
- **Method:** Read the docs (`system-overview`, `glossary`, `data-model`, `architecture`,
  `improvement-backlog`, `CLAUDE.md`, `src/lib/unifiedAssignments.md`), then targeted static
  analysis via `grep`/`Read` of the week/cycle calculation surfaces, the time libraries
  (`lib/centralTime.ts`, `v2/time.ts`, `lib/submissionPolicy.ts`), data hooks, React Query usage,
  and import graphs to detect dead code.
- **Priority:** Highest-impact correctness risks and safe cleanup first — not a line-by-line pass.
- **Tooling caveat:** `npx tsc --noEmit` and `npm run lint` **could not be executed** — the audit
  sandbox denied `npx`/binary invocation (no outbound install, `node_modules/.bin` blocked) and
  denied `git`. TypeScript health below is assessed from config + reading, not a live compile.
  **Action item: run `npx tsc --noEmit` and `npm run lint` locally to get exact counts.**

---

## Executive summary

1. **Real timezone bug in the live weekly-assignment path.** `useWeeklyAssignments.tsx` computes
   "this Monday" in **local** time then serializes it with `.toISOString()` (UTC). For any user
   west of UTC — i.e. the entire current Central-time user base — this yields the **previous
   Sunday's** date and queries `week_start_date` for the wrong day. (Finding 1.)
2. **The documented "single source of truth" hook is dead code.** `useWeeklyAssignmentStatus`
   (and its RPC `get_staff_week_assignments`) has **zero call sites**, yet `unifiedAssignments.md`
   describes it as the unified path that "FIXED" CoachDetail. The doc is stale; the live path is
   `weekAssembly.ts → locationState.ts`. (Finding 2.)
3. **Two divergent client-side week-in-cycle formulas exist**, and one of them
   (`siteState.getWeekInCycle`) is timezone-naive and missing the canonical week-0 special case —
   but it turns out to be **dead** (Finding 4), which is the good news. The live one
   (`locationState.ts`) is correct. (Finding 3.)
4. **Two whole library files are dead:** `lib/progressTracking.ts` (zero importers, all stubs) and
   `lib/siteState.ts` (only imported by `progressTracking.ts`). ~550 lines of confusing,
   self-contradicting "deprecated" legacy. (Finding 4.)
5. **Two routed page components are dead imports:** `pages/Confidence.tsx` and
   `pages/Performance.tsx` are imported in `App.tsx` but never rendered (routes use the `*Wizard`
   variants; the legacy paths `<Navigate>`-redirect). (Finding 5.)
6. **Safe cleanup is plentiful and low-risk:** 6 `*.backup.*` files, `index.backup.css`,
   `tailwind.config.backup.ts`, and **two redundant bun lockfiles** (`bun.lock` + `bun.lockb`)
   alongside the authoritative `package-lock.json`. None are imported by live code. (Quick wins.)
7. **TypeScript safety net is effectively off:** `strict: false`, `strictNullChecks: false`,
   `noImplicitAny: false`, and ESLint `no-unused-vars: "off"`. This is *why* the dead code and the
   null/timezone hazards above went unnoticed. (Finding 7.)
8. **Pattern drift:** 39 of 250 page/component files call `supabase.from`/`supabase.rpc` inline,
   bypassing the documented hook + React-Query convention; the largest files
   (`EvaluationHub.tsx` 2,599 lines; `ConfidenceWizard.tsx` 1,207) mix data, time math, and UI.
   (Findings 6, 8.)

**Finding counts:** 4 correctness/likely-bug findings · 4 maintainability/consistency findings ·
8 safe quick-win cleanup items · 3 higher-risk items flagged for discussion.

---

## Findings ranked by impact

### 🔴 Finding 1 — Local-vs-UTC date mismatch in `useWeeklyAssignments` (live bug)

`src/hooks/useWeeklyAssignments.tsx:35-42`

```ts
const dayOfWeek = now.getDay();                       // LOCAL day
const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
const thisMonday = new Date(now);
thisMonday.setDate(now.getDate() + daysToMonday);
thisMonday.setHours(0, 0, 0, 0);                      // LOCAL midnight
const mondayStr = thisMonday.toISOString().split('T')[0];   // UTC date
```

**Why it's a bug:** `setHours(0,0,0,0)` produces local-midnight Monday. `.toISOString()` then
converts to UTC. For any negative-UTC-offset timezone — which is *every* current user (the app
defaults to `America/Chicago`, UTC−5/−6) — local Monday 00:00 is still **Sunday** in UTC, so
`mondayStr` is the prior Sunday. The subsequent `.eq('week_start_date', mondayStr)` (line 79) then
matches the wrong day and can silently return **zero assignments**.

**Recommendation:** Format the Monday in the location's timezone with `date-fns-tz`
(`formatInTimeZone(thisMonday, tz, 'yyyy-MM-dd')`) rather than `toISOString()`, mirroring how
`locationState.ts` already derives anchors. This `toISOString().split('T')[0]` anti-pattern appears
in **13 files** (`HistoryPanel`, `MonthView`, `WeekBuilderPanel`, `TeamWeeklyFocus`,
`LocationFormDrawer`, `GlobalAssignmentBuilder`, `useWeeklyAssignments`, `useWeeklyAssignmentStatus`,
`useStaffSubmissionRates`, `ScoreHistoryV2`, `submissionRateCalc`, `Review`, `StatsScores`) — audit
each: it is only safe when the input Date is already a UTC instant, **not** a local wall-clock date.

---

### 🟡 Finding 2 — `useWeeklyAssignmentStatus` is dead, but documented as the source of truth

`src/hooks/useWeeklyAssignmentStatus.tsx` (entire file) · doc: `src/lib/unifiedAssignments.md`

The hook has **zero call sites** anywhere in `src/`. Yet `unifiedAssignments.md` (lines 38-66)
presents it and its RPC `get_staff_week_assignments` as the consolidated "single source of truth"
that replaced `assembleCurrentWeek` and "FIXED" CoachDetail. In reality the live staff path is
`ThisWeekPanel → assembleCurrentWeek → locationState.assembleWeek`, and CoachDetail/Coach surfaces
go through `coachStatus.ts` and `get_staff_statuses`.

**Why it matters:** A future engineer reading the doc will "fix the week bug in one place" by
editing a hook that nothing calls. The doc actively misdirects.

**Recommendation:** Either (a) delete the unused hook and correct `unifiedAssignments.md` to
describe the *actual* live path, or (b) if the intent is still to migrate onto it, mark it
explicitly "NOT YET WIRED IN" at the top. Note the hook *also* contains the Finding-1
`toISOString` pattern (line 76), so it should not be wired in as-is.

---

### 🟡 Finding 3 — Two divergent week-in-cycle formulas (canonical drift risk)

- **Live & correct:** `src/lib/locationState.ts:73-74`
  ```ts
  const cycleNumber = Math.max(1, Math.floor(weekIndex / cycleLength) + 1);
  const weekInCycle = Math.max(1, (weekIndex % cycleLength) + 1);
  ```
  This matches the canonical formula in `unifiedAssignments.md` (the `Math.max(1, …)` clamp
  covers the `week_index = 0` special case).
- **Divergent:** `src/lib/siteState.ts:56-58`
  ```ts
  const daysDiff = Math.floor((now.getTime() - cycleStartDate.getTime()) / 86_400_000);
  return ((Math.floor(daysDiff / 7) % cycleLengthWeeks) + 1);
  ```
  This (a) uses raw UTC millisecond arithmetic with **no timezone anchoring** (unlike
  `locationState`, which anchors both `now` and `program_start` to the location's Monday), (b)
  computes only `week_in_cycle` and hardcodes `cycle = 1` (line 47), and (c) keys off
  `site_cycle_state.cycle_start_date` instead of `locations.program_start_date`.

**Why it matters:** The docs explicitly call week-formula drift "a recurring bug source." Two
implementations that disagree is exactly that risk.

**Recommendation:** The good news (Finding 4) is that `siteState.ts` is dead, so the fix is to
**delete it**, not reconcile it. If any of it is ever revived, it must be replaced with a call to
`getLocationWeekContext`, never a parallel formula.

---

### 🟡 Finding 4 — `lib/progressTracking.ts` and `lib/siteState.ts` are dead code

- `src/lib/progressTracking.ts` — **zero importers**. Every exported function is a deprecated stub
  that `console.warn`s and returns hardcoded `{cycle:1, week_in_cycle:1}` or `[]` (lines 45-89).
- `src/lib/siteState.ts` (~491 lines) — its **only** importer is `progressTracking.ts` (which is
  itself dead). So it is transitively dead.

Both files also contain self-contradicting guidance: `progressTracking.ts:1-9` says "All week logic
has been consolidated into `siteState.ts`," but the *actual* live consolidation is in
`locationState.ts` / `weekAssembly.ts`. These comments are stale and misleading.

**Recommendation:** Delete both files (verify with a fresh `git grep` first — see "needs-check"
in quick wins). Removing them also eliminates the divergent formula in Finding 3 and the
timezone-naive `getWeekInCycle`.

---

### 🟡 Finding 5 — `pages/Confidence.tsx` & `pages/Performance.tsx` are dead route components

`src/App.tsx:20-23` imports `Confidence`, `Performance`. `src/App.tsx:115-120`:

```tsx
<Route path="confidence/:week" element={<Navigate to="/confidence/:week/step/1" replace />} />
<Route path="confidence/:week/step/:n" element={<ConfidenceWizard />} />
<Route path="performance/:week" element={<Navigate to="/performance/:week/step/1" replace />} />
<Route path="performance/:week/step/:n" element={<PerformanceWizard />} />
```

`Confidence` and `Performance` are **never rendered** — the legacy bare routes redirect, and the
real routes use the `*Wizard` components. Neither `pages/Confidence.tsx` (14.9 KB) nor
`pages/Performance.tsx` (11.6 KB) is imported anywhere except this unused `App.tsx` import.

**Recommendation:** Remove the two imports and delete the two files (V1 leftovers superseded by the
wizards). `pages/Review.tsx` *is* still routed (line 120) — keep it.

---

### 🟡 Finding 6 — `featureFlags.isV2` is hardcoded on; the env toggle is a no-op

`src/lib/featureFlags.ts:1-2`

```ts
export const isV2 =
  (import.meta.env.VITE_V2?.toLowerCase?.() === 'true') || true; // default on
```

The trailing `|| true` makes `isV2` **always `true`** regardless of `VITE_V2`. It has a single
consumer (`ThisWeekPanel.tsx`), so any `else` branch there is dead. Separately, `architecture.md`
references a `VITE_USE_WEEKLY_ASSIGNMENTS` flag that **does not exist** in code (stale doc).

**Recommendation:** Decide whether V2 is permanent. If yes, drop the flag and inline the V2 branch
(removes a dead code path); if not, remove the `|| true`. Fix the `architecture.md` reference.

---

### 🟡 Finding 7 — TypeScript safety net is effectively disabled

`tsconfig.json` / `tsconfig.app.json`: `strict: false`, **`strictNullChecks: false`**,
`noImplicitAny: false`, `noUnusedLocals: false`. `eslint.config.js:26`:
`"@typescript-eslint/no-unused-vars": "off"`.

**Why it matters:** With `strictNullChecks` off, the `null`/`undefined` returns that pervade the
Supabase data layer (e.g. `confidence_score: number | null`, `.maybeSingle()` results) are not
type-checked, so the Finding-1 timezone path and the dead-code in Findings 2/4/5 produced no
compiler/lint signal. This is the root enabler of several findings above.

**Recommendation:** This is a higher-risk change (see below) — turning on `strictNullChecks`
across ~330 files will surface many errors. Treat as a tracked, incremental project, not a quick
win. At minimum, re-enable `no-unused-vars` as a *warning* to catch future dead imports.

---

### 🟡 Finding 8 — Convention drift: inline Supabase calls & very large files

- **Inline data access:** 39 of 250 files under `pages/`+`components/` call
  `supabase.from`/`supabase.rpc` directly, bypassing the documented "prefer a hook + React Query"
  convention (`architecture.md`, "Cross-cutting conventions"). `ConfidenceWizard.tsx` alone embeds
  raw `weekly_assignments` queries with hand-written joins (e.g. lines 258-285).
- **Oversized files mixing concerns:** `pages/coach/EvaluationHub.tsx` (2,599 lines),
  `ConfidenceWizard.tsx` (1,207), `EvaluationsExportTab.tsx` (1,095), `LearningDrawer.tsx` (1,094),
  `PerformanceWizard.tsx` (1,043) interleave data fetching, the fragile week/cycle math, and UI.
  `ConfidenceWizard.tsx` re-implements week/cycle/source-selection branching inline (lines 228-560)
  rather than delegating to `locationState`/`weekAssembly`, duplicating the legacy
  cycle-≤3-vs-plan logic that lives in the RPCs.

**Recommendation:** Not a mechanical fix. As wizards/eval surfaces are touched, extract the inline
Supabase reads into `useX` hooks and route week derivation through the single `locationState`
helper, so the "fragile" formula lives in exactly one client place. Track under the existing
"fragile week formula" note in the docs.

---

## SAFE quick wins (no behavior change)

These won't change runtime behavior. Marked **safe** (delete freely) or **needs-check** (verify
no import first — trivial with `git grep <basename>`).

| Item | Path(s) | Verdict |
|---|---|---|
| Backup component/style files | `src/index.backup.css`, `src/pages/Index.backup.tsx`, `src/components/ui/button.backup.tsx`, `src/components/ui/card.backup.tsx`, `src/components/home/ChristmasWelcome.backup.tsx`, `src/components/home/RecentWinBanner.backup.tsx` | **safe** — confirmed no live import references any `.backup` file (only the non-backup `RecentWinBanner.tsx`/`ChristmasWelcome.tsx` are imported by `Index.tsx`). |
| Backup config files | `tailwind.config.backup.ts` (root) | **safe** — `tailwind.config.ts` is the live config; nothing imports the `.backup`. |
| Redundant bun lockfile (stale binary) | `bun.lockb` (Mar 6) | **safe** — superseded by the newer text `bun.lock` (Jun 12); a binary bun lock is never needed alongside the text one. |
| Redundant bun lockfile (vs npm) | `bun.lock` | **needs-check** — CLAUDE.md declares **npm** the package manager and `package-lock.json` is present & current, so bun lockfiles are not the source of truth. Remove both bun locks to avoid drift, *after* confirming no Bun-based CI step. |
| Dead library: deprecated stubs | `src/lib/progressTracking.ts` | **safe** — zero importers (Finding 4). |
| Dead library: legacy site state | `src/lib/siteState.ts` | **needs-check** — only importer is the (dead) `progressTracking.ts`; delete both together (Finding 4). |
| Dead route components + their imports | `src/pages/Confidence.tsx`, `src/pages/Performance.tsx` + imports at `src/App.tsx:20-23` | **safe** — never rendered; routes use `*Wizard` (Finding 5). Keep `Review.tsx`. |
| Stale doc references | `architecture.md` (`VITE_USE_WEEKLY_ASSIGNMENTS` doesn't exist); `src/lib/unifiedAssignments.md` (describes a dead hook as live) | **safe** — doc-only edits. |

Optional follow-on (low risk): re-enable ESLint `no-unused-vars` as `"warn"` to keep future dead
imports visible.

---

## Higher-risk / needs discussion

1. **Enable `strictNullChecks` / `strict` (Finding 7).** High value but will surface many errors
   across the Supabase-typed data layer. Do it incrementally (per-directory `// @ts-strict`
   adoption or staged `tsconfig` overrides), with a tracking issue — not in the "safe" pass.
2. **Retire the cycle/week concept (docs A1–A4).** The live formula in `locationState.ts` is
   currently load-bearing for `weekly_assignments` lookups and the legacy cycle-≤3 branches in the
   wizards. Removal is multi-surface (client + RPCs) and must keep client/RPC formulas identical
   until cut over. Coordinate with the migration owners.
3. **Consolidate the weekly-assignment data path (Findings 2 & 8).** Decide whether
   `useWeeklyAssignmentStatus`/`get_staff_week_assignments` is the intended future single path
   (then wire it in and migrate `ThisWeekPanel`/wizards onto it, *after* fixing its `toISOString`
   bug) or whether `locationState`/`coachStatus` is canonical (then delete the unused hook). Either
   way, update `unifiedAssignments.md` to match reality.

---

## Notes on what could NOT be verified

- **`npx tsc --noEmit` and `npm run lint` did not run** (sandbox denied `npx`/binary/`git`). Run
  both locally. Given `strict`/`strictNullChecks` are off, expect tsc to be near-clean *despite*
  the latent null/timezone hazards above — which is the point of Finding 7. Lint will likely flag
  `react-hooks/exhaustive-deps` and `react-refresh/only-export-components` warnings; `no-unused-vars`
  is disabled so it won't catch the dead imports this audit found by hand.
- Dead-code findings were established by `grep` import-graph analysis; confirm with `git grep`
  before deleting, since dynamic imports (none observed) would not show up.
