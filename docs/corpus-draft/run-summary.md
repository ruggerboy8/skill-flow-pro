> **DRAFT - AI-generated 2026-08-20 from the Pro Moves framework. Not canon. Requires review by John before entering the Ask corpus.**

# Overnight Corpus-Seeding Run: Summary

## What was produced

Everything lives in `docs/corpus-draft/`.

| Piece | Count | What it is |
|---|---|---|
| `corpus-index.md` | 1 | The master spine: 4 domain chapters mirroring the Pro Moves framework (62 competency sections, 214 pro moves, 66 doctor-track moves) plus Chapter 5 with 7 reserved shelves for non-framework knowledge. |
| `chapters/` | 62 files | One draft chapter per competency, in 6 folders: staff clinical (12), staff clerical (12), staff cultural (12), staff case acceptance (12), doctor clinical + case (8), doctor clerical + cultural (6). Each has an overview, the moves with sourced guidance, scripts, good-looks-like and pitfalls, FAQ seeds, gaps, and provenance down to action_ids. |
| `questions/` | 4 files | Persona question banks that pressure-test the index: new dental assistant (50), veteran DFI (50), office manager (50), associate doctor (49). 199 questions total, each mapped to a home section or marked NO_HOME (54 were). |
| `data/` | 5 files | The verified read-only framework export (domains, competencies, pro moves, resources) with a README documenting the filter and checksum verification. |
| `gap-report.md` | 1 | The merged master gap list: about 480 inline gap markers consolidated into roughly 40 asks, grouped by owning expert, each with a ready-to-send 10-minute capture prompt. |

## How to review it (suggested order, about 30 minutes)

1. **`corpus-index.md` first.** It is the map; everything else hangs off it. Check that the shape feels right, since tomorrow's Basecamp sort files into it.
2. **One strong chapter:** `chapters/staff-clinical/CLIN-20-patient-comfort-and-communication.md`. Richest staff chapter, four sourced scripts, shows the format at its best. (For the doctor track, `doctor-clinical-case/CASE-413-clear-options-clear-plan.md` is the equivalent.)
3. **One weak chapter:** `chapters/staff-clinical/CLIN-34-team-training-oversight.md`. An honest stub: one pro move, no resources, mostly well-formed gaps. This is what "the framework runs thin here" looks like, and there are about ten chapters like it (mostly Office Manager and Lead DA).
4. **`gap-report.md` last.** It is the action list; the capture prompts are written to be forwarded nearly as-is.

## What the question banks revealed about the index

- **The structure mostly holds.** 145 of 199 questions found a home; the operational OM sections and the doctor-track sections held up especially well.
- **The biggest hole is the program itself.** About 15 NO_HOME questions across all four personas are people asking about Pro Moves: what it is, the meetings, scoring, disputes. The corpus catalogs every move and never explains the program. Proposed shelf RSVD-8 is the top structural fix.
- **The other clusters:** HR and people management (write-ups, conduct reports), records release and legal requests, the hard half of money conversations (refusals, refunds), negative reviews, patient conduct and dismissal, and daily office rhythm. Section 4 of the gap report proposes shelves for each.
- **20 questions are LIVE-DATA:** "my moves this week," "my score trend," "who hasn't checked in." No document can answer these; they need the platform exposed to Ask as tools. Roadmap item, not corpus item.
- **Cross-role policies need shared homes.** The veteran DFI kept landing on doctor-owned sections (the parental separation policy lives in a doctor chapter but the desk explains it at booking). Tomorrow's sort should prefer shelves for policies multiple roles recite.

## Sanity check: rule compliance and files to review first

All 62 chapters and 4 question banks passed the mechanical checks: every file carries the DRAFT banner, every chapter uses [ALCAN]/[GENERAL] tier labels, every chapter has gap markers instead of invented facts, and no em dashes anywhere. **No chapter was found making Alcan-specific claims without provenance.** That said, start human review with these, ranked by stakes rather than by rule violations:

1. **`doctor-clinical-case/CLIN-404-treatment-planning-long-term-health.md`** quotes AAPD oral sedation dosing numbers (mg/kg ranges and maximum doses) taken from the framework's own resources. They are labeled [ALCAN] and carry an inline "verify before chairside use" warning, but this is the one place a transcription or staleness error could cause real harm. Dr. Alex should verify first.
2. **`doctor-clerical-cultural/CLER-406-follow-through-and-review.md`** carries the special-consent procedure list and the pregnancy-test waiver policy. Sourced, but legal-adjacent; worth Dr. Alex's eyes early.
3. **`staff-clinical/CLIN-3-daily-schedule-adaptability.md`** and **`staff-case-acceptance/CASE-13-effective-objection-handling.md`** quote dollar figures from sourced scripts ($125 limited exam fee, $30 fluoride portion). Real quotes, but prices go stale; both are gap-flagged for confirmation.
4. **`staff-clinical/CLIN-1-patient-flow-coordination.md`** is the most gap-dense chapter (6 distinct gaps) and repeats a framework term ("Red Zone") that is never defined anywhere. Nothing invented, but the reader will feel the holes.
5. Two cosmetic notes, not violations: the 12 staff-clerical chapters use bare `[GAP]` markers inside FAQ answers with the full expert attribution only in their Gaps sections (slightly off the house pattern), and 8 doctor chapters contain no [GENERAL] content at all because nearly everything in them is framework-sourced. Both fine, flagged so a reviewer does not misread them.
6. One data-quality find worth fixing in the framework itself: the resources attached to pro move 63 (the RDA reschedule-list move) are placeholder test links (a YouTube music video and yahoo.com), flagged in `staff-clerical/CLER-21-office-task-management.md`. Also, the framework's benefits-language wording differs between roles ("estimated family contribution" for OMs versus "patient portion/responsibility" for DFI/RDA); CASE-45 flags it for a canonical ruling.

## Honest caveats

- **Everything here is unverified AI expansion of the framework data.** The [ALCAN] labels mark what came straight from the export; [GENERAL] marks universal best practice the AI drafted; the gap markers mark what only a human knows. Those three mechanisms are the entire trust model. Nothing should enter the Ask corpus until the owning expert (named in each banner) has reviewed it.
- The question banks tested the index's structure, deliberately without reading the chapter drafts. They validate the shelving, not the prose.
- Sourced scripts are quoted nearly verbatim, including the framework's own typos and quirks; names in scripts (Dr. Patel, Jenni, Sarah) are the framework's illustrative examples, not real staff.
- Tier labels are only as good as the drafting discipline behind them. Spot-checking a few [ALCAN] claims against `data/` during expert review would be a cheap confidence booster.

## Next step

Tomorrow's job, as set up in the index: **sort the Basecamp content into `corpus-index.md`**, filing each piece under the best-fitting section, and add new shelves for whatever fits nowhere (the gap report's Section 4 proposes RSVD-8 through RSVD-14 based on where the question banks came up empty). In parallel, the capture prompts in `gap-report.md` can start going out; the NPO guidelines (Dr. Alex), the software screen recordings (Tim), and the clinical checklists pack (Ariyana) unblock the most, fastest.
