# PRO MOVES — Design Kit

Locked mark: **V3A Signal P**, integrated as the P of PRO MOVES, snug spacing. Everything in this folder derives from three editable build scripts — regenerate any asset at any size from them.

## Tokens

| Token | Value | Use |
|---|---|---|
| `navy` | `#113B62` | Structure on light grounds; primary brand color (inherited from Alcan) |
| `blue` | `#005286` | Secondary Alcan blue (available, not used in the mark) |
| `signal` | `#4FA8DC` | The dot; the family's dark-ground blue accent |
| `bone` | `#F4F1EA` | Structure on dark grounds |
| `charcoal` | `#1A1D21` | Presentation/soundstage dark ground |
| `gray` | `#929497` | Alcan 40% gray (available) |

Type: **Biondi Sans** — Regular 400 for the wordmark (uppercase, tracking .06em). Wordmark SVGs are outlined; no font needed to deploy them.

## Mark geometry (canonical, viewBox 100u)

Cap top y=14 · baseline y=86 (72u cap) · stem x17 w12 · bowl = stroked arc, centerline circle **center (47,37) r17**, stroke 12 · gap −12°→−70°, butt terminals (neutral: upper −70° / lower −12°) · dot r6, center **exactly on the centerline** at −41°. Angles: y-down, 0°=right, positive=clockwise; point(a) = (47+17·cos a, 37+17·sin a).

**Icon build (≤24px only):** gap −7°→−75°, dot r7, mid-gap. Silhouette over fidelity.

**Snug spacing (in-wordmark):** P occupies 73u of width (bowl outer x=70 +3u); R pen starts at 74.32u; tracking 6u; word gap 25.68u; GPOS kerning applies. Judged optically against the word's internal rhythm — do not re-derive from bounding boxes.

## Motion contract

Run-once, never loops. rest → release → one lap on the centerline circle → deceleration → drawn home. Final frame **bit-identical** to the static mark. Easing cubic-bezier(0.50, 0.05, 0.15, 1); ~800–1200ms; no bounce. A small outward radial lift (≈2u) is permitted mid-travel; the endpoints are law. Direction is free (terminals are neutral). In all layered files, `#signal-p-structure` and `#signal-p-dot` are independent — never flatten them. Reference implementation: `promoves-loader.html`; canonical path geometry: `promoves-p-construction.svg`.

## File inventory

**Wordmark masters (SVG, outlined type, layered)** — `promoves-wordmark.svg` (light) · `-dark` · `-mono` · `-reversed`

**Standalone P (SVG, layered, optically centered)** — `promoves-p.svg` · `-dark` · `-mono` · `-reversed` · `-icon` (≤24px build) · `-construction` (motion handoff)

**Web/app icons** — `favicon.ico` (48/32/16; 16 = icon build) · `favicon-16.png` / `favicon-32.png` · `apple-touch-icon-180.png` · `pwa-192.png` / `pwa-512.png` / `pwa-maskable-512.png` (44% safe zone) · `notification-glyph-96.png` (white mono)

**Social/deck** — `og-1200x630.png` · `promoves-wordmark@2x.png` / `promoves-wordmark-dark@2x.png` (transparent) · `promoves-p-dark@512.png`

**Motion** — `promoves-loader.html` (interactive prototype: duration, lift, direction, construction overlay)

**Source of truth** — `build_assets.py` (SVG masters; deps: fontTools, uharfbuzz) · `build_rasters.py` (all rasters; dep: cairosvg) · `build_loader.py` (prototype) · `asset-sheet.png` (visual overview)

## HTML head snippets (MyProMoves.com)

```html
<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon-180.png">
<meta property="og:image" content="/og-1200x630.png">
```

PWA manifest icons: `pwa-192.png` (192, any) · `pwa-512.png` (512, any) · `pwa-maskable-512.png` (512, maskable).

## Not yet built

One-page brand sheet · stacked lockup · Alcan co-brand lockup · clear-space/minimum-size rules (interim: clear space = one dot diameter (12u) from ink; minimum 16px standalone, 18px cap in-wordmark).
