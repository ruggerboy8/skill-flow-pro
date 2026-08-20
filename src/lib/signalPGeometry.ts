// DSN-5c: pure geometry + easing helpers for the Signal P mark's motion.
//
// Ported from promoves-brand/exports/promoves-loader.html (the reference
// implementation) and promoves-brand/exports/promoves-p-construction.svg
// (the canonical geometry). Kept dependency-free and side-effect-free so it
// can be unit tested without a DOM, and reused by both the animated
// component and (if ever needed) a static render.
//
// Geometry contract (see promoves-brand/exports/README.md, "Mark geometry"):
// centerline circle center (47,37) r17, stem x17 w12, dot rest EXACTLY on
// the centerline at -41deg. Angles are y-down, 0deg=right, positive=
// clockwise: point(a) = (cx + r*cos(a), cy + r*sin(a)).
//
// The "icon" build (<=24px, per README "Icon build") widens the bowl gap and
// enlarges the dot for silhouette legibility at small sizes; the dot's rest
// angle and the centerline radius are unchanged, so both builds share the
// same rest position.

export interface SignalPGeometry {
  /** Centerline circle radius (also the bowl's stroke path radius). */
  r: number;
  /** Bowl stroke width. */
  sw: number;
  /** Stem rect x. */
  stemX: number;
  /** Stem rect width. */
  stemW: number;
  /** Lower terminal angle (degrees). */
  aLow: number;
  /** Upper terminal angle (degrees). */
  aUp: number;
  /** Dot rest angle (degrees) -- exactly on the centerline. */
  dotA: number;
  /** Dot radius. */
  dotR: number;
}

export const SIGNAL_P_CENTER = { cx: 47, cy: 37 } as const;

/** Stem is static across builds: y=14, height=72, rx=1 (full cap-to-baseline). */
export const SIGNAL_P_STEM = { y: 14, height: 72, rx: 1 } as const;

export const SIGNAL_P_GEOMETRY = {
  master: { r: 17, sw: 12, stemX: 17, stemW: 12, aLow: -12, aUp: -70, dotA: -41, dotR: 6 },
  // Icon build (<=24px only, per README): wider gap, larger dot, mid-gap silhouette-first.
  icon: { r: 17, sw: 12, stemX: 17, stemW: 12, aLow: -7, aUp: -75, dotA: -41, dotR: 7 },
} as const satisfies Record<string, SignalPGeometry>;

export type SignalPBuild = keyof typeof SIGNAL_P_GEOMETRY;

/** Size threshold (px) at or under which the icon build must be used (README, "Icon build (<=24px only)"). */
export const SIGNAL_P_ICON_BUILD_MAX_SIZE = 24;

export function buildForSize(sizePx: number): SignalPBuild {
  return sizePx <= SIGNAL_P_ICON_BUILD_MAX_SIZE ? 'icon' : 'master';
}

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Point at radius `r`, angle `a` (degrees, y-down, 0=right, clockwise), with
 * an optional outward radial offset. This is the single source of truth for
 * "where a point on the centerline circle is" -- used for the terminals, the
 * dot's rest position, and every frame of its travel.
 */
export function onPath(
  r: number,
  a: number,
  offset = 0,
  center: { cx: number; cy: number } = SIGNAL_P_CENTER
): [number, number] {
  return [center.cx + (r + offset) * Math.cos(rad(a)), center.cy + (r + offset) * Math.sin(rad(a))];
}

/**
 * CSS-style cubic-bezier(x1,y1,x2,y2) easing evaluator. Given the curve's two
 * control points, returns a function mapping animation progress x in [0,1]
 * to eased progress y in [0,1], solved via Newton-Raphson on the bezier's
 * parametric form (same technique browsers use for `transition-timing-
 * function`). Matches promoves-loader.html's `bezier()` exactly.
 */
export function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  const sampleCurveX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleCurveDerivativeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return function evaluate(x: number): number {
    let t = x;
    for (let i = 0; i < 6; i++) {
      const err = sampleCurveX(t) - x;
      const deriv = sampleCurveDerivativeX(t);
      if (Math.abs(err) < 1e-6 || deriv === 0) break;
      t -= err / deriv;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}

/** The brand motion contract's easing curve (src/index.css `--ease-brand`). */
export const BRAND_EASE = bezier(0.5, 0.05, 0.15, 1.0);

/**
 * Small outward radial lift during the dot's lap, as a function of eased
 * progress `s` in [0,1] and the lift's peak magnitude `max`. Zero at both
 * endpoints -- the endpoints are law -- rising during the first 10% of
 * travel (eased in), held flat through the middle, and eased back to zero
 * over the last 20% ("drawn back to the line"). Matches promoves-
 * loader.html's `radialOffset()` exactly.
 */
export function radialOffset(s: number, max: number): number {
  if (s < 0.1) {
    const u = s / 0.1;
    return max * u * u;
  }
  if (s > 0.8) {
    const u = (1 - s) / 0.2;
    return max * u * u;
  }
  return max;
}

/** The dot's exact rest position for a given build -- the static mark's dot center. */
export function getDotRestPoint(build: SignalPBuild): [number, number] {
  const g = SIGNAL_P_GEOMETRY[build];
  return onPath(g.r, g.dotA);
}

/**
 * The dot's position at eased progress `s` (0..1) along one lap. Direction
 * is free per the contract (`ccw` picks it); `offsetMax` is the lift's peak
 * magnitude in the same units as the geometry (~2u per the contract).
 *
 * NOTE: because this is trig over a computed angle, s=1 lands extremely
 * close to but not bit-identically at the rest point (float error on the
 * order of 1e-13). Callers implementing the "final frame bit-identical to
 * the static mark" rule must snap to `getDotRestPoint()` on completion
 * rather than trust this function's output at s=1 -- see SignalP.tsx.
 */
export function getLapPoint(
  build: SignalPBuild,
  s: number,
  ccw: boolean,
  offsetMax: number
): [number, number] {
  const g = SIGNAL_P_GEOMETRY[build];
  const sweep = ccw ? -360 : 360;
  const a = g.dotA + sweep * s;
  return onPath(g.r, a, radialOffset(s, offsetMax));
}

/** The bowl's stroked arc path `d`, terminal to terminal, for a given build. */
export function getBowlPathD(build: SignalPBuild): string {
  const g = SIGNAL_P_GEOMETRY[build];
  const p1 = onPath(g.r, g.aLow);
  const p2 = onPath(g.r, g.aUp);
  return `M ${p1[0].toFixed(2)} ${p1[1].toFixed(2)} A ${g.r} ${g.r} 0 1 1 ${p2[0].toFixed(2)} ${p2[1].toFixed(2)}`;
}
