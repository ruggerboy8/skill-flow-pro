import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  action_statement: string;
}

export default function WeekInfo() {
  const { cycle, week } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [hasConfidenceScores, setHasConfidenceScores] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const cycleNum = parseInt(cycle || '1');
  const weekNum = parseInt(week || '1');

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, cycle, week]);

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

    // Load weekly focus using the view
    const { data: focusData, error: focusError } = await supabase
      .from('v_weekly_focus')
      .select('id, display_order, action_statement')
      .eq('cycle', cycleNum)
      .eq('week_in_cycle', weekNum)
      .eq('role_id', staffData.role_id)
      .order('display_order');

    if (focusError || !focusData || focusData.length === 0) {
      toast({
        title: "No Pro Moves",
        description: "No Pro Moves found for this week",
        variant: "destructive"
      });
      navigate('/');
      return;
    }

    setWeeklyFocus(focusData);

    // Check if confidence scores already exist
    const focusIds = focusData.map(f => f.id);
    const { data: scoresData } = await supabase
      .from('weekly_scores')
      .select('weekly_focus_id, confidence_score')
      .eq('staff_id', staffData.id)
      .in('weekly_focus_id', focusIds)
      .not('confidence_score', 'is', null);

    setHasConfidenceScores(scoresData && scoresData.length === focusData.length);
    setLoading(false);
  };

  const handleRateConfidence = () => {
    if (weeklyFocus.length > 0) {
      navigate(`/confidence/${weeklyFocus[0].id}/1`);
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
            <CardTitle className="text-center">Consider the following Pro Moves</CardTitle>
            <CardDescription className="text-center">
              Cycle {cycleNum}, Week {weekNum}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {weeklyFocus.map((focus, index) => (
                <div key={focus.id} className="flex items-start gap-3 p-3 bg-muted rounded-lg">
                  <Badge variant="outline" className="text-xs shrink-0">
                    {index + 1}
                  </Badge>
                  <p className="text-sm">{focus.action_statement}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-4">
              <Button 
                onClick={handleRateConfidence}
                disabled={hasConfidenceScores}
                className="w-full h-12"
              >
                {hasConfidenceScores ? 'Confidence Already Submitted' : 'Rate your confidence'}
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => navigate('/')}
                className="w-full"
              >
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}