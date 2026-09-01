import { useMemo, useState, useEffect } from 'react';
import { useStaffWeeklyScores } from '@/hooks/useStaffWeeklyScores';
import { useLocationExcuses } from '@/hooks/useLocationExcuses';
import { LocationHealthCard, LocationStats } from '@/components/dashboard/LocationHealthCard';
import { ExcuseSubmissionsDialog } from '@/components/dashboard/ExcuseSubmissionsDialog';
import { SignalsBanner, Signal } from '@/components/dashboard/SignalsBanner';
import { DomainConfidenceHeatmap } from '@/components/dashboard/DomainConfidenceHeatmap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, CloudOff } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { StaffWeekSummary } from '@/types/coachV2';
import { nowUtc } from '@/lib/centralTime';
import { useLocationTimezone } from '@/hooks/useLocationTimezone';
import { getLocationSubmissionGates, calculateExcuseAdjustedLocationStats, type SubmissionGates } from '@/lib/submissionStatus';
import { getSubmissionPolicy, getPolicyOffsetsForLocation } from '@/lib/submissionPolicy';
import { participationTier } from '@/lib/participationTier';
import { getDashboardMoment } from '@/lib/dashboardMoment';
import { severityComparator, type GridSortEntry } from '@/lib/dashboardGridSort';
import { supabase } from '@/integrations/supabase/client';

interface LocationConfig {
  timezone: string;
  conf_due_day: number;
  conf_due_time: string;
  perf_due_day: number;
  perf_due_time: string;
}

