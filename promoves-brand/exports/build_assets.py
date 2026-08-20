#!/usr/bin/env python3
"""PRO MOVES — production asset build. LOCKED: V3A + snug spacing.
This file is the editable source of truth: every SVG and raster derives from
the parameters below. Canonical coordinate system: viewBox 100 units,
cap top y=14, baseline y=86 (72u cap), bowl center (47,37).

V3A: centerline r17 / stroke 12 / stem x17 w12 / gap -12deg -> -70deg /
dot r6 at -41deg, center EXACTLY on the centerline circle (radial offset 0).
Icon build (<=24px): gap -7deg -> -75deg, dot r7, mid-gap (-41deg).
Terminals: butt. Angles: y-down, 0deg=right, positive=clockwise.
Terminals are neutral: upper (-70deg) / lower (-12deg).
"""
import math, os, struct
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen

OUT = os.path.dirname(os.path.abspath(__file__))

# Biondi Sans is licensed and deliberately not committed. Point BIONDI_OTF at
# your copy, or drop BiondiSansRg-Regular.otf next to this script (gitignored).
FONT_PATH = os.environ.get('BIONDI_OTF', os.path.join(OUT, 'BiondiSansRg-Regular.otf'))
if not os.path.exists(FONT_PATH):
    raise SystemExit(
        'BiondiSansRg-Regular.otf not found. Set BIONDI_OTF=/path/to/it or place '
        'the file next to this script. The font is licensed and not in the repo.')

CX, CY = 47.0, 37.0
R, SW = 17.0, 12.0
STEM_X, STEM_W = 17.0, 12.0
A_LOW, A_UP = -12.0, -70.0
DOT_A, DOT_R = -41.0, 6.0
ICON = dict(a_low=-7.0, a_up=-75.0, dot_a=-41.0, dot_r=7.0)

NAVY, CYAN, BONE, WHITE = '#113B62', '#4FA8DC', '#F4F1EA', '#FFFFFF'
CHARCOAL = '#1A1D21'

def pt(r, a):
    a = math.radians(a)
    return (CX + r * math.cos(a), CY + r * math.sin(a))

def f(x): return f'{x:.2f}'.rstrip('0').rstrip('.')

def p_group(struct_col, dot_col, icon=False, gid='signal-p'):
    """The Signal P as a layered group: #stem + #bowl (structure), #dot.
    Never flattened - dot stays independently addressable."""
    if icon:
        a_low, a_up, dot_a, dot_r = ICON['a_low'], ICON['a_up'], ICON['dot_a'], ICON['dot_r']
    else:
        a_low, a_up, dot_a, dot_r = A_LOW, A_UP, DOT_A, DOT_R
    p1, p2 = pt(R, a_low), pt(R, a_up)
    d = pt(R, dot_a)
    return (f'<g id="{gid}">'
            f'<g id="{gid}-structure">'
            f'<rect id="{gid}-stem" x="{f(STEM_X)}" y="14" width="{f(STEM_W)}" height="72" rx="1" fill="{struct_col}"/>'
            f'<path id="{gid}-bowl" d="M {f(p1[0])} {f(p1[1])} A {R} {R} 0 1 1 {f(p2[0])} {f(p2[1])}" '
            f'fill="none" stroke="{struct_col}" stroke-width="{f(SW)}" stroke-linecap="butt"/>'
            f'</g>'
            f'<circle id="{gid}-dot" cx="{f(d[0])}" cy="{f(d[1])}" r="{f(dot_r)}" fill="{dot_col}"/>'
            f'</g>')

# ---------- outlined type ----------
FONT = TTFont(FONT_PATH)
UPEM = FONT['head'].unitsPerEm            # 1000
CAPH = FONT['OS/2'].sCapHeight            # 717
S = 72.0 / CAPH                           # font-unit -> canvas-unit (cap = exactly 72u)
GS = FONT.getGlyphSet()
CMAP = FONT.getBestCmap()

def glyph(ch):
    g = GS[CMAP[ord(ch)]]
    pen = SVGPathPen(GS)
    g.draw(pen)
    return pen.getCommands(), g.width * S   # d in font units, advance in canvas units

TRACK = 6.0          # .06em at the approved 148px master = 6 canvas units
WORD_GAP = 38.0 * 100.0 / 148.0            # the approved 38px gap span
PEN_R = (round(148 * 0.73) + 2) * 100.0 / 148.0   # snug: cropped P svg (73u) + 2px

import uharfbuzz as hb
_blob = hb.Blob.from_file_path(FONT_PATH)
_hbfont = hb.Font(hb.Face(_blob))

