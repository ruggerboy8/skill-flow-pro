import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';


import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useUserRole } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getWeekAnchors } from '@/v2/time';
import { useNow } from '@/providers/NowProvider';
import { getDomainPastelVar, getDomainColorVar, getDomainInk } from '@/lib/domainColors';
import { assembleCurrentWeek, WeekAssignment } from '@/lib/weekAssembly';
import { computeWeekState, StaffStatus, getLocationWeekContext, LocationWeekContext } from '@/lib/locationState';
import { useSim } from '@/devtools/SimProvider';
import { formatInTimeZone } from 'date-fns-tz';
import { GraduationCap, CalendarOff, ChevronRight, PauseCircle } from 'lucide-react';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { buildWeekBanner } from '@/v2/weekCta';
import { LearnerLearnDrawer } from '@/components/learner/LearnerLearnDrawer';
import { cn } from '@/lib/utils';
import { useMobileShell } from '@/hooks/useMobileShell';

// Mobile-shell state heading + dot for the hero card (section C.5). Verbatim
// banner copy from src/v2/weekCta.ts still drives the message/CTA below —
// this map only supplies the short UI heading and its dot color.
const MOBILE_STATE_HEADING: Record<string, { heading: string; dot: 'due' | 'done' }> = {
  can_checkin: { heading: 'Check-in', dot: 'due' },
  missed_checkin: { heading: 'Still open', dot: 'due' },
  wait_for_thu: { heading: 'Confidence submitted', dot: 'done' },
  can_checkout: { heading: 'Check-out', dot: 'due' },
  missed_checkout: { heading: 'Still open', dot: 'due' },
  done: { heading: 'All set', dot: 'done' },
};

const MOBILE_MOVE_CAP = 4;

interface WeeklyScore { 
  weekly_focus_id: string;
  assignment_id?: string | null;
  confidence_score: number | null; 
  performance_score: number | null; 
}

