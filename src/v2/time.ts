// V2 time utilities with location-aware timezone handling
// Currently re-exports v1 functionality but ensures tz is read from location

import { getWeekAnchors as _getWeekAnchors, getAnchors, nowUtc, nextMondayStr, CT_TZ } from '@/lib/centralTime';
import { supabase } from '@/integrations/supabase/client';

// Re-export core time functions
export { getAnchors, nowUtc, nextMondayStr, CT_TZ } from '@/lib/centralTime';

/**
 * Enhanced getWeekAnchors that reads timezone from location if locationId provided
 */
export async function getWeekAnchors(
  now: Date = new Date(), 
  tzOrLocationId?: string
): Promise<ReturnType<typeof _getWeekAnchors>> {
  let timezone = CT_TZ; // default fallback
  
  // If tzOrLocationId looks like a UUID (locationId), fetch timezone from location
  if (tzOrLocationId && tzOrLocationId.includes('-')) {
    try {
      const { data: location } = await supabase
        .from('locations')
        .select('timezone')
        .eq('id', tzOrLocationId)
        .maybeSingle();
      
      if (location?.timezone) {
        timezone = location.timezone;
      }
    } catch (error) {
      console.warn('Failed to fetch location timezone, using default:', error);
    }
  } else if (tzOrLocationId) {
    // Direct timezone string provided
    timezone = tzOrLocationId;
  }
  
  return _getWeekAnchors(now, timezone);
}