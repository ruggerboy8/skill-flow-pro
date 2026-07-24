# Simplification & Enhancement Roadmap (consolidated)

> **Status:** v1 — 2026-07-24. Owner: John.
> **This is the single ordered list** John asked for: it merges the database
> cleanup, the permission unification, the navigation Phase 3 work
> ([navigation-remediation-plan.md](navigation-remediation-plan.md)), and the
> enhancement queue into one sequence. Grounded in
> [utilization-snapshot-2026-07-24.md](utilization-snapshot-2026-07-24.md).
> Supersedes nothing; the source docs stay as reference.

## Standing rules (all tracks)

- **Conservative migration:** build new alongside old; keep fallbacks until every
  persona is verified live; never break live paths.
- **Schema drops lag deployed code.** Grep `src/` AND `supabase/functions/` before
  any drop (the `home_route` outage lesson). DDL via dashboard SQL editor or
  Lovable-landed migration, written idempotently.
- **Change notes:** any user-visible workflow change ships with a short "how it
  used to work → how it works now" note.
- **Decisions already made (do not relitigate):** universal assignment scope; no
  self-select; eval release stays gated (per location + position, batched); shell
  demo orgs stay; multi-tenancy stays at "basic + onboarding," not built ahead;
  doctor track is a top priority; persona-shaped app direction.
- **Added 2026-07-24:** no missed-assignment catch-up workflow (Pro Moves are only
  meaningful reviewed in the group meeting); participant evaluations happen **only
  on the standard quarterly timeline** — remove the "baseline" eval type from the
  evaluations surface, and treat a new organization's first quarterly evals as its
  de facto baseline (the doctor-track `coach_baseline_*`/`doctor_baseline_*`
  tables are unrelated and stay).
- **Working practice (revised 2026-07-25):** a **reverse PRD** leads the visible
  work. Phase A (owner interviews on the operating model) is done; Phase B is the
  clean-room requirements doc, [clean-room-prd.md](clean-room-prd.md), written
  blind to the current app; Phase C compares PRD vs. app space by space, sorting
  every finding into **aligned / close-needs-tweak / misaligned-or-missing /
  unrequired**. Phase C's output replaces the predetermined designs in Track 3,
  and Track 4 dissolves into the PRD's priorities. Tracks 1-2 are need-agnostic
  and proceed in parallel. The sequencer is no longer reviewed as a feature; it
  is judged against PRD requirement CS-3 (assisted, explainable curation - not
  full automation). Phase C also includes an explicit **multi-tenant isolation
  check** (PRD MT-2): verify cross-org data bleed John has noticed is only the
  super-admin's deliberately cross-org view, not a real leak. Include the
  **evaluation flow's tenant wiring** — the UK has never run evals, so that path
  is untested under a non-Alcan org (quarter labels, release scoping, RLS).

---

## Track 1 — Permission unification (first, it unblocks everything)

The split-brain is live: Raul, Wes, Lauren, Dr. Alex, Kasey + 3 OMs are
legacy-flags-only; UK admins are capabilities-only. Order matters.

