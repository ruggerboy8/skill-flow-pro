# Spec: MOB-6, The Craft Atlas — lead with tools + effective search (no flatten)

**Status:** draft, awaiting John's approval
**Lane:** medium (touches `src/pages/my-role/*` + a client-side search index over the role's moves)
**Ticket:** MOB-6 (Motion, MyProMoves Dev Board) — **APPROVED to build**
**Branch:** feature/mob-6-craft-atlas
**DB change:** none required; one optional additive column in a *select* (add `pro_moves.description` to the atlas query — see Approach). No schema change.
**Personas to test as:** participant (Front Desk / role 1 — has script+audio moves), participant (Dental Assistant / role 2), participant (Office Manager — description-only), participant (Doctor — description tier for v1)
**Depends on:** MOB-1 (Explore tab identity). **Reserves holding space for** The Alcan Way "museum" (a separate later track — not built here).

## What and why

Explore's "My Role" pillar today opens by **grading** the staff member —
eval-average level pills on every competency tile — before it teaches anything
(skeleton §3 "Explore"). The reframe (skeleton §3, plan MOB-6, decisions log):

- **Lead with the tools.** Each move surfaces its `pro_move_resources`
  (script/audio via `ProMoveDrawer`) with the move **description as the universal
  fallback**, so the surface answers "what do I actually say/do" first.
- **Keep the domain → competency → move → resource structure — do NOT flatten
  it** (John's explicit decision, plan MOB-6). It mirrors the eval and staff
  already know it.
- **Make the depth navigable with effective search** across the role's moves, so
  a specific move/topic is findable fast without four taps.
- **De-emphasize the graded tiles** as the entry point (grading belongs to
  Performance).
- **The Alcan Way "museum" is OUT of scope** — a separate later track, imagined
  and built together after a dedicated design conversation (skeleton §3, plan
  "Explicitly deferred"). This ticket only holds space for it; no code.

**The resource reality that shapes the design** (audited 2026-08-20, skeleton
§5.0): script or audio exists for **only ~16% of active moves, and only for
Front Desk (role 1) and Dental Assistant (role 2)**. Description covers **96.8%**
and `action_statement` **100%**. So for most staff, most of the time, the "tool"
is a well-written **description** — which means **the description tier must look
intentional, not like a degraded "no media" state.** Doctors stay on the
description tier for v1 (their separate `doctor_*` content is not wired in here —
matches the MOB-3 doctor decision).

## Grounded-in-code facts

- **The atlas is mobile-shell-only.** `RoleRadar.tsx` (lines 125–126) returns
  `<CraftAtlasOverview />` on `useMobileShell()`; desktop keeps the old
  domain/radar flow. `MyRoleLayout.tsx` (lines 55–59) hands the atlas the full
  screen (bare `<Outlet />`, no tab chrome) on the mobile overview route.
- **Routes** (`src/App.tsx`): `my-role` → `MyRoleLayout` (index → `RoleRadar`);
  `my-role/area/:competencyId` → `CraftAtlasArea` (line 151). The tap chain is
  **competency tile → area page → move drawer** (domain is a visual band, not a
  tapped screen); resources are the leaf. Depth today is effectively 3 taps.
- **The whole role's move set is already loaded client-side in ONE cached
  query** — `useCraftAtlas` (`src/hooks/useCraftAtlas.ts`), query key
  `['craft-atlas', staffProfile?.id, roleIds]` (line 45). It fetches every active
  competency for the role, then every active pro_move via
  `.in('competency_id', compIds)` (lines 146–150). `CraftAtlasArea` is a pure
  client-side `.find()` over that cached array (line 27), not a second fetch.
  **This is the fact that makes a client-side search index the right call — the
  corpus is already in memory.**
- **The data shapes:**
  - `AtlasCompetency` (`useCraftAtlas.ts` lines 9–19): `competency_id, domainId,
    domainName, title, subtitle, description, observerScore, observerNote,
    proMoves: ProMoveDetail[]`.
  - `ProMoveDetail` (`src/hooks/useDomainDetail.ts` lines 8–13): `action_id,
    action_statement, lastPracticed, avgConfidence`. **The move object client-side
    carries `action_statement` but NOT `description` and NOT resources** — the
    move's `description` and `pro_move_resources` are fetched lazily *per move*
    inside `ProMoveDrawer`.
  - So a search index built from the loaded data can cover **competency
    title/subtitle/description/domainName + move `action_statement`** out of the
    box, but **not** move descriptions or resource text unless those are added to
    the query.
- **`ProMoveDrawer`** (`src/components/my-role/ProMoveDrawer.tsx`), props
  `{ open, onOpenChange, move, domainName }` (lines 13–18). On open it fetches
  `pro_moves.description` (lines 52–56) and `pro_move_resources`
  (`status='active'`, ordered, lines 59–64). Renders `script` (`content_md` as
  "Suggested Verbiage"), `audio` (via storage bucket **`pro-move-audio`**,
  `getPublicUrl`, lines 76–80), `video` (YouTube embed), `link` (buttons), and
  the description as "The Why" (lines 158–163). Empty state when nothing exists:
  "No learning materials available yet." (lines 151–155).
- **The graded tiles to de-emphasize** are driven by `levelForScore`
  (`src/lib/scoreLevel.ts` lines 14–19) + `SCORE_LEVEL_BUCKET` + `--score-*` CSS
  vars, rendered as: `LevelPill` on every competency tile in
  `CraftAtlasOverview.tsx` (lines 8–26, 128–144), the aggregated "snapshot strip"
  (lines 85–101), and the area-page coach pill (`CraftAtlasArea.tsx` lines 86–96).
- **No search/filter UI exists anywhere in `my-role` today** (grep found only
  array `.filter` for grouping and one unrelated year `<Select>` on the practice
  log). This is net-new.
- **Completeness caveat:** a `TODO(build-review)` at `useCraftAtlas.ts`
  lines 205–210 notes that a competency with a null `domain_id` is silently
  excluded from the atlas — so a search index over atlas data inherits that gap
  (a move under an unmapped competency won't be found). Worth a data check, not a
  code blocker.

## Approach (grounded in the real files)

### 1. Effective search — client-side index over already-loaded data (recommended)

Because `useCraftAtlas` already holds the role's full competency + move corpus in
one cached array, build the search **client-side over that data** — no new query
round-trip, instant filtering as the user types, works offline in the PWA.

- Add a persistent **search field** at the top of `CraftAtlasOverview` (and
  optionally reachable from the area page). Typing filters to matching moves and
  competencies across the whole role, collapsing the domain→competency→move depth
  into a **flat result list while a query is active**, then restoring the
  structured band view when the query clears. **This keeps the structure intact
  (no permanent flatten) while making depth navigable** — the exact "no flatten +
  effective search" bargain John set.
- Index fields (from the loaded data): move `action_statement`, competency
  `title` / `subtitle` / `description`, and `domainName`. So "search by move
  text / competency / domain" is satisfied by the in-memory corpus.
- A result row tapped opens the same `ProMoveDrawer` (for a move) or navigates to
  `CraftAtlasArea` (for a competency) — reusing the existing leaves, no new
  detail surface.

**One recommended data addition to make search and the description tier
first-class:** add `description` to the `pro_moves` select in `useCraftAtlas`
(lines 146–150) and onto `ProMoveDetail`. It is one more column on a query that
already runs, and it buys three things at once: (a) search can match move
**descriptions**, not just the one-line statement; (b) a result row / move row
can show a description snippet so the description tier reads as content, not
emptiness; (c) `ProMoveDrawer` already re-fetches the description on open — with
it preloaded the drawer can render instantly and the per-move fetch becomes a
resource-only call. This is a *select* change, not a schema change. (Searching
resource *text* — script bodies — is explicitly out of v1: resources aren't
loaded up front, and pulling every script into memory for the whole role isn't
worth it. See Open questions.)

Recommend a tiny, dependency-free matcher (normalized substring / token match
over the indexed fields) rather than adding a fuzzy-search library — the corpus
is small (one role's moves), and it keeps the PWA bundle lean.

### 2. Lead with tools; description as the universal, intentional fallback

- In the move drawer and move rows, present the **tool first**: script/audio when
  the move has one, else the **description** as the primary content (not a
  fallback footnote). `ProMoveDrawer` already renders the description as "The
  Why"; for the ~84% of moves with no script/audio, that description **is** the
  content and should be styled as a deliberate teaching block, not shown under an
  empty-media state. The current empty state ("No learning materials available
  yet.") should only appear when there is genuinely nothing — description absent
  too (~3% of moves) — never when a description exists.
- Copy/labels must **not promise "listen"/"script" when showing text** (same rule
  as MOB-3's value card).

### 3. De-emphasize the graded tiles

- Grading belongs to Performance, so the graded `LevelPill` / snapshot strip
  should stop being the **entry point** of the overview. Options (John to pick):
  demote the level pill to a small secondary marker rather than the tile's
  dominant visual, or move the graded snapshot to a collapsed/secondary position
  below the tools. Keep the data reachable — this is de-emphasis, not deletion —
  but the first thing the eye lands on should be the craft (competency + its
  moves/tools), not a colored grade.

### 4. Hold space for The Alcan Way — build nothing

- Reserve Explore's second pillar (The Alcan Way museum) as holding space only,
  consistent with the tab/pillar structure. No component, no route, no data. A
  later, separate, iterative track owns it after a dedicated design conversation
  (skeleton §3, plan "Explicitly deferred"). Do not scaffold it here.

## Acceptance criteria (behavioral, testable)

1. The Craft Atlas overview preserves the **domain → competency → move →
   resource** structure — it is **not flattened**. The domain bands and
   competency tiles remain the default browse view.
2. A search field is present. Typing a move phrase, a competency name, or a
   domain name filters to matching results across the **entire role's moves** and
   lets the user reach a specific move **without walking the full
   band→tile→area→move tap chain**. Clearing the query restores the structured
   band view.
3. Search runs client-side over the already-loaded `useCraftAtlas` corpus (no new
   network request per keystroke); results appear as-you-type.
4. Opening a move leads with its tool: script/audio if it exists (via
   `ProMoveDrawer`), otherwise the move's **description**, presented as
   intentional content — the "No learning materials available yet." empty state
   appears only when a move has neither resources nor a description. Labels never
   promise audio/script when showing text.
5. The graded level pills are no longer the visual entry point of the overview;
   the craft (competency + moves/tools) leads. Grading is still reachable but
   secondary.
6. For a Front Desk / Dental Assistant user, moves that have script/audio expose
   them; for an Office Manager / Doctor, moves render the description tier and it
   looks like content, not a degraded state.
7. No Alcan Way UI ships (holding space only). Desktop My Role and all
   non-flagged users are untouched.

## Files touched

- `src/hooks/useCraftAtlas.ts` — add `description` to the `pro_moves` select and
  onto `ProMoveDetail` (the one recommended data addition); the corpus for the
  client-side index is otherwise already loaded here.
- New `src/components/my-role/AtlasSearch.tsx` (or similar) — the search field +
  in-memory matcher + flat result list, reusing `ProMoveDrawer` / `CraftAtlasArea`
  as leaves.
- `src/pages/my-role/CraftAtlasOverview.tsx` — host the search field; de-emphasize
  `LevelPill` (lines 8–26) and the snapshot strip (lines 85–101) as the entry
  point.
- `src/pages/my-role/CraftAtlasArea.tsx` — de-emphasize the coach level pill
  (lines 86–96) so grading isn't the lead here either.
- `src/components/my-role/ProMoveDrawer.tsx` — ensure the description renders as
  primary content when no script/audio exists (not under an empty-media frame);
  consume the preloaded description if added.
- Possibly `src/hooks/useDomainDetail.ts` — `ProMoveDetail` type gains
  `description`.

## Risks / blast radius

- **Search corpus gaps.** The client-side index only knows what
  `useCraftAtlas` loads. Move **descriptions** aren't loaded today (recommended
  add fixes that); resource/script **text** is never loaded (out of v1 scope). And
  the `TODO(build-review)` null-`domain_id` exclusion (lines 205–210) means a
  move under an unmapped competency won't appear in the atlas *or* search — a data
  hygiene item to check, not a code fix here.
- **Description tier must look intentional.** The single biggest design risk: for
  ~84% of moves the description is the whole tool, so if it's styled like a "no
  media" fallback the reframe fails for most staff. The empty state must be
  reserved for genuinely empty moves.
- **Scope creep toward the museum.** The Alcan Way is explicitly a later,
  co-designed track. Building any of it here contradicts John's decision — hold
  the line at holding space.
- **Grading de-emphasis vs removal.** Do not delete the grade; some staff use it.
  This is a visual-priority change confined to the mobile atlas surface.
- Confined to `src/pages/my-role/*` + `src/components/my-role/*` on the
  mobile-shell branch; desktop My Role and non-flagged users are untouched.

## Open questions for John

1. **Add `pro_moves.description` to the atlas query?** Recommended (enables
   searching move descriptions + a description snippet on rows + an instant
   drawer). It's a one-column select add, no schema change. Confirm.
2. **Search scope for v1.** Moves + competencies + domains (from loaded data) —
   yes. Should it also search **resource/script text**? That would require
   loading every move's resources up front (heavier). Recommend deferring
   resource-text search to when the Ask surface (E4) — which this search also
   seeds — is built. Confirm moves/competencies/domains is enough for v1.
3. **Where the search lives.** A persistent bar on the overview (recommended),
   vs a search icon that expands, vs also on the area page. Preference?
4. **How far to de-emphasize grading.** Demote the level pill to a small marker,
   or move the graded snapshot into a collapsed "How I'm graded" section below the
   tools? Recommend the latter (cleaner separation: tools lead, grade is a
   deliberate second look), but it's your call on how visible the grade stays.
5. **Doctor tier confirmation.** Consistent with MOB-3, doctors stay on the
   description tier for v1 (their `doctor_*` content is not wired into the atlas
   here). Confirm — the alternative is treating `doctor_script` as their script
   tier, which is a larger, separate piece.
