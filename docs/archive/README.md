# Archive

Everything in this folder is a **historical record**. Each file is accurate about
a moment in the past and is **not** a description of how the system works today.
Every file carries a header saying so.

Nothing here was deleted. This is the audit trail: the plans that shipped, the
audits that were run, the roadmaps that were abandoned, and the six docs that were
actively misleading enough to be dangerous where they were.

**Do not route an agent here.** `.claude/skills/_shared/doc-routing.md` never
points at `archive/`. If a task genuinely needs one of these files, read it as
evidence about what happened, and verify any claim about present behaviour against
the code or the database before acting on it.

Contents:

- `*.md` at this level: retired top-level docs, including `architecture.md`,
  `data-model.md`, `glossary.md`, `roadmap.md` and `progress.md`
- `audits/`: the June 2026 security, quality, navigation and accessibility audits
- `features/`: feature docs whose feature shipped, went dormant, or was superseded
- `prototypes/`: standalone HTML prototypes that were never wired into the app

For the trust rating of any individual file, see `docs/README.md`. Fixing the
content of the misleading ones is ticket DOC-3.
