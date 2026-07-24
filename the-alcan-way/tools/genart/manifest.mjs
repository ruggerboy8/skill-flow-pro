// The asset manifest for batch image generation. Each entry becomes one
// gpt-image-1 call. `transparent: true` returns a real alpha PNG (no magenta
// trick needed). `ref` (a path, or array, under art-source/) routes the call
// through the image-edits endpoint so a character stays consistent across poses
// or an asset matches a style anchor. Add/remove entries freely; it is just data.

// Look/palette ONLY (no scene description) so isolated sprites don't get a whole
// room painted around them. Backgrounds carry their own scene wording.
export const STYLE = [
  '16-bit SNES-era pixel art, bright clean modern style.',
  'Limited palette of crisp white, bright blue (Alcan #005286), light pale blonde wood,',
  'and soft orange accents. Crisp pixels, soft flat shading, light from the upper left,',
  'simple, readable, cheerful and friendly.',
].join(' ')

// Appended to every transparent asset to force a clean cut-out sprite.
export const ISO =
  ' Shown completely ALONE on a plain empty background: no room, no walls, no floor, no scenery, no furniture around it, no other objects, no text, no drop shadow. A single clean isolated game-asset sprite, centered, simple and low-detail.'

const BG = { size: '1536x1024', transparent: false }
const PIECE = { size: '1024x1024', transparent: true }
const PROP = { size: '1024x1024', transparent: true }
const CHAR = { size: '1024x1024', transparent: true }

