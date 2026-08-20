#!/usr/bin/env python3
"""M1 Signal Ring P — geometry study builder.
Renders V1–V4 from the designer agent's parameter table. All dots are computed
exactly on the bowl's centerline circle (animation-by-construction).
Canvas convention: y-down, 0deg = right, positive = clockwise.
Invariant: centerline_r + stroke/2 = 23 (bowl outer edge holds cap height; center y=37).
"""
import math, re

CX, CY = 47.0, 37.0

VARIANTS = [
    dict(key='V1', name='V1 · CONTROL', r=17.5, sw=11, a_low=-15, a_up=-62,
         dot_r=5, dot_a=-38.5, stem_w=11, cut=False, dot_r_small=5.8,
         note='47° gap · dot:stroke 0.91 · the as-approved datum'),
    dict(key='V2', name='V2 · AIR', r=17.5, sw=11, a_low=-8, a_up=-68,
         dot_r=4.5, dot_a=-44, stem_w=11, cut=False, dot_r_small=5.2,
         note='60° gap · lighter dot r4.5 biased toward the release terminal — "just returned"'),
    dict(key='V3', name='V3 · PLUG — agent recommendation', r=17, sw=12, a_low=-12, a_up=-70,
         dot_r=6, dot_a=-41, stem_w=12, cut=False, dot_r_small=7,
         note='58° gap · heavier bowl sw12 · dot:stroke 1.00 — the dot is a punched-out segment of the line'),
    dict(key='V4', name='V4 · SOCKET — M3 receiving cue', r=17.5, sw=11, a_low=-13, a_up=-64,
         dot_r=5, dot_a=-38.5, stem_w=11, cut=True, dot_r_small=5.8,
         note='51° gap · terminals cut 13° off-radial, faces aimed at the dot — negative space frames the seat'),
]

def pt(r, a_deg):
    a = math.radians(a_deg)
    return (CX + r * math.cos(a), CY + r * math.sin(a))

def f(x): return f'{x:.2f}'.rstrip('0').rstrip('.')

def cut_edge(theta_deg, r, sw, dot_c):
    """Terminal edge as a straight line through the centerline terminal point,
    perpendicular to the bearing toward the dot center (face normal aims at dot).
    Returns (outer_pt, inner_pt)."""
    T = pt(r, theta_deg)
    n = (dot_c[0] - T[0], dot_c[1] - T[1])
    ln = math.hypot(*n); n = (n[0]/ln, n[1]/ln)
    e = (-n[1], n[0])  # edge direction
    def isect(R, ref_ang):
        # |T + t e - C|^2 = R^2
        u = (T[0]-CX, T[1]-CY)
        b = u[0]*e[0] + u[1]*e[1]
        c = u[0]**2 + u[1]**2 - R*R
        disc = b*b - c
        disc = max(disc, 0)
        ts = (-b + math.sqrt(disc), -b - math.sqrt(disc))
        ref = pt(R, ref_ang)
        best = min(ts, key=lambda t: (T[0]+t*e[0]-ref[0])**2 + (T[1]+t*e[1]-ref[1])**2)
        return (T[0]+best*e[0], T[1]+best*e[1])
    return isect(r + sw/2, theta_deg), isect(r - sw/2, theta_deg)

