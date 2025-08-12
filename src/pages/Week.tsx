import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  action_statement: string;
  iso_year: number;
  iso_week: number;
}

interface WeeklyScore {
  weekly_focus_id: string;
  confidence_score: number | null;
  performance_score: number | null;
}

export default function Week() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [cycle, setCycle] = useState(1);
  const [weekInCycle, setWeekInCycle] = useState(1);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [weeklyScores, setWeeklyScores] = useState<WeeklyScore[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const params = useParams();

  useEffect(() => {
    if (user) {
      loadStaffProfile();
    }
  }, [user]);

  useEffect(() => {
    // Parse cycle and week from URL params (format: "1-2" for cycle 1, week 2)
    if (params.weekId) {
      const [cycleStr, weekStr] = params.weekId.split('-');
      setCycle(parseInt(cycleStr) || 1);
      setWeekInCycle(parseInt(weekStr) || 1);
    }
  }, [params.weekId]);

  useEffect(() => {
    if (staff && cycle && weekInCycle) {
      loadWeekData();
    }
  }, [staff, cycle, weekInCycle]);

  const loadStaffProfile = async () => {
    const { data, error } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user!.id)
      .maybeSingle();

    if (error || !data) {
      navigate('/setup');
      return;
    }
    
    setStaff(data);
  };

  const loadWeekData = async () => {
    if (!staff) return;
    
    setLoading(true);
    
    // Load weekly focus with pro moves data
    const { data: focusData, error: focusError } = await supabase
      .from('weekly_focus')
      .select(`
        id,
        display_order,
        iso_year,
        iso_week,
        pro_moves!inner(action_statement)
      `)
      .eq('cycle', cycle)
      .eq('week_in_cycle', weekInCycle)
      .eq('role_id', staff.role_id)
      .order('display_order');

    if (focusError) {
      toast({
        title: "Error",
        description: "Failed to load Pro Moves for this week",
        variant: "destructive"
      });
      setLoading(false);
      return;
    }

    const transformedFocus = (focusData || []).map(item => ({
      id: item.id,
      display_order: item.display_order,
      action_statement: (item.pro_moves as any)?.action_statement || '',
      iso_year: (item as any).iso_year,
      iso_week: (item as any).iso_week,
    }));

    setWeeklyFocus(transformedFocus);

    // Load existing scores
    if (focusData && focusData.length > 0) {
      const focusIds = focusData.map(f => f.id);
      const { data: scoresData } = await supabase
        .from('weekly_scores')
        .select('weekly_focus_id, confidence_score, performance_score')
        .eq('staff_id', staff.id)
        .in('weekly_focus_id', focusIds);

      setWeeklyScores(scoresData || []);
    }
    
    setLoading(false);
  };

  const getScoreForFocus = (focusId: string) => {
    return weeklyScores.find(score => score.weekly_focus_id === focusId);
  };

  const canRateConfidence = () => {
    return weeklyFocus.every(focus => {
      const score = getScoreForFocus(focus.id);
      return !score || score.confidence_score === null;
    });
  };

  const canRatePerformance = () => {
    return weeklyFocus.every(focus => {
      const score = getScoreForFocus(focus.id);
      return score && score.confidence_score !== null && score.performance_score === null;
    });
  };

  const isWeekComplete = () => {
    return weeklyFocus.every(focus => {
      const score = getScoreForFocus(focus.id);
      return score && score.confidence_score !== null && score.performance_score !== null;
    });
  };

  // Central Time gating calculations
  const nowZ = getNowZ();
  const { monCheckInZ, tueDueZ, thuStartZ } = getAnchors(nowZ);
  const confCount = weeklyFocus.filter(f => {
    const s = getScoreForFocus(f.id);
    return s && s.confidence_score !== null;
  }).length;
  const perfCount = weeklyFocus.filter(f => {
    const s = getScoreForFocus(f.id);
    return s && s.performance_score !== null;
  }).length;
  const focusMeta = weeklyFocus[0];
  const isCurrentIsoWeek = focusMeta ? isSameIsoWeek(nowZ, focusMeta.iso_year, focusMeta.iso_week) : true;

  const showConfidenceCTA = confCount === 0 && isCurrentIsoWeek && nowZ >= monCheckInZ && nowZ < tueDueZ;
  const showSoftReset = confCount === 0 && ((isCurrentIsoWeek && nowZ >= tueDueZ) || !isCurrentIsoWeek);
  const showPerformanceCTA = confCount > 0 && perfCount === 0 && ((!isCurrentIsoWeek) || (isCurrentIsoWeek && nowZ >= thuStartZ));
  const showPerfLocked = confCount > 0 && perfCount === 0 && isCurrentIsoWeek && nowZ < thuStartZ;


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (weeklyFocus.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>No Pro Moves Set</CardTitle>
            <CardDescription>
              No Pro Moves have been configured for Cycle {cycle}, Week {weekInCycle}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" onClick={() => navigate('/')} className="w-full">
              Back to Dashboard
            </Button>
            <Button variant="outline" onClick={signOut} className="w-full">
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-md mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-center">SkillCheck</CardTitle>
            <CardDescription className="text-center">
              Cycle {cycle}, Week {weekInCycle}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            
            <div className="space-y-3">
              <h3 className="font-medium">This Week's Pro Moves:</h3>
              {weeklyFocus.map((focus, index) => {
                const score = getScoreForFocus(focus.id);
                return (
                  <div key={focus.id} className="p-3 bg-muted rounded-lg">
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="text-xs">
                        {index + 1}
                      </Badge>
                      <p className="text-sm flex-1">{focus.action_statement}</p>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {score?.confidence_score && (
                        <Badge variant="secondary" className="text-xs">
                          Confidence: {score.confidence_score}
                        </Badge>
                      )}
                      {score?.performance_score && (
                        <Badge variant="secondary" className="text-xs">
                          Performance: {score.performance_score}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              {isWeekComplete() ? (
                <Badge variant="default" className="w-full justify-center py-2">
                  ✓ Completed for Cycle {cycle}, Week {weekInCycle}
                </Badge>
              ) : (
                <>
                  {showSoftReset && (
                    <div className="p-3 rounded-md border bg-muted">
                      <div className="font-medium">Confidence window closed</div>
                      <div className="text-sm text-muted-foreground">
                        You’ll get a fresh start on Mon, {nextMondayStr(nowZ)}.
                      </div>
                    </div>
                  )}

                  {showConfidenceCTA && (
                    <Button 
                      onClick={() => navigate(`/confidence/${cycle}-${weekInCycle}`)}
                      className="w-full h-12"
                    >
                      Rate Confidence
                    </Button>
                  )}

                  {showPerfLocked && (
                    <Button 
                      className="w-full h-12"
                      variant="outline"
                      disabled
                    >
                      Performance opens Thursday
                    </Button>
                  )}

                  {showPerformanceCTA && (
                    <Button 
                      onClick={() => navigate(`/performance/${cycle}-${weekInCycle}`)}
                      className="w-full h-12"
                    >
                      Rate Performance
                    </Button>
                  )}
                </>
              )}
            </div>
            
            <Button variant="outline" onClick={signOut} className="w-full">
              Sign Out
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}