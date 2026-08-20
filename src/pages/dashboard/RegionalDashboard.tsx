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
import { Users, AlertCircle, TrendingUp, CloudOff, Clock } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { format as formatDate } from 'date-fns';
import { StaffWeekSummary } from '@/types/coachV2';
import { nowUtc } from '@/lib/centralTime';
import { useLocationTimezone } from '@/hooks/useLocationTimezone';
import { getLocationSubmissionGates, calculateLocationStats, calculateDistinctMissedCount, type SubmissionGates } from '@/lib/submissionStatus';
import { getSubmissionPolicy, getPolicyOffsetsForLocation } from '@/lib/submissionPolicy';
import { participationTier, tierColorTokens } from '@/lib/participationTier';
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
      
      const locStats = calculateLocationStats(staff, gates);
      const excuseStatus = getExcuseStatus(locId);

      let adjustedMissingConf = locStats.missingConfCount;
      let adjustedMissingPerf = locStats.missingPerfCount;
      let adjustedPendingConf = locStats.pendingConfCount;
      let adjustedSubmissionRate = locStats.submissionRate;

      if (excuseStatus.isConfExcused) {
        adjustedMissingConf = 0;
        adjustedPendingConf = 0;
      }
      if (excuseStatus.isPerfExcused) {
        adjustedMissingPerf = 0;
      }

      if (excuseStatus.isConfExcused && excuseStatus.isPerfExcused) {
        adjustedSubmissionRate = 100;
      }

      // DASH-1a QA fix: distinct people missed, honoring the same excuse
      // adjustments applied to missingConf/missingPerf above (an excused
      // metric is treated as not-yet-past-deadline, so it can never count
      // someone as "missing").
      const distinctMissedCount = calculateDistinctMissedCount(staff, {
        ...gates,
        isPastConfidenceDeadline: gates.isPastConfidenceDeadline && !excuseStatus.isConfExcused,
        isPastPerformanceDeadline: gates.isPastPerformanceDeadline && !excuseStatus.isPerfExcused,
      });

      return {
        id: locId,
        name: staff[0]?.location_name || 'Unknown',
        staffCount: locStats.staffCount,
        submissionRate: adjustedSubmissionRate,
        missingConfCount: adjustedMissingConf,
        missingPerfCount: adjustedMissingPerf,
        distinctMissedCount,
        pendingConfCount: adjustedPendingConf,
        confSubmitted: locStats.confSubmittedCount,
        confExpected: locStats.confExpectedCount,
        perfSubmitted: locStats.perfSubmittedCount,
        perfExpected: locStats.perfExpectedCount,
      };
    });

    stats.sort((a, b) => a.submissionRate - b.submissionRate);

    const totalStaff = stats.reduce((sum, s) => sum + s.staffCount, 0);
    const totalMissingConf = stats.reduce((sum, s) => sum + s.missingConfCount, 0);
    const totalMissingPerf = stats.reduce((sum, s) => sum + s.missingPerfCount, 0);
    // DASH-1a QA fix: sum of per-location DISTINCT missed counts. Safe to
    // sum across locations since a staff member belongs to exactly one.
    const totalDistinctMissed = stats.reduce((sum, s) => sum + s.distinctMissedCount, 0);
    const totalPendingConf = stats.reduce((sum, s) => sum + (s.pendingConfCount ?? 0), 0);
    const totalConfSubmitted = stats.reduce((sum, s) => sum + (s.confSubmitted ?? 0), 0);
    const totalConfExpected = stats.reduce((sum, s) => sum + (s.confExpected ?? 0), 0);
    const totalPerfSubmitted = stats.reduce((sum, s) => sum + (s.perfSubmitted ?? 0), 0);
    const totalPerfExpected = stats.reduce((sum, s) => sum + (s.perfExpected ?? 0), 0);
    const avgRate = stats.length > 0 
      ? stats.reduce((sum, s) => sum + s.submissionRate, 0) / stats.length 
      : 0;
    
    // Check if any location has passed a deadline
    const anyLocationPastDeadline = stats.some(s => {
      const gates = locationGatesMap.get(s.id);
      return gates?.isPastConfidenceDeadline || gates?.isPastPerformanceDeadline;
    });

    return {
      locationStats: stats,
      totals: { totalStaff, totalMissingConf, totalMissingPerf, totalDistinctMissed, totalPendingConf, avgRate, locationCount: stats.length,
        totalConfSubmitted, totalConfExpected, totalPerfSubmitted, totalPerfExpected, anyLocationPastDeadline }
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
  const summaryTiers = useMemo(() => {
    const confRate = Math.round(
      totals.totalConfExpected > 0
        ? (totals.totalConfSubmitted / totals.totalConfExpected) * 100
        : 100
    );
    const perfRate = Math.round(
      totals.totalPerfExpected > 0
        ? (totals.totalPerfSubmitted / totals.totalPerfExpected) * 100
        : 100
    );
    const avgRate = Math.round(totals.avgRate);
    return {
      confRate,
      perfRate,
      avgRate,
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

        {/* Signals Banner */}
        <SignalsBanner signals={signals} />

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Total Staff
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">{totals.totalStaff}</div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Submissions Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              {totals.totalMissingConf === 0 && totals.totalPendingConf === 0 && totals.totalMissingPerf === 0 ? (
                <div>
                  <div className="text-sm text-muted-foreground">All on track!</div>
                  {nextDeadlineLabel && (
                    <p className="text-xs text-muted-foreground/70 mt-1">Next: {nextDeadlineLabel}</p>
                  )}
                </div>
              ) : (
                <div className="flex gap-4">
                  {totals.totalConfExpected > 0 && (
                    <div>
                      <div
                        className="text-2xl font-bold"
                        style={{ color: tierColorTokens(summaryTiers.confTier)?.text ?? 'hsl(var(--foreground))' }}
                      >
                        {summaryTiers.confRate}%
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {totals.totalConfSubmitted}/{totals.totalConfExpected} conf submitted
                      </p>
                      {totals.totalMissingConf > 0 && (
                        <span
                          className="inline-flex items-center mt-1 rounded-full px-1.5 py-0.5 text-2xs font-medium"
                          style={{ backgroundColor: 'hsl(var(--status-late-bg))', color: 'hsl(var(--status-late))' }}
                        >
                          {totals.totalMissingConf} late
                        </span>
                      )}
                    </div>
                  )}
                  {totals.totalPendingConf > 0 && (
                    <div>
                      <div className="text-2xl font-bold text-foreground">{totals.totalPendingConf}</div>
                      <p className="text-xs text-muted-foreground">Pending Conf</p>
                    </div>
                  )}
                  {totals.totalMissingPerf > 0 && (
                    <div>
                      <div
                        className="text-2xl font-bold"
                        style={{ color: tierColorTokens(summaryTiers.perfTier)?.text ?? 'hsl(var(--foreground))' }}
                      >
                        {summaryTiers.perfRate}%
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {totals.totalPerfSubmitted}/{totals.totalPerfExpected} perf submitted
                      </p>
                      <span
                        className="inline-flex items-center mt-1 rounded-full px-1.5 py-0.5 text-2xs font-medium"
                        style={{ backgroundColor: 'hsl(var(--status-late-bg))', color: 'hsl(var(--status-late))' }}
                      >
                        {totals.totalMissingPerf} late
                      </span>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Avg Completion
              </CardTitle>
            </CardHeader>
            <CardContent>
              {totals.anyLocationPastDeadline ? (
                <div
                  className="text-3xl font-bold"
                  style={{ color: tierColorTokens(summaryTiers.avgTier)?.text ?? 'hsl(var(--foreground))' }}
                >
                  {summaryTiers.avgRate}%
                </div>
              ) : (
                <div>
                  <div className="text-2xl font-bold text-foreground">
                    {totals.totalConfSubmitted}/{totals.totalConfExpected}
                  </div>
                  <p className="text-xs text-muted-foreground">Conf submitted</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Domain Confidence Heatmap */}
        {locationIdList.length > 0 && (
          <DomainConfidenceHeatmap
            locationIds={locationIdList}
            locationNames={locationNamesMap}
          />
        )}

        {/* Location Grid */}
        {locationStats.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No location data available for this week.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {locationStats.map(stats => {
              // Compute per-location next deadline label
              const locConfig = locationConfigs.get(stats.id);
              let locDeadlineLabel: string | null = null;
              if (locConfig) {
                const offsets = getPolicyOffsetsForLocation(locConfig);
                const policy = getSubmissionPolicy(now, locConfig.timezone, offsets);
                if (!policy.isConfidenceLate(now)) {
                  locDeadlineLabel = `Conf due ${formatInTimeZone(policy.confidence_due, locConfig.timezone, 'EEE h:mm a')}`;
                } else if (!policy.isPerformanceLate(now)) {
                  locDeadlineLabel = `Perf due ${formatInTimeZone(policy.performance_due, locConfig.timezone, 'EEE h:mm a')}`;
                }
              }
              return (
                <LocationHealthCard
                  key={stats.id}
                  stats={stats}
                  excuseStatus={getExcuseStatus(stats.id)}
                  submissionGates={getCardSubmissionGates(stats.id)}
                  nextDeadlineLabel={locDeadlineLabel}
                />
              );
            })}
          </div>
        )}
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
