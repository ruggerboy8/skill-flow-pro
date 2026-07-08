import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useSessionState — useState-shaped hook backed by sessionStorage.
 *
 * Use for UI state that shouldn't leak into the URL (large blobs, per-tab
 * toggles). Value survives tab-away/return and page refresh within the same
 * browser tab; cleared when the tab closes.
 *
 * The `key` should be namespaced (e.g. `clinical:doctor:${id}:assessmentsOpen`)
 * to avoid collisions between pages.
 */
export function useSessionState<T>(key: string, defaultValue: T): [T, (value: T | ((prev: T) => T)) => void] {
  const readInitial = (): T => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw === null) return defaultValue;
      return JSON.parse(raw) as T;
    } catch {
      return defaultValue;
    }
  };

  const [value, setValue] = useState<T>(readInitial);
  const keyRef = useRef(key);

  // If key changes, re-read from storage.
  useEffect(() => {
    if (keyRef.current === key) return;
    keyRef.current = key;
    setValue(readInitial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        try {
          if (resolved === undefined || resolved === null) {
            window.sessionStorage.removeItem(key);
          } else {
            window.sessionStorage.setItem(key, JSON.stringify(resolved));
          }
        } catch {
          /* quota exceeded — ignore */
        }
        return resolved;
      });
    },
    [key]
  );

  return [value, set];
}
