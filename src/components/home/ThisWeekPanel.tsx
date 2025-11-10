import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { nowUtc, nextMondayStr, CT_TZ } from '@/lib/centralTime';
import { getWeekAnchors } from '@/v2/time';
import { isV2 } from '@/lib/featureFlags';
import { useNow } from '@/providers/NowProvider';
import { getDomainColor } from '@/lib/domainColors';
import { assembleCurrentWeek, WeekAssignment } from '@/lib/weekAssembly';
import { computeWeekState, StaffStatus, getLocationWeekContext, LocationWeekContext } from '@/lib/locationState';
import { useSim } from '@/devtools/SimProvider';
import { formatInTimeZone } from 'date-fns-tz';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { buildWeekBanner } from '@/v2/weekCta';
import { enforceWeeklyRolloverNow } from '@/v2/rollover';

interface Staff { id: string; role_id: number; }
interface WeeklyScore { 
  weekly_focus_id: string; 
  confidence_score: number | null; 
  performance_score: number | null; 
}

export default function ThisWeekPanel() {
  const { user, isParticipant } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const now = useNow();
  const { overrides } = useSim();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [weekContext, setWeekContext] = useState<StaffStatus | null>(null);
  const [locationWeekContext, setLocationWeekContext] = useState<LocationWeekContext | null>(null);
  const [weekAssignments, setWeekAssignments] = useState<WeekAssignment[]>([]);
  const [weeklyScores, setWeeklyScores] = useState<WeeklyScore[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [weekOfDate, setWeekOfDate] = useState<string>('');
  const [SimBannerComponent, setSimBannerComponent] = useState<React.ComponentType | null>(null);

  // Load dev tools conditionally
  useEffect(() => {
    if (import.meta.env.VITE_ENABLE_SIMTOOLS === 'true') {
      import('@/devtools/SimConsole').then(module => {
        setSimBannerComponent(() => module.SimBanner);
      }).catch(() => {
        // Dev tools not available
      });
    }
  }, []);

  // Load staff profile
  useEffect(() => {
    if (user) void loadStaff();
  }, [user]);

  async function loadStaff() {
    const { data, error } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user!.id)
      .maybeSingle();

    if (error || !data) {
      navigate('/setup');
      return;
    }

    setStaff(data);
  }

  // Load current week data and compute state
  useEffect(() => {
    // Early return for non-participants to avoid heavy computation
    if (!isParticipant) {
      setLoading(false);
      return;
    }
    if (staff) void loadCurrentWeek();
  }, [staff, overrides, isParticipant]); // Re-run when simulation overrides change

  async function loadCurrentWeek() {
    if (!staff || !user) return;

    setLoading(true);

    try {
      console.log('=== DEBUGGING THISWEEKPANEL ===');
      console.log('Current time (now):', now);
      console.log('Staff:', staff);
      console.log('Simulation overrides:', overrides);
      
      // Get staff info including location
      const { data: staffData } = await supabase
        .from('staff')
        .select('id, role_id, primary_location_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!staffData?.primary_location_id) {
        throw new Error('Staff member has no assigned location');
      }

      // Use simulated time if available
      const effectiveNow = overrides.enabled && overrides.nowISO ? new Date(overrides.nowISO) : now;
      console.log('Effective time being used:', effectiveNow);
      
      // Enforce weekly rollover (idempotent)
      await enforceWeeklyRolloverNow({
        userId: user.id,
        staffId: staffData.id,
        roleId: staffData.role_id,
        locationId: staffData.primary_location_id,
        now: effectiveNow,
      });
      
      // Load current week assignments and context based on user progress
      const { assignments, cycleNumber, weekInCycle } = await assembleCurrentWeek(user.id, overrides);
      console.log('Progress-based assignments:', assignments);
      console.log('Progress-based week:', { cycleNumber, weekInCycle });
      console.log('Program start date from location:', staffData.primary_location_id);
      console.log('Effective now for calculation:', effectiveNow);
      console.log('Expected: Cycle 4 Week 2, Got:', `Cycle ${cycleNumber} Week ${weekInCycle}`);
      setWeekAssignments(assignments);

      // Get location-specific time anchors for state computation
      const locationTimeContext = await getLocationWeekContext(staffData.primary_location_id, effectiveNow);
      setLocationWeekContext({ ...locationTimeContext, cycleNumber, weekInCycle });
      
      // Calculate week of date using location timezone
      if (isV2) {
        const locationAnchors = await getWeekAnchors(effectiveNow, locationTimeContext.timezone);
        setWeekOfDate(formatInTimeZone(locationAnchors.mondayZ, locationTimeContext.timezone, 'MMM d, yyyy'));
      } else {
        const { getWeekAnchors: v1GetWeekAnchors } = await import('@/lib/centralTime');
        const { mondayZ } = v1GetWeekAnchors(effectiveNow, CT_TZ);
        setWeekOfDate(formatInTimeZone(mondayZ, CT_TZ, 'MMM d, yyyy'));
      }
      
      // Compute current week state with simulation overrides (location-based unified)
      const context = await computeWeekState({
        userId: user.id,
        locationId: staffData.primary_location_id,
        roleId: staffData.role_id,
        now: effectiveNow,
        simOverrides: overrides.enabled ? overrides : undefined,
        weekContext: { cycleNumber, weekInCycle }
      });
      console.log('Week context:', context);
      setWeekContext(context);

      // Load weekly scores for the assignments
      if (assignments.length > 0) {
        const focusIds = assignments.map(a => a.weekly_focus_id);
        const { data: scores } = await supabase
          .from('weekly_scores')
          .select('weekly_focus_id, confidence_score, performance_score')
          .eq('staff_id', staffData.id)
          .in('weekly_focus_id', focusIds);
        
        setWeeklyScores(scores || []);
      } else {
        setWeeklyScores([]);
      }

      setLoading(false);
    } catch (error) {
      console.error('Error loading current week:', error);
      toast({ title: 'Error', description: 'Failed to load current week data', variant: 'destructive' });
      setLoading(false);
    }
  }

  // Banner message + CTA via centralized helper
  const banner = useMemo(() => {
    if (!weekContext || !locationWeekContext) {
      return { message: '', cta: undefined };
    }
    return buildWeekBanner({
      status: weekContext,
      location: locationWeekContext,
      now
    });
  }, [weekContext, locationWeekContext, now]);

  // Show loading state (but allow non-participants through even without weekContext)
  if (loading || !staff || (!weekContext && isParticipant)) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>This Week&apos;s Pro Moves</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-24 rounded-md bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  // Show Coach/Admin CTA for non-participants
  if (!isParticipant) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>You&apos;re set up as a Coach/Admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Participant tasks aren&apos;t assigned to your account.
          </p>
          <Button 
            className="w-full" 
            onClick={() => navigate('/coach')}
          >
            Go to Coach Dashboard
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Get Monday date for "Week of" display using location timezone - calculated in loadCurrentWeek

  // Show all assignments regardless of state - user wants to see self-select moves too
  const displayAssignments = weekAssignments;

  // Show empty state when no pro moves found (or no site moves for missed states)
  if (displayAssignments.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>This Week's Pro Moves</CardTitle>
          <CardDescription>Week of {weekOfDate}</CardDescription>
          {locationWeekContext && (
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="outline" className="text-xs">
                Cycle {locationWeekContext.cycleNumber}, Week {locationWeekContext.weekInCycle}
              </Badge>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted p-3">
            <div className="font-medium text-sm text-foreground text-center">
              No Pro Moves configured for this week. Please contact your administrator.
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show normal view with pro moves and banner
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle>This Week's Pro Moves</CardTitle>
        <CardDescription>Week of {weekOfDate}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pro Moves list */}
        <div className="space-y-3">
          {displayAssignments.map((assignment, index) => {
            const domainName = assignment.domain_name;
            const bgColor = domainName ? getDomainColor(domainName) : undefined;
            const isUnchosen = assignment.type === 'selfSelect' && !assignment.action_statement;
            
            // Find scores for this assignment
            const scores = weeklyScores.find(s => s.weekly_focus_id === assignment.weekly_focus_id);

            return (
              <div key={assignment.weekly_focus_id} className="rounded-lg p-4 border" style={bgColor ? { backgroundColor: `hsl(${bgColor})` } : undefined}>
                {domainName && (
                  <Badge variant="secondary" className="text-xs font-semibold mb-2 bg-white/80 text-gray-900" aria-label={`Domain: ${domainName}`}> 
                    {domainName}
                  </Badge>
                )}

                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2 flex-1">
                    <p className="text-sm font-medium">
                      {assignment.action_statement || 'Check-In to choose this Pro-Move for the week.'}
                    </p>
                  </div>
                  <div className="flex-shrink-0">
                    <ConfPerfDelta 
                      confidence={scores?.confidence_score} 
                      performance={scores?.performance_score} 
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic banner message */}
        <div className="rounded-md border bg-muted p-3">
          <div className="font-medium text-sm text-foreground text-center">{banner.message}</div>
          {banner.cta && (
            <Button
              className="w-full h-12 mt-2"
              onClick={() => navigate(banner.cta!.to)}
              aria-label="Next action"
            >
              {banner.cta.label}
            </Button>
          )}
        </div>

        {/* Simulation status below CTA when active */}
        {SimBannerComponent && <SimBannerComponent />}
      </CardContent>
    </Card>
  );
}
