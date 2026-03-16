import { useMemo, useState, useEffect } from 'react';
import { useStaffWeeklyScores } from '@/hooks/useStaffWeeklyScores';
import { useUserRole } from '@/hooks/useUserRole';
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
import { getLocationSubmissionGates, calculateLocationStats, type SubmissionGates } from '@/lib/submissionStatus';
import { getSubmissionPolicy } from '@/lib/submissionPolicy';
import { supabase } from '@/integrations/supabase/client';

interface LocationConfig {
  timezone: string;
  conf_due_day: number;
  conf_due_time: string;
  perf_due_day: number;
  perf_due_time: string;
}

export default function RegionalDashboard() {
  const { managedLocationIds, managedOrgIds, isSuperAdmin } = useUserRole();
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
      if (!isSuperAdmin) {
        const hasOrgAccess = managedOrgIds.includes(s.group_id);
        const hasLocationAccess = managedLocationIds.includes(s.location_id);
        if (!hasOrgAccess && !hasLocationAccess) return;
      }
      
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
      
      return {
        id: locId,
        name: staff[0]?.location_name || 'Unknown',
        staffCount: locStats.staffCount,
        submissionRate: adjustedSubmissionRate,
        missingConfCount: adjustedMissingConf,
        missingPerfCount: adjustedMissingPerf,
        pendingConfCount: adjustedPendingConf,
      };
    });

    stats.sort((a, b) => a.submissionRate - b.submissionRate);

    const totalStaff = stats.reduce((sum, s) => sum + s.staffCount, 0);
    const totalMissingConf = stats.reduce((sum, s) => sum + s.missingConfCount, 0);
    const totalMissingPerf = stats.reduce((sum, s) => sum + s.missingPerfCount, 0);
    const totalPendingConf = stats.reduce((sum, s) => sum + (s.pendingConfCount ?? 0), 0);
    const avgRate = stats.length > 0 
      ? stats.reduce((sum, s) => sum + s.submissionRate, 0) / stats.length 
      : 0;

    return { 
      locationStats: stats, 
      totals: { totalStaff, totalMissingConf, totalMissingPerf, totalPendingConf, avgRate, locationCount: stats.length }
    };
  }, [summaries, managedLocationIds, managedOrgIds, isSuperAdmin, locationGatesMap]);

  // Compute signals — only fire when a deadline has actually passed
  const signals = useMemo((): Signal[] => {
    const result: Signal[] = [];
    locationStats.forEach(loc => {
      const gates = locationGatesMap.get(loc.id);
      // Only signal if at least one deadline has passed for this location
      const anyDeadlinePassed = gates?.isPastConfidenceDeadline || gates?.isPastPerformanceDeadline;
      if (anyDeadlinePassed && loc.submissionRate < 70 && loc.staffCount > 0) {
        result.push({
          type: 'participation_drop',
          message: `${loc.name}: participation rate is ${Math.round(loc.submissionRate)}% this week — below 70%.`,
          locationName: loc.name,
        });
      }
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
              <div className="flex gap-4">
                {totals.totalMissingConf > 0 && (
                  <div>
                    <div className="text-2xl font-bold text-destructive">{totals.totalMissingConf}</div>
                    <p className="text-xs text-muted-foreground">Late Conf</p>
                  </div>
                )}
                {totals.totalPendingConf > 0 && (
                  <div>
                    <div className="text-2xl font-bold text-primary">{totals.totalPendingConf}</div>
                    <p className="text-xs text-muted-foreground">Pending Conf</p>
                  </div>
                )}
                {totals.totalMissingPerf > 0 && (
                  <div>
                    <div className="text-2xl font-bold text-warning">{totals.totalMissingPerf}</div>
                    <p className="text-xs text-muted-foreground">Missing Perf</p>
                  </div>
                )}
              {totals.totalMissingConf === 0 && totals.totalPendingConf === 0 && totals.totalMissingPerf === 0 && (
                  <div>
                    <div className="text-sm text-muted-foreground">All on track!</div>
                    {nextDeadlineLabel && (
                      <p className="text-xs text-muted-foreground/70 mt-1">Next: {nextDeadlineLabel}</p>
                    )}
                  </div>
                )}
              </div>
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
              <div className="text-3xl font-bold">{Math.round(totals.avgRate)}%</div>
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
            {locationStats.map(stats => (
              <LocationHealthCard
                key={stats.id}
                stats={stats}
                excuseStatus={getExcuseStatus(stats.id)}
                submissionGates={getCardSubmissionGates(stats.id)}
              />
            ))}
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
