// Updated Performance Wizard to use progress-based approach instead of ISO week
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
import { assembleCurrentWeek } from '@/lib/weekAssembly';

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
  const { n } = useParams();
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

  const currentIndex = Math.max(0, (Number(n) || 1) - 1);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, n]);

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

    // Use the new progress-based approach to get current week assignments
    const assignments = await assembleCurrentWeek(user.id, overrides);

    if (!assignments || assignments.length === 0) {
      toast({
        title: 'Error',
        description: 'No Pro Moves found for this week',
        variant: 'destructive'
      });
      navigate('/week');
      return;
    }

    // Load existing confidence scores with selected action IDs
    const focusIds = assignments.map(a => a.weekly_focus_id);
    const { data: scoresData, error: scoresError } = await supabase
      .from('weekly_scores')
      .select('id, weekly_focus_id, confidence_score, confidence_date, selected_action_id')
      .eq('staff_id', staffData.id)
      .in('weekly_focus_id', focusIds)
      .not('confidence_score', 'is', null);

    if (scoresError || !scoresData || scoresData.length !== assignments.length) {
      toast({
        title: "Error",
        description: "Please complete confidence ratings first",
        variant: "destructive"
      });
      navigate('/');
      return;
    }

    // Build the weekly focus with actual selected pro moves
    const transformedFocusData: WeeklyFocus[] = assignments.map((assignment) => ({
      id: assignment.weekly_focus_id,
      display_order: assignment.display_order,
      action_statement: assignment.action_statement || '',
      cycle: 1, // Will be updated when we have cycle info in assignments
      week_in_cycle: 1, // Will be updated when we have week info in assignments
      domain_name: assignment.domain_name,
      competency_name: undefined // Could be added to assignments if needed
    }));

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
      navigate(`/performance/current/step/${currentIndex + 2}`);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      navigate(`/performance/current/step/${currentIndex}`);
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
                {submitting ? 'Saving...' : isLastItem ? 'Submit' : 'Next'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}