export default function RegionalDashboard() {
  const tz = useLocationTimezone();
  const [now, setNow] = useState(nowUtc());
  const [excuseDialogOpen, setExcuseDialogOpen] = useState(false);
  const [locationConfigs, setLocationConfigs] = useState<Map<string, LocationConfig>>(new Map());

  // Keep time updated for live dashboard feel
  useEffect(() => {
    const interval = setInterval(() => setNow(nowUtc()), 60000);
    return () => clearInterval(interval);
  }, []);
  
  // Use the current user's location timezone for the correct "Week Of" date
  const displayPolicy = useMemo(() => getSubmissionPolicy(now, tz), [now, tz]);
  const weekOf = formatInTimeZone(displayPolicy.mondayZ, tz, 'yyyy-MM-dd');
  
  // Reuse existing hook - no new RPC needed
  const { summaries, loading, error } = useStaffWeeklyScores({ weekOf });

  // Fetch per-location deadline configs once we have summaries
  useEffect(() => {
    if (summaries.length === 0) return;
    const locationIds = [...new Set(summaries.map(s => s.location_id))];
    supabase
      .from('locations')
      .select('id, timezone, conf_due_day, conf_due_time, perf_due_day, perf_due_time')
      .in('id', locationIds)
      .then(({ data }) => {
        if (!data) return;
        const map = new Map<string, LocationConfig>();
        data.forEach(loc => {
          map.set(loc.id, {
            timezone: loc.timezone,
            conf_due_day: loc.conf_due_day,
            conf_due_time: loc.conf_due_time,
            perf_due_day: loc.perf_due_day,
            perf_due_time: loc.perf_due_time,
          });
        });
        setLocationConfigs(map);
      });
  }, [summaries]);
  
  // Location-level excuses
  const { 
    getExcuseStatus, 
    canManage: canManageExcuses,
  } = useLocationExcuses(weekOf);

  // Build per-location submission gates
  const locationGatesMap = useMemo(() => {
    const map = new Map<string, SubmissionGates>();
    locationConfigs.forEach((config, locId) => {
      map.set(locId, getLocationSubmissionGates(now, config));
    });
    return map;
  }, [now, locationConfigs]);

  // Build per-location submission gate props for LocationHealthCard
  const getCardSubmissionGates = (locId: string) => {
    const gates = locationGatesMap.get(locId);
    if (!gates) {
      return { confidenceOpen: true, confidenceClosed: false, performanceOpen: false, performanceClosed: false };
    }
    return {
      confidenceOpen: true,
      confidenceClosed: gates.isPastConfidenceDeadline,
      performanceOpen: gates.isPerformanceOpen,
      performanceClosed: gates.isPastPerformanceDeadline,
    };
  };

  // Aggregate by location client-side
  const { locationStats, totals } = useMemo(() => {
    const byLocation = new Map<string, StaffWeekSummary[]>();
    
    summaries.forEach(s => {
      if (!byLocation.has(s.location_id)) {
        byLocation.set(s.location_id, []);
      }
      byLocation.get(s.location_id)!.push(s);
    });

    const stats: LocationStats[] = Array.from(byLocation.entries()).map(([locId, staff]) => {
      // Use per-location gates if available, otherwise default to "nothing due yet"
      const gates = locationGatesMap.get(locId) ?? {
        isPastConfidenceDeadline: false,
        isPastPerformanceDeadline: false,
        isPerformanceOpen: false,
      };
      
      // DASH-4: excuse adjustments (zeroed counts, 100% when fully excused,
      // excuse-off effective gates for distinct-missed and due totals) live
      // in this shared helper so Location Detail shows the same numbers.
      const locStats = calculateExcuseAdjustedLocationStats(staff, gates, getExcuseStatus(locId));

      return {
        id: locId,
        name: staff[0]?.location_name || 'Unknown',
        staffCount: locStats.staffCount,
        owedStaffCount: locStats.owedStaffCount,
        submissionRate: locStats.submissionRate,
        missingConfCount: locStats.missingConfCount,
        missingPerfCount: locStats.missingPerfCount,
        distinctMissedCount: locStats.distinctMissedCount,
        pendingConfCount: locStats.pendingConfCount,
        confSubmitted: locStats.confSubmittedCount,
        confExpected: locStats.confExpectedCount,
        perfSubmitted: locStats.perfSubmittedCount,
        perfExpected: locStats.perfExpectedCount,
      };
    });

    // Sorted later via the severity comparator (DASH-5), once the tier and
    // deadline metadata are known - see sortedLocationStats.
    const totalStaff = stats.reduce((sum, s) => sum + s.staffCount, 0);

    return {
      locationStats: stats,
      totals: { totalStaff, locationCount: stats.length }
    };
  }, [summaries, locationGatesMap, getExcuseStatus]);

  // Compute signals, only fire when a deadline has actually passed, and
  // use the same participationTier bands as the summary cards and location
  // cards so the banner never disagrees with them (DASH-1a).
  const signals = useMemo((): Signal[] => {
    const result: Signal[] = [];
    locationStats.forEach(loc => {
      const gates = locationGatesMap.get(loc.id);
      const anyDeadlinePassed = !!(gates?.isPastConfidenceDeadline || gates?.isPastPerformanceDeadline);
      // owedStaffCount 0 = no assignments published this week: nothing is
      // due, so a shortfall is impossible and a nudge would be noise (DASH-5).
      if (!anyDeadlinePassed || loc.owedStaffCount === 0) return;

      // Round once and reuse for both the >= 85 gate and the tier decision
      // (DASH-1a QA fix), so a rate that displays as 85% can never still
      // read "below 85%" in the signal message.
      const displayRate = Math.round(loc.submissionRate);
      if (displayRate >= 85) return;

      const tier = participationTier({
        rate: displayRate,
        missedCount: loc.distinctMissedCount,
        teamSize: loc.owedStaffCount,
        anyDeadlinePassed,
      });

      result.push({
        type: 'participation_drop',
        message: `${loc.name}: participation rate is ${displayRate}% this week, below 85%.`,
        locationName: loc.name,
        severity: tier === 'red' ? 'red' : 'watch',
      });
    });
    return result;
  }, [locationStats, locationGatesMap]);

  // Build location names map for heatmap
  const locationNamesMap = useMemo(() => {
    const map: Record<string, string> = {};
    locationStats.forEach(loc => { map[loc.id] = loc.name; });
    return map;
  }, [locationStats]);

  const locationIdList = useMemo(() => locationStats.map(l => l.id), [locationStats]);

  // DASH-1b: which of the page's two moments we're in - mid-week (nudge
  // toward a deadline) or wrap-up (review what was missed). Drives strip
  // titling and section order; the grid sort itself is moment-agnostic
  // severity ordering as of DASH-5. See dashboardMoment.ts.
  const moment = useMemo(() => getDashboardMoment(locationGatesMap), [locationGatesMap]);

  // Per-location deadline metadata for the grid sort and card labels,
  // computed once alongside the same policy calls the display label
  // already needed, so the sort and the label can never disagree.
  const locationDeadlineMeta = useMemo(() => {
    const map = new Map<string, { label: string | null; nextDeadlineAt: Date | null; pendingCount: number }>();
    locationStats.forEach(stats => {
      const locConfig = locationConfigs.get(stats.id);
      let label: string | null = null;
      let nextDeadlineAt: Date | null = null;
      let pendingCount = 0;
      if (locConfig) {
        const offsets = getPolicyOffsetsForLocation(locConfig);
        const policy = getSubmissionPolicy(now, locConfig.timezone, offsets);
        if (!policy.isConfidenceLate(now)) {
          label = `Conf due ${formatInTimeZone(policy.confidence_due, locConfig.timezone, 'EEE h:mm a')}`;
          nextDeadlineAt = policy.confidence_due;
          pendingCount = stats.pendingConfCount ?? 0;
        } else if (!policy.isPerformanceLate(now)) {
          label = `Perf due ${formatInTimeZone(policy.performance_due, locConfig.timezone, 'EEE h:mm a')}`;
          nextDeadlineAt = policy.performance_due;
          pendingCount = Math.max((stats.perfExpected ?? 0) - (stats.perfSubmitted ?? 0), 0);
        }
      }
      map.set(stats.id, { label, nextDeadlineAt, pendingCount });
    });
    return map;
  }, [locationStats, locationConfigs, now]);

  // DASH-5: worst shape first, always. Each location's sort entry is built
  // from the same excuse-adjusted stats, gates, and deadline metadata its
  // card renders, so the order and the cards can never disagree. See
  // severityComparator for the band definitions.
  const sortedLocationStats = useMemo(() => {
    const entryFor = (loc: LocationStats): GridSortEntry => {
      const gates = locationGatesMap.get(loc.id);
      const anyDeadlinePassed = !!(gates?.isPastConfidenceDeadline || gates?.isPastPerformanceDeadline);
      const meta = locationDeadlineMeta.get(loc.id) ?? { nextDeadlineAt: null, pendingCount: 0 };
      return {
        tier: participationTier({
          rate: Math.round(loc.submissionRate),
          missedCount: loc.distinctMissedCount,
          teamSize: loc.owedStaffCount,
          anyDeadlinePassed,
        }),
        owedStaffCount: loc.owedStaffCount,
        submissionRate: loc.submissionRate,
        nextDeadlineAt: meta.nextDeadlineAt,
        pendingCount: meta.pendingCount,
      };
    };
    const entries = new Map(locationStats.map(loc => [loc.id, entryFor(loc)]));
    return [...locationStats].sort((a, b) => severityComparator(entries.get(a.id)!, entries.get(b.id)!));
  }, [locationStats, locationDeadlineMeta, locationGatesMap]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-10 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Skeleton key={i} className="h-36" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-6xl mx-auto">
          <Card className="border-destructive">
            <CardContent className="p-6">
              <p className="text-destructive">Error loading dashboard: {error.message}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // DASH-1b: build the heatmap and grid sections once, then order them by
  // moment below, rather than writing two parallel JSX trees.
  const heatmapSection = locationIdList.length > 0 ? (
    <DomainConfidenceHeatmap
      key="heatmap"
      locationIds={locationIdList}
      locationNames={locationNamesMap}
    />
  ) : null;

  const gridSection = (
    <div key="grid">
      {locationStats.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-muted-foreground">
            No location data available for this week.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sortedLocationStats.map(stats => (
            <LocationHealthCard
              key={stats.id}
              stats={stats}
              excuseStatus={getExcuseStatus(stats.id)}
              submissionGates={getCardSubmissionGates(stats.id)}
              nextDeadlineLabel={locationDeadlineMeta.get(stats.id)?.label ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );

  // Mid-week: grid first (nudge targets), heatmap demoted to the bottom
  // (it's 6-week lookback data, irrelevant to nudging). Wrap-up: heatmap
  // promoted as the coaching lens, grid as the calm archive.
  const orderedSections = moment === 'wrapup'
    ? [heatmapSection, gridSection]
    : [gridSection, heatmapSection];

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Regional Command Center</h1>
            <p className="text-muted-foreground text-sm">
              Week of {formatInTimeZone(displayPolicy.mondayZ, tz, 'MMM d, yyyy')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
              <Users className="h-4 w-4" />
              {totals.totalStaff} staff
            </span>
            <Badge variant="outline" className="text-sm">
              {totals.locationCount} Location{totals.locationCount !== 1 ? 's' : ''}
            </Badge>
            {canManageExcuses && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExcuseDialogOpen(true)}
                className="gap-2"
              >
                <CloudOff className="h-4 w-4" />
                Excuse ProMoves
              </Button>
            )}
          </div>
        </div>

        {/* Signals Banner, retitled per moment (DASH-1b) */}
        <SignalsBanner
          signals={signals}
          title={moment === 'wrapup' ? 'Missed this week' : 'Needs a nudge'}
          emptyStateMessage={
            moment === 'wrapup'
              ? 'All locations submitted.'
              : 'No flags this week, all locations on track.'
          }
        />

        {/* DASH-5: the Weekly Participation summary card was removed here.
            Its due-only org rate silently narrowed to whichever locations
            had already passed a deadline (Tuesday mornings that was one UK
            site), reading as a nonsense org-wide 0%. Per-location truth
            lives on the cards below; nothing at page level claims to be an
            org rate anymore. */}

        {/* Moment-aware section order (DASH-1b): see orderedSections above. */}
        {orderedSections}
      </div>
      
      {/* Excuse Submissions Dialog */}
      <ExcuseSubmissionsDialog
        open={excuseDialogOpen}
        onOpenChange={setExcuseDialogOpen}
        initialWeekOf={weekOf}
      />
    </div>
  );
}
