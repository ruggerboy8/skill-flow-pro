import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getISOWeek, getISOWeekYear } from 'date-fns';

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
  weekly_focus_id: string;
  confidence_score: number | null;
  performance_score: number | null;
}

export default function Week() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [currentWeek, setCurrentWeek] = useState(getISOWeek(new Date()));
  const [currentYear, setCurrentYear] = useState(getISOWeekYear(new Date()));
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [weeklyScores, setWeeklyScores] = useState<WeeklyScore[]>([]);
  const [loading, setLoading] = useState(true);
  const { user, signOut } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      loadStaffProfile();
    }
  }, [user]);

  useEffect(() => {
    if (staff) {
      loadWeekData();
    }
  }, [staff, currentWeek, currentYear]);

  const loadStaffProfile = async () => {
    const { data, error } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user!.id)
      .single();

    if (error || !data) {
      navigate('/setup');
      return;
    }
    
    setStaff(data);
  };

  const loadWeekData = async () => {
    if (!staff) return;
    
    setLoading(true);
    
    // Load weekly focus
    const { data: focusData, error: focusError } = await supabase
      .from('weekly_focus')
      .select(`
        id,
        display_order,
        pro_moves(action_statement)
      `)
      .eq('iso_week', currentWeek)
      .eq('iso_year', currentYear)
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

    setWeeklyFocus(focusData || []);

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

  const generateWeekOptions = () => {
    const options = [];
    for (let week = 1; week <= 52; week++) {
      options.push(
        <SelectItem key={week} value={week.toString()}>
          Week {week}
        </SelectItem>
      );
    }
    return options;
  };

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
              No Pro Moves have been configured for Week {currentWeek}, {currentYear}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Select value={currentWeek.toString()} onValueChange={(value) => setCurrentWeek(parseInt(value))}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {generateWeekOptions()}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => setCurrentYear(currentYear === 2024 ? 2025 : 2024)}>
                {currentYear}
              </Button>
            </div>
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
              Week {currentWeek}, {currentYear}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Select value={currentWeek.toString()} onValueChange={(value) => setCurrentWeek(parseInt(value))}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {generateWeekOptions()}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => setCurrentYear(currentYear === 2024 ? 2025 : 2024)}>
                {currentYear}
              </Button>
            </div>
            
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
                      <p className="text-sm flex-1">{focus.pro_moves.action_statement}</p>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {score?.confidence_score && (
                        <Badge variant="secondary" className="text-xs">
                          Confidence: {score.confidence_score}/4
                        </Badge>
                      )}
                      {score?.performance_score && (
                        <Badge variant="secondary" className="text-xs">
                          Performance: {score.performance_score}/4
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
                  ✓ Completed for Week {currentWeek}
                </Badge>
              ) : (
                <>
                  {canRateConfidence() && (
                    <Button 
                      onClick={() => navigate(`/confidence/${currentWeek}-${currentYear}`)}
                      className="w-full h-12"
                    >
                      Rate Confidence (Monday)
                    </Button>
                  )}
                  {canRatePerformance() && (
                    <Button 
                      onClick={() => navigate(`/performance/${currentWeek}-${currentYear}`)}
                      className="w-full h-12"
                    >
                      Rate Performance (Thursday)
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