def p_svg(v, size, struct, dot_col, small=None, crop=True, wpx=None):
    """One Signal-P SVG. small=True forces the <=24px build. crop trims x for kerning."""
    if small is None: small = size <= 24
    r, sw, stem_w = v['r'], v['sw'], v['stem_w']
    if small:
        a_low, a_up = v['a_low'] + 5, v['a_up'] - 5
        dot_r = v['dot_r_small']
        dot_a = (a_low + a_up) / 2
        cut = False
    else:
        a_low, a_up = v['a_low'], v['a_up']
        dot_r, dot_a = v['dot_r'], v['dot_a']
        cut = v['cut']
    dot = pt(r, dot_a)
    parts = [f'<rect x="17" y="14" width="{stem_w}" height="72" rx="1" fill="{struct}"/>']
    if not cut:
        p1, p2 = pt(r, a_low), pt(r, a_up)
        parts.append(
            f'<path d="M {f(p1[0])} {f(p1[1])} A {f(r)} {f(r)} 0 1 1 {f(p2[0])} {f(p2[1])}" '
            f'fill="none" stroke="{struct}" stroke-width="{sw}" stroke-linecap="butt"/>')
    else:
        Ro, Ri = r + sw/2, r - sw/2
        (Ol, Il) = cut_edge(a_low, r, sw, dot)
        (Ou, Iu) = cut_edge(a_up, r, sw, dot)
        parts.append(
            f'<path d="M {f(Ol[0])} {f(Ol[1])} A {f(Ro)} {f(Ro)} 0 1 1 {f(Ou[0])} {f(Ou[1])} '
            f'L {f(Iu[0])} {f(Iu[1])} A {f(Ri)} {f(Ri)} 0 1 0 {f(Il[0])} {f(Il[1])} Z" fill="{struct}"/>')
    parts.append(f'<circle cx="{f(dot[0])}" cy="{f(dot[1])}" r="{f(dot_r)}" fill="{dot_col}"/>')
    if crop:
        vb, vw = '0 0 73 100', 73
    else:
        vb, vw = '0 0 100 100', 100
    w = wpx if wpx else round(size * vw / 100)
    return (f'<svg height="{size}" width="{w}" xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="{vb}">' + ''.join(parts) + '</svg>')

# ---- construction diagram (V3, applies to all) ----
def construction_svg():
    v = VARIANTS[2]
    r, sw = v['r'], v['sw']
    dot = pt(r, v['dot_a'])
    p_low, p_up = pt(r, v['a_low']), pt(r, v['a_up'])
    guides = '#3A4048'; accent = '#4FA8DC'; faint = '#262B31'; label = '#8B94A0'
    ghost_struct = '#2E343B'
    parts = []
    # ghost mark
    p1, p2 = pt(r, v['a_low']), pt(r, v['a_up'])
    parts.append(f'<rect x="17" y="14" width="{v["stem_w"]}" height="72" rx="1" fill="{ghost_struct}"/>')
    parts.append(f'<path d="M {f(p1[0])} {f(p1[1])} A {f(r)} {f(r)} 0 1 1 {f(p2[0])} {f(p2[1])}" fill="none" stroke="{ghost_struct}" stroke-width="{sw}" stroke-linecap="butt"/>')
    # cap/baseline guides
    for y, t in ((14, 'cap · y14'), (86, 'baseline · y86')):
        parts.append(f'<line x1="2" y1="{y}" x2="98" y2="{y}" stroke="{faint}" stroke-width="0.4" stroke-dasharray="1.5 1.5"/>')
        parts.append(f'<text x="97" y="{y-1.6}" fill="{label}" font-size="3.2" text-anchor="end">{t}</text>')
    # centerline motion circle
    parts.append(f'<circle cx="{CX}" cy="{CY}" r="{f(r)}" fill="none" stroke="{accent}" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.9"/>')
    # center cross
    parts.append(f'<path d="M {CX-2} {CY} H {CX+2} M {CX} {CY-2} V {CY+2}" stroke="{guides}" stroke-width="0.5"/>')
    parts.append(f'<text x="{CX+2.5}" y="{CY+4.5}" fill="{label}" font-size="3.2">(47, 37) · r{f(r)}</text>')
    # radial lines to terminals
    for ang, name in ((v['a_low'], f'entry · {v["a_low"]}°'), (v['a_up'], f'release · {v["a_up"]}°')):
        p = pt(r + sw/2 + 2.5, ang)
        parts.append(f'<line x1="{CX}" y1="{CY}" x2="{f(p[0])}" y2="{f(p[1])}" stroke="{guides}" stroke-width="0.4"/>')
    parts.append(f'<text x="{f(pt(r+sw/2+4, v["a_low"])[0])}" y="{f(pt(r+sw/2+4, v["a_low"])[1]+1)}" fill="{label}" font-size="3.2">entry · {v["a_low"]}°</text>')
    parts.append(f'<text x="{f(pt(r+sw/2+4, v["a_up"])[0]-2)}" y="{f(pt(r+sw/2+4, v["a_up"])[1]-1)}" fill="{label}" font-size="3.2">release · {v["a_up"]}°</text>')
    # dot at rest, on the path
    parts.append(f'<circle cx="{f(dot[0])}" cy="{f(dot[1])}" r="{v["dot_r"]}" fill="{accent}"/>')
    parts.append(f'<text x="{f(dot[0]+7)}" y="{f(dot[1]-3)}" fill="{accent}" font-size="3.2">rest · {v["dot_a"]}° · offset 0</text>')
    # clockwise travel arrow along the circle (arc near bottom with arrowhead)
    a1, a2 = 55, 118
    q1, q2 = pt(r+sw/2+3.5, a1), pt(r+sw/2+3.5, a2)
    parts.append(f'<path d="M {f(q1[0])} {f(q1[1])} A {f(r+sw/2+3.5)} {f(r+sw/2+3.5)} 0 0 1 {f(q2[0])} {f(q2[1])}" fill="none" stroke="{label}" stroke-width="0.5"/>')
    tang = math.radians(a2 + 90)
    ah = pt(r+sw/2+3.5, a2)
    d = (math.cos(tang), math.sin(tang))
    n2 = (-d[1], d[0])
    A = (ah[0], ah[1]); B = (ah[0]-2.2*d[0]+1.1*n2[0], ah[1]-2.2*d[1]+1.1*n2[1]); Cc=(ah[0]-2.2*d[0]-1.1*n2[0], ah[1]-2.2*d[1]-1.1*n2[1])
    parts.append(f'<path d="M {f(A[0])} {f(A[1])} L {f(B[0])} {f(B[1])} L {f(Cc[0])} {f(Cc[1])} Z" fill="{label}"/>')
    parts.append(f'<text x="{f(pt(r+sw/2+7, 88)[0]-8)}" y="{f(pt(r+sw/2+7, 88)[1]+3)}" fill="{label}" font-size="3.2">clockwise travel</text>')
    # weld zone note
    wp = pt(r, 180)
    parts.append(f'<text x="{f(wp[0]-1)}" y="{f(wp[1]-9)}" fill="{label}" font-size="3.0" text-anchor="end">weld 150–210°</text>')
    return ('<svg height="520" width="520" xmlns="http://www.w3.org/2000/svg" viewBox="-2 4 104 92">'
            + ''.join(parts) + '</svg>')