export const ASSETS = [
  // ---- Backgrounds (bare, flat side-on, phone-first vertical framing) ----
  {
    id: 'bg-front', group: 'bg', file: 'environment/bg-front.png', ...BG,
    prompt:
      'An EMPTY modern pediatric dental office lobby as a FLAT SIDE-ON ELEVATION (camera facing the wall straight on, like a 2D side-scroller background). No perspective, no vanishing point, floor perfectly level left to right. A crisp white wall, a bright blue (#005286) accent band along the lower wall at character-leg height, a clean white ceiling line with subtle recessed downlights, and a light pale blonde wood plank floor as a GENEROUS band filling the lower third. Completely bare: no furniture, no people, no signage, no plants. Keep the center clean (left/right edges may be cropped on a phone). Wide and horizontally tileable.',
  },
  {
    id: 'bg-hallway', group: 'bg', file: 'environment/bg-hallway.png', ...BG,
    prompt:
      'An EMPTY modern clinic hallway as a FLAT SIDE-ON ELEVATION, no perspective, floor level left to right. Same white wall + bright blue (#005286) accent band at leg height + light blonde wood floor (generous lower-third band) + clean white ceiling as the lobby, a touch simpler. Completely bare. Center clean, wide and tileable.',
  },
  {
    id: 'bg-exam', group: 'bg', file: 'environment/bg-exam.png', ...BG,
    prompt:
      'An EMPTY modern pediatric dental exam room as a FLAT SIDE-ON ELEVATION, no perspective, floor level left to right. Bright and reassuring: white walls with a bright blue (#005286) accent band at leg height, a clean white drop-ceiling with subtle recessed downlights, a light blonde wood floor as a generous lower-third band. Completely bare: no chair, no equipment, no people. Center clean, wide and tileable.',
  },

  // ---- Set pieces (transparent, isolated) ----
  { id: 'piece-desk', group: 'pieces', file: 'pieces/piece-desk.png', ...PIECE, prompt: 'A single modern reception desk, isolated and centered, side-on view: light blonde wood counter with a bright blue (#005286) front panel.' },
  { id: 'piece-bench', group: 'pieces', file: 'pieces/piece-bench.png', ...PIECE, prompt: 'A single modern waiting bench with bright orange seat cushions and a light wood frame, isolated and centered, side-on view.' },
  { id: 'piece-chairs', group: 'pieces', file: 'pieces/piece-chairs.png', ...PIECE, prompt: 'Two simple light gray modern armchairs standing side by side, clearly recognizable as comfy waiting-room chairs, front view.' },
  { id: 'piece-plant', group: 'pieces', file: 'pieces/piece-plant.png', ...PIECE, prompt: 'A single small potted green plant in a clean white modern pot, isolated and centered.' },
  { id: 'piece-playrug', group: 'pieces', file: 'pieces/piece-playrug.png', ...PIECE, prompt: 'A kids play-area rug with a few colorful soft blocks and a small teddy bear sitting on it, isolated and centered, slight top-down floor view.' },
  { id: 'piece-coffee', group: 'pieces', file: 'pieces/piece-coffee.png', ...PIECE, prompt: 'A small modern beverage and coffee station on a light wood counter, isolated and centered.' },
  { id: 'piece-sign-alcan', group: 'pieces', file: 'pieces/piece-sign-alcan.png', ...PIECE, prompt: 'A modern wall sign reading "ALCAN" with a small navy and bright-blue mountain-range logo, clean glass-style plaque, isolated and centered.' },
  { id: 'piece-wallart-fish', group: 'pieces', file: 'pieces/piece-wallart-fish.png', ...PIECE, prompt: 'A framed piece of kid-friendly wall art showing a cute smiling fish, simple modern frame, isolated and centered.' },
  { id: 'piece-window', group: 'pieces', file: 'pieces/piece-window.png', ...PIECE, prompt: 'A bright modern window with a clean white frame looking out to blue sky and a green tree, isolated and centered.' },
  { id: 'piece-schedscreen', group: 'pieces', file: 'pieces/piece-schedscreen.png', ...PIECE, prompt: 'A small modern desktop monitor showing a simple appointment calendar, isolated and centered.' },
  { id: 'piece-kiddrawings', group: 'pieces', file: 'pieces/piece-kiddrawings.png', ...PIECE, prompt: 'A small cluster of framed childrens crayon drawings arranged on a wall, isolated and centered.' },
  { id: 'piece-barndoor', group: 'pieces', file: 'pieces/piece-barndoor.png', ...PIECE, prompt: 'A modern light-wood barn door on a black sliding rail, isolated and centered, side-on view.' },
  { id: 'piece-dentalchair', group: 'pieces', file: 'pieces/piece-dentalchair.png', ...PIECE, prompt: 'A single friendly modern pediatric dental chair with light blue and teal upholstery, clean and not scary, isolated and centered, side view.' },
  { id: 'piece-examlight', group: 'pieces', file: 'pieces/piece-examlight.png', ...PIECE, prompt: 'A modern overhead dental exam light on an articulating arm, isolated and centered.' },
  { id: 'piece-monitorarm', group: 'pieces', file: 'pieces/piece-monitorarm.png', ...PIECE, prompt: 'A flat monitor on an articulating wall arm, isolated and centered.' },
  { id: 'piece-tray', group: 'pieces', file: 'pieces/piece-tray.png', ...PIECE, prompt: 'A small dental equipment tray on a cart with a few tidy instruments, isolated and centered.' },
  { id: 'piece-cornerchair', group: 'pieces', file: 'pieces/piece-cornerchair.png', ...PIECE, prompt: 'A single comfortable modern accent chair for a parent, isolated and centered, side-on view.' },
  { id: 'piece-cabinets', group: 'pieces', file: 'pieces/piece-cabinets.png', ...PIECE, prompt: 'A run of modern light blonde wood dental cabinetry with a clean white countertop, isolated and centered, side-on view.' },
  { id: 'piece-xray', group: 'pieces', file: 'pieces/piece-xray.png', ...PIECE, prompt: 'A wall-mounted screen showing a friendly cartoon tooth, isolated and centered.' },
  { id: 'piece-qr', group: 'pieces', file: 'pieces/piece-qr.png', ...PIECE, prompt: 'A small "Leave us a review" sign with a QR code on a little desk stand, isolated and centered.' },

  // ---- Handheld props ----
  { id: 'prop-cup', group: 'props', file: 'props/prop-cup.png', ...PROP, prompt: 'A single small paper beverage cup, isolated and centered.' },
  { id: 'prop-mirror', group: 'props', file: 'props/prop-mirror.png', ...PROP, prompt: 'A single tiny round dental mirror on a slim handle, isolated and centered.' },
  { id: 'prop-blanket', group: 'props', file: 'props/prop-blanket.png', ...PROP, prompt: 'A single small folded soft coral blanket, isolated and centered.' },
  { id: 'prop-tablet', group: 'props', file: 'props/prop-tablet.png', ...PROP, prompt: 'A single small tablet or clipboard showing a simple patient chart, isolated and centered.' },
  { id: 'prop-phone', group: 'props', file: 'props/prop-phone.png', ...PROP, prompt: 'A single modern smartphone, front view, upright, with a blank white screen, isolated and centered.' },

  // ---- Characters: base pose first (no ref), variants reference the base ----
  // Receptionist
  { id: 'recept-idle', group: 'recept', file: 'receptionist/recept-idle.png', ...CHAR, prompt: 'A single friendly FEMALE receptionist named Maria, a woman, full body in THREE-QUARTER view, her body and face TURNED TO THE LEFT SIDE OF THE IMAGE (looking toward the left, as if facing someone standing to the left of her), bright blue (#005286) polo, shoulder-length brown hair, warm smile, standing. COMPACT, chunky cute proportions like a cozy pixel game (NOT tall or lanky), big head relative to body. Isolated and centered.' },
  { id: 'recept-seated', group: 'recept', file: 'receptionist/recept-seated.png', ...CHAR, ref: 'receptionist/recept-idle.png', prompt: 'The SAME woman Maria from the reference (same brown hair, blue polo, compact chunky proportions), TURNED TO THE LEFT SIDE OF THE IMAGE (facing left), now seated on a simple office chair, hands resting, attentive. NO desk, NO counter, just the seated woman.' },
  { id: 'recept-standup', group: 'recept', file: 'receptionist/recept-standup.png', ...CHAR, ref: 'receptionist/recept-idle.png', prompt: 'The SAME compact woman Maria from the reference, TURNED TO THE LEFT SIDE OF THE IMAGE (facing left), now standing up and leaning slightly forward to the left, welcoming. Same hair and blue polo. Isolated and centered.' },
  { id: 'recept-offer', group: 'recept', file: 'receptionist/recept-offer.png', ...CHAR, ref: 'receptionist/recept-idle.png', prompt: 'The SAME compact woman Maria from the reference, TURNED TO THE LEFT SIDE OF THE IMAGE (facing left), now extending a small paper cup forward to the left in one hand, hospitable. Same hair and blue polo. Isolated and centered.' },
  { id: 'recept-wave', group: 'recept', file: 'receptionist/recept-wave.png', ...CHAR, ref: 'receptionist/recept-idle.png', prompt: 'The SAME compact woman Maria from the reference, TURNED TO THE LEFT SIDE OF THE IMAGE (facing left), now waving warmly with one hand raised. Same brown hair and blue polo. Isolated and centered.' },
  // Assistant (Jordan)
  { id: 'assistant-idle', group: 'assistant', file: 'assistant/assistant-idle.png', ...CHAR, prompt: 'A single friendly dental assistant named Jordan, full body, facing slightly toward the viewer, in teal and light-blue modern scrubs, hair tied back, a lanyard, standing idle. Simple cute pixel character, isolated and centered.' },
  { id: 'assistant-crouch', group: 'assistant', file: 'assistant/assistant-crouch.png', ...CHAR, ref: 'assistant/assistant-idle.png', prompt: 'The SAME assistant Jordan from the reference, now crouching down low to a childs eye level, warm. Same scrubs. Isolated and centered.' },
  { id: 'assistant-mirror', group: 'assistant', file: 'assistant/assistant-mirror.png', ...CHAR, ref: 'assistant/assistant-idle.png', prompt: 'The SAME assistant Jordan from the reference, now standing and holding up a tiny dental mirror to show it, gentle. Same scrubs. Isolated and centered.' },
  { id: 'assistant-present', group: 'assistant', file: 'assistant/assistant-present.png', ...CHAR, ref: 'assistant/assistant-idle.png', prompt: 'The SAME assistant Jordan from the reference, now standing with one open hand gesturing to the side, introducing someone. Same scrubs. Isolated and centered.' },
  { id: 'assistant-blanket', group: 'assistant', file: 'assistant/assistant-blanket.png', ...CHAR, ref: 'assistant/assistant-idle.png', prompt: 'The SAME assistant Jordan from the reference, now leaning in placing a small soft blanket, caring. Same scrubs. Isolated and centered.' },
  // Doctor (Dr. Patel)
  { id: 'doctor-idle', group: 'doctor', file: 'doctor/doctor-idle.png', ...CHAR, prompt: 'A single confident reassuring pediatric dentist, Dr. Patel, full body, facing slightly toward the viewer, in a clean white coat over a blue top, warm, standing idle. Simple cute pixel character, isolated and centered.' },
  { id: 'doctor-greet', group: 'doctor', file: 'doctor/doctor-greet.png', ...CHAR, ref: 'doctor/doctor-idle.png', prompt: 'The SAME dentist Dr. Patel from the reference, now turned to face a family with a warm slight bow of the head, greeting. Same white coat. Isolated and centered.' },
  { id: 'doctor-turn', group: 'doctor', file: 'doctor/doctor-turn.png', ...CHAR, ref: 'doctor/doctor-idle.png', prompt: 'The SAME dentist Dr. Patel from the reference, now turned slightly down toward a seated person, listening attentively (no thought bubble). Same white coat. Isolated and centered.' },

  // Parent (Jessica, a mom) — regenerated in the unified style
  { id: 'parent-idle', group: 'parent', file: 'parent/parent-idle.png', ...CHAR, prompt: 'A single young mom named Jessica, full body, facing slightly toward the viewer, casual warm clothes (a soft cardigan over a top, jeans), shoulder-length hair, gentle and calm, standing relaxed. Simple cute pixel character.' },
  { id: 'parent-tense', group: 'parent', file: 'parent/parent-tense.png', ...CHAR, ref: 'parent/parent-idle.png', prompt: 'The SAME mom Jessica from the reference (same clothes, same hair), now standing tense and a little anxious, shoulders slightly raised, arms held protectively.' },
  { id: 'parent-walk', group: 'parent', file: 'parent/parent-walk.png', ...CHAR, ref: 'parent/parent-idle.png', prompt: 'The SAME mom Jessica from the reference, now walking, mid-stride. Same clothes and hair.' },
  { id: 'parent-seated', group: 'parent', file: 'parent/parent-seated.png', ...CHAR, ref: 'parent/parent-idle.png', prompt: 'The SAME mom Jessica from the reference, now seated on a simple chair, watchful. Same clothes and hair. No desk.' },
  { id: 'parent-seated-relaxed', group: 'parent', file: 'parent/parent-seated-relaxed.png', ...CHAR, ref: 'parent/parent-idle.png', prompt: 'The SAME mom Jessica from the reference, now seated on a simple chair, relaxed and at ease, leaning back slightly. Same clothes and hair. No desk.' },

  // Child (Johnny) — regenerated in the unified style
  { id: 'child-idle', group: 'child', file: 'child/cj-idle.png', ...CHAR, prompt: 'A single cheerful 5-year-old boy named Johnny, full body, facing slightly toward the viewer, bright red t-shirt, dark hair, shorts and sneakers, small and cute, standing. Simple cute pixel character.' },
  { id: 'child-scared', group: 'child', file: 'child/cj-scared.png', ...CHAR, ref: 'child/cj-idle.png', prompt: 'The SAME boy Johnny from the reference (same red shirt, same hair), now shy and nervous, shoulders pulled in, looking worried, one hand up as if holding a grown-ups hand.' },
  { id: 'child-walk', group: 'child', file: 'child/cj-walk.png', ...CHAR, ref: 'child/cj-idle.png', prompt: 'The SAME boy Johnny from the reference, now walking, mid-stride. Same red shirt and hair.' },
  { id: 'child-seated', group: 'child', file: 'child/cj-seated.png', ...CHAR, ref: 'child/cj-idle.png', prompt: 'The SAME boy Johnny from the reference, now seated on a chair, small legs dangling. Same red shirt and hair.' },
  { id: 'child-reach', group: 'child', file: 'child/cj-reach.png', ...CHAR, ref: 'child/cj-idle.png', prompt: 'The SAME boy Johnny from the reference, now reaching one hand forward curiously to touch something. Same red shirt and hair.' },
  { id: 'child-wave', group: 'child', file: 'child/cj-wave.png', ...CHAR, ref: 'child/cj-idle.png', prompt: 'The SAME boy Johnny from the reference, now waving happily with one hand raised, big smile. Same red shirt and hair.' },
]
