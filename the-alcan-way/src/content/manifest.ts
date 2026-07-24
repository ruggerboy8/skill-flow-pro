// Asset manifest. Characters render as colored placeholder blocks until a real
// sprite exists for a given slot:pose in SPRITES; rooms render as CSS
// placeholders until a real image exists in ROOM_IMAGES. Drop art in, map it
// here, no other code changes.

import type { RoomId } from './stage'

export interface CharSlot {
  slot: string
  label: string
  color: string // placeholder color (CSS var). Ignored once a sprite exists.
}

export const CHARACTERS: CharSlot[] = [
  { slot: 'child', label: 'Johnny', color: 'var(--char-child)' },
  { slot: 'parent', label: 'Jessica', color: 'var(--char-parent)' },
  { slot: 'frontdesk', label: 'Front Desk', color: 'var(--char-frontdesk)' },
  { slot: 'assistant', label: 'Assistant', color: 'var(--char-assistant)' },
  { slot: 'doctor', label: 'Doctor', color: 'var(--char-doctor)' },
]

// Real perspective room art (served from public/). Rooms without an entry fall
// back to the CSS placeholder.
export const ROOM_IMAGES: Partial<Record<RoomId, string>> = {
  lobby: '/assets/environment/lobby.png',
  hallway: '/assets/environment/hallway1.png',
  exam: '/assets/environment/exam.png',
}

// Real sprite per `slot:pose`. Anything missing falls back to a placeholder
// block. All generated through tools/genart in the unified bright/modern style.
export const SPRITES: Record<string, string> = {
  // Parent (Jessica, mom)
  'parent:idle-relaxed': '/assets/parent/parent-idle.png',
  'parent:idle-tense': '/assets/parent/parent-tense.png',
  'parent:walk': '/assets/parent/parent-walk.png',
  'parent:seated': '/assets/parent/parent-seated.png',
  'parent:seated-relaxed': '/assets/parent/parent-seated-relaxed.png',

  // Child (Johnny)
  'child:idle': '/assets/child/cj-idle.png',
  'child:scared': '/assets/child/cj-scared.png',
  'child:walk': '/assets/child/cj-walk.png',
  'child:seated': '/assets/child/cj-seated.png',
  'child:waving': '/assets/child/cj-wave.png',

  // Front desk (receptionist)
  'frontdesk:seated': '/assets/receptionist/recept-seated.png',
  'frontdesk:standup': '/assets/receptionist/recept-standup.png',
  'frontdesk:idle': '/assets/receptionist/recept-idle.png',
  'frontdesk:offer': '/assets/receptionist/recept-offer.png',
  'frontdesk:wave': '/assets/receptionist/recept-wave.png',
}

// Preloaded before scroll is enabled (no mid-scroll pop-in).
export const IMAGE_ASSETS: string[] = [...Object.values(ROOM_IMAGES).filter(Boolean) as string[], ...Object.values(SPRITES)]
