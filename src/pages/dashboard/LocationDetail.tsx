import { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft } from 'lucide-react';
import { formatInTimeZone } from 'date-fns-tz';
import { useStaffWeeklyScores } from '@/hooks/useStaffWeeklyScores';
import { LocationHealthCard, LocationStats } from '@/components/dashboard/LocationHealthCard';
import { LocationSkillGaps } from '@/components/dashboard/LocationSkillGaps';
import CoachDashboardV2 from '@/pages/coach/CoachDashboardV2';
import { getWeekAnchors, nowUtc, CT_TZ } from '@/lib/centralTime';
import { getSubmissionGates, calculateLocationStats } from '@/lib/submissionStatus';

export default function LocationDetail() {
  const { locationId } = useParams<{ locationId: string }>();
  const navigate = useNavigate();
  const [now, setNow] = useState(nowUtc());

  // Keep time updated
  useEffect(() => {
    const interval = setInterval(() => setNow(nowUtc()), 60000);
    return () => clearInterval(interval);
  }, []);

  const anchors = useMemo(() => getWeekAnchors(now), [now]);
  const weekOf = formatInTimeZone(anchors.mondayZ, CT_TZ, 'yyyy-MM-dd');
  
  const { summaries, loading, error } = useStaffWeeklyScores({ weekOf });

  // Filter to just this location and compute stats
  const { locationStaff, locationStats, locationName } = useMemo(() => {
    const staff = summaries.filter(s => s.location_id === locationId);
    const name = staff[0]?.location_name || 'Location';
    
    if (staff.length === 0) {
      return { 
        locationStaff: [], 
        locationStats: null, 
        locationName: name 
      };
    }

    const gates = getSubmissionGates(now, anchors);
    const stats = calculateLocationStats(staff, gates);
    
    const locationStats: LocationStats = {
      id: locationId!,
      name,
      staffCount: stats.staffCount,
      submissionRate: stats.submissionRate,
      missingConfCount: stats.missingConfCount,
      missingPerfCount: stats.missingPerfCount,
    };

    return { locationStaff: staff, locationStats, locationName: name };
  }, [summaries, locationId, now, anchors]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-6xl mx-auto space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-6 w-64" />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Skeleton className="h-40" />
            <Skeleton className="h-40 lg:col-span-2" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background p-4">
        <div className="max-w-6xl mx-auto">
          <Button variant="ghost" onClick={() => navigate(-1)} className="mb-4">
            <ChevronLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Card className="border-destructive">
            <CardContent className="p-6">
              <p className="text-destructive">Error loading location data: {error.message}</p>
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
        <div>
          <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mb-2 -ml-2">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Regional Dashboard
          </Button>
          <h1 className="text-2xl font-bold">{locationName}</h1>
          <p className="text-muted-foreground text-sm">
            Performance Insights • Week of {formatInTimeZone(anchors.mondayZ, CT_TZ, 'MMM d, yyyy')}
          </p>
        </div>

        {/* Top Row: Health Card + Skill Gaps */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Health Card - click disabled */}
          <div className="pointer-events-none">
            {locationStats ? (
              <LocationHealthCard stats={locationStats} />
            ) : (
              <Card>
                <CardContent className="p-6 text-center text-muted-foreground">
                  No staff data for this location
                </CardContent>
              </Card>
            )}
          </div>
          
          {/* Skill Gaps Panel */}
          <div className="lg:col-span-2">
            {locationId && <LocationSkillGaps locationId={locationId} />}
          </div>
        </div>

        {/* Staff Roster - Embedded Coach Dashboard */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Staff Roster</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="p-4">
              <CoachDashboardV2 
                forcedLocationId={locationId}
                hideHeader
                hideOrgLocationFilters
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