export default function ThisWeekPanel() {
  const { user } = useAuth();
  const { data: staff, isLoading: staffLoading } = useStaffProfile({ redirectToSetup: true });
  const { isParticipant } = useUserRole();
  const { toast } = useToast();
  const navigate = useNavigate();
  const now = useNow();
  const { overrides } = useSim();
  

  const [weekContext, setWeekContext] = useState<StaffStatus | null>(null);
  const [locationWeekContext, setLocationWeekContext] = useState<LocationWeekContext | null>(null);
  const [weekAssignments, setWeekAssignments] = useState<WeekAssignment[]>([]);
  const [parentWeekAssignments, setParentWeekAssignments] = useState<WeekAssignment[]>([]);
  const [parentRoleId, setParentRoleId] = useState<number | null>(null);
  const [weeklyScores, setWeeklyScores] = useState<WeeklyScore[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [weekOfDate, setWeekOfDate] = useState<string>('');
  const [SimBannerComponent, setSimBannerComponent] = useState<React.ComponentType | null>(null);
  const [learnDrawerOpen, setLearnDrawerOpen] = useState(false);
  const [selectedLearnAssignment, setSelectedLearnAssignment] = useState<WeekAssignment | null>(null);
  const [resourceCounts, setResourceCounts] = useState<Record<number, number>>({});
  const [isExempt, setIsExempt] = useState(false);
  const isMobileShell = useMobileShell();
  const [movesExpanded, setMovesExpanded] = useState(false);

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
      // Use simulated time if available
      const effectiveNow = overrides.enabled && overrides.nowISO ? new Date(overrides.nowISO) : now;

      // Weekly rollover retired 2026-07-25 (roadmap 2.4 slice A): it only acted
      // for cycles 1-3 and fed the removed backlog. Missed weeks are simply missed.

      // Legacy "Lead Pro Move" dual-panel retired 2026-07-21. Leads now get
      // Ariyana's weekly focus card on the home (LeadFocusHomeCard) instead of a
      // second pro-move stream. Keep the parent panel empty so the old Lead Pro
      // Move block + banner below never render. staff.is_lead itself is unchanged.
      const resolvedLeadRoleId: number | null = null;
      setParentRoleId(resolvedLeadRoleId);

      // Load current week assignments and context based on user progress
      console.log('🔎 [ThisWeekPanel] Calling assembleCurrentWeek with:', {
        userId: user.id,
        staffId: staff.id,
        roleId: staff.role_id,
        locationId: staff.primary_location_id,
      });
      const { assignments, cycleNumber, weekInCycle } = await assembleCurrentWeek(
        user.id,
        {
          id: staff.id,
          role_id: staff.role_id!,
          primary_location_id: staff.primary_location_id!
        },
        overrides
      );
      console.log('🔎 [ThisWeekPanel] assembleCurrentWeek returned:', {
        assignmentCount: assignments.length,
        cycleNumber,
        weekInCycle,
        assignments: assignments.map(a => ({ id: a.weekly_focus_id, action: a.action_statement, domain: a.domain_name })),
      });
      setWeekAssignments(assignments);

      // For Lead Dental Assistant: also load the lead role's assignments
      if (resolvedLeadRoleId) {
        const { assignments: leadAssignments } = await assembleCurrentWeek(
          user.id,
          {
            id: staff.id,
            role_id: resolvedLeadRoleId,
            primary_location_id: staff.primary_location_id!
          },
          overrides
        );
        setParentWeekAssignments(leadAssignments);
      } else {
        setParentWeekAssignments([]);
      }

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

      // Load weekly scores for all assignments (own + parent panel)
      const allFocusIds = [
        ...assignments.map(a => a.weekly_focus_id),
        ...(resolvedLeadRoleId ? [] : []), // lead assignments loaded separately above
      ];
      if (allFocusIds.length > 0 || resolvedLeadRoleId) {
        const { data: scores } = await supabase
          .from('weekly_scores')
          .select('weekly_focus_id, assignment_id, confidence_score, performance_score')
          .eq('staff_id', staff.id);

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

  // Lead-specific CTA: same time gates, but checks lead assignment scores
  const leadBanner = useMemo(() => {
    if (!parentWeekAssignments.length || !locationWeekContext || !parentRoleId) return null;

    const leadScores = parentWeekAssignments.map(a =>
      weeklyScores.find(s =>
        s.assignment_id === a.weekly_focus_id || s.weekly_focus_id === a.weekly_focus_id
      )
    );

    const allConfDone = leadScores.every(s => s?.confidence_score != null);
    const allPerfDone = leadScores.every(s => s?.performance_score != null);
    const { anchors } = locationWeekContext;
    const effectiveNow = now;

    const confOpen = effectiveNow >= anchors.checkin_open;
    const perfOpen = effectiveNow >= anchors.checkout_open;

    if (allConfDone && allPerfDone) return null; // done

    if (!allConfDone && confOpen) {
      const isLate = effectiveNow >= anchors.checkin_due;
      return {
        message: isLate
          ? 'Lead confidence is late — you can still submit it now.'
          : 'Rate your confidence for the Lead Pro Move.',
        cta: { label: 'Rate Lead Confidence', to: `/confidence/current/step/1?roleId=${parentRoleId}` },
      };
    }

    if (allConfDone && !perfOpen) return null; // waiting for Thu

    if (allConfDone && !allPerfDone && perfOpen) {
      const isLate = effectiveNow >= anchors.checkout_due;
      return {
        message: isLate
          ? 'Lead performance is late — add it now to wrap things up.'
          : 'Rate your performance for the Lead Pro Move.',
        cta: { label: 'Rate Lead Performance', to: `/performance/current/step/1?roleId=${parentRoleId}` },
      };
    }

    return null;
  }, [parentWeekAssignments, weeklyScores, locationWeekContext, parentRoleId, now]);

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

  // Show paused account message
  if (staff.is_paused) {
    return (
      <div className="bg-transparent md:bg-glass-gradient md:backdrop-blur-md md:border md:border-white/40 dark:md:border-slate-700/40 md:shadow-glass md:rounded-xl overflow-hidden">
        <div className="px-4 py-3 md:px-6 md:py-4 md:border-b md:border-border/50">
          <h3 className="font-semibold text-lg">This Week's Pro Moves</h3>
          {weekOfDate && <p className="text-sm text-muted-foreground">Week of {weekOfDate}</p>}
        </div>
        <div className="p-4 md:p-6">
          <div className="rounded-xl border bg-amber-50 border-amber-200 p-6 text-center">
            <PauseCircle className="h-10 w-10 mx-auto mb-3 text-amber-600" />
            <p className="font-semibold text-amber-900 mb-1">Your ProMoves Account is Temporarily Paused</p>
            <p className="text-sm text-amber-700">
              You won't receive assignments or be marked for missed submissions during this time.
              Contact your Regional Manager if you'd like to be reinstated.
            </p>
            {staff.pause_reason && (
              <p className="text-xs text-amber-600 mt-3 italic">Reason: {staff.pause_reason}</p>
            )}
          </div>
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

  // Mobile-shell hero emphasis (section C.4): can_checkin/can_checkout get a
  // 2px primary border; missed states get the late tint; done gets the
  // complete tint. Never the late-amber tint for an on-time state.
  const mobileHeroState = weekContext?.state;
  const mobileHeroClass = isMobileShell ? 'bg-card border rounded-2xl' : '';
  const mobileHeroStyle: import('react').CSSProperties | undefined = isMobileShell
    ? mobileHeroState === 'can_checkin' || mobileHeroState === 'can_checkout'
      ? { borderWidth: 2, borderColor: 'hsl(var(--primary))' }
      : mobileHeroState === 'missed_checkin' || mobileHeroState === 'missed_checkout'
      ? { backgroundColor: 'hsl(var(--status-late-bg))' }
      : mobileHeroState === 'done'
      ? { backgroundColor: 'hsl(var(--status-complete-bg))' }
      : undefined
    : undefined;

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
    <div
      className={cn(
        "bg-transparent md:bg-glass-gradient md:backdrop-blur-md md:border md:border-white/40 dark:md:border-slate-700/40 md:shadow-glass md:rounded-xl overflow-hidden",
        mobileHeroClass
      )}
      style={mobileHeroStyle}
    >
      {/* Header - Centered */}
      <div className="px-4 py-3 md:px-6 md:py-4 md:border-b md:border-border/50 text-center">
        <h3 className="font-semibold text-lg">ProMoves</h3>
        <p className="text-sm text-muted-foreground">Week of {weekOfDate}</p>
      </div>

      {/* Content */}
      <div className="px-2.5 py-3 md:p-6 space-y-3">
        {isMobileShell && (
          <MobileMovesAndBanner
            displayAssignments={displayAssignments}
            movesExpanded={movesExpanded}
            setMovesExpanded={setMovesExpanded}
            weeklyScores={weeklyScores}
            resourceCounts={resourceCounts}
            onOpenLearn={(assignment) => {
              setSelectedLearnAssignment(assignment);
              setLearnDrawerOpen(true);
            }}
            weekContext={weekContext}
            banner={banner}
            onCta={(to) => navigate(to)}
          />
        )}
        {!isMobileShell && (
        <>
        {/* Pro Moves list - Spine Layout */}
        {displayAssignments.map((assignment) => {
          const domainName = assignment.domain_name;
          const domainColor = domainName ? getDomainPastelVar(domainName) : 'hsl(var(--primary))';
          const domainInk = domainName ? getDomainInk(domainName) : 'hsl(var(--primary-foreground))';
          
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
                  className="text-2xs font-bold tracking-widest uppercase"
                  style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: domainInk }}
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
        </>
        )}

        {/* ── Lead Pro Move card + CTA — below the main flow ─────────────── */}
        {parentWeekAssignments.length > 0 && (
          <div className="space-y-3 pt-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-1">
              Lead Pro Move
            </p>
            {parentWeekAssignments.map((assignment) => {
              const domainName = assignment.domain_name;
              const domainColor = domainName ? getDomainPastelVar(domainName) : 'hsl(var(--primary))';
              const domainInk = domainName ? getDomainInk(domainName) : 'hsl(var(--primary-foreground))';
              const scores = weeklyScores.find(s =>
                s.assignment_id === assignment.weekly_focus_id || s.weekly_focus_id === assignment.weekly_focus_id
              );
              const resourceCount = assignment.pro_move_id ? (resourceCounts[assignment.pro_move_id] || 0) : 0;

              return (
                <div
                  key={`parent-${assignment.weekly_focus_id}`}
                  className={cn(
                    "relative flex bg-white dark:bg-slate-800",
                    "backdrop-blur-sm rounded-xl overflow-hidden",
                    "border border-border/50 dark:border-slate-700/50",
                    "shadow-sm transition-colors",
                    resourceCount > 0 && "cursor-pointer hover:shadow-md active:scale-[0.99]"
                  )}
                  onClick={() => {
                    if (resourceCount > 0) {
                      setSelectedLearnAssignment(assignment);
                      setLearnDrawerOpen(true);
                    }
                  }}
                  onKeyDown={
                    resourceCount > 0
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            setSelectedLearnAssignment(assignment);
                            setLearnDrawerOpen(true);
                          }
                        }
                      : undefined
                  }
                  role={resourceCount > 0 ? "button" : undefined}
                  tabIndex={resourceCount > 0 ? 0 : undefined}
                >
                  <div className="w-8 shrink-0 flex flex-col items-center justify-center" style={{ backgroundColor: domainColor }}>
                    <span className="text-2xs font-bold tracking-widest uppercase" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', color: domainInk }}>
                      {domainName}
                    </span>
                  </div>
                  <div className="flex-1 p-3 md:p-4">
                    <p className="text-sm font-medium leading-relaxed text-foreground/90">
                      {assignment.action_statement || 'Pro Move'}
                    </p>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/30">
                      <ConfPerfDelta confidence={scores?.confidence_score} performance={scores?.performance_score} />
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Lead CTA Banner */}
            {leadBanner && (
              <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-2xl p-4 border border-white/40 dark:border-slate-700/40">
                <p className="text-sm font-medium text-center mb-3 text-foreground">
                  {leadBanner.message}
                </p>
                {leadBanner.cta && (
                  <Button
                    variant="outline"
                    className="w-full rounded-full"
                    onClick={() => navigate(leadBanner.cta!.to)}
                  >
                    {leadBanner.cta.label}
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </Button>
                )}
              </div>
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

/**
 * Mobile-shell move list + state banner (section C.3–C.5). Capped at 4 rows
 * with a "+N more" expander, full-strength domain spine (no vertical text —
 * that's a desktop-only affordance), and a state heading above the verbatim
 * banner copy/CTA from src/v2/weekCta.ts.
 */
function MobileMovesAndBanner({
  displayAssignments,
  movesExpanded,
  setMovesExpanded,
  weeklyScores,
  resourceCounts,
  onOpenLearn,
  weekContext,
  banner,
  onCta,
}: {
  displayAssignments: WeekAssignment[];
  movesExpanded: boolean;
  setMovesExpanded: (value: boolean) => void;
  weeklyScores: WeeklyScore[];
  resourceCounts: Record<number, number>;
  onOpenLearn: (assignment: WeekAssignment) => void;
  weekContext: StaffStatus | null;
  banner: { message: string; cta?: { label: string; to: string } };
  onCta: (to: string) => void;
}) {
  const shown = movesExpanded ? displayAssignments : displayAssignments.slice(0, MOBILE_MOVE_CAP);
  const hiddenCount = displayAssignments.length - shown.length;
  const heading = weekContext ? MOBILE_STATE_HEADING[weekContext.state] : undefined;

  return (
    <>
      {shown.map((assignment) => {
        const domainName = assignment.domain_name;
        const domainColorRich = domainName ? getDomainColorVar(domainName) : 'hsl(var(--primary))';
        const scores = weeklyScores.find(
          (s) => s.assignment_id === assignment.weekly_focus_id || s.weekly_focus_id === assignment.weekly_focus_id
        );
        const resourceCount = assignment.pro_move_id ? resourceCounts[assignment.pro_move_id] || 0 : 0;

        return (
          <div
            key={assignment.weekly_focus_id}
            className="flex gap-2.5 py-3 border-b border-border last:border-0 items-stretch"
            onClick={() => resourceCount > 0 && onOpenLearn(assignment)}
            role={resourceCount > 0 ? 'button' : undefined}
            tabIndex={resourceCount > 0 ? 0 : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && resourceCount > 0) onOpenLearn(assignment);
            }}
          >
            <div className="w-2 rounded-sm flex-none" style={{ backgroundColor: domainColorRich }} />
            <p className="flex-1 text-[13px] leading-snug self-center">
              {assignment.action_statement || 'Check-In to choose this Pro-Move for the week.'}
            </p>
            <div className="self-center flex-none">
              <ConfPerfDelta confidence={scores?.confidence_score} performance={scores?.performance_score} />
            </div>
          </div>
        );
      })}

      {hiddenCount > 0 && (
        <button
          type="button"
          className="w-full text-left text-[13px] font-semibold text-primary pt-2 pb-1 min-h-[44px]"
          onClick={() => setMovesExpanded(!movesExpanded)}
        >
          {movesExpanded ? 'Show less' : `+${hiddenCount} more`}
        </button>
      )}

      <div className="mt-3">
        {heading && (
          <div className="flex items-center gap-2 mb-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full flex-none"
              style={{ backgroundColor: heading.dot === 'done' ? 'hsl(var(--status-complete))' : 'hsl(var(--status-late))' }}
            />
            <h2 className="text-[17px]" style={{ fontWeight: 650 }}>
              {heading.heading}
            </h2>
          </div>
        )}
        {banner.message && <p className="text-[13px] text-muted-foreground">{banner.message}</p>}
        {banner.cta && (
          <Button className="w-full rounded-full mt-3" onClick={() => onCta(banner.cta!.to)}>
            {banner.cta.label}
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        )}
      </div>
    </>
  );
}
