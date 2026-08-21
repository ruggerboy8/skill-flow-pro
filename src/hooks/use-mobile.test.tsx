// Regression tests for the Explore competency-tap "blink" (2026-08-21).
//
// CraftAtlasArea and ExploreMove are mobile-shell-only routes: when
// useMobileShell() reads false they immediately return a <Navigate> redirect
// back to the desktop equivalent. useIsMobile used to start as `undefined`
// (coerced to false) and only learn the real viewport width in an effect, so
// the FIRST render of those pages always looked like desktop. With the atlas
// query already cached (the normal case: the user just tapped a competency on
// the domain page), the redirect fired on that first frame and phone users
// bounced straight back — screen blink, no navigation. These tests pin the
// fix: the hook must report the true viewport width on its very first render.

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { useIsMobile } from './use-mobile';

// jsdom implements neither matchMedia nor resizable viewports, so both are
// stubbed. The stub records change-listeners so the resize test can fire them.
type ChangeListener = () => void;
const changeListeners = new Set<ChangeListener>();

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

beforeEach(() => {
  changeListeners.clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: (_type: string, listener: ChangeListener) => {
        changeListeners.add(listener);
      },
      removeEventListener: (_type: string, listener: ChangeListener) => {
        changeListeners.delete(listener);
      },
    }))
  );
});

/** Records the hook's value for every render, so the first render's value
 *  can be asserted separately from the post-effect one. */
function renderProbe() {
  const values: boolean[] = [];
  function Probe() {
    values.push(useIsMobile());
    return null;
  }
  const utils = render(<Probe />);
  return { values, ...utils };
}

describe('useIsMobile', () => {
  it('reports mobile on the FIRST render for a narrow viewport (the blink bug)', () => {
    setViewportWidth(390); // iPhone-ish
    const { values } = renderProbe();
    expect(values[0]).toBe(true);
    expect(values.every(Boolean)).toBe(true);
  });

  it('reports desktop on the first render for a wide viewport', () => {
    setViewportWidth(1280);
    const { values } = renderProbe();
    expect(values[0]).toBe(false);
    expect(values.some(Boolean)).toBe(false);
  });

  it('treats the 768px breakpoint itself as desktop', () => {
    setViewportWidth(768);
    const { values } = renderProbe();
    expect(values[0]).toBe(false);
  });

  it('still tracks viewport changes after mount', () => {
    setViewportWidth(1280);
    const { values } = renderProbe();
    expect(values.at(-1)).toBe(false);

    setViewportWidth(390);
    act(() => {
      changeListeners.forEach((listener) => listener());
    });
    expect(values.at(-1)).toBe(true);
  });
});
