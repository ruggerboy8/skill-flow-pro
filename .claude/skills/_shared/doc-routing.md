# Doc-routing table

When writing a spec (`/spec`), copy the relevant rows into the spec's "Docs the
builder must read" section so the builder reads exactly what it needs.

## What is routable

`docs/` is organised by kind, not by topic (DOC-5, 2026-08-19):

| Folder | Kind | Route an agent to it? |
|---|---|---|
| `docs/*.md` (top level) | Canonical. How the system works today. | Yes |
| `docs/specs/` | Work in flight. | Yes, the one spec for the task |
| `docs/dev/` | How we work: the kit, the assessment, lint policy. | Yes, when relevant |
| `docs/features/` | Feature plans and build instructions still in play. | Yes, the relevant one |
| `docs/archive/` | Historical records. Accurate about the past, wrong about now. | **No.** Cite as history only, never as authority |
| `docs/business/` | Client emails, source content, CSV exports. | **No** |

Every file under `docs/archive/` carries a header saying so. If a task genuinely
needs one, read it as evidence about what happened, and verify any claim about
present behaviour against the code or the database before acting on it.

## Routing table

| Area | Docs to read |
|------|-------------|
| Schema / DB | CLAUDE.md sections "Data model & terminology", "Framework content is versioned" and "Applying migrations"; `supabase/migrations/` for the real current schema. There is no trustworthy schema doc right now: `docs/archive/data-model.md` lists five tables dropped on 2026-07-25 as live. DOC-3 will produce a replacement. |
| Pro Move content | CLAUDE.md "Framework content is versioned" (set `app.change_reason`, no deletes, release cutting) and `docs/pro-move-versioning-implementation-plan.md`. For terminology use CLAUDE.md and `docs/enterprise-architecture.md`, not `docs/archive/glossary.md`, whose table rows name dropped tables. |
| Mobile UI | `docs/features/mobile-design-principles.md`, `docs/features/mobile-build-instructions.md` Ground rules, gating via `useMobileShell` |
| Evaluations | `src/components/review/` and the hollow-evals guard (see memory). The `docs/archive/features/evaluation-*.md` set is the 2026-06 planning series, partly shipped, and is history rather than a description of the live surface. |
| Coaching / leads | `docs/management-model.md` |
| Surveys | No doc exists. The hand-written types in `src/lib/surveyTypes.ts` and the `survey_*` tables are the source of truth. |
| Testing | `docs/testing.md` for the Supabase test double, `docs/dev/lint-policy.md` for the lint gate |
| Anything | `docs/system-overview.md`, `docs/README.md` for the trust rating of any doc, CLAUDE.md design system conventions, no em dashes, token/color conventions |