| # | Step | Notes |
|---|---|---|
| 1.1 | ✅ **DONE 2026-07-24.** Backfilled `user_capabilities` for all 39 missing staff (migration `20260724120000_backfill_user_capabilities.sql`, applied live). Verified: 105/105 staff covered, 0 mismatches vs. legacy-derived formulas; no RLS policy reads `user_capabilities`, so scope of effect is the frontend hook only. The 8 legacy-only leaders (Raul, Wes, Lauren, Dr. Alex, Kasey, 3 OMs) mirror correctly. | Behavior-preserving by construction |
| 1.2 | ✅ **DONE 2026-07-25.** John walked every persona: all correct (participant, OM scoping, regional, Ariyana, UK org admin, platform admin). Two tightenings requested and implemented same day: (a) Facilitate limited to regionals/org admins/super admins — leads and OMs keep Coach but lose Facilitate (`allowFacilitate` guard + split menu entry); (b) leads no longer see staff evaluations — Quarterly Evaluations tab and eval deep-link routes now require evaluator/admin capability or OM (`allowStaffEvals`; OM access confirmed intentional — appropriate to the role, low expected use). Wrinkles logged: roaming staff (PRD §13), UK eval-tenant wiring check (Phase C below). **Pushed `29b115e7` + gate fix `f43246ab` 2026-07-25** (first spot check caught leads still seeing Facilitate: 5 lead RDAs carry **org-wide** `coach_scopes` rows → `isRegional` passed the gate; fixed by excluding participants). Awaiting Lovable pull + publish + re-check. **Open data question (1.6):** should leads hold org-wide scopes at all? Org scope means those 5 leads can browse every staff member org-wide in Coach; location scope would match the "location lead" model but shrinks their staff list — owner call. Jennifer Esquivel also has 3 duplicate org scope rows (hygiene). | Change note drafted 2026-07-25 |
| 1.3 | ✅ **DONE 2026-07-25.** `useUserRole` is caps-only (legacy `is_*` fallbacks removed; zero behavior change since all 105 staff have mirrored caps rows and caps already won when present). `admin-users` edge function gained capability presets for `doctor` and `clinical_director` (previously left caps stale) and was **deployed to prod**. Legacy flags are still *written* by presets (harmless) until their own retirement slice. | Provably equivalent |
| 1.4 | 🔵 **Mostly done 2026-07-25.** Verified no column-only scope data; both RPCs (`get_staff_weekly_scores`, `get_coach_roster_summary`) rewritten to read scope ONLY from `coach_scopes` (applied live); `admin-users` no longer writes `staff.coach_scope_type/id`; `useStaffProfile` no longer selects them. **Remaining:** admin-users get/update actions still select the columns — clean those, then the column drop joins the staged migration. | Column drop lags deploy |
| 1.5 | **Name the archetypes — NEXT UP, needs owner input.** The drawer already works via presets (participant, lead, coach, coach_participant, regional_manager, super_admin, doctor, clinical_director) hitting admin-users. Remaining: align preset names/labels with the archetype model, and decide how **Office Manager** is set (today `is_office_manager` has no preset). Proposed archetype list to confirm with John: Participant / Lead / Office Manager / Evaluator / Regional-Director / Clinical Director / Doctor / Org Admin / Platform Admin. | Owner confirms preset list first |

## Track 2 — Database cleanup (after 1.1-1.2, alongside 1.3+)

| # | Step | Notes |
|---|---|---|
| 2.1 | ✅ **Code done 2026-07-25.** Deleted orphaned legacy modules (`siteState.ts`, `coachStatus.ts`, `progressTracking.ts`, `v2/weekAssembly.ts`, `v2/locationState.ts`, `backlog.ts`). Table drops staged in `supabase/staged/drop_retired_backlog_and_selfselect.sql` — **apply only after the Lovable publish that includes these removals.** | Drops lag deploy |
| 2.2 | ✅ **Code done 2026-07-25.** Self-select helpers removed from `weekAssembly`; `weekly_self_select` cleanup removed from admin-users (deployed). | |
| 2.3 | ✅ **Code done 2026-07-25.** Sequencer confirmed NOT to read `user_backlog_v2` (gate cleared). Backlog writers removed (`locationState`, `rollover`); roster RPC returns `backlog_count = 0`. Table + backlog RPCs + the legacy uuid overload of `get_staff_week_assignments` are in the staged drop file. | Drops lag deploy |
| 2.4 | **Retire `weekly_focus` + `weekly_plan` + cycle machinery** (backlog A1-A3) — **sliced plan, 2026-07-25:** each slice ships alone, invisible to users, verified by build + participant/coach spot check before the next. **Slice A — rollover:** remove `enforceWeeklyRolloverNow` from `ThisWeekPanel`, delete `v2/rollover.ts` + the SequencerTestConsole dry-run + the `sequencer-rollover` edge function (cycles-1-3 only; dormant). **Slice B — plan/focus reads:** remove `weekly_plan`/`weekly_focus` fallback reads from wizards, `facilitatorData`, planner components, `sequencer-rank`; decide GlobalPlanManager's fate (superseded by Builder). **Slice C — cycle formula:** collapse cycle/week-in-cycle out of the remaining RPCs (`get_staff_week_assignments` text overload, `get_staff_statuses`) and retire `site_cycle_state`; delete stale `src/lib/unifiedAssignments.md`. **Slice D — archive + drop:** CSV-export then drop `weekly_focus`, `weekly_plan`, `site_cycle_state`; also drop `staff.coach_scope_type/id` (after 1.4 residue ships) and legacy `is_*` write retirement; regenerate `types.ts`. | Each slice lags its deploy |
| 2.5 | **Keep and re-document `coach_baseline_*`** as the doctor-track observed baseline. Correct data-model.md §6 + backlog C1. | Was wrongly slated as removable |
| 2.6 | **Deputy tidy:** reconcile `sync_enabled` vs `auto_sync_enabled`; enable or remove the dormant second connection. | Small |

