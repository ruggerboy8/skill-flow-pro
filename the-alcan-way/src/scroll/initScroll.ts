// The Lenis + GSAP marriage. Lenis smooths native scroll; GSAP's ScrollTrigger
// pins the stage and reports progress. Nothing else in the app touches scroll
// setup.

import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(ScrollTrigger)

export interface ScrollOptions {
  /** the tall outer element that provides scroll distance */
  trigger: HTMLElement
  /** the full-viewport element to pin while scrolling through `trigger` */
  pin: HTMLElement
  /** called every frame with progress 0..1 */
  onUpdate: (progress: number) => void
  /** called when ScrollTrigger recalculates (e.g. resize); re-measure here */
  onRefresh: () => void
  /** skip smooth-scroll when the user prefers reduced motion */
  reduced: boolean
}

export interface ScrollHandles {
  destroy: () => void
}

export function initScroll(opts: ScrollOptions): ScrollHandles {
  let lenis: Lenis | null = null
  const ticker = (time: number) => {
    lenis?.raf(time * 1000)
  }

  if (!opts.reduced) {
    lenis = new Lenis({ smoothWheel: true, syncTouch: true })
    lenis.on('scroll', ScrollTrigger.update)
    gsap.ticker.add(ticker)
    gsap.ticker.lagSmoothing(0)
    if (import.meta.env.DEV) {
      ;(window as unknown as { __lenis?: Lenis; __ST?: typeof ScrollTrigger }).__lenis = lenis
      ;(window as unknown as { __ST?: typeof ScrollTrigger }).__ST = ScrollTrigger
    }
  }

  const st = ScrollTrigger.create({
    trigger: opts.trigger,
    start: 'top top',
    end: 'bottom bottom',
    pin: opts.pin,
    pinSpacing: true,
    invalidateOnRefresh: true,
    onUpdate: (self) => opts.onUpdate(self.progress),
    onRefresh: () => opts.onRefresh(),
  })

  // Paint the initial frame.
  opts.onUpdate(0)

  return {
    destroy() {
      st.kill()
      if (lenis) {
        gsap.ticker.remove(ticker)
        lenis.destroy()
        lenis = null
      }
    },
  }
}
