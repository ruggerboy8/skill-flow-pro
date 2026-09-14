# CLIP PRODUCTION ORDER — full set for the Overjet presentation

*This is the complete request. Work top to bottom; when every acceptance box checks, capture is DONE and everything goes to the polish stage. Clip 1's remaining fixes are in CLIP1-RETAKE-INSTRUCTIONS.md ("TAKE 4") — that run comes first and also produces clip 5. This doc covers the rest: the shared recipe port, seeds, and clips 2–4.*

## ⚠️ PIPELINE FIX FIRST (2026-09-02, blocking — deliverables were destroyed)

`recordings/` is Playwright's `outputDir`, and Playwright CLEARS outputDir at the start of every run — so each run deletes previously delivered clips (clip 1 take 4 was produced and then wiped by the clip 5 runs). Fix before anything else:
1. Final deliverables go to **`demo-capture/final/`** (created; clip 5 already salvaged there) — every spec's last step copies its `<name>.webm` + `<name>-taps.json` there. `recordings/` remains scratch.
2. Re-run clip 1 take 4 and deliver it to `final/`.
3. Update this doc's paths mentally: everywhere below that says `recordings/`, deliver to `final/`.

## The deliverable set (what "done" looks like)

All in `final/`, each clip as exactly two files — `<name>.webm` + `<name>-taps.json` — raw, no editing/re-encoding:

| File | Surface | Form |
|---|---|---|
| `clip1-mobile-staff-self-eval.webm` | staff weekly self-eval | mobile 780×1688 (take 4) |
| `clip2-facilitation.webm` | lead facilitation surface | desktop 2560×1440 |
| `clip3-command-center.webm` | command center → location detail | desktop 2560×1440 |
| `clip4-evaluation.webm` | quarterly evaluation + self-vs-observed | desktop 2560×1440 |
| `clip5-mobile-explore.webm` | Explore surface | mobile 780×1688 |

(The existing `03-group-domain-confidence` spec is NOT deck-bound — keep it runnable as backup footage, lowest priority.)

## 0 · Shared recipe (do once, before clips 2–4)

Port into a shared helper (e.g. `lib/capture.ts`) and consume from every spec:
- **Clock fake:** `page.clock.setFixedTime(new Date("2026-08-31T09:30:00"))` before first navigation. All seeded data must be coherent with this date (current week = Aug 31; "last quarter" ends before it).
- **Ripple + tap log init script** (as in clip 1, ripple bg `rgba(17,59,98,.35)`), taps written to `recordings/<name>-taps.json` with viewport metadata.
- **Video sizes:** mobile specs → viewport 390×844, `deviceScaleFactor 3`, `video.size { 780, 1688 }`. Desktop specs → viewport 1920×1080, `deviceScaleFactor 2`, `video.size { 2560, 1440 }`.
- **Suppressions + assertions:** PWA banner off; assert zero matches for `/late for this week/i` and `/recovered submission/i` on every clip.
- **DESKTOP CURSOR RULE (critical):** Playwright teleports the mouse by default, which reads broken on camera. Every desktop click must be preceded by an eased glide: `page.mouse.move(x, y, { steps: 25–35 })` from the previous position, then `dwell(~400)`, then click. Wrap this in the helper (`glideClick(locator)`) so no spec calls `locator.click()` raw. No scroll-flicking either — small incremental `mouse.wheel` steps.
- **Pacing:** existing dwell() discipline; ~1.2s settle on every newly-loaded screen before the first action; ~2.5s hold on each clip's final frame, then end.

## 1 · Seeds (before clips 3 and 4)

**Clip 3 seed — org breadth:** the command center must show multiple locations (4–6, all fictional — Bluebird Dental plus invented siblings) with plausible, varied domain confidence data — not uniform, not all-red/all-green. One location (Bluebird) should have a visible priority story: a couple of ProMoves flagged as low-confidence so the "ID what they're worried about, and intervene" beat has something to point at.

**Clip 4 seed — the evaluation (Johno's direction, 2026-09-02):** do NOT hand-type an evaluation, and do not require manual entry before capture. Instead:
1. Clone one real, completed evaluation from the production org into the demo org as demo-staff Jamie's delivered quarterly eval (a strong-but-honest one — believable ratings with some spread, not straight 4s).
2. **Scrub pass (blocking):** replace every identifying field — staff name/initials → Jamie E., evaluator → the demo coach persona, practice → Bluebird Dental, dates → the seeded quarter (ending before Aug 31, 2026). Then read every free-text field (comments, glows, grows) and remove/neutralize anything identifying: real staff or doctor names, patient references or clinical specifics, practice names, anything traceable. Rewrite minimally; keep the voice.
3. Also seed Jamie's Friday self-ratings across that quarter so the self-vs-observed comparison view has real data and a visible, believable gap on at least one domain (the on-screen point of the clip).
4. **Gate: post the scrubbed eval text (all free text, verbatim) for Johno's approval BEFORE capturing clip 4.**

## 2 · Clip choreography

**Clip 2 — facilitation surface** (coach login, desktop, 25–35s):
Open this week's session for the team → settle on the surface showing the opening question, the three ProMoves, and learning materials → open one move's learning material briefly → return → end on the confidence-mapping view. The story: "leads aren't coaches by trade, so the surface carries them."

**Clip 3 — command center → location detail** (admin login, desktop, 25–35s):
Open the command center → settle on the org-wide domain view (the breadth moment — multiple locations visible) → glide to and open Bluebird Dental → settle on the location detail → move deliberately past the domain summary to the priority ProMoves → end there. One continuous navigation, no backtracking.

**Clip 4 — evaluation + the delta** (coach login, desktop, 30–40s):
Open Jamie's delivered quarterly evaluation → unhurried scroll through the domain ratings (readable pace) → arrive at the self-vs-observed comparison → hold where the gap is visible → end on that frame. **The comparison IS the money shot** — compose the ending so both rating sets share the frame. Viewing only; nothing is typed or submitted on camera.

**Clip 5 — Explore** (already spec'd in CLIP1-RETAKE-INSTRUCTIONS.md, TAKE 3 section).

## 3 · Acceptance (every clip)

- [ ] Correct resolution; text crisp at 200%
- [ ] Desktop: zero cursor teleports (every movement is a glide); mobile: ripple on every tap
- [ ] `<name>-taps.json` present, count matches on-screen interactions
- [ ] No real names, patient references, pay data, or identifying free text anywhere in frame — pause the frame anywhere and check toasts/avatars/sidebars too
- [ ] No "late" advisory, no "Recovered submission" toast, no PWA banner, dates coherent with Aug 31, 2026
- [ ] ~1.2s settle after loads; ~2.5s final hold; total within the clip's time budget
- [ ] Clip 4 only: scrubbed eval text was approved by Johno before capture

## 4 · Order of operations

1. Clip 1 take 4 + clip 5 (per CLIP1-RETAKE-INSTRUCTIONS.md)
2. Shared recipe port (§0)
3. Clip 3 seed → clip 3
4. Clip 2
5. Clip 4 seed → **Johno approves scrubbed text** → clip 4
6. Post all files to `recordings/` — done; polish stage takes over from there.

Questions or blockers: flag to Johno rather than improvising around a spec item — especially anything touching the clip 4 scrub.
