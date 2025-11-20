// Updated Confidence Wizard to use progress-based approach instead of ISO week
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
import { nowUtc, getAnchors, nextMondayStr } from '@/lib/centralTime';
import { format } from 'date-fns';
import { getWeekAnchors } from '@/v2/time';
import { useNow } from '@/providers/NowProvider';
import { useSim } from '@/devtools/SimProvider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
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

interface Staff {
  id: string;
  role_id: number;
  locations?: {
    program_start_date?: string;
    cycle_length_weeks?: number;
  };
}

interface WeeklyFocus {
  id: string;
  display_order: number;
  action_statement: string;
  cycle: number;
  week_in_cycle: number;
  domain_name: string;
  intervention_text?: string | null;
  week_label?: string;
}

export default function ConfidenceWizard() {
  const { n } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [currentFocus, setCurrentFocus] = useState<WeeklyFocus | null>(null);
  const [scores, setScores] = useState<{ [key: string]: number }>({});
  const [selectedActions, setSelectedActions] = useState<{ [key: string]: string | null }>({});
  const [selfSelectById, setSelfSelectById] = useState<Record<string, boolean>>({});
  const [competencyById, setCompetencyById] = useState<Record<string, number | null>>({});
  const [competencyNameById, setCompetencyNameById] = useState<Record<string, string>>({});
  const [optionsByCompetency, setOptionsByCompetency] = useState<{ [key: number]: { action_id: string; action_statement: string }[] }>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [hasConfidence, setHasConfidence] = useState(false);
  const [showIntervention, setShowIntervention] = useState(false);
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
  console.log('ConfidenceWizard - Raw URL params:', { 
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
      console.log('ConfidenceWizard - Parsed repair params:', { 
        targetCycle, 
        targetWeek, 
        targetCycleIsNaN: isNaN(targetCycle), 
        targetWeekIsNaN: isNaN(targetWeek) 
      });
    }
  }

  // Use simulated time if available for time gating
  const effectiveNow = overrides.enabled && overrides.nowISO ? new Date(overrides.nowISO) : now;
  const { monCheckInZ, tueDueZ } = getAnchors(effectiveNow);
  const beforeCheckIn = effectiveNow < monCheckInZ;
  const afterTueNoon = effectiveNow >= tueDueZ;

  const currentIndex = Math.max(0, (Number(n) || 1) - 1);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  useEffect(() => {
    if (weeklyFocus.length > 0 && currentIndex < weeklyFocus.length) {
      setCurrentFocus(weeklyFocus[currentIndex]);
    }
  }, [currentIndex, weeklyFocus]);

  // Removed time gating - allow access anytime

  const loadData = async () => {
    if (!user) return;

    // Load staff profile with location info
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('id, role_id, primary_location_id, locations(program_start_date, cycle_length_weeks)')
      .eq('user_id', user.id)
      .single();

    if (staffError || !staffData) {
      navigate('/setup');
      return;
    }

    setStaff(staffData);

    // Use the unified site-based approach to get assignments
    let assignments, cycleNumber, weekInCycle;
    
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
          // Query weekly_focus for cycles 1-3
          const { data: focusData, error: focusError } = await supabase
            .from('weekly_focus')
            .select(`
              id,
              display_order,
              competency_id,
              self_select,
              cycle,
              week_in_cycle,
              action_id,
              pro_moves!weekly_focus_action_id_fkey ( 
                action_statement,
                intervention_text,
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
            .eq('cycle', targetCycle)
            .eq('week_in_cycle', targetWeek)
            .order('display_order');

          console.log('Repair query result (focus):', { focusData, focusError });

          assignments = (focusData || []).map((item: any) => {
            let domainName = 'Unknown';
            if (item.pro_moves?.competencies?.domains?.domain_name) {
              domainName = item.pro_moves.competencies.domains.domain_name;
            } else if (item.competencies?.domains?.domain_name) {
              domainName = item.competencies.domains.domain_name;
            }

            return {
              weekly_focus_id: item.id,
              type: item.self_select ? 'self_select' : 'site',
              display_order: item.display_order,
              action_statement: item.pro_moves?.action_statement || '',
              intervention_text: item.pro_moves?.intervention_text || null,
              domain_name: domainName,
              required: true,
              locked: false
            };
          });
        } else {
          // Query weekly_plan for cycle 4+
          const { data: planData, error: planError } = await supabase
            .from('weekly_plan')
            .select(`
              id,
              display_order,
              competency_id,
              self_select,
              action_id,
              pro_moves!weekly_plan_action_id_fkey ( 
                action_statement,
                intervention_text,
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

          console.log('Repair query result (plan):', { planData, planError });

          assignments = (planData || []).map((item: any) => {
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
        
        const { data: planData, error: planError } = await supabase
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

        console.log('Repair query result (plan by weekOf):', { planData, planError });

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

        assignments = (planData || []).map((item: any) => {
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
            intervention_text: item.pro_moves?.intervention_text || null,
            domain_name: domainName,
            required: true,
            locked: false
          };
        });
        
        // Set cycle/week to unknown for display
        cycleNumber = 0;
        weekInCycle = 0;
      }

      console.log('repair mode assignments', assignments);
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
      assignments = result.assignments;
      cycleNumber = result.cycleNumber;
      weekInCycle = result.weekInCycle;
      console.log('current assignments', assignments);
    }
    
    console.log('cycle info:', { cycleNumber, weekInCycle });

    if (!assignments || assignments.length === 0) {
      toast({
        title: 'Error',
        description: 'Failed to load Pro Moves',
        variant: 'destructive'
      });
      navigate('/week');
      return;
    }

    // Transform assignments to WeeklyFocus format with correct week label
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
      const focusIds = assignments.map(a => a.weekly_focus_id);
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
    
    const transformedFocusData: WeeklyFocus[] = assignments.map((assignment) => {
      return {
        id: assignment.weekly_focus_id,
        display_order: assignment.display_order,
        action_statement: assignment.action_statement || '',
        intervention_text: assignment.intervention_text || null,
        cycle: cycleNumber || 1,
        week_in_cycle: weekInCycle || 1,
        domain_name: assignment.domain_name,
        week_label: weekLabel
      };
    });

    setWeeklyFocus(transformedFocusData);

    // Check if confidence already submitted for all focus items and prefill selections
    const focusIds = transformedFocusData.map(f => f.id);
    const { data: scoresData } = await supabase
      .from('weekly_scores')
      .select('weekly_focus_id, confidence_score, selected_action_id')
      .eq('staff_id', staffData.id)
      .in('weekly_focus_id', focusIds);

    const submittedCount = (scoresData || []).filter((s) => s.confidence_score !== null).length;
    const hasConfidenceReal = submittedCount === assignments.length;
    const hasConfidenceSimulated = overrides.enabled && overrides.forceHasConfidence !== null 
      ? overrides.forceHasConfidence 
      : hasConfidenceReal;
    setHasConfidence(hasConfidenceSimulated);

    const selectedByFocus: { [key: string]: string | null } = {};
    (scoresData || []).forEach((r) => {
      if (r.selected_action_id) selectedByFocus[r.weekly_focus_id] = String(r.selected_action_id);
    });
    setSelectedActions(selectedByFocus);

    // Load self-select metadata and competency names
    const { data: meta } = await supabase
      .from('weekly_focus')
      .select(`
        id, 
        self_select, 
        competency_id,
        competencies(name)
      `)
      .in('id', focusIds);
    const selfSel: Record<string, boolean> = {};
    const compMap: Record<string, number | null> = {};
    const compNameMap: Record<string, string> = {};
    (meta || []).forEach((m: any) => {
      selfSel[m.id] = !!m.self_select;
      compMap[m.id] = (m.competency_id ?? null) as number | null;
      if (m.competencies?.name) {
        compNameMap[m.id] = m.competencies.name;
      }
    });
    setSelfSelectById(selfSel);
    setCompetencyById(compMap);
    setCompetencyNameById(compNameMap);

    // Fetch options for competencies
    const compIds = Array.from(new Set((meta || [])
      .map((m: any) => m.competency_id)
      .filter((cid: any) => !!cid)));
    if (compIds.length) {
      const { data: opts } = await supabase
        .from('pro_moves')
        .select('action_id, action_statement, competency_id')
        .in('competency_id', compIds)
        .eq('active', true)
        .order('action_statement');
      const grouped: { [key: number]: { action_id: string; action_statement: string }[] } = {};
      (opts || []).forEach((o: any) => {
        if (!grouped[o.competency_id]) grouped[o.competency_id] = [];
        grouped[o.competency_id].push({ action_id: String(o.action_id), action_statement: o.action_statement });
      });
      setOptionsByCompetency(grouped);
    }

    setLoading(false);
  };

  // Helper function to preserve URL parameters during navigation
  const preserveSearchParams = (newPath: string) => {
    const currentSearch = location.search;
    return `${newPath}${currentSearch}`;
  };

  const attemptNext = () => {
    // Bypass for Repair Mode (History doesn't need coaching)
    if (isRepair) {
      proceed();
      return;
    }

    const score = currentFocus ? scores[currentFocus.id] : null;

    // Trigger if score is Low (1 or 2)
    if (score !== null && score <= 2) {
      setShowIntervention(true);
    } else {
      proceed();
    }
  };

  const proceed = () => {
    if (currentIndex < weeklyFocus.length - 1) {
      navigate(preserveSearchParams(`/confidence/current/step/${currentIndex + 2}`));
    } else {
      handleSubmit();
    }
  };

  const handleNext = attemptNext; // Keep the old name for compatibility

  const handleBack = () => {
    if (currentIndex > 0) {
      navigate(preserveSearchParams(`/confidence/current/step/${currentIndex}`));
    }
  };

  const handleSubmit = async () => {
    if (!staff || !currentFocus) return;

    // Check if all scores are filled with valid values (1-4)
    const missingScores = weeklyFocus.filter(focus => {
      const score = scores[focus.id];
      return !score || score < 1 || score > 4;
    });
    
    if (missingScores.length > 0) {
      console.error('Missing or invalid scores for focuses:', missingScores.map(f => ({ id: f.id, score: scores[f.id] })));
      toast({
        title: 'Error',
        description: 'Please provide confidence scores for all items before submitting.',
        variant: 'destructive'
      });
      return;
    }

    setSubmitting(true);

    // Debug logging to track self-select state
    console.log('Submit debug - selectedActions:', selectedActions);
    console.log('Submit debug - selfSelectById:', selfSelectById);
    console.log('Submit debug - weeklyFocus:', weeklyFocus.map(f => ({ id: f.id, action_statement: f.action_statement })));

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
    const { checkin_due } = getWeekAnchors(effectiveNow, timezone);
    const isLate = effectiveNow > checkin_due;

    const scoreInserts = weeklyFocus.map(focus => {
      const scoreValue = scores[focus.id];
      console.log(`Processing focus ${focus.id}: score = ${scoreValue}, scores object:`, scores);
      
      if (!scoreValue) {
        console.error(`No score found for focus ${focus.id}`);
      }
      
      const base: any = {
        staff_id: staff.id,
        weekly_focus_id: focus.id,
        confidence_score: scoreValue, // Remove fallback - validation ensures this exists
        confidence_date: new Date().toISOString(),
        confidence_source: isRepair ? 'backfill' as const : 'live' as const,
        confidence_late: isLate,
      };
      
      console.log(`Created base object for focus ${focus.id}:`, base);
      
      // For self-select slots: set selected_action_id
      if (selfSelectById[focus.id] && selectedActions[focus.id] && selectedActions[focus.id] !== "") {
        const actionId = parseInt(selectedActions[focus.id]!, 10);
        if (!isNaN(actionId)) {
          base.selected_action_id = actionId;
          console.log(`Setting selected_action_id for focus ${focus.id}: ${actionId}`);
        } else {
          console.error(`Invalid action_id for focus ${focus.id}: ${selectedActions[focus.id]}`);
        }
      } else if (selfSelectById[focus.id]) {
        console.warn(`Missing selection for self-select focus ${focus.id}`);
      } else {
        // For site slots: get the action_id from weekly_focus and set site_action_id
        const weeklyFocusData = weeklyFocus.find(wf => wf.id === focus.id);
        if (weeklyFocusData) {
          // We need to get the action_id from the weekly_focus table
          // This will be set in the database query below
        }
      }
      
      return base;
    });

    // Get weekly_focus data to set site_action_id for site slots
    const { data: weeklyFocusData } = await supabase
      .from('weekly_focus')
      .select('id, action_id, self_select')
      .in('id', weeklyFocus.map(f => f.id));

    const focusMap = new Map(weeklyFocusData?.map(wf => [wf.id, wf]) || []);

    // Update scoreInserts with site_action_id for site slots
    const finalScoreInserts = scoreInserts.map(insert => {
      const focusData = focusMap.get(insert.weekly_focus_id);
      if (focusData && !focusData.self_select && focusData.action_id) {
        insert.site_action_id = focusData.action_id;
      }
      return insert;
    });

    // Prepare self-select data
    const selfSelectInserts = weeklyFocus
      .filter(focus => selfSelectById[focus.id] && selectedActions[focus.id] && selectedActions[focus.id] !== "")
      .map(focus => ({
        user_id: user!.id,
        weekly_focus_id: focus.id,
        selected_pro_move_id: parseInt(selectedActions[focus.id]!, 10),
        slot_index: focus.display_order || 1,
        source: 'manual'
      }));

    // Use reliable submission system
    const submissionData = {
      updates: finalScoreInserts,
      selfSelectInserts
    };

    console.log('Submitting data:', { 
      submissionData, 
      finalScoreInserts, 
      selfSelectInserts,
      isRepair,
      targetCycle,
      targetWeek 
    });

    const success = await submitWithRetry('confidence', submissionData);
    
    console.log('Submission result:', success);
    console.log('Navigation params:', { isRepair, returnTo });
    
    if (success) {
      toast({
        title: isRepair ? "Confidence backfilled" : "Confidence saved",
        description: isRepair ? "Scores updated for past week." : "Great! Come back later to rate your performance."
      });
      
      // Navigate based on mode and return path
      if (isRepair && returnTo) {
        const dest = decodeURIComponent(returnTo);
        console.log('Navigating back to:', dest);
        setTimeout(() => {
          navigate(dest, { replace: true, state: { repairJustSubmitted: true } });
        }, 150);
      } else if (returnTo && !isRepair) {
        // If we have a return path (e.g., came from performance wizard), go back there
        const dest = decodeURIComponent(returnTo);
        console.log('Returning to performance wizard:', dest);
        setTimeout(() => {
          navigate(dest, { replace: true });
        }, 150);
      } else {
        navigate('/');
      }
    } else {
      console.error('Submission failed');
      toast({
        title: 'Error',
        description: 'Failed to save confidence scores. Please try again.',
        variant: 'destructive'
      });
    }
    setSubmitting(false);
  };

  const handleScoreChange = (score: number) => {
    if (!currentFocus) return;
    setScores(prev => ({
      ...prev,
      [currentFocus.id]: score
    }));
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

  const hasScore = scores[currentFocus.id] !== undefined;
  const hasRequiredSelection = !selfSelectById[currentFocus.id] || (selectedActions[currentFocus.id] && selectedActions[currentFocus.id] !== "");
  const canProceed = hasScore && hasRequiredSelection;
  const isLastItem = currentIndex === weeklyFocus.length - 1;

  return (
    <div className="min-h-screen p-2 sm:p-4 bg-background">
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
            <div className="flex items-center justify-center">
              <Badge variant="outline" className="bg-white/80 text-gray-900">
                {currentIndex + 1} / {weeklyFocus.length}
              </Badge>
            </div>
            <CardTitle className="text-center text-gray-900">
              {isRepair ? `Backfill Confidence - ${currentFocus.week_label || `Cycle ${currentFocus.cycle}, Week ${currentFocus.week_in_cycle}`}` : 'Rate Your Confidence'}
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
                {selfSelectById[currentFocus.id] && competencyNameById[currentFocus.id] && (
                  <Badge 
                    variant="outline" 
                    className="text-xs font-semibold bg-white text-gray-700"
                  >
                    {competencyNameById[currentFocus.id]}
                  </Badge>
                )}
              </div>
              
              {selfSelectById[currentFocus.id] ? (
                <div className="space-y-3">
                  <Label htmlFor="pro-move-select" className="text-sm font-medium text-gray-900">
                    Choose the Pro Move you'd like to focus on this week.
                  </Label>
                  <Select
                    value={selectedActions[currentFocus.id] || ""}
                    onValueChange={(value) => {
                      console.log(`Selection changed for focus ${currentFocus.id}: ${value}`);
                      setSelectedActions(prev => ({
                        ...prev,
                        [currentFocus.id]: value
                      }));
                    }}
                  >
                    <SelectTrigger id="pro-move-select" className="w-full">
                      <SelectValue placeholder="Choose a Pro Move..." />
                    </SelectTrigger>
                    <SelectContent className="bg-white border shadow-lg z-50">
                      {competencyById[currentFocus.id] && 
                       optionsByCompetency[competencyById[currentFocus.id]]?.map((option) => (
                        <SelectItem 
                          key={option.action_id} 
                          value={option.action_id}
                          className="cursor-pointer hover:bg-gray-100"
                        >
                          {option.action_statement}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selfSelectById[currentFocus.id] && !hasRequiredSelection && (
                    <p className="text-sm text-red-600 mt-1">
                      Please select a Pro Move to continue.
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm font-medium text-gray-900">{currentFocus.action_statement}</p>
              )}
            </div>

            <div className="text-center">
              <p className="text-sm font-medium text-gray-800 mb-4">
                How confident are you that you'll do this 100% this week?
              </p>
            </div>

            <NumberScale
              value={scores[currentFocus.id] || null}
              onChange={handleScoreChange}
            />

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={() => currentIndex > 0 ? handleBack() : navigate('/')}
                className="flex-1"
              >
                {currentIndex > 0 ? 'Back' : 'Home'}
              </Button>
              <Button 
                onClick={handleNext}
                disabled={!canProceed || submitting}
                className="flex-1"
              >
                {submitting ? 'Saving...' : isLastItem ? (isRepair ? 'Backfill' : 'Submit') : 'Next'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Smart Friction: Intervention Modal */}
      <AlertDialog open={showIntervention} onOpenChange={setShowIntervention}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              <AlertDialogTitle>Unsure? That's okay.</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-base pt-2">
              {/* THE DATABASE DRIVEN CONTENT */}
              <div className="p-4 bg-amber-50 border border-amber-100 rounded-md text-amber-900 font-medium text-sm leading-relaxed">
                "{currentFocus?.intervention_text || "Make it a point to ask a Lead or your Manager about this today."}"
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => {
              setShowIntervention(false);
              proceed();
            }}>
              Will do
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}