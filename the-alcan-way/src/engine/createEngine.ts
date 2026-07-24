// The render core for the walk-forward model. Caches DOM nodes once, then
// render(p) writes the whole world for scroll progress p as opacity + transform.
// Rooms crossfade and dolly (push in on enter, ease back on leave); characters
// and overlays fade by their scene window. No DOM is created/destroyed on scroll.

import { FLAT_CHARS, FLAT_OVERLAYS, ROOM_WINDOWS } from '@/content/scenes'
import { invlerp, windowOpacity } from '@/lib/lerp'

const ROOM_FADE = 0.028

// Opacity + dolly scale for a room that may appear in several windows.
function roomState(windows: [number, number][], p: number): { opacity: number; scale: number } {
  let best = { opacity: 0, scale: 1 }
  for (const [s, e] of windows) {
    if (p < s - ROOM_FADE || p > e + ROOM_FADE) continue
    let opacity: number
    let scale: number
    if (p < s) {
      const t = invlerp(s - ROOM_FADE, s, p)
      opacity = t
      scale = 1.06 - 0.06 * t // enter: push in from slightly larger
    } else if (p > e) {
      const t = invlerp(e, e + ROOM_FADE, p)
      opacity = 1 - t
      scale = 1.0 - 0.05 * t // leave: ease back
    } else {
      opacity = 1
      scale = 1
    }
    if (opacity >= best.opacity) best = { opacity, scale }
  }
  return best
}

export interface Engine {
  render: (p: number) => void
  measure: () => void
}

export function createEngine(root: HTMLElement): Engine {
  const roomEls = new Map<string, HTMLElement>()
  root.querySelectorAll<HTMLElement>('[data-room]').forEach((el) => roomEls.set(el.dataset.room!, el))

  const charEls = new Map<string, HTMLElement>()
  root.querySelectorAll<HTMLElement>('[data-place]').forEach((el) => charEls.set(el.dataset.place!, el))

  const overlayEls = new Map<string, HTMLElement>()
  root.querySelectorAll<HTMLElement>('[data-overlay]').forEach((el) => overlayEls.set(el.dataset.overlay!, el))

  function measure() {
    // Layout is viewport-relative (%), so nothing to cache yet. Hook kept for
    // resize/ScrollTrigger.refresh symmetry and future depth math.
  }

  function render(p: number) {
    for (const [room, windows] of Object.entries(ROOM_WINDOWS)) {
      const el = roomEls.get(room)
      if (!el) continue
      const { opacity, scale } = roomState(windows, p)
      el.style.opacity = opacity.toFixed(3)
      el.style.transform = `scale(${scale.toFixed(4)})`
      el.style.visibility = opacity <= 0.001 ? 'hidden' : 'visible'
    }

    for (const c of FLAT_CHARS) {
      const el = charEls.get(c.placeId)
      if (!el) continue
      const op = windowOpacity(c.window, p)
      el.style.opacity = op.toFixed(3)
      el.style.visibility = op <= 0.001 ? 'hidden' : 'visible'
    }

    for (const o of FLAT_OVERLAYS) {
      const el = overlayEls.get(o.id)
      if (!el) continue
      const op = windowOpacity(o.window, p)
      el.style.opacity = op.toFixed(3)
      el.style.visibility = op <= 0.001 ? 'hidden' : 'visible'
    }
  }

  return { render, measure }
}
