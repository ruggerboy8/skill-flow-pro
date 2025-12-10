// Updated Performance Wizard to use progress-based approach instead of ISO week
import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import NumberScale from '@/components/NumberScale';
import { getDomainColor } from '@/lib/domainColors';
import { nowUtc, getAnchors } from '@/lib/centralTime';
import { format } from 'date-fns';
import { getWeekAnchors } from '@/v2/time';
import { useNow } from '@/providers/NowProvider';
import { useSim } from '@/devtools/SimProvider';
import { assembleCurrentWeek } from '@/lib/weekAssembly';
import { useReliableSubmission } from '@/hooks/useReliableSubmission';
import { AlertCircle, Loader2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Assignment {
  weekly_focus_id: string;
  type: string;
  pro_move_id?: number;
  display_order: number;
  action_statement: string;
  domain_name: string;
}

interface Staff {
  id: string;
  role_id: number;
  primary_location_id?: string;
  locations?: {
    program_start_date?: string;
    cycle_length_weeks?: number;
    timezone?: string;
  };
}

interface WeeklyFocus {
  id: string;
  display_order: number;
  action_statement: string;
  cycle: number;
  week_in_cycle: number;
  domain_name: string;
  competency_name?: string;
  week_label?: string;
}

interface WeeklyScore {
  id: string;
  weekly_focus_id: string;
  assignment_id?: string | null;
  confidence_score: number;
  confidence_date?: string | null;
  selected_action_id?: number | null;
}

export default function PerformanceWizard() {
  const { n } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [currentFocus, setCurrentFocus] = useState<WeeklyFocus | null>(null);
  const [existingScores, setExistingScores] = useState<WeeklyScore[]>([]);
  const [performanceScores, setPerformanceScores] = useState<{ [key: string]: number }>({});
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isCarryoverWeek, setIsCarryoverWeek] = useState(false);
  const [showVictory, setShowVictory] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const now = useNow();
  const { overrides } = useSim();
  const { submitWithRetry, pendingCount } = useReliableSubmission();

  // Parse repair mode parameters
  const qs = new URLSearchParams(location.search);
  const isRepair = qs.get("mode") === "repair";
  const repairCycle = qs.get("cycle");
  const repairWeek = qs.get("wk");
  const returnTo = qs.get("returnTo");
  
  // Immediate debug logging
  console.log('PerformanceWizard - Raw URL params:', { 
    isRepair, 
    repairCycle: `"${repairCycle}"`, 
    repairWeek: `"${repairWeek}"`, 
    fullSearch: location.search 
  });
  
  // Parse and validate repair parameters early
  let targetCycle: number | null = null;
  let targetWeek: number | null = null;
  
  if (isRepair) {
    if (!repairCycle || !repairWeek) {
      console.error('Missing repair parameters:', { repairCycle, repairWeek });
    } else {
      targetCycle = parseInt(repairCycle, 10);
      targetWeek = parseInt(repairWeek, 10);
      console.log('PerformanceWizard - Parsed repair params:', { 
        targetCycle, 
        targetWeek, 
        targetCycleIsNaN: isNaN(targetCycle), 
        targetWeekIsNaN: isNaN(targetWeek) 
      });
    }
  }

  // Use simulated time if available for time gating
  const effectiveNow = overrides.enabled && overrides.nowISO ? new Date(overrides.nowISO) : now;
  const { thuStartZ, mondayZ } = getAnchors(effectiveNow);

  const currentIndex = Math.max(0, (Number(n) || 1) - 1);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, n]);

  // Time gate: Block performance access until Thursday 00:01 (except repair mode)
  // TEMPORARILY DISABLED - user requested removal of time gating
  // useEffect(() => {
  //   // Skip time gate for repair mode (backfilling past data)
  //   if (isRepair) return;
  //   
  //   // Skip if staff not loaded yet
  //   if (!staff?.locations?.timezone) return;
  //   
  //   const { checkout_open } = getWeekAnchors(effectiveNow, staff.locations.timezone);
  //   
  //   if (effectiveNow < checkout_open) {
  //     toast({
  //       title: "Not Open Yet",
  //       description: "Performance ratings open on Thursday.",
  //     });
  //     navigate('/');
  //   }
  // }, [effectiveNow, staff, isRepair, navigate, toast]);

  const loadData = async () => {
    if (!user) return;

    // Load staff profile with location info (including timezone for time gating)
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('id, role_id, primary_location_id, locations(program_start_date, cycle_length_weeks, timezone)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (staffError || !staffData) {
      navigate('/setup');
      return;
    }

    setStaff(staffData);

    // Use the unified site-based approach to get assignments
    let weekAssignments, cycleNumber, weekInCycle;
    
    // Handle repair mode - either with cycle/week or just weekOf
    if (isRepair) {
      const weekOf = qs.get('weekOf');
      
      if (!weekOf) {
        console.error('Repair mode requires weekOf parameter');
        toast({
          title: 'Error',
          description: 'Invalid repair parameters. Please try again from the Stats page.',
          variant: 'destructive'
        });
        setLoading(false);
        return;
      }

      console.log('Loading repair data for weekOf:', weekOf);
      
      // Try to use cycle/week if available, otherwise use weekOf to determine source
      if (targetCycle !== null && targetWeek !== null && !isNaN(targetCycle) && !isNaN(targetWeek)) {
        // Have cycle/week - use them to determine source
        const isOnboarding = targetCycle <= 3;
        
        if (isOnboarding) {
          // Query weekly_assignments for cycles 1-3
          const { data: assignData } = await supabase
            .from('weekly_assignments')
            .select(`
              id,
              display_order,
              competency_id,
              self_select,
              action_id,
              week_start_date,
              pro_moves!weekly_assignments_action_id_fkey ( 
                action_statement,
                competencies ( 
                  name,
                  domains!competencies_domain_id_fkey ( domain_name )
                )
              ),
              competencies ( 
                name,
                domains!competencies_domain_id_fkey ( domain_name )
              )
            `)
            .eq('role_id', staffData.role_id)
            .eq('location_id', staffData.primary_location_id)
            .eq('week_start_date', weekOf)
            .eq('source', 'onboarding')
            .eq('status', 'locked')
            .order('display_order');

          console.log('Repair query result (assignments):', { assignData });

          weekAssignments = (assignData || []).map((item: any) => {
            let domainName = 'Unknown';
            if (item.pro_moves?.competencies?.domains?.domain_name) {
              domainName = item.pro_moves.competencies.domains.domain_name;
            } else if (item.competencies?.domains?.domain_name) {
              domainName = item.competencies.domains.domain_name;
            }

            return {
              weekly_focus_id: `assign:${item.id}`,
              type: item.self_select ? 'self_select' : 'site',
              display_order: item.display_order,
              action_statement: item.pro_moves?.action_statement || '',
              domain_name: domainName,
              required: true,
              locked: false
            };
          });
        } else {
          // Query weekly_plan for cycle 4+
          const { data: planData } = await supabase
            .from('weekly_plan')
            .select(`
              id,
              display_order,
              competency_id,
              self_select,
              action_id,
              pro_moves!weekly_plan_action_id_fkey ( 
                action_statement,
                competencies ( 
                  name,
                  domains!competencies_domain_id_fkey ( domain_name )
                )
              ),
              competencies ( 
                name,
                domains!competencies_domain_id_fkey ( domain_name )
              )
            `)
            .eq('role_id', staffData.role_id)
            .eq('week_start_date', weekOf)
            .eq('status', 'locked')
            .order('display_order');

          console.log('Repair query result (plan):', { planData });

          weekAssignments = (planData || []).map((item: any) => {
            let domainName = 'Unknown';
            if (item.pro_moves?.competencies?.domains?.domain_name) {
              domainName = item.pro_moves.competencies.domains.domain_name;
            } else if (item.competencies?.domains?.domain_name) {
              domainName = item.competencies.domains.domain_name;
            }

            return {
              weekly_focus_id: `plan:${item.id}`,
              type: item.self_select ? 'self_select' : 'site',
              display_order: item.display_order,
              action_statement: item.pro_moves?.action_statement || '',
              domain_name: domainName,
              required: true,
              locked: false
            };
          });
        }
        
        cycleNumber = targetCycle;
        weekInCycle = targetWeek;
      } else {
        // No cycle/week - query weekly_plan by weekOf (assume ongoing phase)
        console.log('No cycle/week params, querying weekly_plan by weekOf');
        
        const { data: planData } = await supabase
          .from('weekly_plan')
          .select(`
            id,
            display_order,
            competency_id,
            self_select,
            action_id,
            pro_moves!weekly_plan_action_id_fkey ( 
              action_statement,
              competencies ( 
                name,
                domains!competencies_domain_id_fkey ( domain_name )
              )
            ),
            competencies ( 
              name,
              domains!competencies_domain_id_fkey ( domain_name )
            )
          `)
          .eq('role_id', staffData.role_id)
          .eq('week_start_date', weekOf)
          .eq('status', 'locked')
          .order('display_order');

        console.log('Repair query result (plan by weekOf):', { planData });

        if (!planData || planData.length === 0) {
          console.error('No weekly_plan data found for weekOf:', weekOf);
          toast({
            title: 'Error',
            description: 'No assignments found for this week. Please try again.',
            variant: 'destructive'
          });
          setLoading(false);
          return;
        }

        weekAssignments = (planData || []).map((item: any) => {
          let domainName = 'Unknown';
          if (item.pro_moves?.competencies?.domains?.domain_name) {
            domainName = item.pro_moves.competencies.domains.domain_name;
          } else if (item.competencies?.domains?.domain_name) {
            domainName = item.competencies.domains.domain_name;
          }

          return {
            weekly_focus_id: `plan:${item.id}`,
            type: item.self_select ? 'self_select' : 'site',
            display_order: item.display_order,
            action_statement: item.pro_moves?.action_statement || '',
            domain_name: domainName,
            required: true,
            locked: false
          };
        });
        
        // Set cycle/week to unknown for display
        cycleNumber = 0;
        weekInCycle = 0;
      }
      
      console.log('repair mode assignments', weekAssignments);
      console.log('cycle info:', { cycleNumber, weekInCycle });
    } else {
      // Normal current week logic
      const result = await assembleCurrentWeek(
        user.id,
        {
          id: staffData.id,
          role_id: staffData.role_id,
          primary_location_id: staffData.primary_location_id
        },
        overrides
      );
      weekAssignments = result.assignments;
      cycleNumber = result.cycleNumber;
      weekInCycle = result.weekInCycle;
    }

    if (!weekAssignments || weekAssignments.length === 0) {
      toast({
        title: 'Error',
        description: 'No Pro Moves found for this week',
        variant: 'destructive'
      });
      navigate('/week');
      return;
    }

    setAssignments(weekAssignments);

    // Load existing confidence scores with selected action IDs (check both assignment_id and weekly_focus_id)
    const focusIds = weekAssignments.map(a => a.weekly_focus_id);
    const { data: scoresData, error: scoresError } = await supabase
      .from('weekly_scores')
      .select('id, weekly_focus_id, assignment_id, confidence_score, confidence_date, selected_action_id')
      .eq('staff_id', staffData.id)
      .or(focusIds.map(id => `assignment_id.eq.${id},weekly_focus_id.eq.${id}`).join(','))
      .not('confidence_score', 'is', null);
    
    // Match scores by either assignment_id or weekly_focus_id
    const matchedScores = scoresData?.filter(score =>
      focusIds.some(id => id === score.assignment_id || id === score.weekly_focus_id)
    ) || [];

    if (scoresError || matchedScores.length !== weekAssignments.length && !isRepair) {
      if (isRepair) {
        toast({
          title: "Error",
          description: "No confidence scores found for this week",
          variant: "destructive"
        });
        navigate(returnTo ? decodeURIComponent(returnTo) : '/');
      } else {
        // Redirect to confidence wizard to complete missing ratings
        const missingCount = weekAssignments.length - matchedScores.length;
        
        // Find the first incomplete confidence item
        const completedIds = new Set(matchedScores.map(s => s.assignment_id || s.weekly_focus_id));
        const firstIncompleteIndex = weekAssignments.findIndex(
          assignment => !completedIds.has(assignment.weekly_focus_id)
        );
        const stepIndex = Math.max(0, firstIncompleteIndex) + 1;
        
        // Navigate to confidence wizard with clearer messaging for late submissions
        const currentPath = location.pathname + location.search;
        const returnPath = `?returnTo=${encodeURIComponent(currentPath)}`;
        
        // Show a friendly message that explains the flow
        toast({
          title: "Rate Confidence First",
          description: `Complete your confidence ratings (${missingCount} remaining), then you can rate your performance.`,
          variant: "default"
        });
        
        navigate(`/confidence/current/step/${stepIndex}${returnPath}`);
      }
      return;
    }

    // Build the weekly focus with actual selected pro moves
    // For current week: use actual current Monday
    // For repair: try to get week_start_date from data or fall back to cycle/week display
    let weekLabel = `Cycle ${cycleNumber}, Week ${weekInCycle}`;
    
    if (!isRepair) {
      // Calculate current Monday for current week
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() + daysToMonday);
      thisMonday.setHours(0, 0, 0, 0);
      weekLabel = `Week of ${format(thisMonday, 'MMM d')}`;
    } else {
      // For repair mode, try to get week_start_date from weekly_focus
      const focusIds = weekAssignments.map(a => a.weekly_focus_id);
      if (focusIds.length > 0) {
        const { data: focusWithDate } = await supabase
          .from('weekly_focus')
          .select('week_start_date')
          .in('id', focusIds)
          .limit(1)
          .maybeSingle();
        
        if (focusWithDate?.week_start_date) {
          const weekStart = new Date(focusWithDate.week_start_date);
          weekLabel = `Week of ${format(weekStart, 'MMM d')}`;
        }
      }
    }
    
    const transformedFocusData: WeeklyFocus[] = weekAssignments.map((assignment) => {
      return {
        id: assignment.weekly_focus_id,
        display_order: assignment.display_order,
        action_statement: assignment.action_statement || '',
        cycle: cycleNumber,
        week_in_cycle: weekInCycle,
        domain_name: assignment.domain_name,
        competency_name: undefined, // Could be added to assignments if needed
        week_label: weekLabel
      };
    });

    setWeeklyFocus(transformedFocusData);
    setExistingScores(matchedScores);
    
    // Determine carryover if confidence was submitted before this Monday
    const carryover = matchedScores.some((s: any) => s.confidence_date && new Date(s.confidence_date) < mondayZ);
    setIsCarryoverWeek(carryover);

    setCurrentFocus(transformedFocusData[currentIndex]);
    setLoading(false);
  };

  // Helper function to preserve URL parameters during navigation
  const preserveSearchParams = (newPath: string) => {
    const currentSearch = location.search;
    return `${newPath}${currentSearch}`;
  };

  const attemptNext = () => {
    if (!currentFocus) return;

    const perfScore = performanceScores[currentFocus.id]; // Today
    const confScore = getConfidenceScore(currentFocus.id); // Monday

    // Trigger: Low Start + High Finish
    // We ALLOW this in Repair Mode because celebrating past wins is good.
    if (perfScore >= 3 && confScore > 0 && confScore <= 2) {
      setShowVictory(true);
    } else {
      proceed();
    }
  };

  const proceed = () => {
    if (currentIndex < weeklyFocus.length - 1) {
      navigate(preserveSearchParams(`/performance/current/step/${currentIndex + 2}`));
    } else {
      handleSubmit();
    }
  };

  const handleNext = attemptNext; // Keep the old name for compatibility

  const handleBack = () => {
    if (currentIndex > 0) {
      navigate(preserveSearchParams(`/performance/current/step/${currentIndex}`));
    }
  };

  const handleSubmit = async () => {
    if (!staff || !currentFocus) return;

    // Check if all performance scores are filled with valid values (1-4)
    const missingScores = existingScores.filter(score => {
      // Find matching focus item by either assignment_id or weekly_focus_id
      const focusItem = weeklyFocus.find(wf => 
        wf.id === score.assignment_id || wf.id === score.weekly_focus_id
      );
      if (!focusItem) return true; // No matching focus = missing
      
      const perfScore = performanceScores[focusItem.id];
      return !perfScore || perfScore < 1 || perfScore > 4;
    });
    
    if (missingScores.length > 0) {
      console.error('Missing or invalid performance scores:', missingScores.map(s => {
        const focusItem = weeklyFocus.find(wf => 
          wf.id === s.assignment_id || wf.id === s.weekly_focus_id
        );
        return { 
          focus_id: s.weekly_focus_id,
          assignment_id: s.assignment_id,
          matched_id: focusItem?.id,
          score: focusItem ? performanceScores[focusItem.id] : undefined
        };
      }));
      toast({
        title: 'Error',
        description: 'Please provide performance scores for all items before submitting.',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);

    // Get location timezone for proper deadline calculation
    let timezone = 'America/Chicago'; // default fallback
    if (staff && 'primary_location_id' in staff && (staff as any).primary_location_id) {
      const { data: locationData } = await supabase
        .from('locations')
        .select('timezone')
        .eq('id', (staff as any).primary_location_id)
        .maybeSingle();
      if (locationData?.timezone) {
        timezone = locationData.timezone;
      }
    }

    // Check if late submission using location timezone
    const { checkout_due } = getWeekAnchors(effectiveNow, timezone);
    const isLate = effectiveNow > checkout_due;

    const updates = existingScores.map(score => {
      // Find matching focus item by either assignment_id or weekly_focus_id
      const focusItem = weeklyFocus.find(wf => 
        wf.id === score.assignment_id || wf.id === score.weekly_focus_id
      );
      
      return {
        staff_id: staff.id,
        weekly_focus_id: score.weekly_focus_id,
        performance_score: focusItem ? performanceScores[focusItem.id] : undefined,
        performance_date: new Date().toISOString(),
        performance_source: isRepair ? 'backfill' as const : 'live' as const,
        performance_late: isLate,
      };
    });

    // Collect action_ids for backlog resolution
    const actedOnIds = new Set<number>();
    
    // Extract raw IDs for querying
    const rawIds = weeklyFocus.map(f => {
      if (f.id.startsWith('assign:')) return f.id.replace('assign:', '');
      if (f.id.startsWith('plan:')) return f.id.replace('plan:', '');
      return f.id;
    });
    
    // Query both tables to get action_ids
    const { data: focusActionData } = await supabase
      .from('weekly_focus')
      .select('id, action_id, self_select')
      .in('id', rawIds);
      
    const { data: assignActionData } = await supabase
      .from('weekly_assignments')
      .select('id, action_id, self_select')
      .in('id', rawIds);
    
    // Build action map
    const actionMap = new Map<string, { action_id: number | null, self_select: boolean }>();
    (focusActionData || []).forEach(wf => {
      actionMap.set(wf.id, { action_id: wf.action_id, self_select: wf.self_select });
    });
    (assignActionData || []).forEach(wa => {
      actionMap.set(`assign:${wa.id}`, { action_id: wa.action_id, self_select: wa.self_select });
    });
    
    for (const update of updates) {
      const score = existingScores.find(s => 
        s.assignment_id === update.weekly_focus_id || s.weekly_focus_id === update.weekly_focus_id
      );
      if (score?.selected_action_id) {
        actedOnIds.add(score.selected_action_id);
      }
      // For site moves, get the action_id from the map
      const focusItem = weeklyFocus.find(wf => 
        wf.id === score?.assignment_id || wf.id === score?.weekly_focus_id
      );
      if (focusItem) {
        const actionData = actionMap.get(focusItem.id);
        if (actionData?.action_id && !actionData.self_select) {
          actedOnIds.add(actionData.action_id);
        }
      }
    }

    // Use reliable submission system
    const submissionData = {
      updates,
      staffId: staff.id,
      resolveBacklogItems: Array.from(actedOnIds)
    };

    const success = await submitWithRetry('performance', submissionData);
    
    if (success) {
      toast({
        title: isRepair ? "Performance backfilled" : "Great week!",
        description: isRepair ? "Scores updated for past week." : "Enjoy your weekend!"
      });
    }
    
    // Navigate based on mode
    if (isRepair && returnTo) {
      const dest = decodeURIComponent(returnTo);
      setTimeout(() => {
        navigate(dest, { replace: true, state: { repairJustSubmitted: true } });
      }, 150);
    } else {
      navigate('/');
    }
    setSubmitting(false);
  };

  const handleScoreChange = (score: number) => {
    if (!currentFocus) return;
    setPerformanceScores(prev => ({
      ...prev,
      [currentFocus.id]: score
    }));
  };

  const getConfidenceScore = (focusId: string) => {
    const score = existingScores.find(s => 
      s.assignment_id === focusId || s.weekly_focus_id === focusId
    );
    return score?.confidence_score || 0;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (!currentFocus) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Focus item not found</div>
      </div>
    );
  }

  const hasScore = performanceScores[currentFocus.id] !== undefined;
  const isLastItem = currentIndex === weeklyFocus.length - 1;

  return (
    <div className="min-h-[100dvh] p-2 sm:p-4 pb-24 bg-background">
      <div className="max-w-md mx-auto space-y-4">
        <Card style={{ backgroundColor: getDomainColor(currentFocus.domain_name) }}>
          {/* Submission Status Indicator */}
          {pendingCount > 0 && (
            <div className="absolute top-2 right-2 z-10">
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800 flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Saving...
              </Badge>
            </div>
          )}
          <CardHeader>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="bg-white/80 text-gray-900">
                {currentIndex + 1} / {weeklyFocus.length}
              </Badge>
              <Badge variant="secondary" className="bg-white/80 text-gray-900">
                {currentFocus.week_label || `Cycle ${currentFocus.cycle}, Week ${currentFocus.week_in_cycle}`}
              </Badge>
            </div>
            <CardTitle className="text-center text-gray-900">
              {isRepair ? `Backfill Performance - ${currentFocus.week_label || `Cycle ${currentFocus.cycle}, Week ${currentFocus.week_in_cycle}`}` : 'Rate Your Performance'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6 p-3 sm:p-6">
            <div className="p-3 sm:p-4 bg-white/80 rounded-lg">
              <div className="flex gap-2 mb-2">
                <Badge 
                  variant="secondary" 
                  className="text-xs font-semibold bg-white text-gray-900"
                >
                  {currentFocus.domain_name}
                </Badge>
                {currentFocus.competency_name && (
                  <Badge 
                    variant="outline" 
                    className="text-xs font-semibold bg-white text-gray-700"
                  >
                    {currentFocus.competency_name}
                  </Badge>
                )}
              </div>
              <p className="text-lg md:text-xl font-medium leading-relaxed text-slate-800 tracking-tight mb-2">{currentFocus.action_statement}</p>
              <Badge variant="secondary" className="text-xs bg-white text-gray-900">
                Your confidence: {getConfidenceScore(currentFocus.id)}
              </Badge>
            </div>

            <div className="text-center">
              <p className="text-sm font-medium text-gray-800 mb-4">
                How often did you actually do this action this week?
              </p>
            </div>

            <NumberScale
              value={performanceScores[currentFocus.id] || null}
              onChange={handleScoreChange}
            />

          </CardContent>
        </Card>
      </div>

      {/* Sticky Footer Navigation */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-background/80 backdrop-blur border-t z-50">
        <div className="max-w-md mx-auto flex gap-3">
          <Button 
            variant="outline" 
            onClick={() => currentIndex > 0 ? handleBack() : navigate('/')}
            className="flex-1"
          >
            {currentIndex > 0 ? 'Back' : 'Home'}
          </Button>
          <Button 
            onClick={handleNext}
            disabled={!hasScore || submitting}
            className="flex-[2]"
          >
            {submitting ? 'Saving...' : isLastItem ? (isRepair ? 'Backfill' : 'Submit') : 'Next'}
          </Button>
        </div>
      </div>

      {/* Smart Friction: Victory Modal */}
      <AlertDialog open={showVictory} onOpenChange={setShowVictory}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <span className="text-2xl">🚀</span>
              <AlertDialogTitle>That's a Pro Move.</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base">
              You flagged this as 'low confidence' on Monday and turned it around to a <strong>{performanceScores[currentFocus?.id || '']}</strong> today.
              <br/><br/>
              That is exactly the growth we are looking for.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setShowVictory(false);
              proceed();
            }}>
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}