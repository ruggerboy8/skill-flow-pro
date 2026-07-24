// The walk-forward stage: stacked room backdrops (placeholder perspective until
// final art drops in), the family/staff sprites placed in each room, and the
// overlay layer. The engine drives opacity + the room dolly; this file lays out
// the DOM.

import type { CSSProperties, Ref } from 'react'
import { ROOMS } from '@/content/stage'
import { CHARACTERS, ROOM_IMAGES, SPRITES } from '@/content/manifest'
import { FLAT_CHARS } from '@/content/scenes'
import Overlays from './Overlays'

const COLOR = new Map(CHARACTERS.map((c) => [c.slot, c.color]))
const LABEL = new Map(CHARACTERS.map((c) => [c.slot, c.label]))

export default function Stage({ ref }: { ref?: Ref<HTMLDivElement> }) {
  return (
    <div className="stage" ref={ref}>
      {/* Room backdrops (crossfade + dolly between them). Real art if present,
          else CSS placeholder. */}
      <div className="rooms">
        {ROOMS.map((r) => {
          const img = ROOM_IMAGES[r.id]
          return (
            <div
              className="room"
              key={r.id}
              data-room={r.id}
              style={{ ['--wall']: r.wall, ['--floor']: r.floor } as CSSProperties}
            >
              {img ? (
                <div className="room-bg" style={{ backgroundImage: `url(${img})` }} />
              ) : (
                <>
                  <div className="room-wall" />
                  <div className="room-floor" />
                  {r.id !== 'review' && <div className="room-doorway" />}
                  {r.id === 'exam' && <div className="decor-chair" />}
                </>
              )}
              {r.id === 'review' && <div className="review-phone" />}
              {r.label && !img && <div className="room-label">{r.label}</div>}
            </div>
          )
        })}
      </div>

      {/* Actors: one element per scene placement, faded by its scene window.
          Real sprite if present, else placeholder block. */}
      <div className="actors">
        {FLAT_CHARS.map((c) => {
          const sprite = SPRITES[`${c.slot}:${c.pose}`]
          return (
            <div
              className={sprite ? 'char is-sprite' : 'char'}
              key={c.placeId}
              data-place={c.placeId}
              data-char={c.slot}
              data-pose={c.pose}
              style={
                {
                  left: `${c.x}%`,
                  ['--c']: COLOR.get(c.slot) ?? '#888',
                  ['--s']: c.scale ?? 1,
                } as CSSProperties
              }
            >
              {sprite ? (
                <img className="char-sprite" src={sprite} alt="" draggable={false} />
              ) : (
                <>
                  <div className="char-body" />
                  <div className="char-label">{LABEL.get(c.slot)}</div>
                </>
              )}
            </div>
          )
        })}
      </div>

      <Overlays />
    </div>
  )
}
