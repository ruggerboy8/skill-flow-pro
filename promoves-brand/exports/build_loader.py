#!/usr/bin/env python3
"""PRO MOVES — motion prototype generator (promoves-loader.html).
The dot is a component of the P that temporarily leaves home and is drawn back.
Run-once semantics; never loops. Final frame is bit-identical to the static mark."""
import re

fonts = re.search(r"(@font-face\{.*?format\('opentype'\);\})\s*\n?body",
                  open('/home/user/promoves-brand/congress/integrated.html').read(), re.S).group(1)

JS = r"""
// ---- V3A canonical geometry (100-unit canvas) ----
const GEO = {
  master: { r: 17, sw: 12, stemX: 17, stemW: 12, aLow: -12, aUp: -70, dotA: -41, dotR: 6 },
  icon:   { r: 17, sw: 12, stemX: 17, stemW: 12, aLow: -7,  aUp: -75, dotA: -41, dotR: 7 },
  cx: 47, cy: 37
};
const rad = d => d * Math.PI / 180;
const onPath = (r, a, off=0) => [GEO.cx + (r+off)*Math.cos(rad(a)), GEO.cy + (r+off)*Math.sin(rad(a))];

// cubic-bezier(x1,y1,x2,y2) evaluator (CSS-style): decisive start, slight
// mid acceleration, long mechanical deceleration. No bounce, no overshoot.
function bezier(x1, y1, x2, y2) {
  const cx = 3*x1, bx = 3*(x2-x1)-cx, ax = 1-cx-bx;
  const cy = 3*y1, by = 3*(y2-y1)-cy, ay = 1-cy-by;
  const sx = t => ((ax*t+bx)*t+cx)*t;
  const dx = t => (3*ax*t+2*bx)*t+cx;
  return function(x) {
    let t = x;
    for (let i=0;i<6;i++){ const e = sx(t)-x, d = dx(t); if (Math.abs(e)<1e-6||d===0) break; t -= e/d; }
    return ((ay*t+by)*t+cy)*t;
  };
}
const EASE = bezier(0.50, 0.05, 0.15, 1.0);

// radial offset profile: 0 at both endpoints (the endpoints are law),
// small outward lift while the dot rides over the stroke. Purely optical.
function radialOffset(s, max) {
  if (s < 0.10) return max * (s/0.10) * (s/0.10);            // lift in after release
  if (s > 0.80) { const u = (1-s)/0.20; return max * u*u; }   // drawn back to the line
  return max;
}

function buildP(el, opts) {
  const g = GEO[opts.build || 'master'];
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', opts.center ? '-6.5 0 100 100' : '0 0 73 100');
  svg.setAttribute('width', opts.size * (opts.center ? 1 : 0.73));
  svg.setAttribute('height', opts.size);
  const mk = (tag, attrs) => { const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]); svg.appendChild(n); return n; };
  // construction overlay (hidden by default)
  const cons = document.createElementNS(NS, 'g');
  cons.setAttribute('class', 'cons'); cons.setAttribute('opacity', '0'); svg.appendChild(cons);
  const mkc = (tag, attrs) => { const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]); cons.appendChild(n); return n; };
  mkc('circle', { cx: GEO.cx, cy: GEO.cy, r: g.r, fill: 'none', stroke: '#4FA8DC',
                  'stroke-width': 0.5, 'stroke-dasharray': '2 2' });
  for (const a of [g.aLow, g.aUp]) {
    const p = onPath(g.r + g.sw/2, a);
    mkc('line', { x1: GEO.cx, y1: GEO.cy, x2: p[0], y2: p[1], stroke: '#4FA8DC', 'stroke-width': 0.35 });
  }
  // structure
  mk('rect', { x: g.stemX, y: 14, width: g.stemW, height: 72, rx: 1, fill: opts.struct });
  const p1 = onPath(g.r, g.aLow), p2 = onPath(g.r, g.aUp);
  mk('path', { d: `M ${p1[0].toFixed(2)} ${p1[1].toFixed(2)} A ${g.r} ${g.r} 0 1 1 ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`,
               fill: 'none', stroke: opts.struct, 'stroke-width': g.sw, 'stroke-linecap': 'butt' });
  // the dot — independently addressable, never flattened
  const rest = onPath(g.r, g.dotA);
  const dot = mk('circle', { cx: rest[0].toFixed(3), cy: rest[1].toFixed(3), r: g.dotR, fill: opts.dot });
  el.appendChild(svg);

  let running = false;
  function run(duration, ccw, offsetMax) {
    if (running) return; running = true;
    const t0 = performance.now();
    const sweep = ccw ? -360 : 360;
    function frame(now) {
      const t = Math.min((now - t0) / duration, 1);
      const s = EASE(t);
      const a = g.dotA + sweep * s;
      const p = onPath(g.r, a, radialOffset(s, offsetMax));
      dot.setAttribute('cx', p[0].toFixed(3));
      dot.setAttribute('cy', p[1].toFixed(3));
      if (t < 1) requestAnimationFrame(frame);
      else {
        // the endpoints are law: land bit-identical to the static mark
        dot.setAttribute('cx', rest[0].toFixed(3));
        dot.setAttribute('cy', rest[1].toFixed(3));
        running = false;
      }
    }
    requestAnimationFrame(frame);
  }
  svg.style.cursor = 'pointer';
  svg.addEventListener('click', () => run(...currentParams()));
  return { run, cons };
}

const instances = [];
function currentParams() {
  return [ +document.getElementById('dur').value,
           document.getElementById('dir').checked,
           +document.getElementById('off').value ];
}
function runAll() { const p = currentParams(); instances.forEach(i => i.run(...p)); }

window.addEventListener('load', () => {
  const specs = [
    ['stage-light',  { size: 320, struct: '#113B62', dot: '#4FA8DC', center: true }],
    ['stage-dark',   { size: 320, struct: '#F4F1EA', dot: '#4FA8DC', center: true }],
    ['wm-p',         { size: 148, struct: '#113B62', dot: '#4FA8DC' }],
    ['small-48',     { size: 48,  struct: '#113B62', dot: '#4FA8DC', center: true }],
    ['small-24',     { size: 24,  struct: '#113B62', dot: '#4FA8DC', center: true, build: 'icon' }],
    ['small-24d',    { size: 24,  struct: '#F4F1EA', dot: '#4FA8DC', center: true, build: 'icon' }],
  ];
  for (const [id, o] of specs) instances.push(buildP(document.getElementById(id), o));
  document.getElementById('run').addEventListener('click', runAll);
  document.getElementById('cons').addEventListener('change', e =>
    instances.forEach(i => i.cons.setAttribute('opacity', e.target.checked ? 1 : 0)));
  document.getElementById('dur').addEventListener('input', e =>
    document.getElementById('durv').textContent = e.target.value + 'ms');
  document.getElementById('off').addEventListener('input', e =>
    document.getElementById('offv').textContent = (+e.target.value).toFixed(1) + 'u');
  setTimeout(runAll, 700);   // one run on load — then it rests. Never loops.
});
"""

