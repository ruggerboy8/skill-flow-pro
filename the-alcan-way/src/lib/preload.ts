// Preload every image in the manifest before scroll is enabled, so there is no
// mid-scroll pop-in. A small minimum duration keeps the loading screen from
// flashing. With no final art yet, this just waits the minimum.

import { IMAGE_ASSETS } from '@/content/manifest'

export function preloadAll(minMs = 400): Promise<void> {
  const loads = IMAGE_ASSETS.map(
    (src) =>
      new Promise<void>((resolve) => {
        const img = new Image()
        img.onload = () => resolve()
        img.onerror = () => resolve()
        img.src = src
      }),
  )
  const floor = new Promise<void>((resolve) => setTimeout(resolve, minMs))
  return Promise.all([...loads, floor]).then(() => undefined)
}
