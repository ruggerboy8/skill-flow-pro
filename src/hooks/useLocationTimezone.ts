import { useStaffProfile } from './useStaffProfile';

/**
 * Fallback timezone used when no location-specific timezone is set.
 * All Alcan locations are seeded with 'America/Chicago', so this should
 * only be hit for users without a primary location.
 */
export const FALLBACK_TZ = 'America/Chicago';

/**
 * Returns the current user's primary location timezone.
 * Reads from the staffProfile → locations.timezone join that is already
 * fetched by useStaffProfile. Falls back to FALLBACK_TZ while loading
 * or if no timezone is set.
 *
 * Use this hook in any React component that needs to display or calculate
 * deadlines in the user's local timezone instead of the hardcoded CT_TZ.
 */
export function useLocationTimezone(): string {
  // Use non-redirecting options to avoid nav side effects in admin components
  // that may not rely on a staff profile being present.
  const { data: profile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  return profile?.locations?.timezone ?? FALLBACK_TZ;
}