html = f'''<!DOCTYPE html><html><head><meta charset="UTF-8"><title>PRO MOVES · motion prototype</title><style>
{fonts}
body{{margin:0;background:#0E1116;font-family:'Biondi Sans';color:#EAF0F6;padding:32px}}
h1{{font-size:18px;letter-spacing:.3em;font-weight:300;margin:0 0 4px}}
.sub{{color:#8B94A0;font-size:12px;letter-spacing:.1em;font-weight:300;margin:0 0 20px;max-width:900px;line-height:1.8}}
.controls{{display:flex;gap:26px;align-items:center;background:#12161B;border:1px solid #2A2E34;border-radius:8px;padding:14px 20px;margin-bottom:22px;flex-wrap:wrap}}
.controls label{{color:#8B94A0;font-size:12px;letter-spacing:.12em;display:flex;align-items:center;gap:8px}}
button{{background:#113B62;color:#fff;border:0;border-radius:6px;padding:10px 26px;font-family:'Biondi Sans';font-size:13px;letter-spacing:.2em;cursor:pointer}}
button:hover{{background:#16497a}}
input[type=range]{{accent-color:#4FA8DC}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:18px}}
.card{{border-radius:10px;display:flex;align-items:center;justify-content:center;min-height:400px;position:relative}}
.cl{{background:#FFF}} .cd{{background:#1A1D21;outline:1px solid #2A2E34}}
.tag{{position:absolute;top:12px;left:16px;font-size:10px;letter-spacing:.25em;color:#8B94A0;text-transform:uppercase}}
.cl .tag{{color:#9AA3AE}}
.wm{{grid-column:1/3;min-height:260px}}
.integrated{{display:flex;align-items:flex-start}}
.ro{{font-size:148px;line-height:1;font-weight:400;letter-spacing:.06em;margin-left:2px;color:#113B62}}
.wgap{{width:38px}}
.mv{{font-size:148px;line-height:1;font-weight:400;letter-spacing:.06em;color:#113B62}}
.smallrow{{grid-column:1/3;display:flex;gap:18px}}
.chip{{border-radius:10px;flex:1;min-height:140px;display:flex;align-items:center;justify-content:center;gap:34px;position:relative}}
</style></head><body>
<h1>PRO MOVES · SIGNAL P — MOTION PROTOTYPE</h1>
<div class="sub">Run-once, never loops: the dot disengages, rides the centerline circle over the stroke (with a small outward optical lift), decelerates, and is drawn home — final frame bit-identical to the static mark. Click any mark to run it, or run all. The construction toggle shows the canonical path.</div>
<div class="controls">
  <button id="run">RUN</button>
  <label>duration <input type="range" id="dur" min="800" max="1200" step="50" value="1000"/> <span id="durv">1000ms</span></label>
  <label>optical lift <input type="range" id="off" min="0" max="4" step="0.5" value="2"/> <span id="offv">2.0u</span></label>
  <label><input type="checkbox" id="dir"/> reverse (counterclockwise)</label>
  <label><input type="checkbox" id="cons"/> show construction</label>
</div>
<div class="grid">
  <div class="card cl"><span class="tag">standalone · light</span><div id="stage-light"></div></div>
  <div class="card cd"><span class="tag">standalone · dark</span><div id="stage-dark"></div></div>
  <div class="card cl wm"><span class="tag">in the wordmark</span>
    <div class="integrated"><div id="wm-p"></div><span class="ro">RO</span><span class="wgap"></span><span class="mv">MOVES</span></div>
  </div>
  <div class="smallrow">
    <div class="chip cl"><span class="tag">48px master</span><div id="small-48"></div></div>
    <div class="chip cl"><span class="tag">24px icon build</span><div id="small-24"></div></div>
    <div class="chip cd"><span class="tag">24px icon · dark</span><div id="small-24d"></div></div>
  </div>
</div>
<script>{JS}</script>
</body></html>'''

open('/home/user/promoves-brand/exports/promoves-loader.html', 'w').write(html)
print('wrote promoves-loader.html', len(html))
