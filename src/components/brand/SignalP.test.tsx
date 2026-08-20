import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useState } from 'react';
import { render, act, fireEvent, cleanup } from '@testing-library/react';
import { SignalP } from './SignalP';
import { getDotRestPoint } from '@/lib/signalPGeometry';

// DSN-5c QA finding: SignalP.tsx computed `rest = getDotRestPoint(build)` in
// render scope and put it in the animation effect's dependency array.
// getDotRestPoint returns a fresh array reference on every call, so ANY
// unrelated parent re-render while a lap was in flight tore the effect down
// (cancelAnimationFrame fired, the dot snapped to rest) and started a brand
// new lap from the release point -- even though shouldAnimate, mode,
// duration, and build hadn't changed. This violates "once mode runs exactly
// one lap per mount." The fix computes the rest point inside the effect so
// the dependency array is primitives only.
//
// This file reproduces the bug with a controllable fake
// requestAnimationFrame/cancelAnimationFrame, the way QA's harness did.
// jsdom in this repo has no matchMedia; SignalP already tolerates that (see
// usePrefersReducedMotion), so it isn't stubbed here.

let rafCallbacks: Map<number, FrameRequestCallback>;
let cancelledIds: Set<number>;
let nextRafId: number;

function flushRaf(now: number) {
  const pending = Array.from(rafCallbacks.entries());
  rafCallbacks.clear();
  for (const [, cb] of pending) cb(now);
}

beforeEach(() => {
  rafCallbacks = new Map();
  cancelledIds = new Set();
  nextRafId = 1;

  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    const id = nextRafId++;
    rafCallbacks.set(id, cb);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    cancelledIds.add(id);
    rafCallbacks.delete(id);
  });
  // t0 is captured once, at the start of the (one, if the fix holds) lap.
  // The frame timestamps themselves are supplied directly via flushRaf's
  // `now` argument, so pinning performance.now() to 0 makes `t = now / duration`.
  vi.spyOn(performance, 'now').mockReturnValue(0);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** An unrelated bit of parent state: a button that re-renders Host (and therefore SignalP as a child) but has nothing to do with SignalP's own props. */
function Host() {
  const [tick, setTick] = useState(0);
  return (
    <div>
      <button onClick={() => setTick((t) => t + 1)}>bump {tick}</button>
      <SignalP mode="once" duration={1000} />
    </div>
  );
}

describe('SignalP -- in-flight lap survives an unrelated parent re-render', () => {
  it('does not cancel or restart a lap that is mid-flight when the parent re-renders for an unrelated reason', () => {
    const { container, getByRole } = render(<Host />);

    // Mount: the effect ran and queued the lap's first frame.
    expect(rafCallbacks.size).toBe(1);

    // Advance to mid-lap (t=0.5 of the 1000ms lap).
    act(() => {
      flushRaf(500);
    });
    expect(rafCallbacks.size).toBe(1); // the next frame was scheduled
    const inFlightId = Array.from(rafCallbacks.keys())[0];

    // Trigger a re-render that has nothing to do with SignalP's props.
    act(() => {
      fireEvent.click(getByRole('button'));
    });

    // The in-flight frame must not have been cancelled, and the same raf id
    // must still be the one pending -- if the effect had torn down and
    // restarted (the bug), cleanup would have cancelled exactly this id and
    // registered a new one starting a fresh lap.
    expect(cancelledIds.has(inFlightId)).toBe(false);
    expect(rafCallbacks.has(inFlightId)).toBe(true);

    // Finish what should be the *same* lap: flushing to now=1000 completes a
    // lap that started at t0=0. If the lap had restarted mid-flight instead,
    // this would only bring the restarted lap to its own t=0.5 -- still in
    // progress, not at rest, and still holding a pending frame.
    act(() => {
      flushRaf(1000);
    });

    expect(rafCallbacks.size).toBe(0); // 'once' mode: nothing rescheduled after completion

    const dot = container.querySelector('[data-testid="signal-p-dot"]')!;
    const [restX, restY] = getDotRestPoint('master'); // default size (48px) uses the master build
    expect(Number(dot.getAttribute('cx'))).toBeCloseTo(restX, 3);
    expect(Number(dot.getAttribute('cy'))).toBeCloseTo(restY, 3);
  });

  it('does not tear down the effect when re-rendered with the same props (sanity check on the dependency array)', () => {
    const { rerender } = render(<SignalP mode="once" duration={1000} size={48} />);
    expect(rafCallbacks.size).toBe(1);
    const firstId = Array.from(rafCallbacks.keys())[0];

    // Re-render with an identical prop set -- a new element, same values.
    act(() => {
      rerender(<SignalP mode="once" duration={1000} size={48} />);
    });

    expect(cancelledIds.has(firstId)).toBe(false);
    expect(rafCallbacks.has(firstId)).toBe(true);
  });
});

describe('SignalP -- low-severity QA notes', () => {
  it('clamps a degenerate duration instead of leaving the dot stuck on a NaN frame', () => {
    const { container } = render(<SignalP mode="once" duration={0} size={48} />);
    act(() => {
      // Whatever timestamp arrives, the clamped duration must yield a
      // finite, valid progress value -- never NaN attributes on the dot.
      flushRaf(0);
    });
    const dot = container.querySelector('[data-testid="signal-p-dot"]')!;
    expect(dot.getAttribute('cx')).not.toBe('NaN');
    expect(dot.getAttribute('cy')).not.toBe('NaN');
    expect(Number.isFinite(Number(dot.getAttribute('cx')))).toBe(true);
    expect(Number.isFinite(Number(dot.getAttribute('cy')))).toBe(true);
  });

  it('never renders an empty aria-label alongside aria-hidden', () => {
    const { container } = render(<SignalP mode="static" label="" />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.hasAttribute('aria-label')).toBe(false);
  });

  it('an explicit null label stays decorative even in waiting mode (no mode-default label leaks in)', () => {
    const { container } = render(<SignalP mode="waiting" label={null} />);
    const svg = container.querySelector('svg')!;
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.hasAttribute('aria-label')).toBe(false);
  });
});
