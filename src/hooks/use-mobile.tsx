import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  // Initialized synchronously from the real viewport width. This must be
  // correct on the FIRST render, not just after the effect below runs:
  // mobile-shell-only pages (CraftAtlasArea, ExploreMove) return a desktop
  // <Navigate> redirect whenever this reads false, so a first render that
  // defaulted to "not mobile" bounced phone users straight back to the page
  // they came from (the Explore competency-tap "blink" bug).
  const [isMobile, setIsMobile] = React.useState<boolean>(
    () => window.innerWidth < MOBILE_BREAKPOINT
  )

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
