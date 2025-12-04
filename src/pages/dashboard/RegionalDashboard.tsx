import { useMemo } from 'react';
import { useStaffWeeklyScores } from '@/hooks/useStaffWeeklyScores';
import { useUserRole } from '@/hooks/useUserRole';
import { LocationHealthCard, LocationStats } from '@/components/dashboard/LocationHealthCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, AlertCircle, TrendingUp } from 'lucide-react';
import { format, startOfWeek } from 'date-fns';
import { StaffWeekSummary } from '@/types/coachV2';

export default function RegionalDashboard() {
  const { managedLocationIds, isOrgAdmin, isSuperAdmin } = useUserRole();
  
  // Get current week's Monday
  const weekOf = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
  
  // Reuse existing hook - no new RPC needed
  const { summaries, loading, error } = useStaffWeeklyScores({ weekOf });

  // Aggregate by location client-side
  const { locationStats, totals } = useMemo(() => {
    const byLocation = new Map<string, StaffWeekSummary[]>();
    
    summaries.forEach(s => {
      // Filter by managed locations (unless org admin or super admin)
      const hasFullAccess = isOrgAdmin || isSuperAdmin;
      if (!hasFullAccess && managedLocationIds.length > 0 && !managedLocationIds.includes(s.location_id)) {
        return;
      }
      
      if (!byLocation.has(s.location_id)) {
        byLocation.set(s.location_id, []);
      }
      byLocation.get(s.location_id)!.push(s);
    });

    // Calculate stats per location
    const stats: LocationStats[] = Array.from(byLocation.entries()).map(([locId, staff]) => {
      const totalSlots = staff.reduce((sum, s) => sum + s.assignment_count, 0);
      const completedSlots = staff.reduce((sum, s) => sum + Math.min(s.conf_count, s.perf_count), 0);
      const submissionRate = totalSlots > 0 ? (completedSlots / totalSlots) * 100 : 0;
      
      const confScores = staff.flatMap(s => s.scores.filter(sc => sc.confidence_score !== null).map(sc => sc.confidence_score!));
      const perfScores = staff.flatMap(s => s.scores.filter(sc => sc.performance_score !== null).map(sc => sc.performance_score!));
      
      return {
        id: locId,
        name: staff[0]?.location_name || 'Unknown',
        staffCount: staff.length,
        submissionRate,
        missingCount: staff.filter(s => !s.is_complete).length,
        avgConfidence: confScores.length > 0 ? confScores.reduce((a, b) => a + b, 0) / confScores.length : 0,
        avgPerformance: perfScores.length > 0 ? perfScores.reduce((a, b) => a + b, 0) / perfScores.length : 0,
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
  }, [summaries, managedLocationIds, isOrgAdmin, isSuperAdmin]);

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
              Week of {format(new Date(weekOf), 'MMM d, yyyy')}
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
                Missing Submissions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-destructive">{totals.totalMissing}</div>
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
