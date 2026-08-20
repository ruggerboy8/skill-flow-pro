#!/usr/bin/env python3
"""V3 · PLUG — final optical refinement round (A/B/C) + P->R spacing study.
Same topology and opening in all three; only optical mass shifts.
Invariant: centerline_r + stroke/2 = 23. Dot center exactly on the centerline circle.
Butt terminals only. Canvas convention: y-down, 0deg=right, += clockwise.
"""
import math, re

CX, CY = 47.0, 37.0
A_LOW, A_UP = -12, -70          # lower terminal, upper terminal (neutral labels)
DOT_A = -41                     # rest angle, all variants

VARIANTS = [
    dict(key='V3A', name='V3A · AS SHOWN', sw=12, dot_r=6.0, dot_r_small=7.0,
         note='r17 / sw12 · dot r6 · dot:stroke 1.00 — the punched-out-segment datum'),
    dict(key='V3B', name='V3B · EASED WEIGHT', sw=11.5, dot_r=6.0, dot_r_small=7.0,
         note='bowl/stem eased toward V1 → sw11.5 / r17.25 · dot r6 kept · dot:stroke 1.04 — dot a breath heavier than the line'),
    dict(key='V3C', name='V3C · EASED DOT', sw=12, dot_r=5.6, dot_r_small=7.0,
         note='sw12 / r17 kept · dot r5.6 (93% of stroke) · dot:stroke 0.93 — line a breath heavier than the dot'),
]
for v in VARIANTS:
    v['r'] = 23 - v['sw'] / 2
    v['stem_w'] = v['sw']

def pt(r, a_deg):
    a = math.radians(a_deg)
    return (CX + r * math.cos(a), CY + r * math.sin(a))

def f(x): return f'{x:.2f}'.rstrip('0').rstrip('.')

def p_svg(v, size, struct, dot_col, small=None, crop=True):
    if small is None: small = size <= 24
    r, sw, stem_w = v['r'], v['sw'], v['stem_w']
    if small:
        a_low, a_up = A_LOW + 5, A_UP - 5
        dot_r = v['dot_r_small']
        dot_a = (a_low + a_up) / 2
    else:
        a_low, a_up = A_LOW, A_UP
        dot_r, dot_a = v['dot_r'], DOT_A
    dot = pt(r, dot_a)
    p1, p2 = pt(r, a_low), pt(r, a_up)
    parts = [
        f'<rect x="17" y="14" width="{f(stem_w)}" height="72" rx="1" fill="{struct}"/>',
        f'<path d="M {f(p1[0])} {f(p1[1])} A {f(r)} {f(r)} 0 1 1 {f(p2[0])} {f(p2[1])}" '
        f'fill="none" stroke="{struct}" stroke-width="{f(sw)}" stroke-linecap="butt"/>',
        f'<circle cx="{f(dot[0])}" cy="{f(dot[1])}" r="{f(dot_r)}" fill="{dot_col}"/>',
    ]
    vb, vw = ('0 0 73 100', 73) if crop else ('0 0 100 100', 100)
    w = round(size * vw / 100)
    return (f'<svg height="{size}" width="{w}" xmlns="http://www.w3.org/2000/svg" '
            f'viewBox="{vb}">' + ''.join(parts) + '</svg>')

