import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { RouteLoadingFallback } from './RouteLoadingFallback';

// PRF-3 QA fix: this component picks the sizing class that decides whether a
// Suspense fallback covers the whole viewport (min-h-screen -- correct when
// there's no persistent chrome underneath, e.g. the pre-auth gate or a
// top-level route outside Layout) or just fills its container (py-24 --
// correct when it's nested inside the app shell's Outlet, so the
// sidebar/header/tab bar stay mounted around it). Getting this wrong is
// exactly the bug QA caught, so it's worth pinning directly.

afterEach(cleanup);

describe('RouteLoadingFallback', () => {
  it('defaults to a full-screen fallback', () => {
    const { container } = render(<RouteLoadingFallback />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('min-h-screen');
    expect(root.className).not.toContain('py-24');
  });

  it('renders full-screen when fullScreen is explicitly true', () => {
    const { container } = render(<RouteLoadingFallback fullScreen={true} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('min-h-screen');
  });

  it('renders content-scoped (not full-screen) when fullScreen is false', () => {
    const { container } = render(<RouteLoadingFallback fullScreen={false} />);
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).not.toContain('min-h-screen');
    expect(root.className).toContain('py-24');
  });

  it('always renders the SignalP brand loader in waiting mode', () => {
    const { container } = render(<RouteLoadingFallback />);
    // SignalP exposes itself as a status region with an accessible label
    // when mode="waiting" (see SignalP.tsx) -- assert on that rather than a
    // structural detail of its SVG markup.
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.getAttribute('aria-label')).toBe('Loading');
  });
});
