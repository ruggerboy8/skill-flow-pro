# Docs index (honest inventory)

*Built 2026-08-18. This is a map of every markdown file under `docs/`, with a
blunt read on whether you can trust each one right now.*

Not every doc here is equally trustworthy, and a tidy list can hide that. Some
docs are current. Some are old but still useful. A few are **actively
misleading**: they state something that is verifiably wrong today and will send a
newcomer (or an AI agent) down the wrong path. Those are called out in plain
language so you can see them coming.

**How to read the Status column:**

- **CURRENT**: accurate as of today.
- **STALE BUT USEFUL**: dated, some parts overtaken, but still worth reading.
- **ACTIVELY MISLEADING**: contains a specific claim that is wrong now. The
  "Why" says which claim. Treat with care until the doc is fixed (that cleanup is
  ticket DOC-3).
- **HISTORICAL RECORD**: accurate about a moment in the past (a finished
  migration, a shipped feature's plan, a point-in-time audit or snapshot). Fine
  as history, not a description of the app today.
- **UNVERIFIED**: I could not check it against the live code or database in the
  time available. The "Why" says what a check would need.

This inventory does not change, move, or fix any doc. That is deliberate: this is
the input to ticket DOC-5 (restructure) and DOC-3 (staleness banners), and it
loses value if it also edits the thing it is describing.

---

## Start here (read these first, in this order)

1. **`docs/system-overview.md`**: what the product is, who uses it, the weekly
   loop. The single best entry point, and current.
2. **`CLAUDE.md`** (repo root, not under `docs/`) - the load-bearing operational
   facts live only here: how migrations really ship, that `supabase db push` does
   not work, the current Organization / Group / Location terminology, the design
   tokens. A newcomer who skips this file will get stuck in ways nothing in
   `docs/` warns them about.
3. **`docs/dev/assessment-2026-08-18.md`**: the first real engineering review of
   this codebase, and the honest current state: the security exposure, the
   backlog, and why the defects look the way they do. Current.
4. **`docs/glossary.md`**: the domain vocabulary. Trust the term definitions;
   ignore the handful of table rows that name dropped tables (see its entry
   below).
5. **`docs/data-model.md`**: the database as a map. Useful, but treat the
   migrations as the real source of truth: it still lists five tables that were
   deleted on 2026-07-25 as if they were live.

---

## What is NOT in this index

- `docs/prototypes/` holds four HTML prototype files, not markdown, so it has no
  rows here: `alcan-way-explore-concepts.html`, `lead-focus-prototype.html`,
  `mobile-shell-prototype.html`, `my-role-exploration-concepts.html`.
- `docs/reference/` also holds two CSV data files that are not markdown:
  `pro-moves-library-2026-06-25.csv` and
  `alcan-manager-kpi-scorecard-q2-2026-template.csv` (the CSV is currently an
  uncommitted draft).
- A separate section at the bottom lists markdown drafts that exist on disk but
  are **not yet committed to git**, so they will show up in `glow` but are not
  part of the versioned docs set.

"Last changed" is the last git commit that touched the file
(`git log -1 --date=short`), not the date written inside the doc's header. Where
the two disagree, the doc is usually claiming to be fresher than it is.

---

## Top level (`docs/`)

| Doc | What it is | Last changed | Status | Why (if not current) |
|---|---|---|---|---|
| `system-overview.md` | Plain-English tour of the product, the users, and the weekly loop. The designated entry point. | 2026-06-22 | CURRENT | |
| `glossary.md` | Definitions of the domain terms (Pro Move, check-in/out, sequencer, org hierarchy). | 2026-06-22 | ACTIVELY MISLEADING | Calls `user_backlog_v2` the "active store" and lists `weekly_self_select` / `user_backlog` as present, but all were deleted by migration `20260725120000`. Term definitions are fine; those table rows are not. |
| `data-model.md` | The database as it exists, table by table, with row counts. | 2026-07-30 | ACTIVELY MISLEADING | Lists five deleted tables (`weekly_self_select`, `user_backlog`, `user_backlog_v2`, `manager_priorities`, `resource_events`) as live, including `user_backlog_v2` as the active recommender store. All were dropped 2026-07-25, five days before this doc's last edit. |
| `architecture.md` | How the codebase is laid out: stack, routing, auth, roles, libraries. | 2026-06-22 | ACTIVELY MISLEADING | Tells the reader "database changes ship via `npx supabase db push`," but CLAUDE.md states plainly that `db push` does not work on this project. Its own stale banner also undersells how far behind it is. |
| `roadmap.md` | Product roadmap and session log. | 2026-03-06 | ACTIVELY MISLEADING | Header says "Living document. Updated at the end of every working session," but it has one session entry and has not been touched in over five months (roughly 1,900 commits). The currency claim is false. |
| `progress.md` | Session progress tracker and collaboration process. | 2026-03-06 | ACTIVELY MISLEADING | Header says "Updated at the end of every session. Read this at the start of every new session," yet it is five-plus months stale, and the Lovable-preview / merge-in-Lovable workflow it prescribes has been replaced by the dev-workflow kit. A new session told to trust it starts from an outdated process. |
| `enterprise-architecture.md` | The proposed multi-tenant design; CLAUDE.md cites it as the canonical terminology source. | 2026-03-06 | STALE BUT USEFUL | Marked "Draft, not yet implemented," but multi-tenancy has since largely shipped (the `organizations` table and org chain exist). Still the reference for the locked terms. |
| `enterprise-blockers.md` | Issues to clear before a broad enterprise rollout beyond Alcan. | 2026-03-11 | STALE BUT USEFUL | Five months old, but still operationally relevant; some items are now covered by the Aug-18 assessment tickets. |
| `improvement-backlog.md` | Running list of known weirdness and legacy-cleanup candidates. | 2026-07-24 | STALE BUT USEFUL | Predates the Aug-18 assessment, which supersedes several items and formalized them as Motion tickets. Still a good map of the legacy clusters. |
| `management-model.md` | The management theory behind ProMoves and how the deployed system differs from the designed one. | 2026-07-20 | CURRENT | |
| `clean-room-prd.md` | A reverse PRD written as if starting fresh, deliberately blind to the current app. | 2026-07-24 | STALE BUT USEFUL | A point-in-time thought exercise, not a description of the live app, so it cannot be "wrong" about the app; read as intent, not state. |
| `simplification-roadmap.md` | The single ordered cleanup list (DB cleanup, permission unification, navigation). | 2026-07-24 | STALE BUT USEFUL | Partly overtaken by the Aug-18 assessment and the Motion board, but still a coherent sequence. |
| `navigation-remediation-plan.md` | Plan to fix navigation and permission-gating issues (pairs with the nav audit). | 2026-07-20 | UNVERIFIED | Marked "ready to execute"; I did not check the routing code to see how much has shipped. |
| `multi-tenant-isolation-audit.md` | June audit of tenant isolation across RLS and edge functions, with fixes and residual risk. | 2026-06-12 | STALE BUT USEFUL | The Aug-18 assessment found six of its ten remediations still live and correct, but its scope missed the view and SECURITY DEFINER paths, and one later remediation reintroduced a hole. |
| `phase-c-comparison.md` | Point-in-time scoring of the live platform against the PRD, from seven parallel audits. | 2026-07-24 | HISTORICAL RECORD | A dated 2026-07-24 comparison snapshot. |
| `phase-3-5-implementation-plan.md` | Plan to finish the `weekly_assignments` migration. | 2025-12-01 | HISTORICAL RECORD | That migration is now the live assignment path; this is the plan that got it there. |
| `phase2-qa.md` | QA notes for the dual-read feature-flag validation of `weekly_assignments`. | 2025-11-21 | HISTORICAL RECORD | November 2025 QA for a feature flag that has since become the default path. |
| `weekly-assignments-migration-summary.md` | Summary of the completed `weekly_assignments` migration. | 2025-11-21 | HISTORICAL RECORD | Explicitly a "migration completed 2025-11-21" record. |
| `utilization-snapshot-2026-07-24.md` | Live-queried snapshot of how ProMoves is actually used, with an owner interview. | 2026-07-24 | HISTORICAL RECORD | A dated usage snapshot; numbers are point-in-time. |
| `pro-move-versioning-implementation-plan.md` | Effort audit and implementation plan for framework versioning. | 2026-07-30 | CURRENT | Marked APPLIED and verified live; accurately describes the shipped `framework_history` system. |
| `pro-move-versioning-requirements.md` | The what-and-why requirements for framework versioning. | 2026-07-30 | HISTORICAL RECORD | Requirements for a feature that is now live; useful as rationale. |
| `edge-function-deployment.md` | How-to for deploying the `sync-onboarding-assignments` edge function. | 2025-12-01 | UNVERIFIED | Eight months old and about one function; I did not confirm the function still exists or that the CLI deploy path it describes still works (see GOV-2 on orphaned edge functions). |
| `dev-workflow-redesign.md` | Analysis and proposal for the new branches / PRs / board workflow. | 2026-08-18 | CURRENT | |
| `dev-workflow-kit-instructions.md` | The hand-off doc that builds the dev workflow kit in a fresh session. | 2026-08-18 | CURRENT | |

## `docs/dev/`

| Doc | What it is | Last changed | Status | Why (if not current) |
|---|---|---|---|---|
| `assessment-2026-08-18.md` | The first full engineering review: security, data model, docs, and the 36-ticket backlog. | 2026-08-18 | CURRENT | |
| `cli-best-practices.md` | Living cheat sheet for John working in the terminal with Claude Code. | 2026-08-18 | CURRENT | |
| `kit-log.md` | Running build log of the dev workflow kit and where reality diverged from the plan. | 2026-08-18 | CURRENT | |
| `ticket-template.md` | The block every Motion dev-board ticket carries. | 2026-08-18 | CURRENT | |

## `docs/specs/`

| Doc | What it is | Last changed | Status | Why (if not current) |
|---|---|---|---|---|
| `codebase-assessment.md` | The spec that defined the Aug-18 assessment work. | 2026-08-18 | CURRENT | Recent; the work it specified is the assessment now in `docs/dev/`. |

## `docs/audits/`

The Aug-18 assessment flagged this folder specifically: it mixes trustworthy and
stale docs with no consistent banners, so the folder as a whole should not be
read as "the current security and quality picture."

| Doc | What it is | Last changed | Status | Why (if not current) |
|---|---|---|---|---|
| `security-rls-audit.md` | June security and RLS audit, with a "fixes applied" banner. | 2026-06-22 | ACTIVELY MISLEADING | Two problems. It embeds a real-format Supabase management token (`sbp_...`) in the doc text (finding SEC-7). And its reassuring "isolation holds / fixes applied" posture is contradicted by the Aug-18 live audit, which found anonymous users can read every tenant's data through views and SECURITY DEFINER functions this audit never examined. Its own regression script would pass while the data is exposed. |
| `code-quality-audit.md` | Code-quality audit against the March-6 branch. | 2026-06-22 | STALE BUT USEFUL | Self-labeled stale: ran roughly 1,529 commits behind `main`; re-run before acting. |
| `evaluation-flow-analysis.md` | June deep-dive map of the evaluation feature plus a redesign direction. | 2026-06-22 | HISTORICAL RECORD | The June-22 analysis that fed the evaluation overhaul, parts of which have since shipped. |
| `evaluation-data-integrity-audit-2026-07-23.md` | Findings on blank / missing evaluations (the hollow-evals problem). | 2026-07-24 | HISTORICAL RECORD | Dated findings; the hollow-evals issue was subsequently addressed. |
| `facilitator-presentation-design-review.md` | One-pass visual polish review of the facilitator presentation page. | 2026-06-22 | HISTORICAL RECORD | A June design review of a specific file. |
| `usability-navigation-audit.md` | UX audit of routing and navigation (findings N1 to N12). | 2026-07-20 | STALE BUT USEFUL | Feeds `navigation-remediation-plan.md`; how many findings are resolved is unverified. |
| `ux-accessibility-audit.md` | UX and accessibility audit. | 2026-06-25 | STALE BUT USEFUL | Source of the DSN-2 accessibility ticket; some findings likely still open. |

## `docs/features/`

Most of these are PRDs, build plans, and executor specs. For this folder,
**CURRENT** means a recent plan still in play, and **HISTORICAL RECORD** means the
feature has since shipped, gone dormant, or been superseded. That read is from
dates and project memory, not a line-by-line code check, so treat it as a guide
rather than a guarantee.

| Doc | What it is | Last changed | Status | Why (if not current) |
|---|---|---|---|---|
| `alcan-way-exhibit-concept.md` | Concept for reframing The Alcan Way as a museum-exhibit experience. | 2026-08-14 | CURRENT | The agreed current direction; explicitly supersedes the three earlier interaction concepts. |
| `explore-page-plan.md` | Plan for the Explore page (renamed My Role). | 2026-08-14 | CURRENT | |
| `explore-my-role-build-instructions.md` | Executor spec for building the Explore / My Role Atlas. | 2026-08-14 | CURRENT | |
| `mobile-build-plan.md` | Plan of record for the PWA + mobile shell. | 2026-08-13 | CURRENT | |
| `mobile-build-instructions.md` | The build source of truth for the mobile shell. | 2026-08-13 | CURRENT | |
| `mobile-design-principles.md` | Design principles for the PWA (Track B). | 2026-08-13 | CURRENT | |
| `mobile-adjustments-round2.md` | Executor spec for the round-2 mobile shell pass. | 2026-08-13 | CURRENT | |
| `mobile-adjustments-round3.md` | Executor spec for the round-3 mobile shell pass. | 2026-08-14 | CURRENT | |
| `pwa-push-notifications.md` | PWA conversion plus push notifications; open questions answered. | 2026-08-13 | CURRENT | |
| `ask-alcan-assistant.md` | Early outline for a RAG + tools assistant. | 2026-08-13 | CURRENT | A v0.1 brainstorm with open questions, not yet a build plan. |
| `doctor-coaching-regional-prd.md` | PRD for the Regional Clinical Coach feature. | 2026-08-11 | CURRENT | Decisions locked; build pending. |
| `doctor-coaching-regional-build-instructions.md` | Build instructions for the Regional Clinical Coach. | 2026-08-11 | CURRENT | |
| `doctor-coaching-regional-adjustments.md` | Pre-PRD platform adjustments for regional coaching. | 2026-08-11 | CURRENT | |
| `ariyana-coaching-workspace.md` | Design synthesis of the Training Director coaching surface. | 2026-07-20 | HISTORICAL RECORD | Slices 1 and 2 of this workspace have since shipped; the doc is the design that led there. |
| `ariyana-workspace-prd.md` | PRD for Ariyana's coaching workspace. | 2026-07-20 | HISTORICAL RECORD | Feature partly shipped. |
| `ariyana-workspace-build-plan.md` | Build plan (slice 1) for the coaching workspace. | 2026-07-21 | HISTORICAL RECORD | Slice 1 built. |
| `evaluation-overhaul.md` | The umbrella spec for the evaluation overhaul. | 2026-06-24 | HISTORICAL RECORD | Planning doc; the overhaul has since partly shipped (staff review V2 behind a flag). |
| `evaluation-capture-stems.md` | Draft per-domain capture framing and prompt stems. | 2026-06-24 | HISTORICAL RECORD | June working set feeding the overhaul. |
| `evaluation-staff-delivery.md` | Spec for the staff-facing delivery phase of evaluations. | 2026-06-24 | HISTORICAL RECORD | Planning doc from the overhaul series. |
| `evaluation-transcription-spike.md` | Spike on the transcription / recording foundation. | 2026-06-24 | HISTORICAL RECORD | A June investigation spike. |
| `evaluation-view-surfaces.md` | Spec for unifying the several evaluation view surfaces. | 2026-06-24 | HISTORICAL RECORD | Planning doc from the overhaul series. |
| `facilitator-presentation.md` | Spec for the facilitator presentation tool (feature #1). | 2026-06-22 | HISTORICAL RECORD | The first feature built in this series; shipped for Ariana's meetings. |
| `hr-offboarding-export.md` | Scoping draft for an HR offboarding data export (GDPR-adjacent). | 2026-06-22 | UNVERIFIED | A June scoping draft; I did not confirm whether it was built. |
| `the-alcan-way-build-plan.md` | Technical build plan for The Alcan Way experience. | 2026-07-24 | HISTORICAL RECORD | The `the-alcan-way/` build is dormant (assessment CLN-5), and the exhibit concept above supersedes this direction. |
| `the-alcan-way-beat-map.md` | Story beat map for The Alcan Way. | 2026-07-24 | HISTORICAL RECORD | Creative source for the now-dormant experience. |
| `the-alcan-way-copy.md` | Final on-screen copy for The Alcan Way beats. | 2026-07-24 | HISTORICAL RECORD | Creative source for the now-dormant experience. |
| `the-alcan-way-journey-and-art-spec.md` | Walk-forward journey and environment art spec. | 2026-07-24 | HISTORICAL RECORD | Creative source for the now-dormant experience. |
| `the-alcan-way-art-prompts.md` | Art-generation prompts (v3) for The Alcan Way. | 2026-07-24 | HISTORICAL RECORD | Creative source for the now-dormant experience. |

## `docs/reference/`

| Doc | What it is | Last changed | Status | Why (if not current) |
|---|---|---|---|---|
| `hospitality-principles-source.md` | Source text of the three Alcan hospitality principles. | 2026-07-24 | CURRENT | Reference source material. |
| `patient-journey-source.md` | Handoff / source doc for the patient-journey audit framework. | 2026-06-22 | CURRENT | Reference source material. |

## `docs/outbound/`

| Doc | What it is | Last changed | Status | Why (if not current) |
|---|---|---|---|---|
| `sedation-calculator-hosting-email.md` | Draft email to the marketing agency about hosting the sedation calculator. | 2026-08-05 | HISTORICAL RECORD | Point-in-time correspondence, not project documentation. |

---

## Uncommitted drafts on disk (not in git)

These markdown files exist in the working copy and will appear in `glow`, but they
are **not committed to version control**, so they are not part of the versioned
docs set and have no git history. Dates below are from each file's own header.
Status is UNVERIFIED because uncommitted drafts can change or disappear at any
time.

| Doc | What it is | Header date | Status | Why |
|---|---|---|---|---|
| `alcan-avenue-patient-journey.md` | Working draft of the Alcan Avenue (UK) patient journey framework. | 2026-08-13 (v0.3) | UNVERIFIED | Uncommitted draft, not in git. |
| `alcan-avenue-patient-journey-review-draft.md` | Review-ready version of the patient journey, prepared for Bobby and Sam. | 2026-07-29 | UNVERIFIED | Uncommitted draft, not in git. |
| `outbound/patient-journey-review-email.md` | Email requesting review of the Alcan Avenue patient journey draft. | undated | UNVERIFIED | Uncommitted draft, not in git. |
| `outbound/cd-update-regional-coaching-email.md` | Email to clinical directors about the regional coaching changes. | undated | UNVERIFIED | Uncommitted draft, not in git. |
| `reference/baseline-review-session-template.md` | Session template and facilitation guide for baseline reviews. | undated | UNVERIFIED | Uncommitted draft, not in git. |
| `specs/tst-5-supabase-test-double.md` | Spec for the TST-5 Supabase test double ticket. | 2026-08-18 | UNVERIFIED | Uncommitted draft, not in git. |

---

## The six actively misleading docs, in one place

If you fix nothing else, these are the docs that will actively mislead a newcomer
or an agent. Each is here because a specific claim was checked and found wrong,
not because it is merely old. Fixing them is ticket DOC-3.

1. **`architecture.md`** points the reader at `npx supabase db push`; CLAUDE.md
   says that command does not work on this project.
2. **`roadmap.md`** claims it is "updated at the end of every working session";
   it has one session and is over five months stale.
3. **`progress.md`** claims it is updated every session and to be read at the
   start of every new one; it is five-plus months stale and prescribes a retired
   Lovable workflow.
4. **`data-model.md`** lists five tables deleted on 2026-07-25 as live, including
   naming a dropped table (`user_backlog_v2`) as the active recommender store.
5. **`glossary.md`** describes those same dropped tables as present and active.
6. **`audits/security-rls-audit.md`** embeds a real-format management token and
   reads as "security is handled," which the Aug-18 live audit disproved.
