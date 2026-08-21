import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppSidebar } from './AppSidebar';
import { SidebarProvider } from '@/components/ui/sidebar';

// DSN-8a: the sidebar's brand mark must track the sidebar's own
// expanded/collapsed state (from useSidebar()) rather than a parallel one --
// full logo (Signal P + wordmark) expanded, standalone Signal P collapsed.

// SidebarProvider renders useIsMobile() (src/hooks/use-mobile.tsx), which
// calls window.matchMedia unconditionally. jsdom in this repo has no
// matchMedia (SignalP.test.tsx notes the same gap for its own hook), so it's
// stubbed here, scoped to this file only.
beforeEach(() => {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderSidebar(defaultOpen: boolean) {
  return render(
    <MemoryRouter>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar navigation={[]} />
      </SidebarProvider>
    </MemoryRouter>
  );
}

describe('AppSidebar brand mark', () => {
  it('shows the full wordmark logo when expanded, no standalone Signal P mark', () => {
    const { container } = renderSidebar(true);
    expect(container.querySelector('img[alt="Pro Moves"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="signal-p-structure"]')).toBeNull();
  });

  it('shows only the standalone Signal P mark when collapsed, no wordmark image', () => {
    const { container } = renderSidebar(false);
    expect(container.querySelector('[data-testid="signal-p-structure"]')).not.toBeNull();
    expect(container.querySelector('img[alt="Pro Moves"]')).toBeNull();
  });
});
