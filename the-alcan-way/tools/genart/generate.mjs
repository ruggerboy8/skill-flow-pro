#!/usr/bin/env node
// Batch image generator for The Alcan Way. Reads tools/genart/manifest.mjs and
// generates each asset with OpenAI gpt-image-1, saving PNGs into art-source/.
// Zero dependencies (uses Node 20+ global fetch / FormData / Blob).
//
// Usage:
//   OPENAI_API_KEY=sk-... node tools/genart/generate.mjs              # all (skips existing)
//   node tools/genart/generate.mjs --only=pieces                      # one group
//   node tools/genart/generate.mjs --only=piece-desk                  # one asset
//   node tools/genart/generate.mjs --force                            # regenerate existing
//   node tools/genart/generate.mjs --list                             # print the manifest
// Flags: --concurrency=3  --quality=high|medium|low  --model=gpt-image-1

import { writeFile, mkdir, readFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { STYLE, ISO, ASSETS } from './manifest.mjs'

// Full prompt for an asset: shared style + the asset's own wording + (for
// transparent cut-outs) the isolation clause that keeps it a clean sprite.
const promptFor = (a) => `${STYLE}\n\n${a.prompt}${a.transparent ? ISO : ''}`

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT = resolve(HERE, '../..') // the-alcan-way/
const OUT_ROOT = join(PROJECT, 'art-source')

loadEnvLocal(join(PROJECT, '.env.local'))
const API_KEY = process.env.OPENAI_API_KEY
const args = parseArgs(process.argv.slice(2))

if (args.list) {
  for (const a of ASSETS) console.log(`${a.id.padEnd(20)} ${a.group.padEnd(10)} ${a.file}${a.ref ? '   (ref)' : ''}`)
  process.exit(0)
}
if (args.status) {
  let have = 0
  for (const a of ASSETS) {
    const exists = existsSync(join(OUT_ROOT, a.file))
    if (exists) have++
    console.log(`${exists ? '✓' : '·'} ${a.id.padEnd(20)} ${a.group.padEnd(10)} ${a.file}`)
  }
  console.log(`\n${have}/${ASSETS.length} generated.`)
  process.exit(0)
}
if (!API_KEY) {
  console.error('Missing OPENAI_API_KEY. Put it in the-alcan-way/.env.local (OPENAI_API_KEY=sk-...) or export it.')
  process.exit(1)
}

let todo = ASSETS
if (args.only) todo = ASSETS.filter((a) => a.id === args.only || a.group === args.only)
if (todo.length === 0) {
  console.error(`No assets match --only=${args.only}. Try --list.`)
  process.exit(1)
}

// Skip already-generated files unless --force.
const work = todo.filter((a) => {
  if (!args.force && existsSync(join(OUT_ROOT, a.file))) {
    console.log(`skip (exists)  ${a.file}`)
    return false
  }
  return true
})

if (work.length === 0) {
  console.log('Nothing to do (all exist; use --force to regenerate).')
  process.exit(0)
}

// Two phases so reference (`ref`) poses generate AFTER their base image exists.
const phase1 = work.filter((a) => !a.ref)
const phase2 = work.filter((a) => a.ref)

console.log(`Generating ${work.length} asset(s) with ${args.model}, concurrency ${args.concurrency}, quality ${args.quality}.\n`)
const results = []
results.push(...(await pool(phase1, args.concurrency, runOne)))
if (phase2.length) {
  console.log('\n-- reference poses --')
  results.push(...(await pool(phase2, args.concurrency, runOne)))
}

const ok = results.filter((r) => r.ok).length
console.log(`\nDone. ${ok}/${results.length} succeeded.`)
for (const r of results) if (!r.ok) console.log(`  FAIL  ${r.asset.file}: ${r.error}`)
process.exit(ok === results.length ? 0 : 1)

// ----------------------------------------------------------------------------

async function runOne(asset) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const b64 = asset.ref ? await callEdits(asset) : await callGenerate(asset)
      const out = join(OUT_ROOT, asset.file)
      await mkdir(dirname(out), { recursive: true })
      await writeFile(out, Buffer.from(b64, 'base64'))
      console.log(`  ok    ${asset.file}`)
      return { ok: true, asset }
    } catch (err) {
      const msg = String(err?.message ?? err)
      if (attempt === 4) return { ok: false, asset, error: msg }
      const rate = /429|rate limit/i.test(msg)
      const wait = rate ? 8000 * attempt : 1500 * attempt
      console.log(`  retry ${asset.file} (${attempt}/3) in ${wait}ms: ${msg.slice(0, 90)}`)
      await sleep(wait)
    }
  }
}

async function callGenerate(asset) {
  const body = {
    model: args.model,
    prompt: promptFor(asset),
    size: asset.size ?? '1024x1024',
    n: 1,
    output_format: 'png',
    quality: args.quality,
  }
  if (asset.transparent) body.background = 'transparent'
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
  })
  return readImage(res)
}

async function callEdits(asset) {
  const refs = Array.isArray(asset.ref) ? asset.ref : [asset.ref]
  const form = new FormData()
  form.append('model', args.model)
  for (const r of refs) {
    const buf = await readFile(join(OUT_ROOT, r))
    form.append('image[]', new Blob([buf], { type: 'image/png' }), basename(r))
  }
  form.append('prompt', promptFor(asset))
  form.append('size', asset.size ?? '1024x1024')
  form.append('quality', args.quality)
  if (asset.transparent) form.append('background', 'transparent')
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}` },
    body: form,
  })
  return readImage(res)
}

async function readImage(res) {
  if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 220)}`)
  const json = await res.json()
  const b64 = json?.data?.[0]?.b64_json
  if (!b64) throw new Error('no image in response')
  return b64
}

async function pool(items, n, fn) {
  const out = new Array(items.length)
  let i = 0
  const workers = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++
      out[idx] = await fn(items[idx])
    }
  })
  await Promise.all(workers)
  return out
}

function parseArgs(argv) {
  const o = { concurrency: 3, quality: 'high', model: 'gpt-image-1', force: false, list: false, status: false, only: null }
  for (const a of argv) {
    if (a === '--force') o.force = true
    else if (a === '--list') o.list = true
    else if (a === '--status') o.status = true
    else if (a.startsWith('--only=')) o.only = a.slice(7)
    else if (a.startsWith('--concurrency=')) o.concurrency = Math.max(1, +a.slice(14) || 3)
    else if (a.startsWith('--quality=')) o.quality = a.slice(10)
    else if (a.startsWith('--model=')) o.model = a.slice(8)
  }
  return o
}

function loadEnvLocal(p) {
  if (!existsSync(p)) return
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
