# Overnight run plan: 2026-08-21 (afternoon launch)

Five tickets, five branches, all off current main (which includes PRs 72-77).
Same shape as the 2026-08-20 run: builder + fresh-eyes QA per ticket, Codex
review on each PR, John merges in the order below the next morning.

## The tickets

| # | Ticket | Lane | Spec | Branch |
|---|---|---|---|---|
| 1 | DSN-10 StatusBadge ink migration | tiny | inline (below) | `design/dsn-10-statusbadge-ink` |
| 2 | CLN-6 delete dead MarkdownPreview | tiny | inline (below) | `chore/cln-6-delete-markdownpreview` |
| 3 | EVAL-4 transcript paragraph preservation | medium | `docs/specs/eval-4-transcript-paragraphs.md` | `fix/eval-4-transcript-paragraphs` |
| 4 | DASH-1b moment-aware Command Center restructure | medium | `docs/specs/dash-1-command-center-color-direction.md` (Ticket breakdown item 2; 1a shipped in PR #56) | `feature/dash-1b-moment-aware-layout` |
| 5 | DSN-8 Pro Moves branding presence | medium | `docs/specs/dsn-8-product-branding-presence.md` (8a, the side-panel logo, already shipped; build placements 1-3 minus what 8a covered) | `design/dsn-8-branding-presence` |

## Inline spec: DSN-10 (tiny)

`src/components/ui/StatusBadge.tsx` pairs vivid `--status-*` text with the
matching `-bg` tint for every state (~2-4:1 contrast). The `--status-*-ink`
family shipped in PR #75 for exactly this. Change each state's `color` to its
`-ink` token; backgrounds and borders stay. Verify computed contrast for all
five states in light and dark mode (expect 6:1+), run the color ratchet, and
eyeball every surface that renders StatusBadge (it is the shared status pill,
so this is app-wide: dashboards, coach views, staff lists).

## Inline spec: CLN-6 (tiny)

Delete `src/components/admin/MarkdownPreview.tsx`. Nothing imports it
(verified by grep on main 2026-08-21; re-verify at build time). It was
counted as one of react-quill's "3 call sites" but is unreachable. Grep for
the component name and file path after deletion; `npm run check` green.

## Scope boundaries (what keeps five branches mergeable)

- **DASH-1b** owns `RegionalDashboard`, `SignalsBanner`,
  `DomainConfidenceHeatmap`, `LocationHealthCard`, and the dashboard stat
  cards. It must NOT edit `StatusBadge.tsx` (DSN-10 owns it tonight). If 1b
  wants different badge behavior, it writes it at the call site.
- **DSN-10** owns `StatusBadge.tsx` and nothing else.
- **DSN-8** owns the desktop header, avatar menu, and mobile shell header
  chrome. No dashboard files, no StatusBadge.
- **EVAL-4** owns the transcript seeding path (EvaluationHub + a new
  `src/lib` helper). It must NOT change `RichTextEditor.tsx`'s default
  behavior for other call sites.
- **CLN-6** deletes one file. If EVAL-4 and CLN-6 both touch imports in
  admin/eval code, they still cannot conflict: MarkdownPreview has no
  importers.
- **Color ratchet baseline** (`scripts/hardcoded-colors-baseline.json`):
  only regenerate if your change actually moves the count, and say so in the
  PR body. If two PRs both regenerate, the second one merged rebases and
  regenerates again (same as DSN-9 on 2026-08-21).

## Merge order (for John, tomorrow)

1. DSN-10 (StatusBadge, isolated)
2. CLN-6 (deletion, isolated)
3. EVAL-4 (eval flow)
4. DSN-8 (chrome)
5. DASH-1b last (biggest; rebase + ratchet regen if GitHub flags conflicts)

## Launch checklist (the "one step")

1. This prep PR is merged (specs on main).
2. John confirms the EVAL-4 approach (seed-time plain-text-to-paragraph
   conversion) — one line.
3. Kick off: one kit-builder per ticket on its branch, then kit-qa fresh-eyes
   per ticket, PRs opened with the ticket template block, Motion tickets
   commented with branch + PR.

## Known holds

- LND-1 and CLN-2b (Vite 8) deliberately excluded: LND-1 may collide with the
  in-flight mobile redesign branch; CLN-2b wants a run where it is the only
  risky thing.
