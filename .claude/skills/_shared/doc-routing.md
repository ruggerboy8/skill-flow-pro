# Doc-routing table

When writing a spec (`/spec`), copy the relevant rows into the spec's "Docs the
builder must read" section so the builder reads exactly what it needs.

| Area | Docs to read |
|------|-------------|
| Schema / DB | `docs/data-model.md`, CLAUDE.md sections "Framework content is versioned" and "Applying migrations" |
| Mobile UI | `docs/features/mobile-design-principles.md`, `docs/features/mobile-build-instructions.md` Ground rules, gating via `useMobileShell` |
| Pro Move content | `docs/glossary.md`, CLAUDE.md "Framework content is versioned" (set `app.change_reason`, no deletes, release cutting) |
| Evaluations | `docs/features/evaluation-*.md`, hollow-evals guard (see memory) |
| Coaching / leads | `docs/management-model.md` |
| Surveys | `docs/features/ask-alcan-surveys.md` (if it exists) |
| Anything | `docs/system-overview.md`, CLAUDE.md design system conventions, no em dashes, token/color conventions |
