import { useMemo, useState, useEffect } from 'react';
import { useStaffWeeklyScores } from '@/hooks/useStaffWeeklyScores';
import { useUserRole } from '@/hooks/useUserRole';
import { LocationHealthCard, LocationStats } from '@/components/dashboard/LocationHealthCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, AlertCircle, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { formatInTimeZone } from 'date-fns-tz';
import { StaffWeekSummary } from '@/types/coachV2';
import { getWeekAnchors, nowUtc, CT_TZ } from '@/lib/centralTime';

export default function RegionalDashboard() {
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
  
  // Debug: log what we're getting
  console.log('[RegionalDashboard] weekOf:', weekOf, 'managedOrgIds:', managedOrgIds, 'managedLocationIds:', managedLocationIds);
  
  // Reuse existing hook - no new RPC needed
  const { summaries, loading, error } = useStaffWeeklyScores({ weekOf });

  // Aggregate by location client-side
  const { locationStats, totals } = useMemo(() => {
    const byLocation = new Map<string, StaffWeekSummary[]>();
    
    console.log('[RegionalDashboard] summaries:', summaries.length, 'isSuperAdmin:', isSuperAdmin, 'managedOrgIds:', managedOrgIds, 'managedLocationIds:', managedLocationIds);
    
    summaries.forEach(s => {
      // Only super admins get truly unrestricted access
      if (!isSuperAdmin) {
        // Check if user has access via org scope OR location scope
        const hasOrgAccess = managedOrgIds.includes(s.organization_id);
        const hasLocationAccess = managedLocationIds.includes(s.location_id);
        
        if (!hasOrgAccess && !hasLocationAccess) {
          console.log('[RegionalDashboard] Filtered out:', s.staff_name, 'org:', s.organization_id, 'loc:', s.location_id);
          return; // Filter out
        }
      }
      
      if (!byLocation.has(s.location_id)) {
        byLocation.set(s.location_id, []);
      }
      byLocation.get(s.location_id)!.push(s);
    });
    
    console.log('[RegionalDashboard] Locations after filter:', byLocation.size);

    // Time-based "missing" logic
    const isPastConfidenceDeadline = now >= anchors.confidence_deadline;
    const isPerformanceOpen = now >= anchors.checkout_open;

    // Calculate stats per location
    const stats: LocationStats[] = Array.from(byLocation.entries()).map(([locId, staff]) => {
      const totalSlots = staff.reduce((sum, s) => sum + s.assignment_count, 0);
      const completedSlots = staff.reduce((sum, s) => sum + Math.min(s.conf_count, s.perf_count), 0);
      const submissionRate = totalSlots > 0 ? (completedSlots / totalSlots) * 100 : 0;
      
      // Count STAFF members missing items based on current time window
      const staffMissingCount = staff.filter(s => {
        // Grace period: nothing is "missing" yet
        if (!isPastConfidenceDeadline) return false;

        const missingConf = s.conf_count < s.assignment_count;
        
        // Before Thursday, only confidence matters
        if (!isPerformanceOpen) return missingConf;

        // After Thursday, check both
        const missingPerf = s.perf_count < s.assignment_count;
        return missingConf || missingPerf;
      }).length;
      
      return {
        id: locId,
        name: staff[0]?.location_name || 'Unknown',
        staffCount: staff.length,
        submissionRate,
        missingCount: staffMissingCount,
      };
    });

    // Sort by submission rate (lowest first - needs attention)
    stats.sort((a, b) => a.submissionRate - b.submissionRate);

    // Calculate totals
    const totalStaff = stats.reduce((sum, s) => sum + s.staffCount, 0);
    const totalMissing = stats.reduce((sum, s) => sum + s.missingCount, 0);
    const avgRate = stats.length > 0 
      ? stats.reduce((sum, s) => sum + s.submissionRate, 0) / stats.length 
      : 0;

    return { 
      locationStats: stats, 
      totals: { totalStaff, totalMissing, avgRate, locationCount: stats.length }
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
                Staff Missing Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">{totals.totalMissing}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Based on current deadlines
              </p>
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
              <LocationHealthCard key={stats.id} stats={stats} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
