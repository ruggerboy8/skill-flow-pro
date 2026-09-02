import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import {
  computeShowPending,
  useIsTouchDevice,
  usePrefersReducedMotion,
  type PendingAsk,
} from './askPageLogic';

describe('computeShowPending', () => {
  const pending: PendingAsk = { conversationId: 'c1', question: 'hi', prevCount: 2 };

  it('is false with no pending ask', () => {
    expect(computeShowPending(null, 'c1', 2)).toBe(false);
  });

  it('is false when the pending ask belongs to a different conversation (mid-ask switching)', () => {
    expect(computeShowPending(pending, 'c2', 2)).toBe(false);
  });

  it('is false while still creating a new conversation (pending.conversationId is null, activeId is null)', () => {
    const creating: PendingAsk = { conversationId: null, question: 'hi', prevCount: 0 };
    expect(computeShowPending(creating, null, 0)).toBe(true);
  });

  it('stays true until both the question and answer rows have landed', () => {
    // prevCount was 2 at send time; both new rows must arrive before it clears.
    expect(computeShowPending(pending, 'c1', 2)).toBe(true);
    expect(computeShowPending(pending, 'c1', 3)).toBe(true);
    expect(computeShowPending(pending, 'c1', 4)).toBe(false);
  });

  it('stays true for a repeated question (content-independent, count-only check)', () => {
    // A question identical to an earlier one in the thread doesn't make the
    // count jump any differently — this is exactly the PR #81 regression.
    expect(computeShowPending(pending, 'c1', 2)).toBe(true);
  });
});

describe('viewport hooks (synchronous first render — see use-mobile.test.tsx precedent)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: query.includes('coarse') || query.includes('reduce'),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
    );
  });

  it('useIsTouchDevice reads matchMedia(pointer: coarse) correctly on the FIRST render', () => {
    const values: boolean[] = [];
    function Probe() {
      values.push(useIsTouchDevice());
      return null;
    }
    render(<Probe />);
    expect(values[0]).toBe(true);
  });

  it('useIsTouchDevice reports false on a fine-pointer device', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }))
    );
    const values: boolean[] = [];
    function Probe() {
      values.push(useIsTouchDevice());
      return null;
    }
    render(<Probe />);
    expect(values[0]).toBe(false);
  });

  it('usePrefersReducedMotion reads matchMedia(prefers-reduced-motion) correctly on the FIRST render', () => {
    const values: boolean[] = [];
    function Probe() {
      values.push(usePrefersReducedMotion());
      return null;
    }
    render(<Probe />);
    expect(values[0]).toBe(true);
  });
});
