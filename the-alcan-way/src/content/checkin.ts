// Check-In, v3 content build. The cast + set whisk in once; then the stage holds
// and the FIVE content elements deliver one at a time (the background dims so
// text reads); then everything whisks out. Content types are differentiated:
// frame (the parent's inner voice), bullets (table stakes), dialogue (speech
// bubble), promove (spotlight), insight (why it matters), shift (the before/after
// turn), challenge (the ask). Synthesized from the Check-In source decks.

export interface XKey {
  at: number
  /** x in viewport-width units (vw). Negative or >100 = off-screen. For scrim, x = opacity. */
  x: number
}
export interface PoseKey {
  at: number
  pose: string
}

export interface ElementCfg {
  id: string
  kind: 'piece' | 'char'
  slot?: string
  label?: string
  shape?: 'desk' | 'chairs' | 'plant' | 'toys' | 'sign'
  sprite?: string
  w?: number // set-piece width in vw
  bottom?: number // bottom anchor in %
  x: XKey[]
  poses?: PoseKey[]
  scale?: number
  spotlight?: boolean
}

export type PanelType =
  | 'stagecard'
  | 'frame'
  | 'bullets'
  | 'bubble'
  | 'promove'
  | 'insight'
  | 'shift'
  | 'challenge'
  | 'nextcue'

export interface PanelCfg {
  id: string
  type: PanelType
  window: [number, number]
  title?: string
  body?: string
  sub?: string // frame subtext
  before?: string // shift: the braced thought
  after?: string // shift: the resolved thought
  speaker?: string
  lines?: string[]
  anchorX?: number
  tag?: string
  move?: string
}

export interface CheckinConfig {
  scrollVh: number
  bgImage?: string
  scrim: XKey[]
  spotlightWindow: [number, number]
  spotlightSlot: string
  elements: ElementCfg[]
  panels: PanelCfg[]
}

