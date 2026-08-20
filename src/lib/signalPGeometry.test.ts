import { describe, it, expect } from 'vitest';
import {
  bezier,
  BRAND_EASE,
  radialOffset,
  onPath,
  getDotRestPoint,
  getLapPoint,
  getBowlPathD,
  buildForSize,
  SIGNAL_P_GEOMETRY,
  SIGNAL_P_ICON_BUILD_MAX_SIZE,
} from './signalPGeometry';

// DSN-5c: these lock in the motion contract's non-negotiable pieces (see
// promoves-brand/exports/README.md "Motion contract" and
// docs/dev/motion-rules.md) -- the endpoints are law, the easing curve
// matches --ease-brand, the radial lift never touches the endpoints, and the
// icon vs. master build parameters match the kit README exactly.

describe('bezier', () => {
  it('bezier(0)=0 and bezier(1)=1 for the brand curve', () => {
    expect(BRAND_EASE(0)).toBeCloseTo(0, 9);
    expect(BRAND_EASE(1)).toBeCloseTo(1, 9);
  });

  it('is monotonically increasing across the brand curve (no bounce, no overshoot)', () => {
    let prev = BRAND_EASE(0);
    for (let x = 0.05; x <= 1; x += 0.05) {
      const y = BRAND_EASE(x);
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      expect(y).toBeLessThanOrEqual(1 + 1e-9);
      prev = y;
    }
  });

  it('the linear curve is the identity function', () => {
    const linear = bezier(0, 0, 1, 1);
    for (const x of [0, 0.25, 0.5, 0.75, 1]) {
      expect(linear(x)).toBeCloseTo(x, 6);
    }
  });
});

describe('radialOffset', () => {
  it('is 0 at s=0 and s=1 -- the endpoints are law', () => {
    expect(radialOffset(0, 2)).toBe(0);
    expect(radialOffset(1, 2)).toBe(0);
  });

  it('is positive mid-travel', () => {
    expect(radialOffset(0.5, 2)).toBeGreaterThan(0);
    expect(radialOffset(0.5, 2)).toBe(2); // held flat through the middle
  });

  it('ramps smoothly in and out rather than jumping', () => {
    expect(radialOffset(0.05, 2)).toBeGreaterThan(0);
    expect(radialOffset(0.05, 2)).toBeLessThan(2);
    expect(radialOffset(0.9, 2)).toBeGreaterThan(0);
    expect(radialOffset(0.9, 2)).toBeLessThan(2);
  });
});

describe('onPath', () => {
  it('places the master dot rest exactly at the canonical construction point (59.83, 25.85)', () => {
    const g = SIGNAL_P_GEOMETRY.master;
    const [x, y] = onPath(g.r, g.dotA);
    expect(x).toBeCloseTo(59.83, 2);
    expect(y).toBeCloseTo(25.85, 2);
  });
});

describe('getDotRestPoint / getLapPoint -- endpoints are law', () => {
  it('a lap started at s=0 begins exactly at the dot rest point', () => {
    for (const build of ['master', 'icon'] as const) {
      const rest = getDotRestPoint(build);
      const start = getLapPoint(build, 0, false, 2);
      expect(start).toEqual(rest);
      const startCcw = getLapPoint(build, 0, true, 2);
      expect(startCcw).toEqual(rest);
    }
  });

  it('a lap approaching s=1 lands within floating-point tolerance of the dot rest point in both directions', () => {
    for (const build of ['master', 'icon'] as const) {
      const rest = getDotRestPoint(build);
      const end = getLapPoint(build, 1, false, 2);
      const endCcw = getLapPoint(build, 1, true, 2);
      expect(end[0]).toBeCloseTo(rest[0], 9);
      expect(end[1]).toBeCloseTo(rest[1], 9);
      expect(endCcw[0]).toBeCloseTo(rest[0], 9);
      expect(endCcw[1]).toBeCloseTo(rest[1], 9);
    }
  });

  it('master and icon builds share the same rest position (same r, same dotA)', () => {
    const master = getDotRestPoint('master');
    const icon = getDotRestPoint('icon');
    expect(master[0]).toBeCloseTo(icon[0], 9);
    expect(master[1]).toBeCloseTo(icon[1], 9);
  });
});

describe('icon vs master build parameters (promoves-brand/exports/README.md "Mark geometry")', () => {
  it('master build: gap -12 to -70, dot r6', () => {
    expect(SIGNAL_P_GEOMETRY.master.aLow).toBe(-12);
    expect(SIGNAL_P_GEOMETRY.master.aUp).toBe(-70);
    expect(SIGNAL_P_GEOMETRY.master.dotR).toBe(6);
  });

  it('icon build (<=24px): gap -7 to -75, dot r7', () => {
    expect(SIGNAL_P_GEOMETRY.icon.aLow).toBe(-7);
    expect(SIGNAL_P_GEOMETRY.icon.aUp).toBe(-75);
    expect(SIGNAL_P_GEOMETRY.icon.dotR).toBe(7);
  });

  it('buildForSize picks icon at and under the 24px threshold, master above it', () => {
    expect(buildForSize(16)).toBe('icon');
    expect(buildForSize(SIGNAL_P_ICON_BUILD_MAX_SIZE)).toBe('icon');
    expect(buildForSize(25)).toBe('master');
    expect(buildForSize(48)).toBe('master');
  });
});

describe('getBowlPathD', () => {
  it('produces an SVG arc path starting and ending at the build-specific terminals', () => {
    const d = getBowlPathD('master');
    expect(d).toMatch(/^M [\d.]+ [\d.]+ A 17 17 0 1 1 [\d.]+ [\d.]+$/);
  });

  it('master and icon builds produce different paths (different terminal angles)', () => {
    expect(getBowlPathD('master')).not.toBe(getBowlPathD('icon'));
  });
});
