# Docs index (honest inventory)

*Inventory built 2026-08-18. Restructured 2026-08-19 by ticket DOC-5.*

This is a map of every file under `docs/`, with a blunt read on whether you can
trust each one right now.

Not every doc here is equally trustworthy, and a tidy list can hide that. Some
docs are current. Some are old but still useful. A few were **actively
misleading**: they stated something verifiably wrong today and would send a
newcomer (or an AI agent) down the wrong path. Those six have been moved into
`archive/` and each carries a header saying exactly what is wrong with it.

## How the folder is organised

DOC-5 sorted `docs/` by **kind**, not by topic. The point is that an agent or a
new engineer can tell at a glance whether a file describes the present or the
past.

| Folder | Kind | Safe to treat as authority? |
|---|---|---|
| `docs/*.md` (top level) | **Canonical.** How the system works today. | Yes |
| `docs/specs/` | **Work in flight.** One spec per ticket. | Yes, the one for your task |
| `docs/dev/` | **How we work.** The kit, the assessment, lint policy. | Yes |
| `docs/features/` | **Feature plans still in play.** | Yes, the relevant one |
| `docs/archive/` | **Historical record.** Accurate about the past, wrong about now. | **No.** History only |
| `docs/business/` | **Business material.** Client emails, source content, CSV exports. | **No.** Not project documentation |

Every file under `docs/archive/` starts with a header saying it is archived and
should not be read as current. The routing table agents use
(`.claude/skills/_shared/doc-routing.md`) never sends an agent to `archive/` or
`business/`.

**How to read the Status column:**

- **CURRENT**: accurate as of today.
- **STALE BUT USEFUL**: dated, some parts overtaken, but still worth reading.
- **WAS ACTIVELY MISLEADING**: contained a specific claim that is wrong now. Now
  archived with a header naming the wrong claim. Fixing them is ticket DOC-3.
