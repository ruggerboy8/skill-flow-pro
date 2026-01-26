import { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStaffWeeklyScores } from '@/hooks/useStaffWeeklyScores';
import { useUserRole } from '@/hooks/useUserRole';
import { useLocationExcuses } from '@/hooks/useLocationExcuses';
import { LocationHealthCard, LocationStats } from '@/components/dashboard/LocationHealthCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, AlertCircle, TrendingUp } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { StaffWeekSummary } from '@/types/coachV2';
import { getWeekAnchors, nowUtc, CT_TZ } from '@/lib/centralTime';
import { getSubmissionGates, calculateLocationStats } from '@/lib/submissionStatus';
export default function RegionalDashboard() {
  const navigate = useNavigate();
  const { managedLocationIds, managedOrgIds, isSuperAdmin } = useUserRole();
  const [now, setNow] = useState(nowUtc());

  // Keep time updated for live dashboard feel
  useEffect(() => {
    const interval = setInterval(() => setNow(nowUtc()), 60000);
    return () => clearInterval(interval);
  }, []);
  
  // Use Central Time anchors for the correct "Week Of" date
  const anchors = useMemo(() => getWeekAnchors(now), [now]);
  const weekOf = formatInTimeZone(anchors.mondayZ, CT_TZ, 'yyyy-MM-dd');
  
  // Reuse existing hook - no new RPC needed
  const { summaries, loading, error } = useStaffWeeklyScores({ weekOf });
  
  // Location-level excuses
  const { 
    getExcuseStatus, 
    canManage: canManageExcuses,
    toggleExcuse,
    excuseBoth,
    removeAllExcuses,
    isToggling,
    isExcusingBoth,
    isRemovingAll,
  } = useLocationExcuses(weekOf);

  // Aggregate by location client-side
  const { locationStats, totals } = useMemo(() => {
    const byLocation = new Map<string, StaffWeekSummary[]>();
    
    summaries.forEach(s => {
      // Only super admins get truly unrestricted access
      if (!isSuperAdmin) {
        // Check if user has access via org scope OR location scope
        const hasOrgAccess = managedOrgIds.includes(s.organization_id);
        const hasLocationAccess = managedLocationIds.includes(s.location_id);
        
        if (!hasOrgAccess && !hasLocationAccess) {
          return; // Filter out
        }
      }
      
      if (!byLocation.has(s.location_id)) {
        byLocation.set(s.location_id, []);
      }
      byLocation.get(s.location_id)!.push(s);
    });

    // Calculate stats per location using shared utils
    const gates = getSubmissionGates(now, anchors);
    
    const stats: LocationStats[] = Array.from(byLocation.entries()).map(([locId, staff]) => {
      const locStats = calculateLocationStats(staff, gates);
      
      return {
        id: locId,
        name: staff[0]?.location_name || 'Unknown',
        staffCount: locStats.staffCount,
        submissionRate: locStats.submissionRate,
        missingConfCount: locStats.missingConfCount,
        missingPerfCount: locStats.missingPerfCount,
        pendingConfCount: locStats.pendingConfCount,
      };
    });

    // Sort by submission rate (lowest first - needs attention)
    stats.sort((a, b) => a.submissionRate - b.submissionRate);

    // Calculate totals
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
  }, [summaries, managedLocationIds, managedOrgIds, isSuperAdmin, now, anchors]);

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
              Week of {formatInTimeZone(anchors.mondayZ, CT_TZ, 'MMM d, yyyy')}
            </p>
          </div>
          <Badge variant="outline" className="text-sm">
            {totals.locationCount} Location{totals.locationCount !== 1 ? 's' : ''}
          </Badge>
        </div>

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
                  <div className="text-sm text-muted-foreground">All on track!</div>
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
                canManageExcuses={canManageExcuses}
                onToggleExcuse={(metric) => toggleExcuse({ locationId: stats.id, metric })}
                onExcuseBoth={() => excuseBoth({ locationId: stats.id, reason: 'Weather closure' })}
                onRemoveAllExcuses={() => removeAllExcuses({ locationId: stats.id })}
                isUpdating={isToggling || isExcusingBoth || isRemovingAll}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
