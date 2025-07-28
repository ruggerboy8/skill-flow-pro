import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import NumberScale from '@/components/NumberScale';

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
}

export default function ConfidenceWizard() {
  const { focusId, index } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [currentFocus, setCurrentFocus] = useState<WeeklyFocus | null>(null);
  const [scores, setScores] = useState<{ [key: string]: number }>({});
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

    // Get the first focus item to determine cycle/week
    const { data: firstFocus, error: firstError } = await supabase
      .from('v_weekly_focus')
      .select('id, display_order, action_statement, cycle, week_in_cycle')
      .eq('id', focusId)
      .single();

    if (firstError || !firstFocus) {
      toast({
        title: "Error",
        description: "Focus item not found",
        variant: "destructive"
      });
      navigate('/');
      return;
    }

    // Load all weekly focus for this cycle/week
    const { data: focusData, error: focusError } = await supabase
      .from('v_weekly_focus')
      .select('id, display_order, action_statement, cycle, week_in_cycle')
      .eq('cycle', firstFocus.cycle)
      .eq('week_in_cycle', firstFocus.week_in_cycle)
      .eq('role_id', staffData.role_id)
      .order('display_order');

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
    setCurrentFocus(focusData[currentIndex]);
    setLoading(false);
  };

  const handleNext = () => {
    if (currentIndex < weeklyFocus.length - 1) {
      const nextFocus = weeklyFocus[currentIndex + 1];
      navigate(`/confidence/${nextFocus.id}/${currentIndex + 2}`);
    } else {
      handleSubmit();
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      const prevFocus = weeklyFocus[currentIndex - 1];
      navigate(`/confidence/${prevFocus.id}/${currentIndex}`);
    }
  };

  const handleSubmit = async () => {
    if (!staff || !currentFocus) return;

    setSubmitting(true);

    const scoreInserts = weeklyFocus.map(focus => ({
      staff_id: staff.id,
      weekly_focus_id: focus.id,
      confidence_score: scores[focus.id] || 1
    }));

    const { error } = await supabase
      .from('weekly_scores')
      .upsert(scoreInserts, {
        onConflict: 'staff_id,weekly_focus_id'
      });

    if (error) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } else {
      toast({
        title: "Confidence saved",
        description: "Great! Come back later to rate your performance."
      });
      navigate('/');
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
  const isLastItem = currentIndex === weeklyFocus.length - 1;

  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-md mx-auto space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <Badge variant="outline">
                Pro Move {currentIndex + 1} of {weeklyFocus.length}
              </Badge>
              <Badge variant="secondary">
                Cycle {currentFocus.cycle}, Week {currentFocus.week_in_cycle}
              </Badge>
            </div>
            <CardTitle className="text-center">Rate Your Confidence</CardTitle>
            <CardDescription className="text-center">
              How confident are you that you'll do this 100% this week?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="p-4 bg-muted rounded-lg">
              <p className="text-sm font-medium">{currentFocus.action_statement}</p>
            </div>

            <NumberScale
              value={scores[currentFocus.id] || null}
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