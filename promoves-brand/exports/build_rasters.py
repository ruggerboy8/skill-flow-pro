#!/usr/bin/env python3
"""PRO MOVES — raster exports, all derived from the SVG masters."""
import cairosvg, io, math, os
from PIL import Image

OUT = os.path.dirname(os.path.abspath(__file__))
os.chdir(OUT)
NAVY, CYAN, BONE, CHARCOAL = '#113B62', '#4FA8DC', '#F4F1EA', '#1A1D21'

def render(svg_str, w, h):
    png = cairosvg.svg2png(bytestring=svg_str.encode(), output_width=w, output_height=h)
    return Image.open(io.BytesIO(png)).convert('RGBA')

def load(name):
    return open(name).read()

p_master = load('promoves-p.svg')
p_icon = load('promoves-p-icon.svg')
p_dark = load('promoves-p-dark.svg')
wm_dark = load('promoves-wordmark-dark.svg')
wm_light = load('promoves-wordmark.svg')

def framed(inner_svg, canvas, bg, scale=0.62):
    """Place the standalone P (100-unit square svg) on a solid square background."""
    body = inner_svg.split('>', 1)[1].rsplit('</svg>', 1)[0]
    s = canvas * scale / 100.0
    off = canvas * (1 - scale) / 2.0
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {canvas} {canvas}">'
            f'<rect width="{canvas}" height="{canvas}" fill="{bg}"/>'
            f'<g transform="translate({off} {off}) scale({s})">{body}</g></svg>')

# favicons: transparent bg, color mark; 16 uses the icon build
fav16 = render(p_icon, 16, 16); fav16.save('favicon-16.png')
fav32 = render(p_master, 32, 32); fav32.save('favicon-32.png')
fav48 = render(p_master, 48, 48)
fav48.save('favicon.ico', format='ICO', append_images=[fav32, fav16],
            sizes=[(48, 48), (32, 32), (16, 16)])

# app icons: navy field, bone structure + cyan dot
render(framed(p_dark, 180, NAVY, 0.60), 180, 180).save('apple-touch-icon-180.png')
render(framed(p_dark, 192, NAVY, 0.60), 192, 192).save('pwa-192.png')
render(framed(p_dark, 512, NAVY, 0.60), 512, 512).save('pwa-512.png')
render(framed(p_dark, 512, NAVY, 0.44), 512, 512).save('pwa-maskable-512.png')  # safe zone

# monochrome notification glyph: white silhouette, transparent
glyph = load('promoves-p-reversed.svg')
render(glyph, 96, 96).save('notification-glyph-96.png')

# OG / social share 1200x630: charcoal, dark wordmark centered
wmw = float(wm_dark.split('viewBox="0 0 ')[1].split(' ')[0])
tw = 760.0; s = tw / wmw
th = 100 * s
og = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">'
      f'<rect width="1200" height="630" fill="{CHARCOAL}"/>'
      f'<g transform="translate({(1200-tw)/2} {(630-th)/2}) scale({s})">'
      + wm_dark.split('>', 1)[1].rsplit('</svg>', 1)[0] + '</g></svg>')
render(og, 1200, 630).save('og-1200x630.png')

# deck-ready transparent PNGs @2x
h = 296  # 2x of the 148 master
w = int(round(wmw / 100 * h))
render(wm_dark, w, h).save('promoves-wordmark-dark@2x.png')
render(wm_light, w, h).save('promoves-wordmark@2x.png')
render(p_dark, 512, 512).save('promoves-p-dark@512.png')

# verify ico contents
ico = Image.open('favicon.ico')
print('ico sizes:', ico.info.get('sizes'))
print('done:', sorted(f for f in os.listdir('.') if not f.endswith('.py')))
