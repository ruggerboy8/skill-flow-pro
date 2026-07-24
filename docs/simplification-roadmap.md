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
| 1.2 | ✅ **DONE 2026-07-25.** John walked every persona: all correct (participant, OM scoping, regional, Ariyana, UK org admin, platform admin). Two tightenings requested and implemented same day: (a) Facilitate limited to regionals/org admins/super admins — leads and OMs keep Coach but lose Facilitate (`allowFacilitate` guard + split menu entry); (b) leads no longer see staff evaluations — Quarterly Evaluations tab and eval deep-link routes now require evaluator/admin capability or OM (`allowStaffEvals`). Wrinkles logged: roaming staff (PRD §13), UK eval-tenant wiring check (Phase C below). | Ship with change note for leads/OMs |
| 1.3 | **Flip `useUserRole` to caps-only; retire legacy `is_*` reads** (nav-plan 3.1) | Change note for admins |
| 1.4 | **Retire duplicate scope columns** `staff.coach_scope_type/id` → `coach_scopes` table only; fix `EditUserDrawer` writer first (nav-plan 3.2) | |
| 1.5 | **Name the archetypes.** Six real personas exist (snapshot §3). Admin UI should offer named presets (Participant, Lead, Evaluator/Regional, Clinical Director, Org Admin, Platform Admin) + scope, with toggles as advanced overrides. Model OM/Doctor/Clinical Director/Lead as "who they are" attributes, not capabilities (nav-plan 3.3). | This is the "simpler than it needs to be" fix |

## Track 2 — Database cleanup (after 1.1-1.2, alongside 1.3+)

| # | Step | Notes |
|---|---|---|
| 2.1 | **Drop never-used tables:** `weekly_self_select`, `manager_priorities`, `resource_events`, `user_backlog` (v1). Remove frontend dead writers first (`backlog.ts:saveUserSelection`, self-select types). | Zero rows ever; still grep functions/ first |
| 2.2 | **Retire the self-select code paths** end-to-end (types, `selfSelect` branches, `areSelectionsLocked`). | Product decision: never doing it |
| 2.3 | **Retire `user_backlog_v2`** (decided 2026-07-24: no missed-assignment workflow). Remove the missed-week writer (`backlog.ts`), the RPC overload that reads it, then the table. **Gate:** first confirm during the sequencer review that recommendations don't depend on it. | Code first, table drop lags deploy |
| 2.4 | **Retire `weekly_focus` + `weekly_plan` + cycle machinery** (backlog A1-A3): remove stale frontend fallbacks (wizards, facilitatorData, planner components, `sequencer-rank` references), collapse the cycle/week formula out of RPCs, archive both tables (export CSV, then drop or rename `_archive`). Update/delete `src/lib/unifiedAssignments.md`. | The big one; do last, in slices, behind the walkthrough gate |
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

## Sequencing summary

**Now:** 1.1 → 1.2 (backfill + walkthrough).
**Next:** 1.3-1.5 with 2.1-2.2 interleaved (each small, each behind the gate).
**Then:** 3.1-3.3 (the visible payoff), 2.3-2.4 when convenient.
**Later:** 3.4-3.5, Track 4 in order.
