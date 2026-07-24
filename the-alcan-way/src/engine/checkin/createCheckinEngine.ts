// Render core for the Check-In v3 slice. render(p) writes the whole stage from
// scroll progress: scrim dim, set-piece + character whisk (translateX), poses,
// the pro-move spotlight (dim everything but the actor), and panel fades.

import { CHECKIN } from '@/content/checkin'
import { sampleNumber, sampleStep, windowOpacity, type NumKey, type StepKey } from '@/lib/lerp'

interface ElRuntime {
  el: HTMLElement
  xKeys: NumKey[]
  poseKeys: StepKey<string>[]
  firstPose: string
  scale: number
  spotlight: boolean
}

export interface CheckinEngine {
  render: (p: number) => void
  measure: () => void
}

export function createCheckinEngine(root: HTMLElement): CheckinEngine {
  const scrim = root.querySelector<HTMLElement>('.ck-scrim')!
  const elEls = new Map<string, HTMLElement>()
  root.querySelectorAll<HTMLElement>('[data-el]').forEach((el) => elEls.set(el.dataset.el!, el))
  const panelEls = new Map<string, HTMLElement>()
  root.querySelectorAll<HTMLElement>('[data-panel]').forEach((el) => panelEls.set(el.dataset.panel!, el))

  const scrimKeys: NumKey[] = CHECKIN.scrim.map((k) => ({ at: k.at, value: k.x }))

  const els: ElRuntime[] = []
  for (const c of CHECKIN.elements) {
    const el = elEls.get(c.id)
    if (!el) continue
    els.push({
      el,
      xKeys: c.x.map((k) => ({ at: k.at, value: k.x })),
      poseKeys: (c.poses ?? []).map((k) => ({ at: k.at, value: k.pose })),
      firstPose: c.poses?.[0]?.pose ?? 'idle',
      scale: c.scale ?? 1,
      spotlight: !!c.spotlight,
    })
  }

  const spot = CHECKIN.spotlightWindow

  function measure() {
    /* viewport-relative; nothing cached */
  }

  function render(p: number) {
    scrim.style.opacity = sampleNumber(scrimKeys, p).toFixed(3)

    const spotAmt = windowOpacity(spot, p) // 1 while we're in the pro-move beat

    for (const e of els) {
      const x = sampleNumber(e.xKeys, p)
      e.el.style.transform = `translateX(${x.toFixed(2)}vw) translateX(-50%) scale(${e.scale})`
      if (e.poseKeys.length) {
        const pose = sampleStep(e.poseKeys, p, e.firstPose)
        if (e.el.dataset.pose !== pose) e.el.dataset.pose = pose
      }
      // Spotlight: dim everything except the lit actor during the pro-move beat.
      const dim = e.spotlight ? 0 : 0.78 * spotAmt
      e.el.style.opacity = (1 - dim).toFixed(3)
      if (e.spotlight) e.el.classList.toggle('is-lit', spotAmt > 0.5)
    }

    for (const panel of CHECKIN.panels) {
      const el = panelEls.get(panel.id)
      if (!el) continue
      const op = windowOpacity(panel.window, p)
      el.style.opacity = op.toFixed(3)
      el.style.visibility = op <= 0.001 ? 'hidden' : 'visible'
    }
  }

  return { render, measure }
}
