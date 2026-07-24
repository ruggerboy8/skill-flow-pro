// THE script as data. The engine computes the whole world from scroll progress
// (0..1). Each scene is a beat that lives in a room; the engine crossfades and
// dollies between rooms. Characters are placed in viewport space (x = % across,
// pose drives the placeholder). Overlay windows are GLOBAL progress and sit
// inside their scene's window. Mirrors docs/features/the-alcan-way-copy.md and
// the v2 beat list in the-alcan-way-beat-map.md.

import type { RoomId } from './stage'

export type OverlayType =
  | 'title'
  | 'scroll'
  | 'principle'
  | 'dialogue'
  | 'insight'
  | 'promove'
  | 'review'
  | 'challenge'
  | 'recap'

export interface OverlayCfg {
  id: string
  type: OverlayType
  copy: string | string[]
  window: [number, number]
  speaker?: string
}

export interface CharCfg {
  slot: string
  /** horizontal position, percent of viewport width (center anchor) */
  x: number
  /** depth scale (1 = nominal). Smaller = further back. */
  scale?: number
  pose: string
}

export interface SceneCfg {
  id: string
  beat: number
  room: RoomId
  window: [number, number]
  chars?: CharCfg[]
  overlays?: OverlayCfg[]
}

export interface ExperienceConfig {
  scrollVh: number
  scenes: SceneCfg[]
}