- **HISTORICAL RECORD**: accurate about a moment in the past (a finished
  migration, a shipped feature's plan, a point-in-time audit or snapshot). Fine
  as history, not a description of the app today.
- **UNVERIFIED**: not checked against the live code or database. The "Why" says
  what a check would need.

"Last changed" is the last git commit that touched the file before DOC-5 moved
it, not the date written inside the doc's header. Where the two disagree, the doc
is usually claiming to be fresher than it is.

---

## Start here (read these first, in this order)

1. **`docs/system-overview.md`**: what the product is, who uses it, the weekly
   loop. The single best entry point, and current.
2. **`CLAUDE.md`** (repo root, not under `docs/`): the load-bearing operational
   facts live only here: how migrations really ship (the Supabase dashboard SQL
   editor, or land it on `main` for Lovable), why `supabase db push` is still
   unproven and not the documented path (see ticket DOC-2), the current
   Organization / Group / Location terminology, the design tokens. A newcomer
   who skips this file will get stuck in ways nothing in `docs/` warns them
   about.
3. **`docs/dev/assessment-2026-08-18.md`**: the first real engineering review of
   this codebase, and the honest current state: the security exposure, the
   backlog, and why the defects look the way they do. Current.
4. **`docs/enterprise-architecture.md`**: the locked Organization / Group /
   Location terminology. CLAUDE.md cites it as the canonical vocabulary source.

**There is no trustworthy schema or glossary doc right now.** Both
`data-model.md` and `glossary.md` named five tables that were dropped on
2026-07-25 as if they were live, so both are archived. Until DOC-3 replaces them,
`supabase/migrations/` and CLAUDE.md are the source of truth for schema and
terminology.

---

## Canonical (`docs/`, top level)

Eight files. If this list grows much past a dozen, something historical has
leaked back in.

| Doc | What it is | Last changed | Status | Why (if not current) |
|---|---|---|---|---|
| `README.md` | This index. | 2026-08-19 | CURRENT | |
| `system-overview.md` | Plain-English tour of the product, the users, and the weekly loop. The designated entry point. | 2026-06-22 | CURRENT | |
| `enterprise-architecture.md` | The multi-tenant design and the locked terminology; CLAUDE.md cites it as the canonical terminology source. | 2026-03-06 | STALE BUT USEFUL | Marked "Draft, not yet implemented," but multi-tenancy has since largely shipped (the `organizations` table and org chain exist). Kept canonical because it is still the reference for the locked terms. |
| `management-model.md` | The management theory behind ProMoves and how the deployed system differs from the designed one. | 2026-07-20 | CURRENT | |
| `pro-move-versioning-implementation-plan.md` | Effort audit and implementation plan for framework versioning. | 2026-07-30 | CURRENT | Marked APPLIED and verified live; accurately describes the shipped `framework_history` system. |
| `testing.md` | How to unit test Supabase-backed code with the test double. | 2026-08-18 | CURRENT | |
| `dev-workflow-redesign.md` | Analysis and proposal for the branches / PRs / board workflow. | 2026-08-18 | CURRENT | |
| `dev-workflow-kit-instructions.md` | The hand-off doc that builds the dev workflow kit in a fresh session. | 2026-08-18 | CURRENT | |

## `docs/dev/` (how we work)

| Doc | What it is | Last changed | Status | Why (if not current) |
|---|---|---|---|---|
| `assessment-2026-08-18.md` | The first full engineering review: security, data model, docs, and the 36-ticket backlog. | 2026-08-18 | CURRENT | |
| `cli-best-practices.md` | Living cheat sheet for John working in the terminal with Claude Code. | 2026-08-18 | CURRENT | |
| `cli-field-notes.html` | Field notes companion to the CLI cheat sheet. | 2026-08-18 | CURRENT | |
| `restart-to-shipped.html` | Walkthrough of the restart-to-shipped loop. | 2026-08-18 | CURRENT | |
| `kit-log.md` | Running build log of the dev workflow kit and where reality diverged from the plan. | 2026-08-18 | CURRENT | |
| `lint-policy.md` | What GOV-4 changed in the lint setup and the before / after numbers. | 2026-08-19 | CURRENT | |
| `ticket-template.md` | The block every Motion dev-board ticket carries. | 2026-08-18 | CURRENT | |

## `docs/specs/` (work in flight)

| Doc | What it is | Last changed | Status | Why (if not current) |
|---|---|---|---|---|
| `codebase-assessment.md` | The spec that defined the Aug-18 assessment work. | 2026-08-18 | CURRENT | The work it specified is the assessment now in `docs/dev/`. |
| `bug-1-create-eval-legacy-form.md` | Spec for the BUG-1 legacy evaluation form ticket. | 2026-08-19 | CURRENT | |
| `tst-5-supabase-test-double.md` | Spec for the TST-5 Supabase test double ticket. | 2026-08-19 | CURRENT | Shipped; `docs/testing.md` is the resulting guide. |
| `doc-5-docs-restructure.md` | Spec for this restructure. | 2026-08-19 | CURRENT | |

## `docs/features/` (feature plans still in play)

Plans, PRDs, and executor specs for work that is current or pending. Feature docs
whose feature has shipped, gone dormant, or been superseded now live in
`docs/archive/features/`. That read is from dates and project memory, not a
line-by-line code check, so treat it as a guide rather than a guarantee.

| Doc | What it is | Last changed | Status | Why (if not current) |
|---|---|---|---|---|
| `alcan-way-exhibit-concept.md` | Concept for reframing The Alcan Way as a museum-exhibit experience. | 2026-08-14 | CURRENT | The agreed current direction; explicitly supersedes the three earlier interaction concepts. |
| `explore-page-plan.md` | Plan for the Explore page (renamed My Role). | 2026-08-14 | CURRENT | |
| `explore-my-role-build-instructions.md` | Executor spec for building the Explore / My Role Atlas. Referenced from live source files. | 2026-08-14 | CURRENT | |
| `mobile-build-plan.md` | Plan of record for the PWA + mobile shell. | 2026-08-13 | CURRENT | |
| `mobile-build-instructions.md` | The build source of truth for the mobile shell. Referenced from live source files. | 2026-08-13 | CURRENT | |
| `mobile-design-principles.md` | Design principles for the PWA (Track B). | 2026-08-13 | CURRENT | |
| `mobile-adjustments-round2.md` | Executor spec for the round-2 mobile shell pass. | 2026-08-13 | CURRENT | |
| `mobile-adjustments-round3.md` | Executor spec for the round-3 mobile shell pass. | 2026-08-14 | CURRENT | |
| `pwa-push-notifications.md` | PWA conversion plus push notifications; open questions answered. Referenced from `vite.config.ts`. | 2026-08-13 | CURRENT | |
| `ask-alcan-assistant.md` | Early outline for a RAG + tools assistant. | 2026-08-13 | CURRENT | A v0.1 brainstorm with open questions, not yet a build plan. |
| `doctor-coaching-regional-prd.md` | PRD for the Regional Clinical Coach feature. | 2026-08-11 | CURRENT | Decisions locked; build pending. |
| `doctor-coaching-regional-build-instructions.md` | Build instructions for the Regional Clinical Coach. | 2026-08-11 | CURRENT | |
| `doctor-coaching-regional-adjustments.md` | Pre-PRD platform adjustments for regional coaching. | 2026-08-11 | CURRENT | |

---

## `docs/archive/` (historical record, never routed to an agent)

Everything below is accurate about a moment in the past and is **not** a
description of how the system works today. Each file carries a header saying so.
Nothing here was deleted: this is the audit trail.

### Retired top-level docs

| Doc | What it is | Last changed | Status | Why archived |
|---|---|---|---|---|
| `architecture.md` | How the codebase is laid out: stack, routing, auth, roles. | 2026-06-22 | WAS ACTIVELY MISLEADING | Tells the reader "database changes ship via `npx supabase db push`," which CLAUDE.md states does not work on this project. Its own stale banner also undersells how far behind it is. |
| `data-model.md` | The database as it exists, table by table, with row counts. | 2026-07-30 | WAS ACTIVELY MISLEADING | Lists five tables deleted on 2026-07-25 (`weekly_self_select`, `user_backlog`, `user_backlog_v2`, `manager_priorities`, `resource_events`) as live, including `user_backlog_v2` as the active recommender store. |
| `glossary.md` | Definitions of the domain terms (Pro Move, check-in/out, sequencer, org hierarchy). | 2026-06-22 | WAS ACTIVELY MISLEADING | Calls `user_backlog_v2` the "active store" and lists two other dropped tables as present. The term definitions are fine; those table rows are not. |
| `roadmap.md` | Product roadmap and session log. | 2026-03-06 | WAS ACTIVELY MISLEADING | Header says "Living document. Updated at the end of every working session," but it has one session entry and has not been touched in over five months. |
| `progress.md` | Session progress tracker and collaboration process. | 2026-03-06 | WAS ACTIVELY MISLEADING | Header says "Read this at the start of every new session," yet it is five-plus months stale and prescribes the retired Lovable workflow. |
| `improvement-backlog.md` | Running list of known weirdness and legacy-cleanup candidates. | 2026-07-24 | STALE BUT USEFUL | Predates the Aug-18 assessment, which supersedes several items and formalized them as Motion tickets. Still a good map of the legacy clusters. |
| `simplification-roadmap.md` | The single ordered cleanup list (DB cleanup, permission unification, navigation). | 2026-07-24 | STALE BUT USEFUL | Partly overtaken by the Aug-18 assessment and the Motion board. |
| `enterprise-blockers.md` | Issues to clear before a broad enterprise rollout beyond Alcan. | 2026-03-11 | STALE BUT USEFUL | Five months old; some items are now covered by the Aug-18 assessment tickets. |
| `clean-room-prd.md` | A reverse PRD written as if starting fresh, deliberately blind to the current app. | 2026-07-24 | STALE BUT USEFUL | A point-in-time thought exercise. Read as intent, not state. |
| `navigation-remediation-plan.md` | Plan to fix navigation and permission-gating issues. | 2026-07-20 | UNVERIFIED | Marked "ready to execute"; how much has shipped was never checked against the routing code. |
| `edge-function-deployment.md` | How-to for deploying the `sync-onboarding-assignments` edge function. | 2025-12-01 | UNVERIFIED | Eight months old and about one function; the CLI deploy path it describes was never re-confirmed (see GOV-2). |
| `pro-move-versioning-requirements.md` | The what-and-why requirements for framework versioning. | 2026-07-30 | HISTORICAL RECORD | Requirements for a feature that is now live; useful as rationale. |
| `phase-c-comparison.md` | Point-in-time scoring of the live platform against the PRD. | 2026-07-24 | HISTORICAL RECORD | A dated 2026-07-24 comparison snapshot. |
| `phase-3-5-implementation-plan.md` | Plan to finish the `weekly_assignments` migration. | 2025-12-01 | HISTORICAL RECORD | That migration is now the live assignment path; this is the plan that got it there. |
| `phase2-qa.md` | QA notes for the dual-read feature-flag validation of `weekly_assignments`. | 2025-11-21 | HISTORICAL RECORD | November 2025 QA for a flag that has since become the default path. |
| `weekly-assignments-migration-summary.md` | Summary of the completed `weekly_assignments` migration. | 2025-11-21 | HISTORICAL RECORD | Explicitly a "migration completed 2025-11-21" record. |
| `utilization-snapshot-2026-07-24.md` | Live-queried snapshot of how ProMoves is actually used, with an owner interview. | 2026-07-24 | HISTORICAL RECORD | A dated usage snapshot; numbers are point-in-time. |

### `docs/archive/audits/`

The Aug-18 assessment flagged the old `docs/audits/` folder specifically: it mixed
trustworthy and stale docs with no consistent banners, so it could not be read as
"the current security and quality picture." The whole folder is now archived.

| Doc | What it is | Last changed | Status | Why archived |
|---|---|---|---|---|
| `security-rls-audit.md` | June security and RLS audit, with a "fixes applied" banner. | 2026-06-22 | WAS ACTIVELY MISLEADING | Embeds a real-format Supabase management token (finding SEC-7), and its reassuring "isolation holds" posture was contradicted by the Aug-18 live audit, which found anonymous users could read every tenant's data through views and SECURITY DEFINER functions this audit never examined. |
| `multi-tenant-isolation-audit.md` | June audit of tenant isolation across RLS and edge functions. | 2026-06-12 | STALE BUT USEFUL | Six of its ten remediations are still live and correct, but its scope missed the view and SECURITY DEFINER paths, and one later remediation reintroduced a hole. |
| `code-quality-audit.md` | Code-quality audit against the March-6 branch. | 2026-06-22 | STALE BUT USEFUL | Self-labeled stale: ran roughly 1,529 commits behind `main`; re-run before acting. |
| `usability-navigation-audit.md` | UX audit of routing and navigation (findings N1 to N12). | 2026-07-20 | STALE BUT USEFUL | Feeds `navigation-remediation-plan.md`; how many findings are resolved is unverified. |
| `ux-accessibility-audit.md` | UX and accessibility audit. | 2026-06-25 | STALE BUT USEFUL | Source of the DSN-2 accessibility ticket; some findings likely still open. |
| `evaluation-flow-analysis.md` | June deep-dive map of the evaluation feature plus a redesign direction. | 2026-06-22 | HISTORICAL RECORD | The June-22 analysis that fed the evaluation overhaul, parts of which have since shipped. |
| `evaluation-data-integrity-audit-2026-07-23.md` | Findings on blank / missing evaluations (the hollow-evals problem). | 2026-07-24 | HISTORICAL RECORD | Dated findings; the hollow-evals issue was subsequently addressed. |
| `facilitator-presentation-design-review.md` | One-pass visual polish review of the facilitator presentation page. | 2026-06-22 | HISTORICAL RECORD | A June design review of a specific file. |
| `applied-rls-fixes-2026-06-22.sql` | The SQL applied as part of the June RLS audit. | 2026-06-22 | HISTORICAL RECORD | A record of what was run on 2026-06-22. Do not re-run without checking current policies. |

### `docs/archive/features/`

Feature docs whose feature has shipped, gone dormant, or been superseded.

| Doc | What it is | Last changed | Status | Why archived |
|---|---|---|---|---|
| `ariyana-coaching-workspace.md` | Design synthesis of the Training Director coaching surface. | 2026-07-20 | HISTORICAL RECORD | Slices 1 and 2 have shipped; this is the design that led there. |
| `ariyana-workspace-prd.md` | PRD for Ariyana's coaching workspace. | 2026-07-20 | HISTORICAL RECORD | Feature partly shipped. |
| `ariyana-workspace-build-plan.md` | Build plan (slice 1) for the coaching workspace. | 2026-07-21 | HISTORICAL RECORD | Slice 1 built. |
| `evaluation-overhaul.md` | The umbrella spec for the evaluation overhaul. | 2026-06-24 | HISTORICAL RECORD | The overhaul has since partly shipped (staff review V2 behind a flag). |
| `evaluation-capture-stems.md` | Draft per-domain capture framing and prompt stems. | 2026-06-24 | HISTORICAL RECORD | June working set feeding the overhaul. Cited from `src/lib/evalCaptureFraming.ts`. |
| `evaluation-staff-delivery.md` | Spec for the staff-facing delivery phase of evaluations. | 2026-06-24 | HISTORICAL RECORD | Planning doc from the overhaul series. |
| `evaluation-transcription-spike.md` | Spike on the transcription / recording foundation. | 2026-06-24 | HISTORICAL RECORD | A June investigation spike. |
| `evaluation-view-surfaces.md` | Spec for unifying the several evaluation view surfaces. | 2026-06-24 | HISTORICAL RECORD | Planning doc from the overhaul series. Cited from `src/components/review/EvaluationBody.tsx`. |
| `facilitator-presentation.md` | Spec for the facilitator presentation tool (feature #1). | 2026-06-22 | HISTORICAL RECORD | Shipped for Ariana's meetings. |
| `hr-offboarding-export.md` | Scoping draft for an HR offboarding data export (GDPR-adjacent). | 2026-06-22 | UNVERIFIED | A June scoping draft; whether it was built was never confirmed. |
| `the-alcan-way-build-plan.md` | Technical build plan for The Alcan Way experience. | 2026-07-24 | HISTORICAL RECORD | The `the-alcan-way/` build is dormant (assessment CLN-5), and `features/alcan-way-exhibit-concept.md` supersedes this direction. |
| `the-alcan-way-beat-map.md` | Story beat map for The Alcan Way. | 2026-07-24 | HISTORICAL RECORD | Creative source for the now-dormant experience. |
| `the-alcan-way-copy.md` | Final on-screen copy for The Alcan Way beats. | 2026-07-24 | HISTORICAL RECORD | Creative source; still cited from `the-alcan-way/src/content/`. |
| `the-alcan-way-journey-and-art-spec.md` | Walk-forward journey and environment art spec. | 2026-07-24 | HISTORICAL RECORD | Creative source for the now-dormant experience. |
| `the-alcan-way-art-prompts.md` | Art-generation prompts (v3) for The Alcan Way. | 2026-07-24 | HISTORICAL RECORD | Creative source for the now-dormant experience. |

### `docs/archive/prototypes/`

Standalone HTML prototypes. They were exploration artifacts, never wired into the
app, and the shipped surfaces have moved on. Each carries an archived header as an
HTML comment.

| File | What it is | Last changed | Status |
|---|---|---|---|
| `mobile-shell-prototype.html` | Clickable prototype of the mobile shell. | 2026-08-13 | HISTORICAL RECORD |
| `my-role-exploration-concepts.html` | Three library concepts for Explore My Craft. | 2026-08-14 | HISTORICAL RECORD |
| `alcan-way-explore-concepts.html` | Mobile interaction concepts for The Alcan Way. | 2026-08-14 | HISTORICAL RECORD |
| `lead-focus-prototype.html` | Prototype of the (since retired) Lead Pro Move panel. | 2026-07-21 | HISTORICAL RECORD |

---

## `docs/business/` (never routed to an agent)

Client-facing and source material. Real product input in places, but not project
documentation, and agents should not read it when deciding how to change code.

| File | What it is | Last changed | Status |
|---|---|---|---|
| `pro-moves-library-2026-06-25.csv` | Export of the Pro Moves library as of 2026-06-25. | 2026-07-24 | Source data |
| `patient-journey-source.md` | Handoff / source doc for the patient-journey audit framework. | 2026-06-22 | Source material |
| `hospitality-principles-source.md` | Source text of the three Alcan hospitality principles. | 2026-07-24 | Source material |
| `sedation-calculator-hosting-email.md` | Draft email to the marketing agency about hosting the sedation calculator. | 2026-08-05 | Correspondence |

---

## Uncommitted drafts on disk (not in git)

Some markdown and binary drafts exist in John's working copy but are **not
committed to version control**, so they have no git history and DOC-5 could not
move them. They are all business material and belong in `docs/business/` when they
are committed:

- `alcan-avenue-patient-journey.md` and `alcan-avenue-patient-journey-review-draft.md`
- `outbound/patient-journey-review-email.md`, `outbound/cd-update-regional-coaching-email.md`,
  `outbound/Alcan-Avenue-Patient-Journey-Draft.docx`
- `reference/alcan-manager-kpi-scorecard-q2-2026-template.csv`,
  `reference/baseline-review-session-template.md`

The tracked `docs/outbound/` and `docs/reference/` folders no longer exist. If
those folders still appear in a working copy, it is only because of the
uncommitted files above.

---

## The six that were actively misleading

Each of these was checked and found to state something specifically wrong, not
merely to be old. All six now live under `docs/archive/` with a header naming the
wrong claim. Fixing their content is ticket DOC-3.

1. **`archive/architecture.md`** points the reader at `npx supabase db push`;
   CLAUDE.md says that command does not work on this project.
2. **`archive/roadmap.md`** claims it is "updated at the end of every working
   session"; it has one session and is over five months stale.
3. **`archive/progress.md`** claims to be read at the start of every new session;
   it is five-plus months stale and prescribes a retired Lovable workflow.
4. **`archive/data-model.md`** lists five tables deleted on 2026-07-25 as live,
   including naming a dropped table (`user_backlog_v2`) as the active recommender
   store.
5. **`archive/glossary.md`** describes those same dropped tables as present and
   active.
6. **`archive/audits/security-rls-audit.md`** embeds a real-format management
   token and reads as "security is handled," which the Aug-18 live audit
   disproved.
