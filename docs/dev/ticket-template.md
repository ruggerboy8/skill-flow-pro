# Dev Ticket Template

Every dev task on the MyProMoves Dev Board carries this block in its
description. Copy it when creating a new ticket and fill in each field.

```
Lane: tiny | medium | cross-cutting | bug
Spec: <path to spec doc, or "inline" for tiny>
Branch: <name>
PR: <url>
Acceptance script (do X, expect Y): ...
QA verdict: pending | pass | fail: <reason>
Personas to test as: participant | lead | admin(desktop)
DB change: none | <migration + apply-order note>
```

## Field guide

- **Lane** -- how big is this? Determines the workflow:
  - `tiny`: copy, spacing, a token, one card's order. Short branch, no spec doc needed.
  - `medium`: a new page, card family, or hook change. Needs a spec doc and QA.
  - `cross-cutting`: touches auth/roles/data model/IA. Full spec, decomposed tickets, adversarial QA.
  - `bug`: production issue. Repro-first, then fix.

- **Spec** -- path to the spec doc under `docs/specs/<slug>.md`, or "inline" if the
  ticket description itself is enough (tiny lane only).

- **Branch** -- the git branch name. Convention: `feature/<slug>` for new work,
  `fix/<slug>` for bugs.

- **PR** -- the GitHub pull request URL, filled in once the PR is opened.

- **Acceptance script** -- written for John, not a developer. Plain English:
  "open the app as [persona], go to [page], do [action], expect [result]."

- **QA verdict** -- starts as `pending`. Updated to `pass` or `fail: <reason>`
  after QA runs.

- **Personas to test as** -- which user roles need to walk the acceptance script.
  Always includes the primary affected persona; medium+ includes lead; cross-cutting
  includes admin on desktop.

- **DB change** -- `none` if no schema change. Otherwise, name the migration and
  note the apply order (e.g., "apply migration before deploy" or "deploy tolerant
  code first, then apply migration").