export const EXPERIENCE: ExperienceConfig = {
  scrollVh: 1500,
  scenes: [
    // 1 — The Arrival
    {
      id: 'arrival',
      beat: 1,
      room: 'lobby',
      window: [0.0, 0.06],
      chars: [
        { slot: 'parent', x: 50, pose: 'idle-tense' },
        { slot: 'child', x: 62, scale: 0.82, pose: 'scared' },
      ],
      overlays: [
        { id: 'title', type: 'title', copy: ['prologue.title', 'prologue.subA', 'prologue.subB'], window: [0.008, 0.05] },
        { id: 'scroll', type: 'scroll', copy: 'prologue.scroll', window: [0.0, 0.032] },
        { id: 'arrival-insight', type: 'insight', copy: 'arrival.insight', window: [0.035, 0.075] },
      ],
    },
    // 2 — The Greeting
    {
      id: 'greeting',
      beat: 2,
      room: 'lobby',
      window: [0.06, 0.15],
      chars: [
        { slot: 'frontdesk', x: 72, pose: 'standup' },
        { slot: 'parent', x: 40, pose: 'idle-tense' },
        { slot: 'child', x: 50, scale: 0.82, pose: 'idle' },
      ],
      overlays: [
        { id: 'own-card', type: 'principle', copy: ['own.title', 'own.body'], window: [0.064, 0.112] },
        { id: 'greeting-d', type: 'dialogue', copy: 'greeting.dialogue', speaker: 'Front Desk', window: [0.1, 0.15] },
        { id: 'greeting-i', type: 'insight', copy: 'greeting.insight', window: [0.122, 0.178] },
        { id: 'greeting-pm', type: 'promove', copy: 'greeting.promove', window: [0.126, 0.172] },
      ],
    },
    // 3 — Preview the Doctor
    {
      id: 'preview',
      beat: 3,
      room: 'lobby',
      window: [0.15, 0.23],
      chars: [
        { slot: 'frontdesk', x: 72, pose: 'offer' },
        { slot: 'parent', x: 40, pose: 'idle-relaxed' },
        { slot: 'child', x: 50, scale: 0.82, pose: 'idle' },
      ],
      overlays: [
        { id: 'preview-d', type: 'dialogue', copy: 'preview.dialogue', speaker: 'Front Desk', window: [0.155, 0.205] },
        { id: 'preview-i', type: 'insight', copy: 'preview.insight', window: [0.185, 0.235] },
        { id: 'preview-pm', type: 'promove', copy: 'preview.promove', window: [0.19, 0.23] },
      ],
    },
    // 4 — The Handoff
    {
      id: 'handoff',
      beat: 4,
      room: 'lobby',
      window: [0.23, 0.31],
      chars: [
        { slot: 'assistant', x: 28, pose: 'crouch' },
        { slot: 'frontdesk', x: 74, pose: 'idle' },
        { slot: 'parent', x: 46, pose: 'idle-relaxed' },
        { slot: 'child', x: 56, scale: 0.82, pose: 'idle' },
      ],
      overlays: [
        { id: 'handoff-d', type: 'dialogue', copy: 'handoff.dialogue', speaker: 'Jordan', window: [0.235, 0.285] },
        { id: 'handoff-i', type: 'insight', copy: 'handoff.insight', window: [0.265, 0.315] },
        { id: 'handoff-pm', type: 'promove', copy: 'handoff.promove', window: [0.27, 0.31] },
      ],
    },
    // 5 — The Walk Back
    {
      id: 'walkback',
      beat: 5,
      room: 'hallway',
      window: [0.31, 0.39],
      chars: [
        { slot: 'assistant', x: 34, pose: 'walk' },
        { slot: 'parent', x: 50, pose: 'walk' },
        { slot: 'child', x: 62, scale: 0.82, pose: 'scared' },
      ],
      overlays: [{ id: 'walkback-i', type: 'insight', copy: 'walkback.insight', window: [0.325, 0.385] }],
    },
    // 6 — Tell, Show, Do
    {
      id: 'tsd',
      beat: 6,
      room: 'exam',
      window: [0.39, 0.48],
      chars: [
        { slot: 'assistant', x: 38, pose: 'hold-mirror' },
        { slot: 'child', x: 56, scale: 0.82, pose: 'seated' },
        { slot: 'parent', x: 82, scale: 0.92, pose: 'seated' },
      ],
      overlays: [
        { id: 'master-card', type: 'principle', copy: ['master.title', 'master.body'], window: [0.394, 0.442] },
        { id: 'tsd-d', type: 'dialogue', copy: 'tsd.dialogue', speaker: 'Jordan', window: [0.43, 0.485] },
        { id: 'tsd-i', type: 'insight', copy: 'tsd.insight', window: [0.452, 0.51] },
        { id: 'tsd-pm1', type: 'promove', copy: 'tsd.promove1', window: [0.452, 0.48] },
        { id: 'tsd-pm2', type: 'promove', copy: 'tsd.promove2', window: [0.48, 0.512] },
      ],
    },
    // 7 — The Warm Handoff (peak)
    {
      id: 'warm',
      beat: 7,
      room: 'exam',
      window: [0.48, 0.59],
      chars: [
        { slot: 'doctor', x: 32, pose: 'greet-family' },
        { slot: 'assistant', x: 50, pose: 'present' },
        { slot: 'child', x: 64, scale: 0.82, pose: 'seated' },
        { slot: 'parent', x: 84, scale: 0.92, pose: 'seated' },
      ],
      overlays: [
        { id: 'warm-d', type: 'dialogue', copy: 'warm.dialogue', speaker: 'Jordan', window: [0.485, 0.54] },
        { id: 'warm-d2', type: 'dialogue', copy: 'warm.dialogue2', speaker: 'Dr. Patel', window: [0.542, 0.575] },
        { id: 'warm-i', type: 'insight', copy: 'warm.insight', window: [0.55, 0.605] },
        { id: 'warm-pm', type: 'promove', copy: 'warm.promove', window: [0.555, 0.6] },
      ],
    },
    // 8 — Ask Before Telling
    {
      id: 'ask',
      beat: 8,
      room: 'exam',
      window: [0.59, 0.67],
      chars: [
        { slot: 'doctor', x: 40, pose: 'turn-to-parent' },
        { slot: 'parent', x: 74, scale: 0.92, pose: 'seated' },
        { slot: 'child', x: 60, scale: 0.82, pose: 'seated' },
      ],
      overlays: [
        { id: 'ask-d', type: 'dialogue', copy: 'ask.dialogue', speaker: 'Dr. Patel', window: [0.595, 0.645] },
        { id: 'ask-i', type: 'insight', copy: 'ask.insight', window: [0.622, 0.675] },
        { id: 'ask-pm', type: 'promove', copy: 'ask.promove', window: [0.625, 0.668] },
      ],
    },
    // 9 — The Blanket
    {
      id: 'blanket',
      beat: 9,
      room: 'exam',
      window: [0.67, 0.74],
      chars: [
        { slot: 'assistant', x: 46, pose: 'comfort' },
        { slot: 'child', x: 60, scale: 0.82, pose: 'seated' },
        { slot: 'parent', x: 80, scale: 0.92, pose: 'seated-relaxed' },
      ],
      overlays: [
        { id: 'reason-card', type: 'principle', copy: ['reason.title', 'reason.body'], window: [0.672, 0.718] },
        { id: 'blanket-d', type: 'dialogue', copy: 'blanket.dialogue', speaker: 'Jordan', window: [0.7, 0.745] },
        { id: 'blanket-i', type: 'insight', copy: 'blanket.insight', window: [0.718, 0.775] },
        { id: 'blanket-pm', type: 'promove', copy: 'blanket.promove', window: [0.722, 0.768] },
      ],
    },
    // 10 — The Seam
    {
      id: 'seam',
      beat: 10,
      room: 'hallway',
      window: [0.74, 0.83],
      chars: [
        { slot: 'assistant', x: 40, pose: 'walk' },
        { slot: 'parent', x: 52, pose: 'walk' },
        { slot: 'child', x: 63, scale: 0.82, pose: 'walk' },
        { slot: 'frontdesk', x: 84, scale: 0.9, pose: 'idle' },
      ],
      overlays: [
        { id: 'seam-d', type: 'dialogue', copy: 'seam.dialogue', speaker: 'Jordan', window: [0.745, 0.79] },
        { id: 'seam-d2', type: 'dialogue', copy: 'seam.dialogue2', speaker: 'Jordan', window: [0.792, 0.822] },
        { id: 'seam-i', type: 'insight', copy: 'seam.insight', window: [0.79, 0.848] },
        { id: 'seam-pm', type: 'promove', copy: 'seam.promove', window: [0.8, 0.842] },
      ],
    },
    // 11 — The Goodbye
    {
      id: 'goodbye',
      beat: 11,
      room: 'lobby',
      window: [0.83, 0.9],
      chars: [
        { slot: 'frontdesk', x: 70, pose: 'wave' },
        { slot: 'parent', x: 44, pose: 'idle-relaxed' },
        { slot: 'child', x: 54, scale: 0.82, pose: 'waving' },
      ],
      overlays: [
        { id: 'goodbye-d', type: 'dialogue', copy: 'goodbye.dialogue', speaker: 'Maria', window: [0.835, 0.885] },
        { id: 'goodbye-i', type: 'insight', copy: 'goodbye.insight', window: [0.86, 0.915] },
        { id: 'goodbye-pm', type: 'promove', copy: 'goodbye.promove', window: [0.865, 0.908] },
      ],
    },
    // 12 — The Review
    {
      id: 'review',
      beat: 12,
      room: 'review',
      window: [0.9, 0.96],
      overlays: [
        { id: 'review-card', type: 'review', copy: 'review.text', window: [0.903, 0.952] },
        { id: 'review-i', type: 'insight', copy: 'review.insight', window: [0.93, 0.965] },
        { id: 'review-challenge', type: 'challenge', copy: 'review.challenge', window: [0.95, 0.99] },
      ],
    },
    // 13 — Send It
    {
      id: 'sendit',
      beat: 13,
      room: 'lobby',
      window: [0.96, 1.0],
      overlays: [
        { id: 'recap', type: 'recap', copy: ['recap.title', 'recap.own', 'recap.master', 'recap.reason'], window: [0.963, 1.0] },
        { id: 'sendit-c', type: 'challenge', copy: ['sendit.role', 'sendit.share'], window: [0.984, 1.0] },
      ],
    },
  ],
}

// Flattened helpers the engine and renderers consume.
export interface FlatChar extends CharCfg {
  placeId: string
  window: [number, number]
  room: RoomId
}
export const FLAT_CHARS: FlatChar[] = EXPERIENCE.scenes.flatMap((s) =>
  (s.chars ?? []).map((c, i) => ({ ...c, placeId: `${s.id}-${c.slot}-${i}`, window: s.window, room: s.room })),
)

export interface FlatOverlay extends OverlayCfg {
  room: RoomId
}
export const FLAT_OVERLAYS: FlatOverlay[] = EXPERIENCE.scenes.flatMap((s) =>
  (s.overlays ?? []).map((o) => ({ ...o, room: s.room })),
)

// Per-room list of scene windows (a room can appear more than once: out-and-back).
export const ROOM_WINDOWS: Record<string, [number, number][]> = (() => {
  const m: Record<string, [number, number][]> = {}
  for (const s of EXPERIENCE.scenes) {
    ;(m[s.room] ??= []).push(s.window)
  }
  return m
})()
