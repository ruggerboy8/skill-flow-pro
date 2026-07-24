# The Alcan Way — Walk-Forward Journey & Environment Art Spec

*Created 2026-06-25. This supersedes the environment portions of
`the-alcan-way-build-plan.md` (section 4 single-stage model, section 10b zones)
and `the-alcan-way-art-prompts.md` (section 2 environments). Characters, props,
copy, and everything else in those docs still stand. We are switching the world
from a flat side-scroll to a **perspective walk-forward** experience, because the
perspective room art looks better and is what the image generators produce
naturally.*

---

## 1. The core idea: you walk forward, not sideways

Instead of panning across a flat strip of office, the user **walks forward
through a sequence of rooms**, the way you actually move through a building. Each
room is a perspective "shot." You move toward a doorway at the back of the room;
the camera dollies toward it; it fills the frame; we crossfade; and you are now
standing in the next space, looking forward again.

The grammar of the whole experience is therefore a **chain of doorways**:

```
[Lobby] --door--> [Hallway 1] --door--> [Exam Room] --door--> [Hallway 2] --door--> [Checkout] --door--> [Exit]
```

The hallways are the connective tissue (the literal in-between spaces). Their
perspective, which pulls your eye toward the far end, is exactly what sells
"walking deeper into the building."

This is a soft departure from the PRD's literal "continuous horizontal
side-scroller," but it preserves the PRD's real intent: one unbroken, continuous
journey that never hard-cuts. It arguably strengthens it, because moving *into*
spaces feels more like being there than sliding *past* them.

---

## 2. The connection rules (non-negotiable)

These are what make six separately-generated images feel like one building.
**Every room image must obey all of these.** If one breaks them, the crossfades
will jar.

1. **Same canvas, same aspect.** Every room is portrait, the same pixel
   dimensions and the same aspect ratio (recommend **4:5**, e.g. 832 x 1040).