# ---- assemble page ----
fonts = re.search(r'(@font-face\{.*?format\(\'opentype\'\);\})\s*\n?body',
                  open('/home/user/promoves-brand/congress/integrated.html').read(), re.S).group(1)

def lockup(v, dark):
    struct = '#F4F1EA' if dark else '#113B62'
    cls = 'dark' if dark else 'light'
    svg = p_svg(v, 148, struct, '#4FA8DC', small=False, crop=True)
    return (f'<div class="lockup {cls}"><div class="integrated">{svg}'
            f'<span class="ro">RO</span><span class="gap"></span><span class="mv">MOVES</span></div></div>')

def ladder(v, dark):
    struct = '#F4F1EA' if dark else '#113B62'
    chip = 'fd' if dark else 'fw'
    cells = []
    for s in (64, 48, 32, 24, 16):
        cells.append(f'<span class="{chip}" title="{s}px">{p_svg(v, s, struct, "#4FA8DC", crop=False)}</span>')
    return '<div class="favs">' + ''.join(cells) + '</div>'

rows = []
for v in VARIANTS:
    big_light = p_svg(v, 128, '#113B62', '#4FA8DC', small=False, crop=False)
    big_dark = p_svg(v, 128, '#F4F1EA', '#4FA8DC', small=False, crop=False)
    mono = p_svg(v, 96, '#113B62', '#113B62', small=False, crop=False)
    reversed_ = p_svg(v, 96, '#FFFFFF', '#FFFFFF', small=False, crop=False)
    rows.append(f'''
  <div class="row">
    <div class="name">{v['name']}</div>
    <div class="note">{v['note']} &nbsp;·&nbsp; r{f(v['r'])} / sw{v['sw']} · gap {v['a_low']}°→{v['a_up']}° · dot r{f(v['dot_r'])} @ {v['dot_a']}°</div>
    {lockup(v, dark=False)}
    {lockup(v, dark=True)}
    <div class="strip">
      <span class="cell lw">{big_light}</span>
      <span class="cell ld">{big_dark}</span>
      <span class="cell lw">{ladder(v, dark=False)}</span>
      <span class="cell ld">{ladder(v, dark=True)}</span>
      <span class="cell lw" title="mono">{mono}</span>
      <span class="cell navy" title="reversed">{reversed_}</span>
    </div>
  </div>''')

