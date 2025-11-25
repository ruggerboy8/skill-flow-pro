import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CT_TZ } from '@/lib/centralTime';
import { getWeekAnchors } from '@/v2/time';
import { isV2, useWeeklyAssignmentsV2Enabled } from '@/lib/featureFlags';
import { useNow } from '@/providers/NowProvider';
import { getDomainColor } from '@/lib/domainColors';
import { assembleCurrentWeek, WeekAssignment } from '@/lib/weekAssembly';
import { computeWeekState, StaffStatus, getLocationWeekContext, LocationWeekContext } from '@/lib/locationState';
import { useSim } from '@/devtools/SimProvider';
import { formatInTimeZone } from 'date-fns-tz';
import { GraduationCap, CalendarOff } from 'lucide-react';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { buildWeekBanner } from '@/v2/weekCta';
import { enforceWeeklyRolloverNow } from '@/v2/rollover';
import { LearnerLearnDrawer } from '@/components/learner/LearnerLearnDrawer';

interface WeeklyScore { 
  weekly_focus_id: string;
  assignment_id?: string | null;
  confidence_score: number | null; 
  performance_score: number | null; 
}

export default function ThisWeekPanel() {
  const { user, isParticipant } = useAuth();
  const { data: staff, isLoading: staffLoading } = useStaffProfile({ redirectToSetup: true });
  const { toast } = useToast();
  const navigate = useNavigate();
  const now = useNow();
  const { overrides } = useSim();
  const v2Enabled = useWeeklyAssignmentsV2Enabled;

  const [weekContext, setWeekContext] = useState<StaffStatus | null>(null);
  const [locationWeekContext, setLocationWeekContext] = useState<LocationWeekContext | null>(null);
  const [weekAssignments, setWeekAssignments] = useState<WeekAssignment[]>([]);
  const [weeklyScores, setWeeklyScores] = useState<WeeklyScore[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [weekOfDate, setWeekOfDate] = useState<string>('');
  const [SimBannerComponent, setSimBannerComponent] = useState<React.ComponentType | null>(null);
  const [learnDrawerOpen, setLearnDrawerOpen] = useState(false);
  const [selectedLearnAssignment, setSelectedLearnAssignment] = useState<WeekAssignment | null>(null);
  const [resourceCounts, setResourceCounts] = useState<Record<number, number>>({});
  const [isExempt, setIsExempt] = useState(false);

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

  // Load current week data and compute state
  useEffect(() => {
    // Early return for non-participants to avoid heavy computation
    if (!isParticipant) {
      setLoading(false);
      return;
    }
    if (staff && !staffLoading) void loadCurrentWeek();
  }, [staff, staffLoading, overrides, isParticipant]); // Re-run when staff loads or simulation overrides change

  async function loadCurrentWeek() {
    if (!staff || !user) return;

    setLoading(true);

    try {
      console.log('=== DEBUGGING THISWEEKPANEL ===');
      console.log('Current time (now):', now);
      console.log('Staff:', staff);
      console.log('Simulation overrides:', overrides);

      // Use simulated time if available
      const effectiveNow = overrides.enabled && overrides.nowISO ? new Date(overrides.nowISO) : now;
      console.log('Effective time being used:', effectiveNow);
      
      // Enforce weekly rollover (idempotent)
      await enforceWeeklyRolloverNow({
        userId: user.id,
        staffId: staff.id,
        roleId: staff.role_id!,
        locationId: staff.primary_location_id!,
        now: effectiveNow,
      });
      
      // Load current week assignments and context based on user progress
      const { assignments, cycleNumber, weekInCycle } = await assembleCurrentWeek(
        user.id,
        {
          id: staff.id,
          role_id: staff.role_id!,
          primary_location_id: staff.primary_location_id!
        },
        overrides
      );
      setWeekAssignments(assignments);

      // Fetch resource counts for pro-moves
      const actionIds = assignments
        .map(a => a.pro_move_id)
        .filter((id): id is number => id !== null && id !== undefined);
      
      if (actionIds.length > 0) {
        const { data: resourceCounts } = await supabase
          .from('pro_move_resources')
          .select('action_id')
          .in('action_id', actionIds)
          .eq('status', 'active');
        
        const countMap: Record<number, number> = {};
        (resourceCounts ?? []).forEach(rc => {
          countMap[rc.action_id] = (countMap[rc.action_id] || 0) + 1;
        });
        
        setResourceCounts(countMap);
      }

      // Get location-specific time anchors for state computation
      const locationTimeContext = await getLocationWeekContext(staff.primary_location_id!, effectiveNow);
      setLocationWeekContext({ ...locationTimeContext, cycleNumber, weekInCycle });
      
      // Calculate week of date using location timezone
      if (isV2) {
        const locationAnchors = await getWeekAnchors(effectiveNow, locationTimeContext.timezone);
        const mondayStr = formatInTimeZone(locationAnchors.mondayZ, locationTimeContext.timezone, 'yyyy-MM-dd');
        setWeekOfDate(formatInTimeZone(locationAnchors.mondayZ, locationTimeContext.timezone, 'MMM d, yyyy'));
        
        // Check if this week is exempt
        const { data: excused } = await supabase
          .from('excused_weeks')
          .select('reason')
          .eq('week_start_date', mondayStr)
          .maybeSingle();
        
        setIsExempt(!!excused);
      } else {
        const { getWeekAnchors: v1GetWeekAnchors } = await import('@/lib/centralTime');
        const { mondayZ } = v1GetWeekAnchors(effectiveNow, CT_TZ);
        const mondayStr = formatInTimeZone(mondayZ, CT_TZ, 'yyyy-MM-dd');
        setWeekOfDate(formatInTimeZone(mondayZ, CT_TZ, 'MMM d, yyyy'));
        
        // Check if this week is exempt
        const { data: excused } = await supabase
          .from('excused_weeks')
          .select('reason')
          .eq('week_start_date', mondayStr)
          .maybeSingle();
        
        setIsExempt(!!excused);
      }
      
      // Compute current week state with simulation overrides (location-based unified)
      const context = await computeWeekState({
        userId: user.id,
        locationId: staff.primary_location_id!,
        roleId: staff.role_id!,
        now: effectiveNow,
        simOverrides: overrides.enabled ? overrides : undefined,
        weekContext: { cycleNumber, weekInCycle }
      });
      console.log('Week context:', context);
      setWeekContext(context);

      // Load weekly scores for the assignments
      if (assignments.length > 0) {
        const focusIds = assignments.map(a => a.weekly_focus_id);
        
        // Query scores by both assignment_id and weekly_focus_id to catch V2 + legacy
        const { data: scores } = await supabase
          .from('weekly_scores')
          .select('weekly_focus_id, assignment_id, confidence_score, performance_score')
          .eq('staff_id', staff.id)
          .or(focusIds.map(id => `assignment_id.eq.${id},weekly_focus_id.eq.${id}`).join(','));
        
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

  // Show exempt week message
  if (isExempt) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>This Week's Pro Moves</CardTitle>
          <CardDescription>Week of {weekOfDate}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border bg-amber-50 border-amber-200 p-6 text-center">
            <CalendarOff className="h-10 w-10 mx-auto mb-3 text-amber-600" />
            <p className="font-semibold text-amber-900 mb-1">No Submissions Required This Week</p>
            <p className="text-sm text-amber-700">This week has been marked as exempt by your administrator.</p>
          </div>
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
            
            // Find scores for this assignment - match by either assignment_id or weekly_focus_id
            const scores = weeklyScores.find(s => 
              s.assignment_id === assignment.weekly_focus_id || s.weekly_focus_id === assignment.weekly_focus_id
            );
            const resourceCount = assignment.pro_move_id ? (resourceCounts[assignment.pro_move_id] || 0) : 0;

            return (
              <div key={assignment.weekly_focus_id} className="rounded-lg p-4 border" style={bgColor ? { backgroundColor: bgColor } : undefined}>
                <div className="flex items-center gap-2 mb-2">
                  {domainName && (
                    <Badge variant="secondary" className="text-xs font-semibold bg-white/80 text-gray-900" aria-label={`Domain: ${domainName}`}> 
                      {domainName}
                    </Badge>
                  )}
                  
                  {/* Learn Button - positioned after domain */}
                  {resourceCount > 0 && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 gap-1.5 bg-white/80"
                      onClick={() => {
                        setSelectedLearnAssignment(assignment);
                        setLearnDrawerOpen(true);
                      }}
                      aria-label={`Learn: ${assignment.action_statement}`}
                    >
                      <GraduationCap className="h-3 w-3" />
                      <span className="text-xs">Learn</span>
                    </Button>
                  )}
                </div>

                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-2 flex-1">
                    <p className="text-sm font-medium">
                      {assignment.action_statement || 'Check-In to choose this Pro-Move for the week.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
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

      {selectedLearnAssignment && selectedLearnAssignment.pro_move_id && (
        <LearnerLearnDrawer
          open={learnDrawerOpen}
          onOpenChange={setLearnDrawerOpen}
          actionId={selectedLearnAssignment.pro_move_id}
          proMoveTitle={selectedLearnAssignment.action_statement || 'Pro Move'}
          domainName={selectedLearnAssignment.domain_name || 'General'}
        />
      )}
    </Card>
  );
}