## Track 3 — Persona-shaped IA (the visible work; nav-plan Phase 3 continues)

| # | Step | Notes |
|---|---|---|
| 3.1 | **Coach/intervention hub** (nav-plan 3.5 + management-model G1/G2): one home for Ariyana's persona — issues surfaced, low-confidence signals routed, eval work queued. Retire superseded eval viewers (V2 is canonical). | Greatest upside per owner |
| 3.2 | **Eval delivery & closure:** implement the written release policy (batch per location + position); design the staff-receiving experience so acknowledge → focus-select is the natural path (88→55→18 funnel is the metric). Consider async back-and-forth in place of unstaffable 1:1 reviews. Includes removing the participant "baseline" eval type (decided 2026-07-24: quarterly only). | Highest-need area |
| 3.3 | **Doctor line polish** (EX5): converge doctor IA (nav-plan 3.6), tighten the session flow Dr. Alex + Dr. Casey now use weekly. | Top org priority |
| 3.4 | **Library consolidation + CSV access** (nav-plan 3.4). | |
| 3.5 | **Router alias cleanup** (nav-plan 3.7), last. | |

## Track 4 — Enhancement queue (post-cleanup, roughly ordered)

1. **Resource routing:** surface a Pro Move's learning resources based on low
   confidence/performance/eval scores — "the next thing after data capture."
2. **Deputy `Employee.Insert` webhook → auto-draft ProMoves profile/invite**
   (edge function, HMAC-verified). Ends surprise-new-hire profile creation.
3. **Automated reminders + org-admin notification settings** (NF1).
4. **Staff voice:** natural-language reflection capture to triangulate
   location/org issues (NF3 extension). Depends on the psychological-safety asset;
   design with care.
5. **AI insights on the growing dataset** (NF2), after 1-4 give it somewhere to
   land.

## Sequencing summary (updated 2026-07-25 evening)

**Done:** 1.1, 1.2 (+ tightenings), group-scope visibility for leads/OMs (live),
remind-button + facilitate-dropdown gating (in repo), 1.3 flip (live edge +
frontend in repo), 1.4 (all but admin-users get/update column reads), 2.1-2.3
code (drops staged in `supabase/staged/`).
**Now:** Lovable publish → John spot-checks (lead: group-only Coach list, no
Facilitate, no remind buttons, no eval tab; OM: group list, no Facilitate, no
remind; facilitate dropdown shows only in-use roles; regionals unchanged).
**Done 2026-07-25 (later):** staged drops APPLIED after John's spot checks
passed (self-select/backlog tables + RPCs gone). Incident during application:
the uuid overload of `get_staff_week_assignments` was dropped on a wrong
assumption and restored within minutes (see migration
`20260725120000_drop_retired_backlog_and_selfselect.sql` for the full note).
Two findings out of it: the text overload is a broken abandoned rewrite
(errors on any call); and the uuid overload returns empty for org-scoped
weeks (compares `weekly_assignments.org_id` = ORGANIZATION id against the
caller's practice-group id) — pre-existing, low impact because its only
consumer is the legacy `/review/:cycle/:week` page (`useWeeklyAssignmentStatus`
has no importers). **2.4 slice B/C therefore grows:** retire both overloads,
the hook, and the Review route instead of fixing them.
**Next:** 1.5 preset implementation (archetype list approved by John
2026-07-25: Participant / Lead / Office Manager / Evaluator / Regional-
Director / Clinical Director / Doctor / Org Admin / Platform Admin — needs an
Office Manager preset added to admin-users + drawer labels). Then 2.4 slices
A→D one at a time (approved, "must not break current experience").
**In parallel:** PRD Phase C comparison; its findings become the Track 3 list.
**Later:** 3.x per Phase C; Track 4 per PRD priorities.
