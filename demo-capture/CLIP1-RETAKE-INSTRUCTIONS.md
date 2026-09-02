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
