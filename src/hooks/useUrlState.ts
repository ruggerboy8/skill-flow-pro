import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * useUrlState — useState-shaped hook backed by a URL query param.
 *
 * The value survives tab-away/return, page refresh, and browser back/forward
 * because it lives in the URL. Writes use `replace: true` so filter changes
 * don't pile up in the browser history.
 *
 * Encoding:
 *   - `null` / `undefined` / defaultValue → param is removed
 *   - booleans → '1' | '0'
 *   - numbers → String(n)
 *   - strings → as-is
 *   - anything else → JSON.stringify (opt in via serialize)
 */
export interface UrlStateOptions<T> {
  serialize?: (value: T) => string | null;
  parse?: (raw: string) => T;
  /** Also write the value here when it matches the default (defaults to false — cleaner URLs). */
  keepDefaultInUrl?: boolean;
}

function defaultSerialize<T>(value: T): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function defaultParse<T>(raw: string, fallback: T): T {
  if (typeof fallback === 'boolean') return (raw === '1' || raw === 'true') as unknown as T;
  if (typeof fallback === 'number') {
    const n = Number(raw);
    return (Number.isFinite(n) ? n : fallback) as unknown as T;
  }
  if (typeof fallback === 'string' || fallback === null || fallback === undefined) {
    return raw as unknown as T;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function useUrlState<T>(
  key: string,
  defaultValue: T,
  options: UrlStateOptions<T> = {}
): [T, (value: T) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get(key);

  const value = useMemo<T>(() => {
    if (raw === null) return defaultValue;
    return options.parse ? options.parse(raw) : defaultParse(raw, defaultValue);
  }, [raw, defaultValue, options.parse]);

  const setValue = useCallback(
    (next: T) => {
      const serialized = options.serialize
        ? options.serialize(next)
        : defaultSerialize(next);

      const isDefault =
        next === defaultValue ||
        (next === null && defaultValue === null) ||
        (next === undefined && defaultValue === undefined);

      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (serialized === null || (isDefault && !options.keepDefaultInUrl)) {
            params.delete(key);
          } else {
            params.set(key, serialized);
          }
          return params;
        },
        { replace: true }
      );
    },
    [key, defaultValue, setSearchParams, options.serialize, options.keepDefaultInUrl]
  );

  return [value, setValue];
}
