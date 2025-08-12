import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';
import { nowUtc, getAnchors, nextMondayStr } from '@/lib/centralTime';
interface Staff {
  id: string;
  role_id: number;
}

interface WeeklyFocus {
  id: string;
  display_order: number;
  action_statement: string;
  domain_name: string;
}

export default function WeekInfo() {
  const { cycle, week } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [hasConfidenceScores, setHasConfidenceScores] = useState(false);
  const [hasPerformanceScores, setHasPerformanceScores] = useState(false);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const cycleNum = parseInt(cycle || '1');
  const weekNum = parseInt(week || '1');

  const now = nowUtc();
  const { monCheckInZ, tueDueZ, thuStartZ } = getAnchors(now);
  const beforeCheckIn = now < monCheckInZ;
  const afterTueNoon = now >= tueDueZ;

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

    // Load weekly focus using RPC to get domain information
    const { data: focusData, error: focusError } = await supabase.rpc('get_focus_cycle_week', {
      p_cycle: cycleNum,
      p_week: weekNum,
      p_role_id: staffData.role_id
    }) as { data: WeeklyFocus[] | null; error: any };

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

    // Check if confidence and performance scores already exist
    const focusIds = focusData.map(f => f.id);
    const { data: scoresData } = await supabase
      .from('weekly_scores')
      .select('weekly_focus_id, confidence_score, performance_score')
      .eq('staff_id', staffData.id)
      .in('weekly_focus_id', focusIds);

    const confidenceScores = scoresData?.filter(s => s.confidence_score !== null) || [];
    const performanceScores = scoresData?.filter(s => s.performance_score !== null) || [];
    
    setHasConfidenceScores(confidenceScores.length === focusData.length);
    setHasPerformanceScores(performanceScores.length === focusData.length);
    setLoading(false);
  };

  const handleRateNext = () => {
    if (weeklyFocus.length === 0) return;

    const firstFocusId = weeklyFocus[0].id;

    if (!hasConfidenceScores) {
      if (afterTueNoon) {
        toast({
          title: "Confidence window closed",
          description: `You’ll get a fresh start on Mon, ${nextMondayStr(now)}.`
        });
        navigate('/week');
        return;
      }
      if (beforeCheckIn) {
        toast({
          title: "Confidence opens at 9:00 a.m. CT.",
          description: "Please come back after the window opens."
        });
        return;
      }
      navigate(`/confidence/${firstFocusId}/1`);
    } else if (!hasPerformanceScores) {
      if (now < thuStartZ) {
        toast({
          title: "Performance opens Thursday",
          description: "Please come back on Thu 12:00 a.m. CT."
        });
        return;
      }
      navigate(`/performance/${firstFocusId}/1`);
    } else {
      toast({
        title: "Week Complete",
        description: "You've already completed both confidence and performance ratings for this week."
      });
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
              Cycle {cycleNum} · Week {weekNum}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {weeklyFocus.map((focus, index) => (
                <div 
                  key={focus.id} 
                  className="rounded-lg p-4 border"
                  style={{ backgroundColor: getDomainColor(focus.domain_name) }}
                >
                  <Badge 
                    variant="secondary" 
                    className="text-xs font-semibold mb-2 bg-white/80 text-gray-900"
                  >
                    {focus.domain_name}
                  </Badge>
                  <p className="text-sm font-medium text-gray-900">{focus.action_statement}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-4">
              <Button 
                onClick={handleRateNext}
                disabled={(hasConfidenceScores && hasPerformanceScores) || (!hasConfidenceScores && (beforeCheckIn || afterTueNoon)) || (hasConfidenceScores && !hasPerformanceScores && now < thuStartZ)}
                className="w-full h-12"
              >
                {hasConfidenceScores && hasPerformanceScores 
                  ? 'Week Complete' 
                  : !hasConfidenceScores
                    ? (afterTueNoon 
                        ? 'Confidence window closed' 
                        : (beforeCheckIn ? 'Confidence opens at 9:00 a.m. CT' : 'Rate your confidence'))
                    : (now < thuStartZ ? 'Rate your performance (opens Thu)' : 'Rate your performance')}
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