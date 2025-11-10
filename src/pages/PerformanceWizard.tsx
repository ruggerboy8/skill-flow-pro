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
  competency_name?: string;
  week_label?: string;
}

interface WeeklyScore {
  id: string;
  weekly_focus_id: string;
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

  // Removed time gating - allow access anytime

  const loadData = async () => {
    if (!user) return;

    // Load staff profile with location info
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('id, role_id, primary_location_id, locations(program_start_date, cycle_length_weeks)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (staffError || !staffData) {
      navigate('/setup');
      return;
    }

    setStaff(staffData);

    // Use the unified site-based approach to get assignments
    let weekAssignments, cycleNumber, weekInCycle;
    
    if (isRepair && targetCycle !== null && targetWeek !== null && !isNaN(targetCycle) && !isNaN(targetWeek)) {
      // For repair mode, load specific cycle/week assignments
      console.log('Loading repair data for cycle/week:', { targetCycle, targetWeek });
      
      // Use a better query that gets domain info through pro_moves
      const { data: focusData } = await supabase
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

      console.log('Repair query result:', { focusData, focusError: null });

      weekAssignments = (focusData || []).map((item: any) => {
        // Get domain from pro_moves or competencies
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
          domain_name: domainName,
          required: true,
          locked: false
        };
      });
      
      // Debug domain data
      console.log('Domain data in repair mode:', focusData?.map(f => ({
        id: f.id,
        action_statement: f.pro_moves?.action_statement,
        domain_from_pro_moves: f.pro_moves?.competencies?.domains?.domain_name,
        domain_from_competencies: f.competencies?.domains?.domain_name
      })));
      
      console.log('repair mode assignments', weekAssignments);
      console.log('cycle info:', { cycleNumber: targetCycle, weekInCycle: targetWeek });

      cycleNumber = targetCycle;
      weekInCycle = targetWeek;
    } else if (isRepair) {
      // If repair mode but invalid params, show error and exit
      console.error('Repair mode enabled but invalid parameters:', { targetCycle, targetWeek });
      toast({
        title: 'Error',
        description: 'Invalid repair parameters. Please try again from the Stats page.',
        variant: 'destructive'
      });
      setLoading(false);
      return;
    } else {
      // Normal current week logic
      const result = await assembleCurrentWeek(user.id, overrides);
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

    // Load existing confidence scores with selected action IDs
    const focusIds = weekAssignments.map(a => a.weekly_focus_id);
    const { data: scoresData, error: scoresError } = await supabase
      .from('weekly_scores')
      .select('id, weekly_focus_id, confidence_score, confidence_date, selected_action_id')
      .eq('staff_id', staffData.id)
      .in('weekly_focus_id', focusIds)
      .not('confidence_score', 'is', null);

    if (scoresError || !scoresData || (scoresData.length !== weekAssignments.length && !isRepair)) {
      if (isRepair) {
        toast({
          title: "Error",
          description: "No confidence scores found for this week",
          variant: "destructive"
        });
        navigate(returnTo ? decodeURIComponent(returnTo) : '/');
      } else {
        // Redirect to confidence wizard to complete missing ratings
        const missingCount = weekAssignments.length - (scoresData?.length || 0);
        
        // Find the first incomplete confidence item
        const completedIds = new Set((scoresData || []).map(s => s.weekly_focus_id));
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
    setExistingScores(scoresData);
    
    // Determine carryover if confidence was submitted before this Monday
    const carryover = (scoresData || []).some((s: any) => s.confidence_date && new Date(s.confidence_date) < mondayZ);
    setIsCarryoverWeek(carryover);

    setCurrentFocus(transformedFocusData[currentIndex]);
    setLoading(false);
  };

  // Helper function to preserve URL parameters during navigation
  const preserveSearchParams = (newPath: string) => {
    const currentSearch = location.search;
    return `${newPath}${currentSearch}`;
  };

  const handleNext = () => {
    if (currentIndex < weeklyFocus.length - 1) {
      navigate(preserveSearchParams(`/performance/current/step/${currentIndex + 2}`));
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      navigate(preserveSearchParams(`/performance/current/step/${currentIndex}`));
    }
  };

  const handleSubmit = async () => {
    if (!staff || !currentFocus) return;

    // Check if all performance scores are filled with valid values (1-4)
    const missingScores = existingScores.filter(score => {
      const perfScore = performanceScores[score.weekly_focus_id];
      return !perfScore || perfScore < 1 || perfScore > 4;
    });
    
    if (missingScores.length > 0) {
      console.error('Missing or invalid performance scores:', missingScores.map(s => ({ 
        focus_id: s.weekly_focus_id, 
        score: performanceScores[s.weekly_focus_id] 
      })));
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

    const updates = existingScores.map(score => ({
      staff_id: staff.id,
      weekly_focus_id: score.weekly_focus_id,
      performance_score: performanceScores[score.weekly_focus_id], // Remove fallback - validation ensures this exists
      performance_date: new Date().toISOString(),
      performance_source: isRepair ? 'backfill' as const : 'live' as const,
      performance_late: isLate,
    }));

    // Collect action_ids for backlog resolution
    const actedOnIds = new Set<number>();
    
    for (const update of updates) {
      const score = existingScores.find(s => s.weekly_focus_id === update.weekly_focus_id);
      if (score?.selected_action_id) {
        actedOnIds.add(score.selected_action_id);
      }
      // For site moves, get the action_id from weekly_focus
      const focusItem = weeklyFocus.find(wf => wf.id === score?.weekly_focus_id);
      if (focusItem) {
        const { data: focusData } = await supabase
          .from('weekly_focus')
          .select('action_id')
          .eq('id', focusItem.id)
          .maybeSingle();
        if (focusData?.action_id) {
          actedOnIds.add(focusData.action_id);
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
    const score = existingScores.find(s => s.weekly_focus_id === focusId);
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
    <div className="min-h-screen p-2 sm:p-4 bg-background">
      <div className="max-w-md mx-auto space-y-4">
        <Card style={{ backgroundColor: `hsl(${getDomainColor(currentFocus.domain_name)})` }}>
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
              <p className="text-sm font-medium mb-2 text-gray-900">{currentFocus.action_statement}</p>
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
                disabled={!hasScore || submitting}
                className="flex-1"
              >
                {submitting ? 'Saving...' : isLastItem ? (isRepair ? 'Backfill' : 'Submit') : 'Next'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}