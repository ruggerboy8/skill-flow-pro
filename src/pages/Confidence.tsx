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

export default function Confidence() {
  const { week } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [scores, setScores] = useState<{ [key: string]: number }>({});
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

    console.log('Loading confidence data for week:', week, 'user:', user.id);

    // Load staff profile
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user.id)
      .single();

    if (staffError || !staffData) {
      console.error('Staff error:', staffError);
      navigate('/setup');
      return;
    }

    console.log('Staff data loaded:', staffData);
    setStaff(staffData);

    // Try a simpler query first to see if data exists
    const { data: testData, error: testError } = await supabase
      .from('weekly_focus')
      .select('*')
      .eq('iso_week', weekNum)
      .eq('iso_year', yearNum)
      .eq('role_id', staffData.role_id);

    console.log('Test weekly_focus query:', { 
      weekNum, 
      yearNum, 
      roleId: staffData.role_id, 
      testData, 
      testError 
    });

    // Load weekly focus with manual join
    const { data: focusData, error: focusError } = await supabase
      .from('weekly_focus')
      .select(`
        id,
        display_order,
        action_id
      `)
      .eq('iso_week', weekNum)
      .eq('iso_year', yearNum)
      .eq('role_id', staffData.role_id)
      .order('display_order');

    if (focusError) {
      console.error('Focus error:', focusError);
      toast({
        title: "Error",
        description: `Database error: ${focusError.message}`,
        variant: "destructive"
      });
      navigate('/week');
      return;
    }

    if (!focusData || focusData.length === 0) {
      console.log('No focus data found for:', { weekNum, yearNum, roleId: staffData.role_id });
      toast({
        title: "Error",
        description: "No Pro Moves found for this week",
        variant: "destructive"
      });
      navigate('/week');
      return;
    }

    console.log('Focus data found:', focusData);

    // Now fetch pro_moves for each action_id
    const actionIds = focusData.map(f => f.action_id).filter(Boolean);
    const { data: proMovesData, error: proMovesError } = await supabase
      .from('pro_moves')
      .select('action_id, action_statement')
      .in('action_id', actionIds);

    if (proMovesError) {
      console.error('Pro moves error:', proMovesError);
      toast({
        title: "Error",
        description: `Error loading pro moves: ${proMovesError.message}`,
        variant: "destructive"
      });
      navigate('/week');
      return;
    }

    console.log('Pro moves data:', proMovesData);

    // Combine the data
    const combinedData = focusData.map(focus => ({
      ...focus,
      pro_moves: {
        action_statement: proMovesData?.find(pm => pm.action_id === focus.action_id)?.action_statement || 'No action statement'
      }
    }));

    console.log('Combined data:', combinedData);
    setWeeklyFocus(combinedData);
    setLoading(false);
  };

  const handleScoreChange = (focusId: string, score: string) => {
    setScores(prev => ({
      ...prev,
      [focusId]: parseInt(score)
    }));
  };

  const canSubmit = () => {
    return weeklyFocus.every(focus => scores[focus.id] !== undefined);
  };

  const handleSubmit = async () => {
    if (!staff || !canSubmit()) return;

    setSubmitting(true);

    const scoreInserts = weeklyFocus.map(focus => ({
      staff_id: staff.id,
      weekly_focus_id: focus.id,
      confidence_score: scores[focus.id]
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
        description: "See you Thursday for performance rating!"
      });
      navigate('/week');
    }

    setSubmitting(false);
  };

  const getScoreLabel = (score: number) => {
    switch (score) {
      case 1: return 'Not Confident';
      case 2: return 'A Bit';
      case 3: return 'Mostly';
      case 4: return 'Totally';
      default: return '';
    }
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
            <CardTitle className="text-center">Monday Confidence</CardTitle>
            <CardDescription className="text-center">
              Rate how confident you are you'll do each action 100% this week
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
                <CardTitle className="text-sm font-medium leading-relaxed">
                  {focus.pro_moves.action_statement}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={scores[focus.id]?.toString() || ''}
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
            {submitting ? 'Saving...' : 'Save Confidence Ratings'}
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