# MOB-Explore rebuild — implementation spec

Maps the approved **Explore drill** prototype onto the real Skill Flow Pro
codebase. Base: `origin/main` (mobile redesign MOB-1..6 merged). This is a
**rebuild of the existing "My Role" / mobile "Explore" surface**, not a new tab.

Design sources (approved, "ship it"):
- `docs/prototypes/explore-drill-prototype.html` — the visual/interaction design
- `docs/prototypes/explore-drill-design-notes.md` — rationale + decisions

**Reading convention in this spec:**
- **[grounded]** — verified against code/DB on `origin/main`.
- **[proposal]** — a design/structure decision this spec is making; changeable.
- **[flag]** — something in the prototype with no real data/route behind it.

---

## 0. The one correction that drives everything

The design notes describe the competency page as having a *formal definition*
**and** a separate *aspirational identity line* ("you are the patient's advocate
in the chair"). In the real framework these are **two existing columns on the
`competencies` table**, not one plus an invented string:

| Prototype element | Prototype field | Real column | Currently loaded by `useCraftAtlas`? |
|---|---|---|---|
| Page heading | `c.name` | `competencies.name` | ✅ yes (`title`) |
| Quiet subtitle / handle | `c.tagline` | `competencies.tagline` | ✅ yes (`subtitle`) |
| Formal definition (quiet box) | `c.formal` | `competencies.description` | ❌ **no — must add** |
| Aspirational block quote | `c.friendly` | `competencies.friendly_description` | ✅ yes (currently mapped onto `AtlasCompetency.description`) |

[grounded] Both columns exist — see `src/components/platform/CloneCompetenciesDialog.tsx`
selecting `domain_id, name, tagline, description, friendly_description, ...`. The
"aspirational identity line" and the "friendly description" are the **same
field**; no new column, no invented copy. The only data gap at the competency
level is that `useCraftAtlas` does not yet select `competencies.description`
(the formal one). See §2 and §5.

---

## 1. Level → route / component map

The prototype is a single-document **4-level stack** with slide transitions
(`explore → domain → comp → move`, `stack[]` in JS). The current app has **3
screens**: a landing (overview) → a competency page (`area`) → a move **drawer**.
The rebuild inserts the missing **domain level** and promotes the move from a
drawer to its own screen.

### Recommended structure [proposal] — one route per level

| Lvl | Prototype screen | Route | Mobile component | Desktop at this route |
|---|---|---|---|---|
| 1 | Explore landing (doorways) | `/my-role` (index) | `CraftAtlasOverview` **rebuilt → doorways**, reached via `RoleRadar` mobile branch | `RoleRadar` grid — **unchanged** |
| 2 | Domain (competency list) | `/my-role/domain/:domainSlug` | **new mobile branch** in `DomainDetail` (or new `ExploreDomain`) | `DomainDetail` accordion — **unchanged** |
| 3 | Competency (formal + quote + moves) | `/my-role/area/:competencyId` | `CraftAtlasArea` **rebuilt** | redirects to `/my-role/domain/:slug` — **unchanged** |
| 4 | Pro Move (description centerpiece) | **new** `/my-role/move/:actionId` | **new** `ExploreMove` | redirect to the domain page (see §4) |

**Why route-per-level, not an in-component stack** [proposal]:
- The breadcrumb, back-pill, and "sense of place" the founder asked for map
  1:1 to URL depth. Browser/hardware back "just works," and deep entry
  ("Surprise me" → a random move with the trail intact) is a plain `navigate()`
  to `/my-role/move/:actionId` — every ancestor is *derivable* from the move's
  competency, so no URL needs to carry domain/comp ids.
- It reuses the routing seams already built for this surface: `/my-role/area/:competencyId`
  and `/my-role/domain/:domainSlug` already exist [grounded, `App.tsx` lines
  135–151], both already full-screen pages under the main `Layout` (not nested
  under `MyRoleLayout`'s tab chrome), and both already have the mobile-vs-desktop
  split pattern.
- It keeps desktop **byte-identical** by branching on `useMobileShell()` exactly
  as `CraftAtlasArea` does today, instead of a parallel route table.

**The one genuinely new route:** `/my-role/move/:actionId`. [proposal] The move
becomes a page because the drawer (a shadcn `Sheet`) cannot carry the breadcrumb,
the traveling-color page frame, directional slide, or the in-place "Next move"
swap that are the whole point of this level. `:actionId` alone is enough — the
containing competency and domain are looked up from `useCraftAtlas` data.

**Components: reworked vs new**
- Reworked in place: `CraftAtlasOverview` (→ doorways), `CraftAtlasArea` (→ the
  real single-competency page), the mobile branch of `DomainDetail`, `useCraftAtlas`
  (add formal column + move ordering; drop grading — §3/§5).
- New: `ExploreMove` (move page), `useProMoveResources(actionId)` (extract the
  drawer's resource-fetch so the move page and the desktop drawer share it), a
  small `ExploreBreadcrumb` and reuse of the existing `BackPill` [grounded,
  `src/components/mobile/BackPill.tsx`]. (No discovery-state hook — dots are cut.)
- Retained for desktop only: `ProMoveDrawer` stays as-is for `DomainDetail`'s
  desktop accordion; the mobile Explore path stops using it.

---

## 2. Per level: data, render, design specifics

All four levels read from the **single** `useCraftAtlas()` query [grounded] —
one fetch, cache-shared across screens, so domain/comp/move pages are cache hits,
not refetches. The move page additionally fetches per-move resources via a new
`useProMoveResources(actionId)` (extracted from `ProMoveDrawer`).

### Level 1 — Explore landing (`/my-role`, mobile)
- **Data** [grounded]: `useCraftAtlas().competencies`, grouped by `domainName`
  into the four `DOMAIN_ORDER` domains. Per-doorway counts: `list.length` areas,
  `sum(proMoves.length)` moves — both already computed in today's overview.
- **Renders**: four **doorway cards** (not the current 2-col pastel tile grid),
  each with the domain name in serif display (prototype uses Fraunces; use the
  shell's display face), a one-liner, and two neutral counts ("4 areas · 16 Pro
  Moves"). Tapping a doorway → `/my-role/domain/:domainSlug` via `getDomainSlug()`
  [grounded, `domainUtils.ts`].
- **Design specifics**:
  - **Doorways / traveling color**: card carries its domain color as a soft
    corner-gradient using `getDomainColorVar(domain)` / `getDomainPastelVar(domain)`
    [grounded, `domainColors.ts`]. NO scores, NO level markers.
  - Header stays "Explore / My Role" eyebrow+title [grounded, already in overview].
- **Domain one-liner** [DECIDED — add a warm field]. The prototype's `d.intro`
  ("The hands-on craft of the operatory. Clean rooms, smooth procedures…") is
  bespoke editorial copy with no DB column. Add a warm **`oneLiner`** field to
  the `DomainContent` interface in `src/lib/content/roleDefinitions.ts` and
  populate it for **every role × every domain** — that is `DFI`, `RDA`, and `OM`
  (the three `RoleType`s) × the four `DOMAIN_ORDER` domains = **12 strings**, so
  no doorway ever falls back to empty or borrows the formal
  `ROLE_CONTENT[...].description`. The landing reads
  `ROLE_CONTENT[roleType][domain].oneLiner` for the resolved role [grounded —
  `roleType` already resolved via `getRoleTypeFromArchetype` in `RoleRadar`].
  The prototype only wrote the four Dental-Assistant (`RDA`) strings; the other
  eight must be authored in the same warm voice as part of this work.

### Level 2 — Domain (`/my-role/domain/:domainSlug`, mobile branch)
- **Data** [grounded]: resolve `domainName` from the slug (`getDomainNameFromSlug`),
  filter `useCraftAtlas().competencies` to that domain.
- **Renders**: a colored hero stating what the domain is, then a list of
  **competency rows**, each led by its **tagline** (`subtitle`) above the formal
  `title`, so the list reads as inviting places. Tap → `/my-role/area/:competencyId`.
- **Design specifics**:
  - **Traveling color** continues via `getDomainColorVar/Pastel/Ink(domainName)`.
  - **No discovery dots** [DECIDED — cut, see §5]. The competency rows carry the
    domain one-liner voice, not an opened-count marker. Explore stays stateless.
  - **Back pill**: `‹ Explore` → `/my-role`.
- **[proposal]** Add `if (isMobileShell) return <ExploreDomain/>` branch inside
  `DomainDetail`, mirroring `RoleRadar`'s pattern, OR a dedicated route element.
  Keeping it inside `DomainDetail` leaves the desktop render path untouched.

### Level 3 — Competency (`/my-role/area/:competencyId`, mobile)
- **Data** [grounded + one add]: the competency from `useCraftAtlas`. Needs the
  **formal definition** (`competencies.description`) added to the hook (§0/§5).
- **Renders** (this is the bug fix — the page is about *that* competency, not the
  whole domain):
  - `h1` = competency **name** (`title`).
  - Quiet subtitle = **tagline** (`subtitle`).
  - **Formal definition** in a quiet box = the newly-loaded `formalDescription`.
  - **Aspirational block quote** (serif) = `friendlyDescription` — "the app
    describing the person at their best."
  - Section label "N Pro Moves", then the **move list**: numbered rows, each
    showing the move's `action_statement` and a small **materials icon row**
    (speaker/script/video/link) only when those resources exist. Tap →
    `/my-role/move/:actionId`.
- **Design specifics**: traveling color continues; back pill `‹ <Domain name>`.
  No "opened" count, no grade, no coach card.

### Level 4 — Pro Move (`/my-role/move/:actionId`, mobile — new)
- **Data**:
  - [grounded] Move identity from `useCraftAtlas`: find the competency whose
    `proMoves` contains `:actionId`; that yields `action_statement`, the move
    `description`, the containing competency (tagline + name) and domain (color).
  - [grounded] Resources via new `useProMoveResources(actionId)` — the exact
    logic already in `ProMoveDrawer`: select from `pro_move_resources` where
    `status='active'` ordered by `display_order`; script = `content_md` of the
    `script` row; audio = `getPublicUrl` from the `pro-move-audio` bucket for the
    `audio` row's path; video = `extractYouTubeId(url)`; links = `link` rows.
- **Renders** (top→bottom):
  - Back pill `‹ <Competency name>`, then a small eyebrow (domain tag · tagline).
  - `h1` = **`action_statement`**.
  - **Description card = the centerpiece**, shown with **no label above it**,
    16px, domain-tinted. A description-only move ends here and reads as finished.
  - **Materials, no section labels**:
    - Script → serif quote box with the real verbiage.
    - Audio → a **small speaker icon button** (tap to hear). If the move has a
      script *and* audio, the speaker sits **under** the quote; audio-only shows
      just the speaker. **No "Audio" / "Listen" / "Why it matters" pill labels.**
    - Video/link → a single tappable row ("Watch the walkthrough" / "Open the
      reference") [grounded — these resource types are already fetched].
  - **"Next move" button** — plain, full-width, `Next move →`. No preview of the
    next move's text, no checkbox. Advances to the next move in the competency,
    **wrapping at the end** (modulo). [grounded to prototype `renderMove`.]
- **Design specifics**: traveling color = the domain accent throughout;
  directional slide on entry [proposal, polish — see §4 motion note]. No opened
  state is recorded (Explore is stateless).
- **[grounded] Omit-don't-announce**: the genuinely empty-description move exists
  in real data (prototype calls out the "affirm positive behaviors" move). Its
  page shows the statement + Next move and **nothing between** — no placeholder.

---

## 3. What to REMOVE from the current surface

Grading and lookup chrome are explicitly off this surface (design notes: "No
scores, levels, or trends anywhere on this drill").

**`CraftAtlasOverview.tsx`** [grounded — all present today]:
- The `LevelMarker` component and every `observerScore` read.
- The `levelForScore` / `SCORE_LEVEL_BUCKET` / `ScoreLevel` imports + `levelCounts`
  / `snapshotPills` computation.
- The **"How I'm graded"** `<details>` block (pills + "Your coach levels appear
  here…" fallback).
- **`AtlasSearch`** — design notes: "No search here. Search is a separate
  surface." Remove the search box and its `searchActive` collapse logic.
- The 2-col pastel tile grid + domain-band headers → replaced by four doorways.
- **No discovery dots / opened-counts anywhere** [DECIDED] — Explore is
  stateless; there is no `EXPLORED` set to render.

**`CraftAtlasArea.tsx`** [grounded]:
- The entire **coach card** (`level`, `observerNote`, `periodLabel`,
  `evaluatorFirstName`, `metaBits`) and `levelForScore`/`SCORE_LEVEL_BUCKET` imports.
- The `ProMoveDrawer` open-on-tap; moves now navigate to `/my-role/move/:actionId`.
- Add the formal box + friendly block quote (no discovery-dot / opened count).

**`ProMoveDrawer.tsx`** — for the **mobile Explore path** the new `ExploreMove`
page replaces it; the drawer stays only for desktop `DomainDetail`. On the move
page, do **not** carry over:
- The `SectionHeader` labels: "The Move", "Suggested Verbiage", "Listen", "Why
  It Matters", "Resources", and the "Study Mode" `SheetDescription` + `GraduationCap`.
- The **"No learning materials available yet."** empty state — omit rule; a
  description-only (or empty) move simply renders less.
- The **"Your History"** stats footer (Last Practiced / Avg Confidence) — this is
  grading-adjacent and absent from the prototype move page.
- The `<audio controls>` element → replaced by the small speaker-icon button.

**`useCraftAtlas.ts`** [grounded — DECIDED: drop grading]. With grading gone
from both consumers, **remove** the whole evaluation block
(`get_evaluations_summary` → `evaluations` visibility → `evaluation_items`
observer scores/notes → evaluator lookup → `periodLabel` / `evaluatorFirstName`)
and the `weekly_scores` history join (`lastPracticed` / `avgConfidence` are only
consumed by the removed coach card and the removed drawer "Your History" footer).
This cuts ~half the hook and several round-trips. Verify with a grep that no
other file reads `periodLabel`, `evaluatorFirstName`, `observerScore`,
`observerNote`, `lastPracticed`, or `avgConfidence` off this hook's result before
deleting each (today only `CraftAtlasOverview` + `CraftAtlasArea` consume it).
`AtlasCompetency` loses `observerScore` / `observerNote`; `ProMoveDetail` on this
path loses `lastPracticed` / `avgConfidence` (keep them optional on the shared
type since `useDomainDetail`/desktop still populate them).

---

## 4. Desktop behavior

Desktop is **unchanged this pass** [proposal, matches the MOB-6 precedent]:
- `/my-role` → `RoleRadar` desktop domain grid — untouched.
- `/my-role/domain/:domainSlug` → `DomainDetail` accordion — untouched (the new
  mobile Explore render lives behind `useMobileShell()`).
- `/my-role/area/:competencyId` → keeps redirecting desktop to
  `/my-role/domain/:slug` [grounded, `CraftAtlasArea` `Navigate`].
- **New** `/my-role/move/:actionId` on desktop: **redirect** to the move's domain
  page (`/my-role/domain/:slug`) for parity with `area`, since desktop has no
  Explore drill entry today. [proposal]

**Motion** [proposal]: directional slide (deeper = in-from-right, back =
in-from-left) is polish. The breadcrumb + labeled back-pill already deliver the
"sense of place"; ship those first and layer slide on using the existing DSN-5c
motion system, respecting `prefers-reduced-motion` (which the prototype already
honors).

---

## 5. Ordering, persistence, new state

**"Next move" ordering source** [DECIDED — `action_id`]: `useCraftAtlas` selects
`pro_moves … .in('competency_id', compIds).eq('active', true)` with **no
`.order()`** — current order is DB-default and effectively nondeterministic. The
prototype walks a fixed array. **Add `.order('action_id')`** to that select so
the numbered rows and "Next move" are stable and reproducible. (`curriculum_priority`
is not currently calculated for this content, so it is not used; if a real
teaching sequence is computed later, this is the one line to revisit.) "Next" =
`moves[(idx+1) % moves.length]`, wrapping at the end.

**Discovery dots — cut** [DECIDED]. The prototype's `EXPLORED` was an in-memory
`Set` with no persistence story (revisit Explore days later and stale marks would
either linger forever or reset arbitrarily — no good answer). Per founder call,
**remove the dots entirely** and make Explore **fully stateless**: no
`useExploredMoves`, no `localStorage`, no opened-counts on any screen. This also
removes the design notes' open-question 1.

**New state, total (now minimal):**
- `useProMoveResources(actionId)` — extracted from `ProMoveDrawer`'s `useEffect`;
  the only new hook.
- Breadcrumb/back are **derived from route + `useCraftAtlas` lookups** — no new
  global/store state, no navigation stack object, no persisted state anywhere.

**"Surprise me"** [grounded/easy]: a random `action_id` drawn from all loaded
`competencies.flatMap(c => c.proMoves)` → `navigate('/my-role/move/' + id)`. The
trail rebuilds itself from the move's competency. Optional for v1; include if cheap.

---

## 6. Acceptance criteria, files, risks, open questions

### Acceptance criteria (behavioral)
1. On a mobile-shell device, `/my-role` shows **four domain doorways** (serif
   names, one-liner, "N areas · M Pro Moves"), **no scores, no level pills, no
   "How I'm graded", no search box**.
2. Tapping a doorway lands on that domain's page: hero + a list of **its**
   competencies (tagline over name), domain color carried through, back pill to
   Explore. No opened-counts or dots anywhere (Explore is stateless).
3. Tapping a competency lands on **that competency only** (regression fix): name
   heading, tagline subtitle, formal box (`competencies.description`), friendly
   **block quote** (`competencies.friendly_description`), then **only its** moves.
4. Tapping a move opens a **full move page** (`/my-role/move/:actionId`): back
   pill to the competency, breadcrumb Explore › Domain › Competency (all tappable),
   `action_statement` heading, **description as an unlabeled centerpiece card**.
5. A move with a script shows the verbiage in a quote box; if it also has audio, a
   **small speaker icon** sits under it; audio-only shows the speaker alone. **No
   "Audio"/"Listen"/"Why it matters" labels.**
6. A description-only move (and the one empty-description move) ends after its
   content with **no placeholder text** — just the description (or statement) and
   the **plain "Next move →" button**.
7. "Next move" advances in a **stable, reproducible** order and **wraps** at the
   end; it shows no preview text and no checkbox.
8. Traveling color: the domain accent is identical from doorway → domain →
   competency → move for a given path; accents never use score/status colors.
   The landing shows a warm `oneLiner` for every domain of the resolved role
   (all three roles populated), never a blank or the formal description.
9. **Desktop is unchanged**: `RoleRadar` grid, `DomainDetail` accordion, and the
   `area`→`domain` redirect all render as before.
10. `prefers-reduced-motion` disables slide/press animation.

### Files touched / added
- **Rework**: `src/components/my-role/CraftAtlasOverview.tsx` (doorways; strip
  grading + search + dots), `src/pages/my-role/CraftAtlasArea.tsx` (real
  competency page; strip coach card; navigate to move route),
  `src/pages/my-role/DomainDetail.tsx` (add mobile Explore branch),
  `src/hooks/useCraftAtlas.ts` (add `competencies.description`; add
  `.order('action_id')` on `pro_moves`; remove the grading + `weekly_scores`
  fetch), `src/App.tsx` (add `/my-role/move/:actionId` route).
- **New**: `src/pages/my-role/ExploreMove.tsx`, `src/hooks/useProMoveResources.ts`
  (extract from `ProMoveDrawer`), a small `ExploreBreadcrumb` (reuse `BackPill`),
  optionally `src/pages/my-role/ExploreDomain.tsx` if the domain mobile render is
  split out of `DomainDetail`. (No `useExploredMoves` — dots are cut.)
- **Types**: extend `AtlasCompetency` with `formalDescription`; recommend renaming
  its current `description` → `friendlyDescription` for clarity. Drop
  `observerScore` / `observerNote` from `AtlasCompetency`.
- **Content** [DECIDED]: add `oneLiner` to the `DomainContent` interface and
  populate **all 12** entries (`DFI`, `RDA`, `OM` × 4 domains) in
  `src/lib/content/roleDefinitions.ts` — the prototype only supplied the four
  `RDA` strings; author the other eight in the same warm voice.

### Risks / blast radius
- **This replaces a live surface for flagged (mobile-shell) users.** Guard the
  full mobile Explore flow: landing → domain → competency → move → next-move →
  breadcrumb-jump → back, on a role with merged lead competencies (the
  `mergeLeadCompetencies` path) and on a role with sparse media.
- **`useCraftAtlas` is shared by overview + area** — a change to its return shape
  (renaming `description`) touches both; update together. Removing the eval block
  is safe only after confirming no other consumer reads `periodLabel` /
  `evaluatorFirstName` / `observerScore` (grep shows only these two components).
- **`ProMoveDrawer` still serves desktop `DomainDetail`** — extract
  `useProMoveResources` without changing the drawer's behavior; don't delete the
  drawer.
- **`pro_moves` ordering change** affects the numbered list on both the competency
  page and next-move; verify it doesn't reorder anything a user memorized (new
  surface, so low real risk).
- **Nullable `competencies.domain_id`** [grounded TODO in `useCraftAtlas`]: a
  null domain silently drops a competency from all four domains; unchanged risk,
  but the doorway counts now make an omission more visible.

### Decisions (founder, 2026-08-20)
1. ✅ **Domain one-liner** — add a warm `oneLiner` field, populated for **all
   roles × all domains** (12 strings). See §2 Level 1 + Files.
2. ✅ **Discovery dots** — **removed**. Explore is fully stateless (no persistence
   question to answer). See §5.
3. ✅ **Drop grading from `useCraftAtlas`** — yes, remove the eval + `weekly_scores`
   fetch. See §3.
4. ✅ **Next-move sort** — **`action_id`** (`curriculum_priority` isn't calculated).
   See §5.
5. ✅ **Move as its own route** (`/my-role/move/:actionId`) — approved.

### Remaining open questions
1. **Domain one-liner authoring** — the eight non-`RDA` strings (DFI + OM × 4
   domains) still need to be written. Who drafts them, and in what voice pass?
   (This spec can include first-draft copy for review if wanted.)
2. **Desktop `/my-role/move/:actionId`** — this spec proposes a redirect to the
   move's domain page for parity with `area`; the desktop drill is out of scope
   this pass. Confirm that redirect (vs. opening the existing drawer) is fine.
3. **Slide motion** — ship breadcrumb + back-pill first and layer directional
   slide (via the DSN-5c motion system) as a fast-follow, or block v1 on it?
