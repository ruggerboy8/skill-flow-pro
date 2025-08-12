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
import { getNowZ, getAnchors, nextMondayStr, isSameIsoWeek } from '@/lib/centralTime';

interface Staff {
  id: string;
  role_id: number;
}

interface WeeklyFocus {
  id: string;
  display_order: number;
  action_statement?: string; // From RPC function
  iso_year?: number;
  iso_week?: number;
  pro_moves?: {
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

  const weekNum = Number(week); // week param is now just "1", "2", etc.

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

    // Load weekly focus using direct query with cycle/week_in_cycle
    const { data: focusData, error: focusError } = await supabase
      .from('weekly_focus')
      .select(`
        id,
        display_order,
        iso_year,
        iso_week,
        self_select,
        pro_moves (
          action_statement
        ),
        competencies (
          domains ( domain_name )
        )
      `)
      .eq('cycle', 1) // Use cycle 1 for now
      .eq('week_in_cycle', weekNum)
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
      console.log('No focus data found for:', { weekNum, cycle: 1, roleId: staffData.role_id });
      toast({
        title: "Error",
        description: "No Pro Moves found for this week",
        variant: "destructive"
      });
      navigate('/week');
      return;
    }

    console.log('Focus data found:', focusData);
    setWeeklyFocus(focusData);
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
              Cycle 1 · Week {weekNum}
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
                  {focus.pro_moves?.action_statement || 'Self-Select'}
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