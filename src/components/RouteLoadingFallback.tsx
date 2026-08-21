import { SignalP } from '@/components/brand/SignalP';
import { cn } from '@/lib/utils';

/**
 * PRF-3: shared Suspense fallback for lazy-loaded routes. Same brand loader
 * everywhere, same "waiting" mode -- discrete laps, never a continuous spin
 * -- see DSN-5c / docs/dev/motion-rules.md.
 *
 * `fullScreen` (default true) covers the whole viewport -- for boundaries
 * with no persistent chrome underneath: the pre-auth gate in App.tsx, and
 * top-level routes that render outside Layout (e.g. /facilitate). Pass
 * `fullScreen={false}` for a boundary nested inside the app shell (Layout's
 * <Outlet />), so the sidebar/header/tab bar stay mounted and only the
 * content area shows the loader instead of the whole shell unmounting.
 */
export function RouteLoadingFallback({ fullScreen = true }: { fullScreen?: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center justify-center bg-background',
        fullScreen ? 'min-h-screen' : 'py-24'
      )}
    >
      <SignalP mode="waiting" size={48} />
    </div>
  );
}
