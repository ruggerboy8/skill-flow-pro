> **Archived 2026-08-19 (DOC-5).** This is a historical record, accurate about the past, and is not a description of how the system works today. Do not treat it as current. For the present state see docs/README.md.

# The Alcan Way — Art Generation Prompts (v3)

*Updated 2026-06-25. v3 supersedes v2. Two changes: (1) the look is now **bright
and modern** (white walls, bright blue accents, light blonde wood, orange seating
pops, lots of daylight), matching the real Alcan / Kids Tooth Team offices, NOT
the old warm cozy wood look. (2) The staging is **minimal-theater**: a few BARE
side-on backgrounds, and everything else is a **set piece or prop that whisks in
and out**. So this doc is mostly a prop checklist. The child sprite remains the
style anchor for proportions and outline; the palette brightens.*

This file is for Johno. Generate, clean up in Canva (delete the magenta), export
the PNG into `the-alcan-way/art-source/<group>/`.

---

## How to use this file

1. **Two kinds of art:** **backgrounds** (flat side-on, opaque, tileable) and
   **set pieces / props / characters** (transparent PNGs that sit on top).
2. **Keyable background for props:** every prop/character prompt asks for a solid
   **magenta (#FF00FF)** background so you can delete it cleanly for transparency.
   Backgrounds are full scenes, no magenta.
3. **Match the look:** paste the Master Style Block at the top of every prompt.
4. **Sizes** (native pixel-art; the browser scales up crisply):
   - Backgrounds: wide + horizontally tileable, ~**1536 × 768** (2:1).
   - Characters: child **40×60**, adults **~50×78**.
   - Large set pieces (desk, dental chair, bench): ~**80–160 px** wide.
   - Small props (cup, mirror, blanket): ~**12–48 px**.

---

## Master Style Block (paste at the top of EVERY prompt)

```
16-bit SNES-era pixel art, BRIGHT, CLEAN, and MODERN (not warm, rustic, or wood-
cabin). The look of a bright modern pediatric dental office: crisp white surfaces,
bright blue accents (Alcan blue #005286), light pale blonde wood, soft orange pops,
small green plants, lots of natural daylight, cheerful and airy. Clean limited
palette, crisp pixels, soft flat shading, consistent light from upper left.
```

---

## 1. Backgrounds (bare, flat side-on, tileable)

Each is an EMPTY shell. Set pieces get placed on top. Drawn as a flat side-on
elevation (camera facing the wall straight on, like a 2D side-scroller), floor
perfectly level, left and right edges matching so it tiles when scrolled.

> With minimal-theater we need only a few. The set pieces tell you *where* you
> are, so the backgrounds can be close cousins.

> ### ⚠️ PHONE-FIRST FRAMING (the rule that matters most)
> The experience is viewed on a **phone in portrait**. On screen we only ever see
> a **tall, narrow vertical slice of the center** of the image (the left/right
> edges get cropped away). So:
> - **Compose the vertical proportions for a tall phone**, not the wide shot.
>   In the portrait view we want: **floor ≈ the lower 25-30%**, the **blue accent
>   band just above the floor at character-leg height**, and the **white wall
>   filling the upper ~60%** as the content canvas. The floor must be a generous
>   band, NOT a thin strip (a thin strip disappears on a tall screen).
> - **Keep the center clean and the key elements centered.** Anything near the
>   left/right edges (columns, etc.) is cropped on a phone, so don't rely on it.
> - Still draw it **wide and tileable** for the gentle horizontal drift, but the
>   *vertical* layout is what has to read on a phone. Aspect ~2:1 is fine; just
>   get the floor/band/wall heights right for the portrait crop.

### 1.1 `bg-front.png` — front of house (lobby + checkout)

```
[MASTER STYLE BLOCK]

An EMPTY modern pediatric dental office lobby, FLAT SIDE-ON ELEVATION, no
perspective, no vanishing point, floor perfectly level left to right. A crisp
WHITE upper wall with a bright blue (#005286) accent band along the lower wall, a
clean white ceiling line with a hint of recessed downlights at the top, and a
light pale blonde wood plank floor. Bright, open, daylit. COMPLETELY BARE: no
furniture, no desk, no people, no signs, no plants, no windows. PHONE-FIRST
FRAMING: the floor fills the lower ~28% as a generous wood band, the blue accent
band sits just above it at character-leg height, the white wall fills the upper
~60% as a clean content canvas. Keep the center clean (edges get cropped on a
phone). Wide and tileable horizontally.
```

### 1.2 `bg-hallway.png` — hallway

```
[MASTER STYLE BLOCK]

An EMPTY modern clinic hallway, FLAT SIDE-ON ELEVATION, no perspective, floor
level left to right. Same white wall + bright blue (#005286) accent band + light
blonde wood floor + clean white ceiling as the lobby, but a touch simpler. BARE:
no art, no doors, no people. Eye-level, tight framing, floor in the lower third,
edges matching for horizontal tiling.
```

### 1.3 `bg-exam.png` — clinical / exam bay

```
[MASTER STYLE BLOCK]

An EMPTY modern pediatric dental exam room, FLAT SIDE-ON ELEVATION, no
perspective, floor level left to right. Bright and reassuring: white walls with a
bright blue (#005286) accent band, a clean white drop-ceiling with recessed
downlights, light blonde wood floor. BARE: no chair, no equipment, no cabinets, no
people. Eye-level, tight framing, floor in the lower third, edges matching for
horizontal tiling.
```

---

## 2. Set pieces (transparent PNGs that whisk in)

Paste the Master Style Block, then "on a solid magenta #FF00FF background," then
the line below. Export to `art-source/pieces/`.

### 2a. Front of house (Check-In + Checkout)

| File | What it is | ~size |
|---|---|---|
| `piece-desk.png` | A modern reception desk: light blonde wood counter with a bright blue (#005286) front panel | 150×180 |
| `piece-bench.png` | A modern waiting bench with **orange** cushions, light wood frame | 160×120 |
| `piece-chairs.png` | A pair of light gray modern waiting chairs with a small side table | 150×120 |
| `piece-plant.png` | A small potted green plant, modern white pot | 48×90 |
| `piece-playrug.png` | A soft play-area rug with a few colorful soft blocks and a teddy bear | 130×70 |
| `piece-coffee.png` | A small beverage / coffee station on a light wood counter | 90×80 |
| `piece-sign-alcan.png` | An "ALCAN" wall sign / plaque with the navy + blue mountain logo, modern glass-style | 120×80 |
| `piece-wallart-fish.png` | A framed kid-friendly wall art piece (e.g. a cute fish, like the real offices) | 60×70 |
| `piece-window.png` | A bright modern window looking outside (blue sky, a tree), clean white frame | 130×150 |
| `piece-schedscreen.png` | A small scheduling monitor on the desk (checkout) | 60×50 |

### 2b. Hallway

| File | What it is | ~size |
|---|---|---|
| `piece-kiddrawings.png` | A cluster of framed children's crayon drawings on the wall | 110×80 |
| `piece-barndoor.png` | A modern **light wood barn door** on a black rail (the way to the back) | 130×190 |
| `piece-bench-hall.png` | A simple modern bench | 110×70 |
| (reuse `piece-window`, `piece-sign-alcan`) | | |

### 2c. Exam room

| File | What it is | ~size |
|---|---|---|
| `piece-dentalchair.png` | A friendly **modern pediatric dental chair**, light blue/teal upholstery, clean and not scary. THE hero set piece | 170×150 |
| `piece-examlight.png` | A modern overhead exam light on an arm | 90×70 |
| `piece-monitorarm.png` | A monitor on an articulating arm | 70×80 |
| `piece-tray.png` | A small equipment tray / cart with a few tidy instruments | 70×80 |
| `piece-cornerchair.png` | A comfortable corner chair for the parent | 90×110 |
| `piece-cabinets.png` | Light blonde wood modern dental cabinetry with a counter | 160×120 |
| `piece-xray.png` | A wall-mounted x-ray / screen showing a friendly tooth image | 70×70 |
| (reuse `piece-barndoor`, `piece-wallart-fish`) | | |

### 2d. Misc

| File | What it is | ~size |
|---|---|---|
| `piece-qr.png` | A small "Leave us a review!" sign with a QR code, on a little stand at the desk | 60×80 |

---

## 3. Handheld props (small, attach to a character)

Generate together in a row on magenta, cut apart in Canva. Export to
`art-source/props/`.

| File | What it is | ~size |
|---|---|---|
| `prop-cup.png` | A small paper beverage cup | 14×18 |
| `prop-mirror.png` | A tiny round dental mirror on a slim handle | 12×18 |
| `prop-blanket.png` | A small folded soft blanket (a warm pop, e.g. coral) | 26×16 |
| `prop-tablet.png` | A small tablet / clipboard (the assistant's chart for the warm handoff) | 16×20 |
| `prop-phone.png` | A modern smartphone, front view, BLANK white screen (the review shows as text on top) | 60×110 |

```
[MASTER STYLE BLOCK]

A row of small pixel-art objects on a solid magenta #FF00FF background, clearly
separated: a small paper beverage cup; a tiny round dental mirror on a slim
handle; a small folded soft coral blanket; a small tablet/clipboard; a modern
smartphone with a blank white screen. Objects only, no scene, same clean modern
style.
```

---

## 4. Characters (recap)

Transparent PNGs, one pose per file (or a row), export to `art-source/<slot>/`.
Match the child's outline/proportions; brighten palettes to fit the modern set.

| Slot | Status | Poses needed |
|---|---|---|
| **Child (Johnny)** | done (40×60) | idle, 4× walk, seated, touch-reach, waving, scared-hiding |
| **Parent (Jessica)** | done (64×80) — reads as a dad; regen as mom or adjust copy; brighten slightly | idle-tense, idle-relaxed, walk×2, seated, seated-relaxed |
| **Receptionist** | **needed (priority)** | seated, standing-up, idle, offering-a-cup, waving |
| **Assistant (Jordan)** | needed | idle, walk×2, crouch, holding-mirror, presenting, placing-blanket |
| **Doctor (Dr. Patel)** | needed | entering×2, idle, greeting-family, turning-to-parent |

```
[MASTER STYLE BLOCK, single character, magenta background]

A 16-bit pixel-art [ROLE] in a bright modern pediatric dental office, [WARDROBE].
Same proportions and outline weight as the reference child. Full body, facing
slightly toward the viewer. Generate these poses (same person each time): [POSES].
Solid magenta #FF00FF background.
```

Wardrobe notes: **Receptionist** = bright blue (#005286) polo or modern scrub top.
**Assistant (Jordan)** = teal or light-blue modern scrubs. **Doctor (Dr. Patel)** =
clean white coat over a blue top. Keep them bright and modern, not muted.

---

## 5. Generation priority + tips

**To finish the Check-In slice first** (so we can lock the model on real art):
1. `bg-front.png` (bare lobby)
2. `piece-desk.png`, `piece-bench.png` (orange), `piece-plant.png`, `piece-playrug.png`, `piece-sign-alcan.png`
3. **Receptionist** sprite (the lit actor in the Pro Move beat) + `prop-cup.png`

Then work outward: exam (`bg-exam`, `piece-dentalchair`, assistant, doctor), then
hallway, then checkout/review props.

**Tips:**
- Lock one background + one set piece you love, then match everything to them
  (palette, outline, light). Feed them to the generator as references.
- Bright and clean beats detailed. Consistency is what makes it look intentional.
- Rough is fine; placeholders and finals drop into the same slots with no code
  change.