export const CHECKIN: CheckinConfig = {
  scrollVh: 950,
  bgImage: '/assets/environment/bg-front.png',

  // One whisk-in, one long content hold (bg dimmed), one whisk-out.
  scrim: [
    { at: 0.0, x: 0.06 },
    { at: 0.06, x: 0.06 },
    { at: 0.12, x: 0.52 },
    { at: 0.86, x: 0.52 },
    { at: 0.92, x: 0.08 },
    { at: 1.0, x: 0.06 },
  ],

  spotlightWindow: [0.49, 0.6],
  spotlightSlot: 'frontdesk',

  elements: [
    {
      id: 'window',
      kind: 'piece',
      sprite: '/assets/pieces/piece-window.png',
      w: 26,
      bottom: 42,
      x: [
        { at: 0.05, x: -32 },
        { at: 0.12, x: 21 },
        { at: 0.92, x: 21 },
        { at: 1.0, x: -36 },
      ],
    },
    {
      id: 'sign',
      kind: 'piece',
      sprite: '/assets/pieces/piece-sign-alcan.png',
      w: 22,
      bottom: 52,
      x: [
        { at: 0.05, x: 132 },
        { at: 0.12, x: 80 },
        { at: 0.92, x: 80 },
        { at: 1.0, x: 134 },
      ],
    },
    {
      id: 'plant',
      kind: 'piece',
      sprite: '/assets/pieces/piece-plant.png',
      w: 12,
      bottom: 9,
      x: [
        { at: 0.05, x: 126 },
        { at: 0.12, x: 92 },
        { at: 0.92, x: 92 },
        { at: 1.0, x: 126 },
      ],
    },
    {
      id: 'bench',
      kind: 'piece',
      sprite: '/assets/pieces/piece-bench.png',
      w: 30,
      bottom: 9,
      x: [
        { at: 0.05, x: -34 },
        { at: 0.12, x: 11 },
        { at: 0.92, x: 11 },
        { at: 1.0, x: -38 },
      ],
    },
    {
      id: 'playrug',
      kind: 'piece',
      sprite: '/assets/pieces/piece-playrug.png',
      w: 22,
      bottom: 6,
      x: [
        { at: 0.06, x: -38 },
        { at: 0.13, x: 28 },
        { at: 0.92, x: 28 },
        { at: 1.0, x: -42 },
      ],
    },
    // Receptionist (lit actor), then the desk in front of her.
    {
      id: 'frontdesk',
      kind: 'char',
      slot: 'frontdesk',
      label: 'Maria',
      spotlight: true,
      x: [
        { at: 0.05, x: 124 },
        { at: 0.12, x: 73 },
        { at: 0.93, x: 73 },
        { at: 1.0, x: 124 },
      ],
      poses: [
        { at: 0.0, pose: 'seated' },
        { at: 0.35, pose: 'standup' },
        { at: 0.42, pose: 'idle' },
        { at: 0.6, pose: 'offer' },
        { at: 0.74, pose: 'idle' },
      ],
    },
    {
      id: 'desk',
      kind: 'piece',
      sprite: '/assets/pieces/piece-desk.png',
      w: 44,
      bottom: 7,
      x: [
        { at: 0.05, x: 124 },
        { at: 0.12, x: 73 },
        { at: 0.93, x: 73 },
        { at: 1.0, x: 124 },
      ],
    },
    // The family, foreground (arrive braced).
    {
      id: 'parent',
      kind: 'char',
      slot: 'parent',
      label: 'Jessica',
      x: [
        { at: 0.06, x: -24 },
        { at: 0.13, x: 32 },
        { at: 0.93, x: 32 },
        { at: 1.0, x: -28 },
      ],
      poses: [
        { at: 0.0, pose: 'idle-tense' },
        { at: 0.66, pose: 'idle-relaxed' },
      ],
    },
    {
      id: 'child',
      kind: 'char',
      slot: 'child',
      label: 'Johnny',
      x: [
        { at: 0.07, x: -30 },
        { at: 0.14, x: 42 },
        { at: 0.93, x: 42 },
        { at: 1.0, x: -32 },
      ],
      poses: [
        { at: 0.0, pose: 'scared' },
        { at: 0.66, pose: 'idle' },
      ],
    },
  ],

  panels: [
    { id: 'stagecard', type: 'stagecard', window: [0.0, 0.05], title: 'Check-In', body: 'Stage 1 of 5' },

    // 1 — The brace (frame: the parent's inner voice)
    {
      id: 'brace',
      type: 'frame',
      window: [0.14, 0.22],
      body: 'I hope this goes okay.',
      sub: 'Every parent. Every visit. Before they have said a word.',
    },

    // 2 — What check-in involves (table stakes)
    {
      id: 'involves',
      type: 'bullets',
      window: [0.24, 0.35],
      title: 'What check-in really involves',
      lines: [
        'Confirm — who they are, insurance, forms, history',
        'Welcome — a drink, the play area, a place that feels theirs',
        'Preview — the doctor, by name, with something real',
      ],
      body: 'The paperwork has to happen. It is not what they will remember.',
    },

    // 3 — Stand up (dialogue + the Pro Move)
    {
      id: 'greeting',
      type: 'bubble',
      window: [0.38, 0.47],
      speaker: 'Maria',
      body: 'Welcome in, Jessica! And this must be Johnny.',
      anchorX: 73,
    },
    {
      id: 'standup-promove',
      type: 'promove',
      window: [0.49, 0.6],
      tag: 'Own the First Moment',
      move: 'I always stand up and greet every patient and their guardian with a smile.',
      lines: ['She stood up.', 'She used their names.', 'Before a single form.'],
    },

    // 4 — The 15-second trust builder (dialogue + insight)
    {
      id: 'preview',
      type: 'bubble',
      window: [0.62, 0.71],
      speaker: 'Maria',
      body: 'You will be seeing Dr. Patel today. She did her residency at a children’s hospital, and she is wonderful with nervous kids.',
      anchorX: 73,
    },
    {
      id: 'exhaled',
      type: 'insight',
      window: [0.72, 0.8],
      body: 'The parent just exhaled. You gave them a reason to trust someone they have not even met yet.',
    },

    // 5 — The shift + the tone (frame-shift + challenge)
    {
      id: 'shift',
      type: 'shift',
      window: [0.81, 0.88],
      before: 'I hope this goes okay.',
      after: 'These people have us.',
    },
    {
      id: 'tone',
      type: 'challenge',
      window: [0.89, 0.98],
      body: 'Own the First Moment. You set the tone. Did the last family that walked in feel expected, or processed?',
    },
  ],
}
