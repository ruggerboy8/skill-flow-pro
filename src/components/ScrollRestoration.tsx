import { useEffect, useRef } from 'react';
import { useLocation, useNavigationType } from 'react-router-dom';

interface Props {
  /** Namespace so different sections don't overwrite each other. */
  scopeKey: string;
}

/**
 * Records window scroll position per pathname in sessionStorage, and restores
 * it on POP navigation (browser back/forward) for paths within the given scope.
 *
 * Mount once inside a section layout (e.g. ClinicalLayout).
 */
export function ScrollRestoration({ scopeKey }: Props) {
  const location = useLocation();
  const navType = useNavigationType();
  const lastPathRef = useRef<string | null>(null);

  // Save scroll for the outgoing path just before it changes.
  useEffect(() => {
    const path = location.pathname;
    const prevPath = lastPathRef.current;

    // Restore on mount / POP navigations.
    if (navType === 'POP' || prevPath === null) {
      try {
        const raw = sessionStorage.getItem(`scroll:${scopeKey}:${path}`);
        if (raw !== null) {
          const y = Number(raw);
          if (Number.isFinite(y)) {
            // Wait a frame so the new page has rendered before scrolling.
            requestAnimationFrame(() => {
              requestAnimationFrame(() => window.scrollTo(0, y));
            });
          }
        }
      } catch {
        /* ignore */
      }
    } else {
      // Fresh navigation to a new path — start at top.
      window.scrollTo(0, 0);
    }

    lastPathRef.current = path;

    // Save scroll on unmount / before path change.
    return () => {
      try {
        sessionStorage.setItem(`scroll:${scopeKey}:${path}`, String(window.scrollY));
      } catch {
        /* ignore */
      }
    };
  }, [location.pathname, navType, scopeKey]);

  return null;
}