def shaped(text):
    """Kerned advances per char (canvas units), matching browser GPOS shaping."""
    buf = hb.Buffer(); buf.add_str(text); buf.guess_segment_properties()
    hb.shape(_hbfont, buf)
    return [p.x_advance * S for p in buf.glyph_positions]

def word_paths(fill):
    x = PEN_R
    out = []
    for span in ('RO', 'MOVES'):
        advs = shaped(span)
        for ch, adv in zip(span, advs):
            d, _ = glyph(ch)
            out.append(f'<path d="{d}" transform="translate({f(x)} 86) scale({S:.6f} {-S:.6f})" fill="{fill}"/>')
            x += adv + TRACK
        if span == 'RO':
            x += WORD_GAP   # spans are adjacent in the lockup; the 38px gap div sits between
    width = x - TRACK   # drop trailing tracking
    return ''.join(out), width

def wordmark(struct_col, dot_col, type_col, name):
    typ, width = word_paths(type_col)
    W = width + 4     # right breathing room
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(W)} 100">'
           f'<!-- PRO MOVES wordmark - V3A Signal P, snug spacing. Cap y14, baseline y86. -->'
           + p_group(struct_col, dot_col) + f'<g id="type">{typ}</g></svg>')
    open(f'{OUT}/{name}', 'w').write(svg)
    return W

WM_W = wordmark(NAVY, CYAN, NAVY, 'promoves-wordmark.svg')
wordmark(BONE, CYAN, BONE, 'promoves-wordmark-dark.svg')
wordmark(NAVY, NAVY, NAVY, 'promoves-wordmark-mono.svg')
wordmark(WHITE, WHITE, WHITE, 'promoves-wordmark-reversed.svg')

# ---------- standalone P ----------
def standalone(struct_col, dot_col, name, icon=False):
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">'
           f'<!-- Signal P {"icon build (<=24px)" if icon else "master"} - optically centered (+6.5) -->'
           f'<g transform="translate(6.5 0)">' + p_group(struct_col, dot_col, icon=icon) + '</g></svg>')
    open(f'{OUT}/{name}', 'w').write(svg)

standalone(NAVY, CYAN, 'promoves-p.svg')
standalone(BONE, CYAN, 'promoves-p-dark.svg')
standalone(NAVY, NAVY, 'promoves-p-mono.svg')
standalone(WHITE, WHITE, 'promoves-p-reversed.svg')
standalone(NAVY, CYAN, 'promoves-p-icon.svg', icon=True)

# ---------- construction / motion handoff ----------
p1, p2 = pt(R, A_LOW), pt(R, A_UP)
d0 = pt(R, DOT_A)
construction = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<!-- SIGNAL P - MOTION HANDOFF (V3A locked)
  Canonical construction: centerline circle center (47,37) r17 (id=centerline).
  Dot rest: EXACTLY on the centerline at -41deg -> ({f(d0[0])}, {f(d0[1])}), r6.
  Terminals (neutral): upper -70deg, lower -12deg. Butt cuts. Stem weld ~150-210deg is static.
  Motion contract: rest -> release/emergence -> travel (direction free) -> deceleration ->
  attraction/return -> EXACT static rest. Final frame bit-identical to promoves-p.svg.
  The centerline is the canonical reference path; a small outward radial offset during
  travel is permitted for legibility. Never an indefinite spinner.
  Angles: y-down, 0deg=right, positive=clockwise. dot angle a -> (47+17cos(a), 37+17sin(a)).
  Layers: #signal-p-structure (stem+bowl) and #signal-p-dot are independent - never flatten.
-->
<g id="construction-geometry" stroke="{CYAN}" fill="none">
  <circle id="centerline" cx="47" cy="37" r="17" stroke-width="0.5" stroke-dasharray="2 2"/>
  <line id="radial-upper-terminal" x1="47" y1="37" x2="{f(pt(R+SW/2,A_UP)[0])}" y2="{f(pt(R+SW/2,A_UP)[1])}" stroke-width="0.35"/>
  <line id="radial-lower-terminal" x1="47" y1="37" x2="{f(pt(R+SW/2,A_LOW)[0])}" y2="{f(pt(R+SW/2,A_LOW)[1])}" stroke-width="0.35"/>
  <line id="radial-rest" x1="47" y1="37" x2="{f(d0[0])}" y2="{f(d0[1])}" stroke-width="0.35" stroke-dasharray="1 1"/>
</g>
{p_group(NAVY, CYAN)}
</svg>'''
open(f'{OUT}/promoves-p-construction.svg', 'w').write(construction)

print('SVG masters written. Wordmark width:', f(WM_W), 'units')
print('PEN_R', f(PEN_R), '| S', S)
