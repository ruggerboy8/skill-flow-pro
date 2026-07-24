// Wires the stage DOM to the scroll engine. Creates the engine, mounts the
// Lenis/GSAP scroll, and renders on every frame. Cleans up fully on unmount so
// React StrictMode's double-invoke in dev is harmless.

import { useEffect, useRef } from 'react'
import Stage from './Stage'
import { EXPERIENCE } from '@/content/scenes'
import { createEngine } from './createEngine'
import { initScroll } from '@/scroll/initScroll'

export default function Experience() {
  const outerRef = useRef<HTMLDivElement>(null)
  const pinRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const outer = outerRef.current
    const pin = pinRef.current
    const stage = stageRef.current
    if (!outer || !pin || !stage) return

    const engine = createEngine(stage)
    engine.measure()
    engine.render(0)

    // Dev-only: paint an arbitrary progress for visual testing without scrolling.
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
    <div id="experience" ref={outerRef} style={{ height: `${EXPERIENCE.scrollVh}vh` }}>
      <div className="stage-pin" ref={pinRef}>
        <Stage ref={stageRef} />
      </div>
    </div>
  )
}
