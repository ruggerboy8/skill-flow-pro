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
}

interface WeeklyScore {
  id: string;
  weekly_focus_id: string;
  confidence_score: number;
}

export default function PerformanceWizard() {
  const { focusId, index } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [currentFocus, setCurrentFocus] = useState<WeeklyFocus | null>(null);
  const [existingScores, setExistingScores] = useState<WeeklyScore[]>([]);
  const [performanceScores, setPerformanceScores] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const currentIndex = parseInt(index || '1') - 1;

  useEffect(() => {
    if (user && focusId) {
      loadData();
    }
  }, [user, focusId]);

  const loadData = async () => {
    if (!user || !focusId) return;

    // Load staff profile
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user.id)
      .single();

    if (staffError || !staffData) {
      navigate('/setup');
      return;
    }

    setStaff(staffData);

    // Get the focus item details first
    const { data: focusDetails, error: focusDetailsError } = await supabase
      .from('weekly_focus')
      .select('id, cycle, week_in_cycle')
      .eq('id', focusId)
      .single();

    if (focusDetailsError || !focusDetails) {
      toast({
        title: "Error",
        description: "Focus item not found",
        variant: "destructive"
      });
      navigate('/');
      return;
    }

    // Load all weekly focus for this cycle/week
    const { data: focusData, error: focusError } = await supabase.rpc('get_focus_cycle_week', {
      p_cycle: focusDetails.cycle,
      p_week: focusDetails.week_in_cycle,
      p_role_id: staffData.role_id
    }) as { data: WeeklyFocus[] | null; error: any };

    if (focusError || !focusData) {
      toast({
        title: "Error",
        description: "Failed to load Pro Moves",
        variant: "destructive"
      });
      navigate('/');
      return;
    }

    setWeeklyFocus(focusData);

    // Load existing confidence scores
    const focusIds = focusData.map(f => f.id);
    const { data: scoresData, error: scoresError } = await supabase
      .from('weekly_scores')
      .select('id, weekly_focus_id, confidence_score')
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

    setExistingScores(scoresData);
    setCurrentFocus(focusData[currentIndex]);
    setLoading(false);
  };

  const handleNext = () => {
    if (currentIndex < weeklyFocus.length - 1) {
      const nextFocus = weeklyFocus[currentIndex + 1];
      navigate(`/performance/${nextFocus.id}/${currentIndex + 2}`);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      const prevFocus = weeklyFocus[currentIndex - 1];
      navigate(`/performance/${prevFocus.id}/${currentIndex}`);
    }
  };

  const handleSubmit = async () => {
    if (!staff || !currentFocus) return;

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
            <CardDescription className="text-center text-gray-800">
              How often did you actually do this action this week?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 p-3 sm:p-6">
            <div className="p-3 sm:p-4 bg-white/80 rounded-lg">
              <Badge 
                variant="secondary" 
                className="text-xs font-semibold mb-2 bg-white text-gray-900"
              >
                {currentFocus.domain_name}
              </Badge>
              <p className="text-sm font-medium mb-2 text-gray-900">{currentFocus.action_statement}</p>
              <Badge variant="secondary" className="text-xs bg-white text-gray-900">
                Your confidence: {getConfidenceScore(currentFocus.id)}
              </Badge>
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