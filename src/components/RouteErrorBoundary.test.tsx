import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { RouteErrorBoundary, classifyRouteError } from './RouteErrorBoundary';

// PRF-3a: the "New Version Available" copy this boundary shows for a failed
// lazy-chunk load is misleading when the real cause is the user being
// offline, not a stale build after a deploy. classifyRouteError is the pure
// decision extracted out of getDerivedStateFromError so this is testable
// without mounting a component or throwing a real error; the render tests
// below then pin the three resulting UI branches (offline / stale-build /
// generic) end to end.

afterEach(cleanup);

describe('classifyRouteError', () => {
  const chunkErrorMessages = [
    'Failed to fetch dynamically imported module: https://app/assets/AdminPage-abc123.js',
    'Importing a module script failed',
    'Loading chunk 4 failed',
  ];

  it.each(chunkErrorMessages)('classifies "%s" as chunk-update while online', (message) => {
    expect(classifyRouteError({ message, name: 'Error' }, true)).toBe('chunk-update');
  });

  it.each(chunkErrorMessages)('classifies "%s" as chunk-offline while offline', (message) => {
    expect(classifyRouteError({ message, name: 'Error' }, false)).toBe('chunk-offline');
  });

  it('classifies by error name (ChunkLoadError) in addition to message text', () => {
    expect(classifyRouteError({ message: '', name: 'ChunkLoadError' }, true)).toBe('chunk-update');
    expect(classifyRouteError({ message: '', name: 'ChunkLoadError' }, false)).toBe('chunk-offline');
  });

  it('classifies a non-chunk error as generic regardless of online status', () => {
    expect(classifyRouteError({ message: 'TypeError: x is not a function', name: 'TypeError' }, true)).toBe(
      'generic'
    );
    expect(classifyRouteError({ message: 'TypeError: x is not a function', name: 'TypeError' }, false)).toBe(
      'generic'
    );
  });
});

describe('RouteErrorBoundary', () => {
  // Every test in this block throws a real error through the boundary,
  // which React logs via console.error (componentDidCatch) -- expected
  // noise, not a real failure signal, so it's silenced per test.
  function renderWithThrow(message: string, name = 'Error') {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const Thrower = () => {
      const error = new Error(message);
      error.name = name;
      throw error;
    };
    const result = render(
      <RouteErrorBoundary>
        <Thrower />
      </RouteErrorBoundary>
    );
    return { ...result, consoleError };
  }

  function setOnline(value: boolean) {
    Object.defineProperty(window.navigator, 'onLine', { value, configurable: true });
  }

  it('shows the offline copy when a chunk load fails while offline', () => {
    setOnline(false);
    renderWithThrow('Failed to fetch dynamically imported module');

    expect(screen.queryByText('You appear to be offline')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /try again/i })).not.toBeNull();
    // The stale-build copy must not also be showing.
    expect(screen.queryByText('New Version Available')).toBeNull();
  });

  it('shows the stale-build copy when a chunk load fails while online', () => {
    setOnline(true);
    renderWithThrow('Failed to fetch dynamically imported module');

    expect(screen.queryByText('New Version Available')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /refresh page/i })).not.toBeNull();
    expect(screen.queryByText('You appear to be offline')).toBeNull();
  });

  it('shows the generic error copy for a non-chunk error, even while offline', () => {
    setOnline(false);
    renderWithThrow('Cannot read properties of undefined', 'TypeError');

    expect(screen.queryByText('Something went wrong')).not.toBeNull();
    expect(screen.queryByRole('button', { name: /refresh page/i })).not.toBeNull();
  });

  it('renders children normally when there is no error', () => {
    render(
      <RouteErrorBoundary>
        <div>All good</div>
      </RouteErrorBoundary>
    );
    expect(screen.queryByText('All good')).not.toBeNull();
  });
});