html = f'''<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
{fonts}
body{{margin:0;background:#0E1116;font-family:'Biondi Sans';padding:28px;width:1544px}}
h1{{color:#EAF0F6;font-size:19px;letter-spacing:.3em;font-weight:300;margin:0 0 6px}}
.sub{{color:#8B94A0;font-size:12px;letter-spacing:.12em;font-weight:300;margin:0 0 24px}}
.row{{margin-bottom:34px}}
.name{{color:#4FA8DC;font-size:13px;letter-spacing:.25em;margin-bottom:4px;text-transform:uppercase}}
.note{{color:#8B94A0;font-size:11px;letter-spacing:.08em;font-weight:300;margin-bottom:8px}}
.lockup{{width:100%;height:200px;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:10px}}
.light{{background:#FFF}} .dark{{background:#1A1D21;outline:1px solid #2A2E34}}
.integrated{{display:flex;align-items:flex-start}}
.integrated svg{{display:block}}
.ro{{font-size:148px;line-height:1;font-weight:400;letter-spacing:.06em;margin-left:4px}}
.gap{{width:38px}}
.mv{{font-size:148px;line-height:1;font-weight:400;letter-spacing:.06em}}
.light .ro,.light .mv{{color:#113B62}}
.dark .ro,.dark .mv{{color:#F4F1EA}}
.strip{{display:flex;gap:12px;align-items:stretch}}
.cell{{border-radius:8px;display:flex;align-items:center;justify-content:center;padding:14px 18px}}
.lw{{background:#FFF}} .ld{{background:#1A1D21;outline:1px solid #2A2E34}} .navy{{background:#113B62}}
.favs{{display:flex;gap:14px;align-items:center}}
.cons{{background:#12161B;outline:1px solid #2A2E34;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:20px;gap:40px}}
.constext{{color:#8B94A0;font-size:12px;line-height:2.0;letter-spacing:.06em;font-weight:300;max-width:520px}}
.constext b{{color:#EAF0F6;font-weight:400}}
</style></head><body>
<h1>PRO MOVES · M1 SIGNAL P — GEOMETRY STUDY</h1>
<div class="sub">Four executions of the same P · dot rests exactly on the bowl&#8217;s centerline circle in every variant (animation-by-construction) · ≤24px sizes use the small build (gap +5°/terminal, dot ×1.16, mid-gap) · butt terminals throughout</div>
{''.join(rows)}
  <div class="row">
    <div class="name">CONSTRUCTION — shown on V3 · identical logic for all variants</div>
    <div class="cons">{construction_svg()}
      <div class="constext"><b>The motion path is the centerline circle</b> — center (47,37), radius per variant; never drawn, only stroked. The dot&#8217;s rest position sits exactly on it, radial offset 0.<br/>
      <b>Travel is clockwise:</b> rest → disengage → enters the stroke at the lower terminal → full lap through the bowl bottom and cap-top tangent → released at the upper terminal → decelerates ~23° of arc into rest. The final settle frame is bit-identical to the static logo.<br/>
      <b>Terminals</b> are the only stroke ends; always butt-cut (round caps read as loading spinners). V4&#8217;s cuts rotate 13° off-radial with faces aimed at the dot.<br/>
      <b>Stem weld</b> (~150–210°) is static geometry; the dot passes behind it.<br/>
      <b>Optical spacing:</b> P→R tightened ~0.015em vs metric; right sidebearing measured from the bowl&#8217;s outer extreme x=70.</div>
    </div>
  </div>
</body></html>'''

open('/home/user/promoves-brand/congress/m1-study.html', 'w').write(html)
print('wrote m1-study.html', len(html))
