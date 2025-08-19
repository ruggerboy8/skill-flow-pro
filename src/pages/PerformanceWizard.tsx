import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import NumberScale from '@/components/NumberScale';
import { getDomainColor } from '@/lib/domainColors';
import { nowUtc, getAnchors } from '@/lib/centralTime';
import { useNow } from '@/providers/NowProvider';
import { useSim } from '@/devtools/SimProvider';
interface Staff {
  id: string;
  role_id: number;
}

interface WeeklyFocus {
  id: string;
  display_order: number;
  action_statement: string;
  cycle: number;
  week_in_cycle: number;
  domain_name: string;
  competency_name?: string;
}

interface WeeklyScore {
  id: string;
  weekly_focus_id: string;
  confidence_score: number;
  confidence_date?: string | null;
}

export default function PerformanceWizard() {
  const { week, n } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [currentFocus, setCurrentFocus] = useState<WeeklyFocus | null>(null);
  const [existingScores, setExistingScores] = useState<WeeklyScore[]>([]);
  const [performanceScores, setPerformanceScores] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [isCarryoverWeek, setIsCarryoverWeek] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const now = useNow();
  const { overrides } = useSim();

  // Use simulated time if available for time gating
  const effectiveNow = overrides.enabled && overrides.nowISO ? new Date(overrides.nowISO) : now;
  const { thuStartZ, mondayZ } = getAnchors(effectiveNow);

  const weekNum = Number(week);
  const currentIndex = Math.max(0, (Number(n) || 1) - 1);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, week, n]);

  // Central Time gating and route guard for Performance
  useEffect(() => {
    if (!loading) {
      // Allow carryover weeks anytime (computed after data load)
      if (effectiveNow < thuStartZ && !isCarryoverWeek) {
        toast({
          title: 'Performance opens Thursday',
          description: 'Please come back on Thu 12:00 a.m. CT.'
        });
        navigate('/week');
      }
    }
  }, [loading, effectiveNow, thuStartZ, navigate, isCarryoverWeek]);

  const loadData = async () => {
    if (!user) return;

    // Load staff profile
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (staffError || !staffData) {
      navigate('/setup');
      return;
    }

    setStaff(staffData);

    // Determine user's current cycle/week position (same logic as confidence wizard)
    // First try ISO week lookup
    let { data: focusData, error: focusError } = await supabase
      .from('weekly_focus')
      .select(`
        id,
        display_order,
        action_id,
        competency_id,
        cycle,
        week_in_cycle,
        self_select,
        pro_moves(action_statement),
        competencies(
          domain_id,
          domains(domain_name),
          name
        )
      `)
      .eq('iso_year', 2025)
      .eq('iso_week', weekNum)
      .eq('role_id', staffData.role_id)
      .order('display_order');

    // If no ISO week data, fall back to cycle/week logic
    if (!focusData || focusData.length === 0) {
      // Check if user completed backfill to determine cycle position
      const { data: hasScores } = await supabase
        .from('weekly_scores')
        .select('id')
        .eq('staff_id', staffData.id)
        .limit(1);

      if (hasScores && hasScores.length > 0) {
        // User completed backfill, should be on cycle 2 week 1
        const { data: cycle2Data } = await supabase
          .from('weekly_focus')
          .select(`
            id,
            display_order,
            action_id,
            competency_id,
            cycle,
            week_in_cycle,
            self_select,
            pro_moves(action_statement),
            competencies(
              domain_id,
              domains(domain_name),
              name
            )
          `)
          .eq('cycle', 2)
          .eq('week_in_cycle', 1)
          .eq('role_id', staffData.role_id)
          .order('display_order');
        
        if (cycle2Data) focusData = cycle2Data;
      }
    }

    if (focusError || !focusData || focusData.length === 0) {
      toast({
        title: 'Error',
        description: 'No Pro Moves found for this week',
        variant: 'destructive'
      });
      navigate('/week');
      return;
    }

    // Load existing confidence scores with selected action IDs
    const focusIds = focusData.map((f: any) => f.id);
    const { data: scoresData, error: scoresError } = await supabase
      .from('weekly_scores')
      .select('id, weekly_focus_id, confidence_score, confidence_date, selected_action_id')
      .eq('staff_id', staffData.id)
      .in('weekly_focus_id', focusIds)
      .not('confidence_score', 'is', null);

    if (scoresError || !scoresData || scoresData.length !== focusData.length) {
      toast({
        title: "Error",
        description: "Please complete confidence ratings first",
        variant: "destructive"
      });
      navigate('/');
      return;
    }

    // Build the weekly focus with actual selected pro moves
    const transformedFocusData: WeeklyFocus[] = await Promise.all(
      focusData.map(async (item: any) => {
        const score = scoresData.find((s: any) => s.weekly_focus_id === item.id);
        let actionStatement = item.pro_moves?.action_statement || '';
        
        // If this is a self-select item, get the selected pro move
        if (item.self_select && score?.selected_action_id) {
          const { data: selectedProMove } = await supabase
            .from('pro_moves')
            .select('action_statement')
            .eq('action_id', score.selected_action_id)
            .single();
          
          if (selectedProMove) {
            actionStatement = selectedProMove.action_statement;
          }
        }

        return {
          id: item.id,
          display_order: item.display_order,
          action_statement: actionStatement,
          cycle: item.cycle,
          week_in_cycle: item.week_in_cycle,
          domain_name: item.competencies?.domains?.domain_name || 'Unknown',
          competency_name: item.competencies?.name || undefined
        };
      })
    );

    setWeeklyFocus(transformedFocusData);
    setExistingScores(scoresData);
    
    // Determine carryover if confidence was submitted before this Monday
    const carryover = (scoresData || []).some((s: any) => s.confidence_date && new Date(s.confidence_date) < mondayZ);
    setIsCarryoverWeek(carryover);

    setCurrentFocus(transformedFocusData[currentIndex]);
    setLoading(false);
  };

  const handleNext = () => {
    if (currentIndex < weeklyFocus.length - 1) {
      navigate(`/performance/${weekNum}/step/${currentIndex + 2}`);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      navigate(`/performance/${weekNum}/step/${currentIndex}`);
    }
  };

  const handleSubmit = async () => {
    if (!staff || !currentFocus) return;

    // Hard-guard: prevent too-early submit for current week
    const { thuStartZ: thuGuardZ } = getAnchors(effectiveNow);
    if (effectiveNow < thuGuardZ && !isCarryoverWeek) {
      toast({
        title: 'Performance opens Thursday',
        description: 'Please come back on Thu 12:00 a.m. CT.'
      });
      navigate('/week');
      return;
    }

    setSubmitting(true);

    const updates = existingScores.map(score => ({
      id: score.id,
      staff_id: staff.id,
      weekly_focus_id: score.weekly_focus_id,
      performance_score: performanceScores[score.weekly_focus_id] || 1
    }));

    const { error } = await supabase
      .from('weekly_scores')
      .upsert(updates);

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Great week!",
        description: "Enjoy your weekend!"
      });
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
        <Card style={{ backgroundColor: getDomainColor(currentFocus.domain_name) }}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Badge variant="outline" className="bg-white/80 text-gray-900">
                {currentIndex + 1} / {weeklyFocus.length}
              </Badge>
              <Badge variant="secondary" className="bg-white/80 text-gray-900">
                Cycle {currentFocus.cycle}, Week {currentFocus.week_in_cycle}
              </Badge>
            </div>
            <CardTitle className="text-center text-gray-900">Rate Your Performance</CardTitle>
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
              {currentIndex > 0 && (
                <Button 
                  variant="outline" 
                  onClick={handleBack}
                  className="flex-1"
                >
                  Back
                </Button>
              )}
              <Button 
                onClick={handleNext}
                disabled={!hasScore || submitting}
                className="flex-1"
              >
                {submitting ? 'Saving...' : isLastItem ? 'Submit' : 'Next'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}