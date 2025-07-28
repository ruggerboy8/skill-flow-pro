import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface Staff {
  id: string;
  role_id: number;
}

interface WeeklyFocus {
  id: string;
  display_order: number;
  pro_moves: {
    action_statement: string;
  };
}

interface WeeklyScore {
  id: string;
  weekly_focus_id: string;
  confidence_score: number;
}

export default function Performance() {
  const { week } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [existingScores, setExistingScores] = useState<WeeklyScore[]>([]);
  const [performanceScores, setPerformanceScores] = useState<{ [key: string]: number }>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [weekNum, yearNum] = week?.split('-').map(Number) || [0, 0];

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, week]);

  const loadData = async () => {
    if (!user) return;

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

    // Load weekly focus
    const { data: focusData, error: focusError } = await supabase
      .from('weekly_focus')
      .select(`
        id,
        display_order,
        pro_moves(action_statement)
      `)
      .eq('iso_week', weekNum)
      .eq('iso_year', yearNum)
      .eq('role_id', staffData.role_id)
      .order('display_order');

    if (focusError || !focusData || focusData.length === 0) {
      toast({
        title: "Error",
        description: "No Pro Moves found for this week",
        variant: "destructive"
      });
      navigate('/week');
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
      navigate('/week');
      return;
    }

    setExistingScores(scoresData);
    setLoading(false);
  };

  const handleScoreChange = (focusId: string, score: string) => {
    setPerformanceScores(prev => ({
      ...prev,
      [focusId]: parseInt(score)
    }));
  };

  const canSubmit = () => {
    return weeklyFocus.every(focus => performanceScores[focus.id] !== undefined);
  };

  const handleSubmit = async () => {
    if (!staff || !canSubmit()) return;

    setSubmitting(true);

    const updates = existingScores.map(score => ({
      id: score.id,
      performance_score: performanceScores[score.weekly_focus_id]
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
      navigate('/week');
    }

    setSubmitting(false);
  };

  const getScoreLabel = (score: number) => {
    switch (score) {
      case 1: return 'Rarely';
      case 2: return 'Sometimes';
      case 3: return 'Usually';
      case 4: return 'Always';
      default: return '';
    }
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

  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-md mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-center">Thursday Performance</CardTitle>
            <CardDescription className="text-center">
              Rate how often you actually performed each action this week
            </CardDescription>
            <Badge variant="outline" className="mx-auto">
              Week {weekNum}, {yearNum}
            </Badge>
          </CardHeader>
        </Card>

        {weeklyFocus.map((focus, index) => (
          <Card key={focus.id}>
            <CardHeader>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="text-xs">
                  {index + 1}
                </Badge>
                <div className="flex-1">
                  <CardTitle className="text-sm font-medium leading-relaxed mb-2">
                    {focus.pro_moves.action_statement}
                  </CardTitle>
                  <Badge variant="secondary" className="text-xs">
                    Monday Confidence: {getConfidenceScore(focus.id)}/4
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={performanceScores[focus.id]?.toString() || ''}
                onValueChange={(value) => handleScoreChange(focus.id, value)}
              >
                {[1, 2, 3, 4].map((score) => (
                  <div key={score} className="flex items-center space-x-3 py-2">
                    <RadioGroupItem value={score.toString()} id={`${focus.id}-${score}`} />
                    <Label 
                      htmlFor={`${focus.id}-${score}`}
                      className="flex-1 cursor-pointer py-2 text-sm"
                    >
                      {score} - {getScoreLabel(score)}
                    </Label>
                  </div>
                ))}
              </RadioGroup>
            </CardContent>
          </Card>
        ))}

        <div className="space-y-2">
          <Button 
            onClick={handleSubmit}
            disabled={!canSubmit() || submitting}
            className="w-full h-12"
          >
            {submitting ? 'Saving...' : 'Save Performance Ratings'}
          </Button>
          
          <Button 
            variant="outline"
            onClick={() => navigate('/week')}
            className="w-full"
          >
            Back to Week View
          </Button>
        </div>
      </div>
    </div>
  );
}