2. **Same eye level / horizon line.** The horizon (where the back wall meets, the
   viewer's eye height) sits at the **same height in every frame: about 45% down
   from the top.** This is the single most important rule. If the horizon jumps
   between rooms, the building feels broken.
3. **One-point perspective, vanishing point near center.** Each room looks
   straight down its length with the vanishing point near the **horizontal
   center**. Floor planks and ceiling lines converge to that point. This makes
   the dolly-forward and crossfade feel natural and consistent.
4. **One material palette across all rooms.** Same honey-wood plank floor, same
   cream walls, same chocolate-brown wood trim/door frames, same soft daylight.
   The exam room is the only one that shifts wall color (to cool mint) — but it
   keeps the same floor, trim, and lighting so it still belongs.
5. **A brown-trimmed doorway on the forward wall.** Every room has a clearly
   visible doorway or open passage on the wall you are walking toward, in the
   recurring brown-wood-trim style. That doorway is the hinge of the transition:
   you walk to it, it becomes the next space. (The current lobby image does NOT
   have this yet — see 4.1.)
6. **Consistent lighting direction.** Soft natural daylight, windows as the
   source, shadows falling the same way. Don't let one room be lit from the left
   and the next from the right.
7. **No characters in room art.** People are sprites composited on top. Rooms are
   empty stages.

> **Mental model for generating:** picture a real one-storey clinic. You stand at
> the door of each room at the same height, looking straight in. There is always
> a way onward visible ahead of you. Same floor underfoot, same trim, same light,
> the whole way through.

---

## 3. The journey, shot by shot

For each shot: where the camera is, who is in it, where the family moves, and
where the **forward doorway** (the exit to the next space) sits. Family movement
is described relative to the camera ("toward camera" = downstage/bigger; "away"
= upstage/smaller, toward the doorway).

| # | Shot | Camera looks at | Forward doorway (exit) | Family movement |
|---|---|---|---|---|
| 0 | **Arrival** | The lobby, from just inside the entrance | (n/a — we're entering) | Parent + child enter from foreground (near camera), approach the desk |
| 1 | **Lobby / Check-in** | Reception desk (right), windows (left) | Back wall, **left of the desk** → into Hallway 1 | Family pauses at desk facing right; after handoff they turn and head toward the back-left doorway |
| 2 | **Hallway 1** | Straight down the corridor | **Far end** of the hall → Exam Room | Family + assistant walk forward (away), shrinking toward the far doorway |
| 3 | **Exam Room** | The dental chair, center frame | Back-right opening → Hallway 2 | Family enters from the doorway; child to the chair (center), parent to a corner |
| 4 | **Hallway 2** | A shorter corridor back toward the front | **Far end** → Checkout | Family + assistant walk forward |
| 5 | **Checkout** | Reception desk again (warm) | The **front exit door** (where they leave) | Family at desk, then walk toward the exit door and out |
| 6 | **Review / Epilogue** | A phone (review), then the empty lit office | (n/a) | No family — they've gone |

### Why each doorway is where it is

- **Lobby → Hallway 1:** staff come from "the back," so the lobby's onward
  passage is a hallway opening behind/left of the desk. We need to add this to
  the lobby art (the current image is a sealed room).
- **Hallway 1 → Exam:** the exam room is entered at the **end** of hallway 1.
  Your current hallway image has a bright opening on the right and a door on the
  left — we'll designate the **far/right opening as the exam-room entrance**, and
  the left door as a closed "other op" door (set dressing).
- **Exam → Hallway 2 → Checkout:** the return trip. Hallway 2 is shorter and
  warms back toward lobby tones, landing at the checkout desk, which faces the
  **front exit door** the family walks out through.

---

## 4. Revised environment art prompts

Paste this **Master Perspective Block** at the top of every room prompt, then add
the room-specific block under it. It replaces the flat-elevation block from the
old art-prompts doc.

### Master Perspective Block

```
16-bit SNES-era pixel art interior, warm and cozy, NOT clinical. ONE-POINT
PERSPECTIVE looking straight down the length of the room. Vanishing point near
the HORIZONTAL CENTER. Eye level / horizon line at about 45% DOWN FROM THE TOP of
the image (keep this consistent). Portrait 4:5 framing.

Consistent materials in EVERY room: honey-colored wood plank floor with planks
converging to the vanishing point; cream walls (#F5E9D0); chocolate-brown wood
trim, baseboards, and door frames (#6B4A2F); soft natural daylight from windows;
gentle consistent shading; clean limited palette; crisp pixels.

Alcan brand accents only on signage and the reception desk: navy #113B62 and
blue #005286.

A clearly visible brown-wood-trimmed DOORWAY or open passage on the far wall,
showing the way onward. NO people, NO characters. Empty room.
```

### 4.1 Lobby / Check-in — `lobby.png`

> Your current lobby is excellent and close. The one change for connection: it
> needs a **visible hallway doorway on the back wall, to the left of the
> reception desk**, leading deeper into the clinic. Regenerate with that added.

```
[MASTER PERSPECTIVE BLOCK]

A dental office LOBBY / reception. On the RIGHT, a reception desk with a blue
(#005286) front panel receding toward the back, a coffee/beverage station and an
"ALCAN" glass sign with a navy mountain logo on the wall above it. On the LEFT, a
large window wall showing trees and blue sky, with cozy waiting chairs, a side
table, and leafy plants. A small kids' play corner with soft blocks and a teddy
bear. On the BACK wall, LEFT of the reception desk, an open brown-trimmed HALLWAY
DOORWAY leading deeper into the clinic (this is the way onward). Warm honey wood
floor. Cream walls. Warm, welcoming.
```

### 4.2 Hallway 1 (lobby → exam) — `hallway1.png`

> Your current hallway image is close. Designate the **far end / right opening as
> the EXAM ROOM entrance** (a brighter, cooler-lit doorway), and keep the left
> door closed as set dressing. Kid drawings + a framed Alcan mountain logo stay.

```
[MASTER PERSPECTIVE BLOCK]

A clinic HALLWAY connecting the lobby (behind the viewer) to the exam room
(ahead). Corridor running straight forward to the vanishing point. On the LEFT
wall: a closed brown door and framed children's crayon drawings. On the RIGHT
wall: framed art including a small Alcan mountain-range logo. A window partway
down showing trees and sky. At the FAR END, a brighter, slightly COOL-LIT open
DOORWAY into the exam room (the way onward). A small wooden bench against one
wall. Warm honey wood floor, cream walls, brown trim.
```

### 4.3 Exam Room — `exam.png`

```
[MASTER PERSPECTIVE BLOCK]

A child-friendly dental EXAM ROOM, calm and reassuring, NOT sterile. Walls in
soft COOL MINT / pale blue (this room only) but the SAME honey wood floor and
brown trim as the rest of the clinic. A friendly modern dental chair in the
CENTER of the frame, facing slightly toward the viewer, with a gentle overhead
exam light above it. A small equipment tray to one side. A comfortable chair in a
corner for a parent. A small window with soft light. On the BACK-RIGHT wall, an
open brown-trimmed DOORWAY leading back out to a hallway (the way onward). Tidy,
warm, welcoming.
```

### 4.4 Hallway 2 (exam → checkout) — `hallway2.png`

```
[MASTER PERSPECTIVE BLOCK]

A SHORT clinic HALLWAY leading back toward the front of the office. Corridor
running forward to the vanishing point, warming from cool tones back toward cozy
cream-and-honey lobby tones. Simple framed wall art. At the FAR END, an open
brown-trimmed DOORWAY into the checkout area (the way onward). Warm honey wood
floor, cream walls, brown trim. Calm and simple.
```

### 4.5 Checkout — `checkout.png`

```
[MASTER PERSPECTIVE BLOCK]

A dental office CHECKOUT / front-desk area, warm and welcoming like the lobby
(can echo the lobby's palette). A reception/checkout counter with a blue
(#005286) front panel and a small scheduling screen, an "ALCAN" sign with a navy
mountain logo on the wall behind. To one side, the FRONT EXIT DOOR: a
brown-trimmed glass door showing daylight outside (the way the family leaves).
Warm honey wood floor, cream walls, plants. Inviting.
```

### 4.6 (Optional) Arrival exterior — `exterior.png`

```
[MASTER PERSPECTIVE BLOCK overridden: this one is an EXTERIOR]

16-bit SNES-era pixel art EXTERIOR of a friendly small dental clinic, daytime,
warm and inviting. A welcoming entrance with a brown-trimmed glass door and an
"ALCAN DENTAL" sign with a navy (#113B62) and blue (#005286) mountain-range logo.
Soft landscaping, a tree, blue sky. The door is the focal point, centered,
inviting you in. Clean limited palette, crisp pixels.
```

---

## 5. Character staging in perspective

- **Characters are sprites composited onto the room**, scaled by depth: a
  character "near the camera" is rendered larger; one "deeper in the room" is
  smaller. We place them on the floor plane using per-room marks.
- **Facing:** during interactions (check-in, the handoff, the exam) characters
  face each other or the camera. Your existing front/side child sprites are
  perfect for this. Staff sprites should be drawn the same way (facing toward the
  camera / three-quarter).
- **Transitions without back-view sprites (recommended):** when moving to the
  next room, we do NOT need to draw characters walking away from camera. Instead,
  the family pauses, the camera dollies toward the doorway while the characters
  gently fade, and we crossfade into the next room where they reappear
  (front/side facing) near the new doorway. **This keeps the sprite set you're
  already making sufficient** — no extra "back of head" walking frames required.
  (If we later want the extra realism of characters shrinking into the doorway,
  that's a back-view walk cycle per character — a nice-to-have, not now.)
- Depth scaling + a soft contact shadow under each sprite is what will sell
  "they're standing in the room" rather than "pasted on top."

---

## 6. What changes in the build, and what doesn't

- **Survives unchanged:** the data-driven scene model (`scenes.ts` keyframes +
  overlay windows), all copy, all character/prop sprites, the Lenis+GSAP scroll
  spine, accessibility, and the deploy plan.
- **Changes:** the stage renderer. Instead of one long horizontal strip with
  three sliding parallax layers, each scene renders a **room backdrop** with the
  family/staff sprites positioned in room-space, and transitions become
  **dolly-forward + crossfade** between room backdrops (a subtle scale-up of the
  outgoing room toward its doorway, cross-dissolving to the incoming room). Light
  parallax can still come from layering a foreground element or a slow push-in.

---

## 7. Open choices (your call, not blockers)

1. **Aspect ratio:** I recommend **4:5 portrait** (matches your generated images,
   good for phones). Confirm and lock it so every room matches.
2. **Arrival shot:** do we open on an **exterior** establishing shot (4.6) or
   open already inside the lobby entrance? Either works; exterior gives a nicer
   "we've arrived" beat.
3. **Checkout reuse:** is checkout a **distinct image** (4.5) or do we reuse the
   lobby and just stage the goodbye there? Distinct reads better; reuse saves an
   asset.
4. **Doorway-into-room realism later:** ship with the fade-through transition
   (no back-view sprites), and revisit characters-walking-into-doorways as a
   polish pass only if we want it.
```
