#!/usr/bin/env node
// Crops the transparent margins off generated PNGs so each asset's content fills
// its frame (lets us bottom-anchor sprites/pieces on the floor cleanly).
// Overwrites in place under art-source/. Run: node tools/genart/trim.mjs

import { readdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..', 'art-source')
const DIRS = ['pieces', 'props', 'receptionist', 'assistant', 'doctor', 'parent', 'child']
const ALPHA = 10 // treat pixels with alpha <= this as empty
const PAD = 4

for (const d of DIRS) {
  const dir = join(ROOT, d)
  if (!existsSync(dir)) continue
  for (const f of await readdir(dir)) {
    if (!f.endsWith('.png')) continue
    const p = join(dir, f)
    const png = PNG.sync.read(await readFile(p))
    const { width, height, data } = png
    let minX = width, minY = height, maxX = -1, maxY = -1
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (data[(y * width + x) * 4 + 3] > ALPHA) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }
    if (maxX < 0) {
      console.log(`skip (empty)  ${d}/${f}`)
      continue
    }
    minX = Math.max(0, minX - PAD)
    minY = Math.max(0, minY - PAD)
    maxX = Math.min(width - 1, maxX + PAD)
    maxY = Math.min(height - 1, maxY + PAD)
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    if (w === width && h === height) {
      console.log(`ok (full)     ${d}/${f}`)
      continue
    }
    const out = new PNG({ width: w, height: h })
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = ((y + minY) * width + (x + minX)) * 4
        const di = (y * w + x) * 4
        out.data[di] = data[si]
        out.data[di + 1] = data[si + 1]
        out.data[di + 2] = data[si + 2]
        out.data[di + 3] = data[si + 3]
      }
    }
    await writeFile(p, PNG.sync.write(out))
    console.log(`trimmed       ${d}/${f}  ${width}x${height} -> ${w}x${h}`)
  }
}
console.log('\nTrim complete.')
