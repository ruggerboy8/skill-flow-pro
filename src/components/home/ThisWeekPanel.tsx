import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CT_TZ } from '@/lib/centralTime';
import { getWeekAnchors } from '@/v2/time';
import { isV2, useWeeklyAssignmentsV2Enabled } from '@/lib/featureFlags';
import { useNow } from '@/providers/NowProvider';
import { getDomainColor, getDomainColorRichRaw } from '@/lib/domainColors';
import { assembleCurrentWeek, WeekAssignment } from '@/lib/weekAssembly';
import { computeWeekState, StaffStatus, getLocationWeekContext, LocationWeekContext } from '@/lib/locationState';
import { useSim } from '@/devtools/SimProvider';
import { formatInTimeZone } from 'date-fns-tz';
import { GraduationCap, CalendarOff, ChevronRight } from 'lucide-react';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { buildWeekBanner } from '@/v2/weekCta';
import { enforceWeeklyRolloverNow } from '@/v2/rollover';
import { LearnerLearnDrawer } from '@/components/learner/LearnerLearnDrawer';
import { cn } from '@/lib/utils';

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
      // Pass staff.id for masquerade support - avoids re-fetching by user_id
      const context = await computeWeekState({
        userId: user.id,
        locationId: staff.primary_location_id!,
        roleId: staff.role_id!,
        now: effectiveNow,
        simOverrides: overrides.enabled ? overrides : undefined,
        weekContext: { cycleNumber, weekInCycle },
        staffId: staff.id
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
      <div className="bg-transparent md:bg-glass-gradient md:backdrop-blur-md md:border md:border-white/40 dark:md:border-slate-700/40 md:shadow-glass md:rounded-xl overflow-hidden">
        <div className="px-4 py-3 md:px-6 md:py-4 md:border-b md:border-border/50">
          <Skeleton className="h-6 w-40 mb-2" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="p-4 md:p-6 space-y-3">
          <Skeleton className="h-20 rounded-xl" />
          <Skeleton className="h-20 rounded-xl" />
        </div>
      </div>
    );
  }

  // Show exempt week message
  if (isExempt) {
    return (
      <div className="bg-transparent md:bg-glass-gradient md:backdrop-blur-md md:border md:border-white/40 dark:md:border-slate-700/40 md:shadow-glass md:rounded-xl overflow-hidden">
        <div className="px-4 py-3 md:px-6 md:py-4 md:border-b md:border-border/50">
          <h3 className="font-semibold text-lg">This Week's Pro Moves</h3>
          <p className="text-sm text-muted-foreground">Week of {weekOfDate}</p>
        </div>
        <div className="p-4 md:p-6">
          <div className="rounded-xl border bg-amber-50 border-amber-200 p-6 text-center">
            <CalendarOff className="h-10 w-10 mx-auto mb-3 text-amber-600" />
            <p className="font-semibold text-amber-900 mb-1">No Submissions Required This Week</p>
            <p className="text-sm text-amber-700">This week has been marked as exempt by your administrator.</p>
          </div>
        </div>
      </div>
    );
  }

  // Show Coach/Admin CTA for non-participants
  if (!isParticipant) {
    return (
      <div className="bg-transparent md:bg-glass-gradient md:backdrop-blur-md md:border md:border-white/40 dark:md:border-slate-700/40 md:shadow-glass md:rounded-xl overflow-hidden">
        <div className="px-4 py-3 md:px-6 md:py-4 md:border-b md:border-border/50">
          <h3 className="font-semibold text-lg">You're set up as a Coach/Admin</h3>
        </div>
        <div className="p-4 md:p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Participant tasks aren't assigned to your account.
          </p>
          <Button 
            className="w-full rounded-full" 
            onClick={() => navigate('/coach')}
          >
            Go to Coach Dashboard
          </Button>
        </div>
      </div>
    );
  }

  // Get Monday date for "Week of" display using location timezone - calculated in loadCurrentWeek

  // Show all assignments regardless of state - user wants to see self-select moves too
  const displayAssignments = weekAssignments;

  // Show empty state when no pro moves found (or no site moves for missed states)
  if (displayAssignments.length === 0) {
    return (
      <div className="bg-transparent md:bg-glass-gradient md:backdrop-blur-md md:border md:border-white/40 dark:md:border-slate-700/40 md:shadow-glass md:rounded-xl overflow-hidden">
        <div className="px-4 py-3 md:px-6 md:py-4 md:border-b md:border-border/50">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-lg">This Week's Focus</h3>
              <p className="text-sm text-muted-foreground">Week of {weekOfDate}</p>
            </div>
            {locationWeekContext && (
              <Badge variant="outline" className="text-xs">
                Cycle {locationWeekContext.cycleNumber} • Week {locationWeekContext.weekInCycle}
              </Badge>
            )}
          </div>
        </div>
        <div className="p-4 md:p-6">
          <div className="bg-white/60 backdrop-blur-sm rounded-xl p-4 border border-white/30 text-center">
            <p className="text-sm font-medium text-foreground">
              No Pro Moves configured for this week. Please contact your administrator.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Show normal view with pro moves and banner
  return (
    <div className="bg-transparent md:bg-glass-gradient md:backdrop-blur-md md:border md:border-white/40 dark:md:border-slate-700/40 md:shadow-glass md:rounded-xl overflow-hidden">
      {/* Header - Centered */}
      <div className="px-4 py-3 md:px-6 md:py-4 md:border-b md:border-border/50 text-center">
        <h3 className="font-semibold text-lg">ProMoves</h3>
        <p className="text-sm text-muted-foreground">Week of {weekOfDate}</p>
      </div>

      {/* Content */}
      <div className="px-2.5 py-3 md:p-6 space-y-3">
        {/* Pro Moves list - Spine Layout */}
        {displayAssignments.map((assignment) => {
          const domainName = assignment.domain_name;
          const domainColor = domainName ? getDomainColor(domainName) : 'hsl(var(--primary))';
          const domainColorRich = domainName ? `hsl(${getDomainColorRichRaw(domainName)})` : 'hsl(var(--primary))';
          
          const scores = weeklyScores.find(s => 
            s.assignment_id === assignment.weekly_focus_id || s.weekly_focus_id === assignment.weekly_focus_id
          );
          const resourceCount = assignment.pro_move_id ? (resourceCounts[assignment.pro_move_id] || 0) : 0;

          return (
            <div 
              key={assignment.weekly_focus_id} 
              className={cn(
                "relative flex bg-white dark:bg-slate-800",
                "backdrop-blur-sm rounded-xl overflow-hidden",
                "border border-border/50 dark:border-slate-700/50",
                "shadow-sm",
                "transition-colors",
                resourceCount > 0 && "cursor-pointer hover:shadow-md active:scale-[0.99]"
              )}
              onClick={() => {
                if (resourceCount > 0) {
                  setSelectedLearnAssignment(assignment);
                  setLearnDrawerOpen(true);
                }
              }}
              role={resourceCount > 0 ? "button" : undefined}
              tabIndex={resourceCount > 0 ? 0 : undefined}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && resourceCount > 0) {
                  setSelectedLearnAssignment(assignment);
                  setLearnDrawerOpen(true);
                }
              }}
            >
              {/* THE SPINE: Vertical Domain Label */}
              <div 
                className="w-8 shrink-0 flex flex-col items-center justify-center"
                style={{ backgroundColor: domainColor }}
              >
                {/* Vertical domain text */}
                <span 
                  className="text-[10px] font-bold tracking-widest uppercase"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: domainColorRich }}
                >
                  {domainName}
                </span>
              </div>
              
              {/* Content Area */}
              <div className="flex-1 p-3 md:p-4">
                {/* Pro Move Text - Full Width */}
                <p className="text-sm font-medium leading-relaxed text-foreground/90">
                  {assignment.action_statement || 'Check-In to choose this Pro-Move for the week.'}
                </p>

                {/* Bottom Row: Scores + Learn Button */}
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
                  <ConfPerfDelta 
                    confidence={scores?.confidence_score} 
                    performance={scores?.performance_score} 
                  />
                  
                  {/* Learn button with chevron */}
                  {resourceCount > 0 && (
                    <button
                      className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedLearnAssignment(assignment);
                        setLearnDrawerOpen(true);
                      }}
                      aria-label="View learning materials"
                    >
                      <GraduationCap className="h-4 w-4" />
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Floating CTA Banner */}
        {banner.message && (
          <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-2xl p-4 border border-white/40 dark:border-slate-700/40 mt-4">
            <p className="text-sm font-medium text-center mb-3 text-foreground">
              {banner.message}
            </p>
            {banner.cta && (
              <Button
                className="w-full rounded-full shadow-lg"
                onClick={() => navigate(banner.cta!.to)}
              >
                {banner.cta.label}
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}

        {/* Simulation status */}
        {SimBannerComponent && <SimBannerComponent />}
      </div>

      {selectedLearnAssignment && selectedLearnAssignment.pro_move_id && (() => {
        // Find score data for selected assignment to pass history
        const selectedScores = weeklyScores.find(s => 
          s.assignment_id === selectedLearnAssignment.weekly_focus_id || 
          s.weekly_focus_id === selectedLearnAssignment.weekly_focus_id
        );
        return (
          <LearnerLearnDrawer
            open={learnDrawerOpen}
            onOpenChange={setLearnDrawerOpen}
            actionId={selectedLearnAssignment.pro_move_id}
            proMoveTitle={selectedLearnAssignment.action_statement || 'Pro Move'}
            domainName={selectedLearnAssignment.domain_name || 'General'}
            lastPracticed={selectedScores?.confidence_score != null ? weekOfDate : null}
            avgConfidence={selectedScores?.confidence_score}
          />
        );
      })()}
    </div>
  );
}
