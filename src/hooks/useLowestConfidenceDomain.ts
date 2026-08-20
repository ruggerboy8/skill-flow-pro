import { useMemo } from 'react';
import { parseISO, subWeeks } from 'date-fns';
import { useMyWeeklyScores } from './useMyWeeklyScores';
import { computeDomainAverages, pickLowestConfidenceDomain, type DomainAverageEntry } from '@/lib/lowestConfidenceDomain';

// Matches ConfidenceCard's default window ('quarter' = 13 weeks). MOB-5 uses
// the same window so glow selection agrees with what Performance shows as
// the weakest domain (spec open question 5, recommendation accepted).
const QUARTER_WEEKS = 13;

/**
 * The staff member's lowest-confidence domain over the quarter window —
 * shared by ConfidenceCard's own aggregation and useStaffGlows (MOB-5) via
 * the same pure helper (src/lib/lowestConfidenceDomain.ts) so the two can
 * never disagree. See docs/specs/mob-5-recognition-card.md.
 */
export function useLowestConfidenceDomain(staffId: string | undefined) {
  const { rawData, loading } = useMyWeeklyScores({ staffId });

  const cutoff = useMemo(() => subWeeks(new Date(), QUARTER_WEEKS), []);

  const inWindow = useMemo(
    () => rawData.filter((r) => r.week_of && parseISO(r.week_of) >= cutoff),
    [rawData, cutoff]
  );

  const domainAverages: Map<string, DomainAverageEntry> = useMemo(
    () => computeDomainAverages(inWindow),
    [inWindow]
  );

  const lowestConfidenceDomain = useMemo(
    () => pickLowestConfidenceDomain(domainAverages),
    [domainAverages]
  );

  return { domainAverages, lowestConfidenceDomain, loading };
}
