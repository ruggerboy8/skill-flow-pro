# Clip 1 retake — capture-stage requirements (before polish)

*From Johno's review of take 2 (2026-09-02). Five changes to `demo-capture/`, one to the app repo. The polish stage (brand compositor: phone bezel, eased zooms, 1080p60 re-render) consumes exactly two files per clip: the `.webm` and a `clip1-taps.json` — items 3–4 produce the second one. Content, flow, and pacing of take 2 were approved; don't change the choreography.*

---

## 1 · Record at 2× output size (fixes soft text)

In `specs/01-staff-self-eval.spec.ts`, the mobile `test.use` block renders the page at deviceScaleFactor 3 but then writes the video at 390×844 — Playwright downsamples the recording to `video.size`, which is where the crispness dies. Change only the video size:

```ts
video: { mode: "on" as const, size: { width: 780, height: 1688 } },
```

Keep viewport 390×844 and deviceScaleFactor 3 as they are. (Playwright's ~25fps VP8 is fine — the polish stage renders all camera motion at 60fps; it just needs clean pixels to work with.)

## 2 · Remove the "confidence is late" advisory (fake the clock, don't touch the app)

The banner appears because the capture day (Wed Sep 2) is past the seeded week's rating window. Freeze the page clock to the Monday morning of the seeded week ("Week of Aug 31, 2026") before navigation:

```ts
await page.clock.setFixedTime(new Date("2026-08-31T09:30:00"));
await page.goto("/");
```

This also makes the header date deterministic across retakes ("MONDAY, AUG 31" instead of whatever day the capture runs). Two checks: (a) confirm the "Still open / Looks like confidence is late…" block is gone and the header date matches the seeded week; (b) if the advisory is computed server-side and survives the clock fake, fall back to re-seeding so the current week's window includes the capture date — but try the clock first, it's one line. If `setFixedTime` breaks any animation or elapsed-time logic (Date is frozen, timers still run), use `page.clock.install({ time: ... })` followed by `page.clock.resume()` instead.

Add an assertion so a retake can't silently reintroduce it:

```ts
await expect(page.getByText(/late for this week/i)).toHaveCount(0);
```

## 3 · Visible tap ripples (fixes "screens change with no cause")

Nothing in the frame shows *why* the UI changes — there's no cursor on mobile emulation. Add a ripple overlay via init script (alongside the existing PWA-banner suppression):

```ts
await page.addInitScript(() => {
  (window as any).__taps = [];
  addEventListener("pointerdown", (e: PointerEvent) => {
    (window as any).__taps.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    const r = document.createElement("div");
    r.style.cssText =
      `position:fixed;left:${e.clientX}px;top:${e.clientY}px;width:14px;height:14px;` +
      `margin:-7px 0 0 -7px;border-radius:50%;background:rgba(17,59,98,.25);` +
      `border:2px solid rgba(17,59,98,.5);pointer-events:none;z-index:2147483647;` +
      `transition:transform 450ms ease-out,opacity 450ms ease-out;`;
    document.body.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = "scale(3.2)"; r.style.opacity = "0"; });
    setTimeout(() => r.remove(), 500);
  }, true);
});
```

Ripple color is Alcan navy at low opacity — subtle, on-brand, and it doubles as the sync beacon the polish stage detects to align the tap log to video frames.

## 4 · Emit the tap log

At the end of the test (after the final dwell, before the page closes):

```ts
import { writeFileSync } from "node:fs";
// ...
const taps = await page.evaluate(() => (window as any).__taps);
writeFileSync(new URL("../recordings/clip1-taps.json", import.meta.url),
  JSON.stringify({ clip: "clip1-mobile-staff-self-eval", viewport: { w: 390, h: 844 }, taps }, null, 2));
```

Timestamps are page-relative, not video-relative — that's expected; the compositor aligns on the first ripple it sees. Coordinates in CSS pixels (390×844 space), also expected.

## 5 · Trim the dead tail

Take 2 holds the "Confidence submitted" state for ~12 seconds. After the submitted state is visible, `dwell(page, 2500)` and end the test. (The polish stage trims the head — app load and initial paint — so don't worry about the start.)

---

## App repo (one item, outside demo-capture/)

The header's PRO MOVES lockup is not the final mark — the P is off-weight and the dot dies at header size. Replace it with the production wordmark: `EduStack Sales OS/promoves-brand/promoves-design-kit/promoves-wordmark.svg` (outlined type, no font dependency; there's a `-dark` variant if a dark header ever exists). Do this before the retake so all four clips carry the real mark.

---

## Acceptance checklist for the retake

- [ ] Output ≥ 780×1688; text crisp when viewed at 200%
- [ ] No "late" advisory anywhere; header date matches the seeded week
- [ ] Every tap shows a navy ripple
- [ ] `recordings/clip1-taps.json` exists, tap count matches the on-screen taps
- [ ] ≤ ~3s of hold after "Confidence submitted"
- [ ] Header shows the production PRO MOVES wordmark
- [ ] Same choreography as take 2 otherwise (flow and pacing were approved)

---

# TAKE 3 REVIEW (2026-09-02) — three items remain + one new clip

Take 3 passed: resolution (780×1688) · late advisory gone (clock fake working) · ripples firing · taps.json correct · choreography unchanged. Remaining:

## A · Trim the tail (still ~10s)
"Confidence submitted" lands ~0:18; the clip runs to 0:28.8. After the submitted state is visible: `dwell(page, 2500)` and END the test. Nothing after that hold belongs in the take.

## B · Suppress the "Recovered submission" toast
A toast — "Recovered submission — previously pending confidence scores have been saved" — appears near the end. It's a side effect of the reset/clock setup and reads like error recovery on camera. Find its trigger (likely a pending-state flag the reset leaves behind, or the frozen clock re-validating a draft) and pre-clear it the same way the PWA banner is handled (init script or reset-clip1). Add an assertion: `await expect(page.getByText(/recovered submission/i)).toHaveCount(0);`

## C · Header wordmark — RESOLVED, new instruction (2026-09-02)
Item C as originally written was wrong: the header already renders the production master (byte-identical to the kit) — the reviewer misread the master's small-size aliasing as an old asset. The real fix now exists in the kit: a **small-build wordmark** (icon-build P: wider gap, dot r7) for renders below ~32px cap height. Replace the header asset with `promoves-wordmark-small.svg` (a `-small-dark` variant exists too); keep the master for hero/marketing sizes. Comparison render: `wm-small-compare.png` beside it in the kit. Ask Johno for the files if the kit folder isn't reachable from the app repo's environment.

## Optional polish
Ripple visibility: bump the ripple background from `rgba(17,59,98,.25)` to `rgba(17,59,98,.35)` — it reads faint on the pale wizard screens.

## NEW · clip5-mobile-explore (the new Explore surface)
Separate spec, same mobile setup as clip 1 (same viewport/scale/video size, clock fake, ripple + taps init, taps output to `recordings/clip5-taps.json`):
1. Start on home (staff login, seeded state — no reset needed; read-only flow)
2. dwell ~1200ms → tap the Explore tab
3. Scroll the ProMoves library slowly (one smooth pass, ~4–5s — use small incremental scrolls, not one jump)
4. Open one move's detail view → dwell ~2500ms → end
Target 15–20s. No submits, no state changes — this clip is re-runnable by nature. Deck placement TBD (needs a script line); capturing it now regardless — it's also web/app-store material.

## Acceptance for take 4
- [ ] ≤ ~3s after "Confidence submitted"
- [ ] No "Recovered submission" toast (assertion in place)
- [ ] Header shows the production PRO MOVES wordmark
- [ ] clip5-mobile-explore.webm + clip5-taps.json exist, 15–20s, same visual standards

---

# TAKE 4 — FINAL CAPTURE RUN (consolidated; last run before polish)

Everything outstanding in one list. When this passes, clip 1 + clip 5 go to the polish stage as-is.

## 1 · Trim the tail
After "Confidence submitted" is visible: `dwell(page, 2500)`, then end the test. Nothing else after.

## 2 · Suppress the "Recovered submission" toast
Pre-clear whatever pending state triggers it (init script or reset-clip1, same pattern as the PWA banner), and lock it with:
```ts
await expect(page.getByText(/recovered submission/i)).toHaveCount(0);
```

## 3 · Header wordmark → small build
New kit asset, readable at this absolute path:
`/Users/johnoberly/Documents/shared/edustack-sales-os/EduStack Sales OS/promoves-brand/promoves-design-kit/promoves-wordmark-small.svg`
- Copy it into the app as `/brand/promoves-wordmark-small.svg` — do NOT overwrite `/brand/promoves-wordmark.svg` (the master stays for hero/marketing sizes).
- Point the app-header component at the small build. Rule for any future surface: below ~32px cap height → small build; otherwise master. (`promoves-wordmark-small-dark.svg` exists beside it if a dark header ever ships.)

## 4 · Ripple visibility (small tweak)
Ripple background `rgba(17,59,98,.25)` → `rgba(17,59,98,.35)`. Everything else about the ripple stays.

## 5 · Capture clip 5 (Explore) in the same run
Spec as written in the TAKE 3 section above ("NEW · clip5-mobile-explore"). Same mobile setup, clock fake, ripple+taps init; outputs `recordings/clip5-mobile-explore.webm` + `recordings/clip5-taps.json`. 15–20s, read-only, no submits.

## 6 · Port the shared recipe (so clips 2–4 inherit it)
Move the shared pieces — clock fake, ripple+taps init script, taps.json writer, 2× video size, toast/banner suppressions — into a shared helper (e.g. `lib/capture.ts`) and have specs 01 and 05 consume it. Clips 2–4 (desktop, 1920×1080) then get the same treatment for free next round; their video size should be `{ width: 2560, height: 1440 }` with `deviceScaleFactor: 2` when we capture them.

## Acceptance — take 4 (both clips)
- [ ] clip1: ≤ ~3s after "Confidence submitted"; total well under 25s
- [ ] clip1: no "Recovered submission" toast (assertion in place)
- [ ] Header shows the SMALL-BUILD wordmark (dot clearly separate at header size)
- [ ] Ripples visible on every tap at .35 opacity
- [ ] clip5-mobile-explore.webm (15–20s) + clip5-taps.json exist, same standards
- [ ] Both taps.json tap counts match on-screen taps
- [ ] No "late" advisory, header date = Monday, Aug 31 (regression check)

## Handoff to polish (per approved clip)
Exactly two files, in `recordings/`: `<clip>.webm` + `<clip>-taps.json`. No editing, no trimming beyond the spec'd dwells, no re-encoding — the polish stage (brand compositor: device frame, eased zooms keyed from taps, 1080p60 re-render) takes them raw.
