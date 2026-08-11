// Shared "how long since the last coaching session" indicator. Purely
// informational — no gates, no notifications, just a gentle pulse so a
// drifting doctor-coach pair doesn't go silently invisible on the roster.
// Healthy cadence per John: ideally every 2-3 weeks, monthly minimum.

import { differenceInCalendarWeeks } from 'date-fns';

export type CadenceTone = 'none' | 'fresh' | 'drifting' | 'stale';

export interface CadenceInfo {
  tone: CadenceTone;
  label: string;
}

const DRIFTING_AT_WEEKS = 4;
const STALE_AT_WEEKS = 6;

/**
 * @param lastSessionAt ISO timestamp of the most recent meeting record's
 *   submitted_at for this doctor-coach pair, or null/undefined if no
 *   meeting has ever been captured.
 */
export function getCadenceInfo(lastSessionAt: string | null | undefined): CadenceInfo {
  if (!lastSessionAt) {
    return { tone: 'none', label: 'Not started' };
  }

  const weeks = differenceInCalendarWeeks(new Date(), new Date(lastSessionAt));

  if (weeks <= 0) {
    return { tone: 'fresh', label: 'This week' };
  }

  const plural = weeks === 1 ? '' : 's';

  // Bands per John: under 4 weeks fresh, 4 to 6 weeks drifting (6 itself
  // is still amber), past 6 stale.
  if (weeks < DRIFTING_AT_WEEKS) return { tone: 'fresh', label: `${weeks} week${plural} ago` };
  if (weeks <= STALE_AT_WEEKS) return { tone: 'drifting', label: `${weeks} week${plural} since last session` };
  return { tone: 'stale', label: `${weeks} week${plural} since last session` };
}