def construction_svg():
    v = VARIANTS[0]
    r, sw = v['r'], v['sw']
    dot = pt(r, DOT_A)
    accent = '#4FA8DC'; faint = '#262B31'; label = '#8B94A0'; guides = '#3A4048'
    ghost = '#2E343B'
    parts = []
    p1, p2 = pt(r, A_LOW), pt(r, A_UP)
    parts.append(f'<rect x="17" y="14" width="{f(v["stem_w"])}" height="72" rx="1" fill="{ghost}"/>')
    parts.append(f'<path d="M {f(p1[0])} {f(p1[1])} A {f(r)} {f(r)} 0 1 1 {f(p2[0])} {f(p2[1])}" fill="none" stroke="{ghost}" stroke-width="{f(sw)}" stroke-linecap="butt"/>')
    for y, t in ((14, 'cap · y14'), (86, 'baseline · y86')):
        parts.append(f'<line x1="2" y1="{y}" x2="98" y2="{y}" stroke="{faint}" stroke-width="0.4" stroke-dasharray="1.5 1.5"/>')
        parts.append(f'<text x="97" y="{y-1.6}" fill="{label}" font-size="3.2" text-anchor="end">{t}</text>')
    parts.append(f'<circle cx="{CX}" cy="{CY}" r="{f(r)}" fill="none" stroke="{accent}" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.9"/>')
    parts.append(f'<path d="M {CX-2} {CY} H {CX+2} M {CX} {CY-2} V {CY+2}" stroke="{guides}" stroke-width="0.5"/>')
    parts.append(f'<text x="{CX+2.5}" y="{CY+4.5}" fill="{label}" font-size="3.2">(47, 37) · r{f(r)}</text>')
    for ang, name, dx, dy, anch in ((A_LOW, f'lower · {A_LOW}°', 1.5, 3.2, 'start'), (A_UP, f'upper · {A_UP}°', -14, -0.6, 'start')):
        p = pt(r + sw/2 + 2.5, ang)
        parts.append(f'<line x1="{CX}" y1="{CY}" x2="{f(p[0])}" y2="{f(p[1])}" stroke="{guides}" stroke-width="0.4"/>')
        q = pt(r + sw/2 + 4, ang)
        parts.append(f'<text x="{f(q[0]+dx)}" y="{f(q[1]+dy)}" fill="{label}" font-size="3.2" text-anchor="{anch}">{name}</text>')
    parts.append(f'<circle cx="{f(dot[0])}" cy="{f(dot[1])}" r="{f(v["dot_r"])}" fill="{accent}"/>')
    parts.append(f'<text x="{f(dot[0]+7.5)}" y="{f(dot[1]-3)}" fill="{accent}" font-size="3.2">rest · {DOT_A}°</text>')
    a1, a2 = 55, 118
    R2 = r + sw/2 + 3.5
    q1, q2 = pt(R2, a1), pt(R2, a2)
    parts.append(f'<path d="M {f(q1[0])} {f(q1[1])} A {f(R2)} {f(R2)} 0 0 1 {f(q2[0])} {f(q2[1])}" fill="none" stroke="{label}" stroke-width="0.5"/>')
    tang = math.radians(a2 + 90)
    ah = pt(R2, a2); d = (math.cos(tang), math.sin(tang)); n2 = (-d[1], d[0])
    B = (ah[0]-2.2*d[0]+1.1*n2[0], ah[1]-2.2*d[1]+1.1*n2[1]); Cc = (ah[0]-2.2*d[0]-1.1*n2[0], ah[1]-2.2*d[1]-1.1*n2[1])
    parts.append(f'<path d="M {f(ah[0])} {f(ah[1])} L {f(B[0])} {f(B[1])} L {f(Cc[0])} {f(Cc[1])} Z" fill="{label}"/>')
    parts.append(f'<text x="{f(pt(R2+3.5, 88)[0]-8)}" y="{f(pt(R2+3.5, 88)[1]+3)}" fill="{label}" font-size="3.2">travel (direction free)</text>')
    wp = pt(r, 180)
    parts.append(f'<text x="{f(wp[0]-1)}" y="{f(wp[1]-9)}" fill="{label}" font-size="3.0" text-anchor="end">weld 150–210°</text>')
    return ('<svg height="520" width="520" xmlns="http://www.w3.org/2000/svg" viewBox="-2 4 104 92">'
            + ''.join(parts) + '</svg>')

fonts = re.search(r"(@font-face\{.*?format\('opentype'\);\})\s*\n?body",
                  open('/home/user/promoves-brand/congress/integrated.html').read(), re.S).group(1)

def lockup(v, dark, ml=2):
    struct = '#F4F1EA' if dark else '#113B62'
    cls = 'dark' if dark else 'light'
    svg = p_svg(v, 148, struct, '#4FA8DC', small=False, crop=True)
    return (f'<div class="lockup {cls}"><div class="integrated">{svg}'
            f'<span class="ro" style="margin-left:{ml}px">RO</span><span class="gap"></span><span class="mv">MOVES</span></div></div>')

def ladder(v, dark):
    struct = '#F4F1EA' if dark else '#113B62'
    chip = 'fd' if dark else 'fw'
    return '<div class="favs">' + ''.join(
        f'<span class="{chip}" title="{s}px">{p_svg(v, s, struct, "#4FA8DC", crop=False)}</span>'
        for s in (48, 32, 24, 20, 16)) + '</div>'

