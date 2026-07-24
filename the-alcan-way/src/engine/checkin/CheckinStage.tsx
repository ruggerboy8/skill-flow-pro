// DOM for the Check-In v3 slice: a bare stage background + scrim, the whisking
// set pieces and cast, and the content panels (stage card, bullets, speech
// bubble, pro-move spotlight, impact, next cue). The engine drives everything.

import type { CSSProperties, Ref } from 'react'
import { CHECKIN } from '@/content/checkin'
import { CHARACTERS, SPRITES } from '@/content/manifest'

const COLOR = new Map(CHARACTERS.map((c) => [c.slot, c.color]))

export default function CheckinStage({ ref }: { ref?: Ref<HTMLDivElement> }) {
  return (
    <div className="checkin" ref={ref}>
      {/* Bare stage background (real art if present, else placeholder) */}
      <div
        className="ck-bg"
        style={CHECKIN.bgImage ? { backgroundImage: `url(${CHECKIN.bgImage})` } : undefined}
      />
      <div className="ck-scrim" />

      {/* Whisking set pieces + cast */}
      <div className="ck-stage">
        {CHECKIN.elements.map((e) => {
          if (e.kind === 'piece') {
            if (e.sprite) {
              return (
                <img
                  className="ck-piece-img"
                  key={e.id}
                  data-el={e.id}
                  src={e.sprite}
                  alt=""
                  draggable={false}
                  style={{ width: `${e.w ?? 30}vw`, bottom: `${e.bottom ?? 11}%` } as CSSProperties}
                />
              )
            }
            return <div className={`ck-piece ck-${e.shape}`} key={e.id} data-el={e.id} />
          }
          const sprite = e.poses ? SPRITES[`${e.slot}:${e.poses[0].pose}`] : undefined
          return (
            <div
              className="ck-char"
              key={e.id}
              data-el={e.id}
              data-char={e.slot}
              data-pose={e.poses?.[0].pose}
              style={{ ['--c']: COLOR.get(e.slot ?? '') ?? '#888' } as CSSProperties}
            >
              {sprite ? (
                <CharSprite slot={e.slot!} />
              ) : (
                <>
                  <div className="ck-body" />
                  <div className="ck-label">{e.label}</div>
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* Content panels */}
      <div className="ck-panels">
        {CHECKIN.panels.map((panel) => {
          switch (panel.type) {
            case 'stagecard':
              return (
                <div key={panel.id} data-panel={panel.id} className="ck-panel ck-center">
                  <div className="ck-stagecard">
                    <span className="ck-stagecard-kicker">{panel.body}</span>
                    <span className="ck-stagecard-title">{panel.title}</span>
                  </div>
                </div>
              )
            case 'bullets':
              return (
                <div key={panel.id} data-panel={panel.id} className="ck-panel ck-lower">
                  <div className="ck-bullets">
                    <div className="ck-bullets-title">{panel.title}</div>
                    <ul>
                      {panel.lines?.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                    {panel.body && <div className="ck-bullets-note">{panel.body}</div>}
                  </div>
                </div>
              )
            case 'bubble':
              return (
                <div
                  key={panel.id}
                  data-panel={panel.id}
                  className="ck-panel ck-bubble-layer"
                  style={{ ['--anchor']: `${panel.anchorX}vw` } as CSSProperties}
                >
                  <div className="ck-bubble">
                    {panel.speaker && <span className="ck-who">{panel.speaker}</span>}
                    {panel.body}
                    <span className="ck-tail" aria-hidden="true" />
                  </div>
                </div>
              )
            case 'promove':
              return (
                <div key={panel.id} data-panel={panel.id} className="ck-panel ck-upper">
                  <div className="ck-promove">
                    <div className="ck-promove-head">
                      <span className="ck-bolt" aria-hidden="true">
                        ⚡
                      </span>
                      <span className="ck-tag">{panel.tag}</span>
                    </div>
                    <div className="ck-move">{panel.move}</div>
                    <ul className="ck-dissect">
                      {panel.lines?.map((l, i) => (
                        <li key={i}>{l}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )
            case 'frame':
              return (
                <div key={panel.id} data-panel={panel.id} className="ck-panel ck-center">
                  <div className="ck-frame">
                    <p className="ck-frame-line">{panel.body}</p>
                    {panel.sub && <p className="ck-frame-sub">{panel.sub}</p>}
                  </div>
                </div>
              )
            case 'insight':
              return (
                <div key={panel.id} data-panel={panel.id} className="ck-panel ck-insight-pos">
                  <div className="ck-insight">{panel.body}</div>
                </div>
              )
            case 'shift':
              return (
                <div key={panel.id} data-panel={panel.id} className="ck-panel ck-center">
                  <div className="ck-shift">
                    <p className="ck-shift-before">{panel.before}</p>
                    <p className="ck-shift-after">{panel.after}</p>
                  </div>
                </div>
              )
            case 'challenge':
              return (
                <div key={panel.id} data-panel={panel.id} className="ck-panel ck-center">
                  <div className="ck-challenge">{panel.body}</div>
                </div>
              )
            case 'nextcue':
              return (
                <div key={panel.id} data-panel={panel.id} className="ck-panel ck-nextcue">
                  <span>{panel.body}</span>
                  <span className="ck-arrow" aria-hidden="true">
                    →
                  </span>
                </div>
              )
          }
        })}
      </div>
    </div>
  )
}

// Sprite stack: render all poses for a slot, toggle visibility by data-pose on
// the parent so pose changes are an instant swap (no reload).
function CharSprite({ slot }: { slot: string }) {
  const poses = Object.keys(SPRITES)
    .filter((k) => k.startsWith(`${slot}:`))
    .map((k) => k.slice(slot.length + 1))
  return (
    <>
      {poses.map((pose) => (
        <img key={pose} className="ck-sprite" data-sprite-pose={pose} src={SPRITES[`${slot}:${pose}`]} alt="" draggable={false} />
      ))}
    </>
  )
}
