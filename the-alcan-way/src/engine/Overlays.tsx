// Renders all text overlays from config into the DOM (opacity driven by the
// engine). Real selectable text is the accessibility backbone.

import { FLAT_OVERLAYS } from '@/content/scenes'
import { COPY } from '@/content/copy'

function lines(copy: string | string[]): string[] {
  return (Array.isArray(copy) ? copy : [copy]).map((k) => COPY[k] ?? k)
}

export default function Overlays() {
  return (
    <div className="overlays">
      {FLAT_OVERLAYS.map((o) => {
        const ls = lines(o.copy)
        switch (o.type) {
          case 'title':
            return (
              <div key={o.id} data-overlay={o.id} className="overlay overlay-center">
                <div className="t-title">{ls[0]}</div>
                {ls.slice(1).map((l, i) => (
                  <div className="t-sub" key={i}>
                    {l}
                  </div>
                ))}
              </div>
            )
          case 'scroll':
            return (
              <div key={o.id} data-overlay={o.id} className="overlay scrollprompt">
                <span>{ls[0]}</span>
                <span className="chev" aria-hidden="true" />
              </div>
            )
          case 'principle':
            return (
              <div key={o.id} data-overlay={o.id} className="overlay overlay-center">
                <div className="card">
                  <div className="t-principle-title">{ls[0]}</div>
                  {ls[1] && <div className="t-principle-body">{ls[1]}</div>}
                </div>
              </div>
            )
          case 'dialogue':
            return (
              <div key={o.id} data-overlay={o.id} className="overlay overlay-dialogue">
                <div className="dialogue">
                  {o.speaker && <span className="who">{o.speaker}</span>}
                  {ls[0]}
                </div>
              </div>
            )
          case 'insight':
            return (
              <div key={o.id} data-overlay={o.id} className="overlay overlay-insight">
                <div className="insight">{ls[0]}</div>
              </div>
            )
          case 'promove':
            return (
              <div key={o.id} data-overlay={o.id} className="overlay overlay-promove">
                <div className="promove">
                  <span className="bolt" aria-hidden="true">
                    ⚡
                  </span>
                  <span>{ls[0]}</span>
                </div>
              </div>
            )
          case 'review':
            return (
              <div key={o.id} data-overlay={o.id} className="overlay overlay-center">
                <div className="review-card">
                  <div className="stars" aria-label="five stars">
                    ★★★★★
                  </div>
                  <p className="review-text">{ls[0]}</p>
                </div>
              </div>
            )
          case 'challenge':
            return (
              <div key={o.id} data-overlay={o.id} className="overlay overlay-center">
                <div className="challenge">
                  {ls.map((l, i) => (
                    <p key={i}>{l}</p>
                  ))}
                </div>
              </div>
            )
          case 'recap':
            return (
              <div key={o.id} data-overlay={o.id} className="overlay overlay-center">
                <div className="recap">
                  <div className="recap-title">{ls[0]}</div>
                  {ls.slice(1).map((l, i) => (
                    <p className="recap-line" key={i}>
                      {l}
                    </p>
                  ))}
                </div>
              </div>
            )
        }
      })}
    </div>
  )
}