rows = []
for v in VARIANTS:
    big_light = p_svg(v, 128, '#113B62', '#4FA8DC', small=False, crop=False)
    big_dark = p_svg(v, 128, '#F4F1EA', '#4FA8DC', small=False, crop=False)
    mono = p_svg(v, 96, '#113B62', '#113B62', small=False, crop=False)
    reversed_ = p_svg(v, 96, '#FFFFFF', '#FFFFFF', small=False, crop=False)
    rows.append(f'''
  <div class="row">
    <div class="name">{v['name']}</div>
    <div class="note">{v['note']}</div>
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

# ---- P->R spacing study (on V3A) ----
spacing_rows = []
for ml, lbl in ((0, 'TIGHT · −4px'), (2, 'SNUG · −2px — RECOMMENDED (used in the rows above)'), (4, 'PRIOR ROUND'), (7, 'LOOSE · +3px')):
    spacing_rows.append(f'''
    <div class="sname">{lbl}</div>
    <div class="lockup light slim">{ '<div class="integrated">' + p_svg(VARIANTS[0], 148, '#113B62', '#4FA8DC', small=False, crop=True) + f'<span class="ro" style="margin-left:{ml}px">RO</span><span class="gap"></span><span class="mv">MOVES</span></div>' }</div>''')

html = f'''<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
{fonts}
body{{margin:0;background:#0E1116;font-family:'Biondi Sans';padding:28px;width:1544px}}
h1{{color:#EAF0F6;font-size:19px;letter-spacing:.3em;font-weight:300;margin:0 0 6px}}
.sub{{color:#8B94A0;font-size:12px;letter-spacing:.12em;font-weight:300;margin:0 0 24px}}
.row{{margin-bottom:34px}}
.name{{color:#4FA8DC;font-size:13px;letter-spacing:.25em;margin-bottom:4px;text-transform:uppercase}}
.sname{{color:#8B94A0;font-size:11px;letter-spacing:.2em;margin:10px 0 4px;text-transform:uppercase}}
.note{{color:#8B94A0;font-size:11px;letter-spacing:.08em;font-weight:300;margin-bottom:8px}}
.lockup{{width:100%;height:200px;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:10px}}
.slim{{height:180px;margin-bottom:0}}
.light{{background:#FFF}} .dark{{background:#1A1D21;outline:1px solid #2A2E34}}
.integrated{{display:flex;align-items:flex-start}}
.integrated svg{{display:block}}
.ro{{font-size:148px;line-height:1;font-weight:400;letter-spacing:.06em}}
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
<h1>PRO MOVES · V3 PLUG — OPTICAL REFINEMENT</h1>
<div class="sub">One P, three masses · topology, opening (−12°→−70°) and rest angle (−41°) identical in all three · dot center on the bowl centerline circle in every build · butt terminals · ≤24px = one shared icon build for all three (gap +5°/terminal, dot r7, mid-gap) — silhouette over fidelity</div>
{''.join(rows)}
  <div class="row">
    <div class="name">P→R SPACING — judged in the word, on V3A</div>
    <div class="note">Spacing read from the perceived right-hand mass of the bowl/dot system (upper right is open air; solid ink peaks at mid-height), not the geometric extreme. Measured against the word&#8217;s internal rhythm (R→O mean ink-gap 40px @148, O→V 45px): tight 43 · snug 45 · prior 47 · loose 50. Snug sits inside the word&#8217;s own band; loose begins to detach the P into icon + type.</div>
    {''.join(spacing_rows)}
  </div>
  <div class="row">
    <div class="name">CONSTRUCTION — canonical geometric reference</div>
    <div class="cons">{construction_svg()}
      <div class="constext"><b>The centerline circle is the canonical construction path</b> — center (47,37), radius per variant, never drawn. The dot&#8217;s static rest position sits exactly on it.<br/>
      <b>Motion is free to deviate optically:</b> during travel a small outward offset from the centerline is permitted for legibility (the dot need not vanish behind the weld); only the endpoints are law — the sequence is rest → release/emergence → clockwise travel → deceleration → attraction/return → <b>exact static rest</b>. The final frame is bit-identical to the production mark.<br/>
      <b>Terminals are neutral:</b> upper terminal (−70°) and lower terminal (−12°) — direction and role may be assigned or reversed per use. Butt-cut always.<br/>
      <b>Character:</b> a component of the P that temporarily leaves home and is drawn back — never an indefinite spinner.<br/>
      <b>Stem weld</b> (~150–210°) is static geometry.</div>
    </div>
  </div>
</body></html>'''

open('/home/user/promoves-brand/congress/v3-refine.html', 'w').write(html)
print('wrote v3-refine.html', len(html))
for v in VARIANTS:
    print(v['key'], 'r', v['r'], 'sw', v['sw'], 'dot', v['dot_r'], 'ratio', round(2*v['dot_r']/v['sw'], 3))
