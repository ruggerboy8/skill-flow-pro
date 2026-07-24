// Scroll wiring for the Check-In v3 slice. Same Lenis + GSAP spine as the main
// experience; renders the Check-In stage and engine.

import { useEffect, useRef } from 'react'
import CheckinStage from './CheckinStage'
import { CHECKIN } from '@/content/checkin'
import { createCheckinEngine } from './createCheckinEngine'
import { initScroll } from '@/scroll/initScroll'

export default function CheckinExperience() {
  const outerRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const outer = outerRef.current
    const pin = pinRef.current
    const stage = stageRef.current
    if (!outer || !pin || !stage) return

    const engine = createCheckinEngine(stage)
    engine.measure()
    engine.render(0)

    if (import.meta.env.DEV) {
      ;(window as unknown as { __render?: (p: number) => void }).__render = (p) => {
        engine.measure()
        engine.render(p)
      }
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const handles = initScroll({
      trigger: outer,
      pin,
      reduced,
      onUpdate: (p) => engine.render(p),
      onRefresh: () => engine.measure(),
    })

    const onResize = () => engine.measure()
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      handles.destroy()
    }
  }, [])

  return (
    <div id="experience" ref={outerRef} style={{ height: `${CHECKIN.scrollVh}vh` }}>
      <div className="stage-pin" ref={pinRef}>
        <CheckinStage ref={stageRef} />
      </div>
    </div>
  )
}
