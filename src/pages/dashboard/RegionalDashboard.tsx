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
import { Users, TrendingUp, CloudOff, Clock } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { format as formatDate } from 'date-fns';
import { StaffWeekSummary } from '@/types/coachV2';
import { nowUtc } from '@/lib/centralTime';
import { useLocationTimezone } from '@/hooks/useLocationTimezone';
import { getLocationSubmissionGates, calculateExcuseAdjustedLocationStats, calculateDueSubmissionTotals, type SubmissionGates } from '@/lib/submissionStatus';
import { getSubmissionPolicy, getPolicyOffsetsForLocation } from '@/lib/submissionPolicy';
import { participationTier, tierColorTokens } from '@/lib/participationTier';
import { getDashboardMoment } from '@/lib/dashboardMoment';
import { wrapupComparator, midweekComparator } from '@/lib/dashboardGridSort';
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

    // DASH-1a Codex fix (P1): raw conf/perf submitted & expected counts,
    // but only for locations where that metric is actually due (and not
    // excused), see calculateDueSubmissionTotals. Collected alongside the
    // per-location stats below so the org-wide colored rates can never be
    // dragged down by a location that isn't due yet.
    const dueTotalsList: ReturnType<typeof calculateDueSubmissionTotals>[] = [];

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
      dueTotalsList.push(locStats.dueTotals);

      return {
        id: locId,
        name: staff[0]?.location_name || 'Unknown',
        staffCount: locStats.staffCount,
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

    // DASH-1b: no longer sorted here - the moment-aware comparator is
    // applied later, once `moment` is known, via `sortedLocationStats`.

    const totalStaff = stats.reduce((sum, s) => sum + s.staffCount, 0);
    const totalMissingConf = stats.reduce((sum, s) => sum + s.missingConfCount, 0);
    const totalMissingPerf = stats.reduce((sum, s) => sum + s.missingPerfCount, 0);
    // DASH-1a QA fix: sum of per-location DISTINCT missed counts. Safe to
    // sum across locations since a staff member belongs to exactly one.
    const totalDistinctMissed = stats.reduce((sum, s) => sum + s.distinctMissedCount, 0);
    const totalPendingConf = stats.reduce((sum, s) => sum + (s.pendingConfCount ?? 0), 0);
    // Raw, deadline-unaware counts, used ONLY for the neutral pre-deadline
    // progress display ("X/Y conf submitted" when nothing is due yet).
    // Never feed these into a colored rate; see totalDue* below.
    const totalConfSubmitted = stats.reduce((sum, s) => sum + (s.confSubmitted ?? 0), 0);
    const totalConfExpected = stats.reduce((sum, s) => sum + (s.confExpected ?? 0), 0);
    const totalPerfSubmitted = stats.reduce((sum, s) => sum + (s.perfSubmitted ?? 0), 0);
    const totalPerfExpected = stats.reduce((sum, s) => sum + (s.perfExpected ?? 0), 0);

    // DASH-1a Codex fix (P1): due-only, excuse-aware totals that the
    // colored confRate/perfRate/avgRate must be built from instead, a
    // not-yet-due (or excused) location contributes nothing to either side
    // of the ratio, rather than dragging the denominator down. See
    // summaryTiers below, which is the only place these feed into.
    const totalDueConfSubmitted = dueTotalsList.reduce((sum, d) => sum + d.confSubmitted, 0);
    const totalDueConfExpected = dueTotalsList.reduce((sum, d) => sum + d.confExpected, 0);
    const totalDuePerfSubmitted = dueTotalsList.reduce((sum, d) => sum + d.perfSubmitted, 0);
    const totalDuePerfExpected = dueTotalsList.reduce((sum, d) => sum + d.perfExpected, 0);

    // Check if any location has passed a deadline
    const anyLocationPastDeadline = stats.some(s => {
      const gates = locationGatesMap.get(s.id);
      return gates?.isPastConfidenceDeadline || gates?.isPastPerformanceDeadline;
    });

    return {
      locationStats: stats,
      totals: { totalStaff, totalMissingConf, totalMissingPerf, totalDistinctMissed, totalPendingConf, locationCount: stats.length,
        totalConfSubmitted, totalConfExpected, totalPerfSubmitted, totalPerfExpected,
        totalDueConfSubmitted, totalDueConfExpected, totalDuePerfSubmitted, totalDuePerfExpected,
        anyLocationPastDeadline }
    };
  }, [summaries, locationGatesMap]);

  // Compute signals, only fire when a deadline has actually passed, and
  // use the same participationTier bands as the summary cards and location
  // cards so the banner never disagrees with them (DASH-1a).
  const signals = useMemo((): Signal[] => {
    const result: Signal[] = [];
    locationStats.forEach(loc => {
      const gates = locationGatesMap.get(loc.id);
      const anyDeadlinePassed = !!(gates?.isPastConfidenceDeadline || gates?.isPastPerformanceDeadline);
      if (!anyDeadlinePassed || loc.staffCount === 0) return;

      // Round once and reuse for both the >= 85 gate and the tier decision
      // (DASH-1a QA fix), so a rate that displays as 85% can never still
      // read "below 85%" in the signal message.
      const displayRate = Math.round(loc.submissionRate);
      if (displayRate >= 85) return;

      const tier = participationTier({
        rate: displayRate,
        missedCount: loc.distinctMissedCount,
        teamSize: loc.staffCount,
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

  // Compute next deadline label for context when all is on track
  const nextDeadlineLabel = useMemo(() => {
    let earliest: { label: string; date: Date } | null = null;
    locationConfigs.forEach((config) => {
      const offsets = getPolicyOffsetsForLocation(config);
      const policy = getSubmissionPolicy(now, config.timezone, offsets);
      
      if (!policy.isConfidenceLate(now)) {
        const label = `Conf due ${formatInTimeZone(policy.confidence_due, config.timezone, 'EEE h:mm a')}`;
        if (!earliest || policy.confidence_due < earliest.date) {
          earliest = { label, date: policy.confidence_due };
        }
      } else if (!policy.isPerformanceLate(now)) {
        const label = `Perf due ${formatInTimeZone(policy.performance_due, config.timezone, 'EEE h:mm a')}`;
        if (!earliest || policy.performance_due < earliest.date) {
          earliest = { label, date: policy.performance_due };
        }
      }
    });
    return earliest?.label ?? null;
  }, [now, locationConfigs]);

  // Build location names map for heatmap
  const locationNamesMap = useMemo(() => {
    const map: Record<string, string> = {};
    locationStats.forEach(loc => { map[loc.id] = loc.name; });
    return map;
  }, [locationStats]);

  const locationIdList = useMemo(() => locationStats.map(l => l.id), [locationStats]);

  // Org-wide rates and tiers for the summary cards, same participationTier
  // bands as the location cards and signals banner (DASH-1a). Each rate is
  // rounded ONCE here and reused for both the tier decision and the
  // displayed percentage (DASH-1a QA fix for the rounding mismatch), so
  // the JSX below just renders these numbers directly.
  //
  // DASH-1a Codex fix (P1): these are built from totalDue*, not the raw
  // totalConf*/totalPerf* sums, so a location that isn't due yet (or is
  // excused) can never dilute a colored rate, it contributes to neither
  // the numerator nor the denominator, the same way an individual
  // LocationHealthCard treats a not-yet-due metric as 100%, not 0%.
  const summaryTiers = useMemo(() => {
    const confRate = Math.round(
      totals.totalDueConfExpected > 0
        ? (totals.totalDueConfSubmitted / totals.totalDueConfExpected) * 100
        : 100
    );
    const perfRate = Math.round(
      totals.totalDuePerfExpected > 0
        ? (totals.totalDuePerfSubmitted / totals.totalDuePerfExpected) * 100
        : 100
    );
    // Avg Completion pools due conf + due perf into one combined rate,
    // mirroring how each location's own submissionRate is computed,
    // this is the org's own due-participation rate, not an unweighted
    // average of each location's percentage.
    const dueExpected = totals.totalDueConfExpected + totals.totalDuePerfExpected;
    const dueSubmitted = totals.totalDueConfSubmitted + totals.totalDuePerfSubmitted;
    const avgRate = Math.round(dueExpected > 0 ? (dueSubmitted / dueExpected) * 100 : 100);
    return {
      confRate,
      perfRate,
      avgRate,
      // Exposed for the merged participation row (DASH-1b): the same
      // pooled due-conf + due-perf figures already used to compute
      // avgRate above, not a new aggregate.
      dueSubmitted,
      dueExpected,
      confTier: participationTier({
        rate: confRate,
        missedCount: totals.totalMissingConf,
        teamSize: totals.totalStaff,
        anyDeadlinePassed: totals.anyLocationPastDeadline,
      }),
      perfTier: participationTier({
        rate: perfRate,
        missedCount: totals.totalMissingPerf,
        teamSize: totals.totalStaff,
        anyDeadlinePassed: totals.anyLocationPastDeadline,
      }),
      // Uses the summed DISTINCT missed count (DASH-1a QA fix), not
      // totalMissingConf + totalMissingPerf, which double-counts anyone
      // missing both metrics.
      avgTier: participationTier({
        rate: avgRate,
        missedCount: totals.totalDistinctMissed,
        teamSize: totals.totalStaff,
        anyDeadlinePassed: totals.anyLocationPastDeadline,
      }),
    };
  }, [totals]);

  // DASH-1b: which of the page's two moments we're in - mid-week (nudge
  // toward a deadline) or wrap-up (review what was missed). Drives strip
  // titling, section order, and grid sort below. See dashboardMoment.ts.
  const moment = useMemo(() => getDashboardMoment(locationGatesMap), [locationGatesMap]);

  // DASH-1b: per-location deadline metadata for the grid's mid-week sort,
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

  // DASH-1b: the grid's actual display order, per moment. Wrap-up keeps the
  // original worst-rate-first order (wrapupComparator, extracted unchanged
  // from what this page always did). Mid-week orders by soonest deadline,
  // then by pending count (midweekComparator) - "who needs a nudge first."
  const sortedLocationStats = useMemo(() => {
    if (moment === 'wrapup') {
      return [...locationStats].sort(wrapupComparator);
    }
    return [...locationStats].sort((a, b) => {
      const metaA = locationDeadlineMeta.get(a.id) ?? { nextDeadlineAt: null, pendingCount: 0 };
      const metaB = locationDeadlineMeta.get(b.id) ?? { nextDeadlineAt: null, pendingCount: 0 };
      return midweekComparator(metaA, metaB);
    });
  }, [locationStats, locationDeadlineMeta, moment]);

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

        {/* Weekly Participation - merged from the three former summary
            cards (Total Staff moved to the header above) into one
            proportion+meter row (DASH-1b). */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Weekly Participation
            </CardTitle>
          </CardHeader>
          <CardContent>
            {totals.anyLocationPastDeadline ? (
              <div className="space-y-2">
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span
                    className="text-3xl font-bold"
                    style={{ color: tierColorTokens(summaryTiers.avgTier)?.text ?? 'hsl(var(--foreground))' }}
                  >
                    {summaryTiers.avgRate}%
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {summaryTiers.dueSubmitted} of {summaryTiers.dueExpected} due submitted
                  </span>
                  {totals.totalMissingConf > 0 && (
                    <span
                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-medium"
                      style={{ backgroundColor: 'hsl(var(--status-late-bg))', color: 'hsl(var(--status-late))' }}
                    >
                      {totals.totalMissingConf} conf late
                    </span>
                  )}
                  {totals.totalMissingPerf > 0 && (
                    <span
                      className="inline-flex items-center rounded-full px-1.5 py-0.5 text-2xs font-medium"
                      style={{ backgroundColor: 'hsl(var(--status-late-bg))', color: 'hsl(var(--status-late))' }}
                    >
                      {totals.totalMissingPerf} perf late
                    </span>
                  )}
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.min(summaryTiers.avgRate, 100)}%`,
                      backgroundColor: tierColorTokens(summaryTiers.avgTier)?.text ?? 'hsl(var(--status-complete))',
                    }}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-baseline gap-3">
                  <span className="text-2xl font-bold text-foreground">
                    {totals.totalConfSubmitted} of {totals.totalConfExpected}
                  </span>
                  <span className="text-sm text-muted-foreground">confidence in</span>
                </div>
                {totals.totalConfExpected > 0 && (
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min((totals.totalConfSubmitted / totals.totalConfExpected) * 100, 100)}%`,
                        backgroundColor: 'hsl(var(--muted-foreground) / 0.4)',
                      }}
                    />
                  </div>
                )}
                {nextDeadlineLabel && (
                  <p className="text-xs text-muted-foreground/70">Next: {nextDeadlineLabel}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

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
