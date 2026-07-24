# Batch art generator

Generates the experience's pixel-art assets with OpenAI `gpt-image-1` from a
manifest, so you don't click through a UI one at a time. Output lands in
`art-source/` with the exact filenames the app expects.

## Setup (once)

Put your key in `the-alcan-way/.env.local` (this file is gitignored):

```
OPENAI_API_KEY=sk-...
```

(Or `export OPENAI_API_KEY=sk-...` in your shell.)

## Run

```bash
npm run genart                 # generate everything (skips files that already exist)
npm run genart -- --list       # just print the manifest (ids, groups, files)
npm run genart -- --only=pieces        # one group: bg | pieces | props | recept | assistant | doctor
npm run genart -- --only=piece-desk    # one asset by id
npm run genart -- --force      # regenerate even if the file exists
```

Flags: `--concurrency=3`, `--quality=high|medium|low`, `--model=gpt-image-1`.

## What it does

- Reads `manifest.mjs` (the asset list + the shared bright/modern style prefix).
- Backgrounds are opaque and wide; set pieces, props, and characters are
  generated with a **transparent background** (real alpha PNG, no magenta trick).
- Character pose variants use the image-**edits** endpoint with the character's
  base `idle` as a reference, so the SAME character carries across poses. The
  runner generates base images first, then the reference poses.
- Skips files that already exist (so reruns only fill gaps); `--force` overrides.
- Retries on rate limits / transient errors.

## Notes

- **You own the output.** Images generated via the OpenAI API can be used
  commercially, which is why this is the right path for a shipped product
  (unlike the non-commercial PixelSpaces pack).
- **Cost:** roughly a few cents per image at `high` quality; the full manifest
  (~40 assets) is a few dollars. Use `--only=` while iterating.
- **gpt-image-1 may require OpenAI org verification.** If you get a 403 about
  verification, complete it in the OpenAI dashboard (Settings → Organization).
- To add assets: append entries to `manifest.mjs`. It is just data.
- Results are starting points; clean up / crop in Canva as needed, then they
  drop straight into the app slots.
