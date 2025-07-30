import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';

interface ScoreHistory {
  id: string;
  cycle: number;
  week_in_cycle: number;
  confidence_score: number | null;
  performance_score: number | null;
  confidence_date: string | null;
  performance_date: string | null;
  action_statement: string;
}

export default function Stats() {
  const [scores, setScores] = useState<ScoreHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      loadScoreHistory();
    }
  }, [user]);

  const loadScoreHistory = async () => {
    if (!user) return;

    try {
      // First get the staff record
      const { data: staffData } = await supabase
        .from('staff')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (!staffData) return;

      // Then get the score history with weekly focus details
      const { data: scoresData } = await supabase
        .from('weekly_scores')
        .select(`
          id,
          confidence_score,
          performance_score,
          confidence_date,
          performance_date,
          weekly_focus!inner(
            cycle,
            week_in_cycle,
            action_id,
            pro_moves!inner(action_statement)
          )
        `)
        .eq('staff_id', staffData.id)
        .order('confidence_date', { ascending: false });

      if (scoresData) {
        const transformedData: ScoreHistory[] = scoresData.map(item => ({
          id: item.id,
          cycle: (item.weekly_focus as any).cycle,
          week_in_cycle: (item.weekly_focus as any).week_in_cycle,
          confidence_score: item.confidence_score,
          performance_score: item.performance_score,
          confidence_date: item.confidence_date,
          performance_date: item.performance_date,
          action_statement: (item.weekly_focus as any).pro_moves.action_statement
        }));
        setScores(transformedData);
      }
    } catch (error) {
      console.error('Error loading score history:', error);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'secondary';
    if (score >= 8) return 'default';
    if (score >= 6) return 'secondary';
    return 'destructive';
  };

  const getCompletionStatus = (confidence: number | null, performance: number | null) => {
    if (confidence !== null && performance !== null) {
      return 'completed'; // Green check
    } else if (confidence !== null || performance !== null) {
      return 'in-progress'; // Yellow indicator
    }
    return 'not-started'; // Nothing
  };

  const getStatusIcon = (status: string) => {
    if (status === 'completed') return '✓';
    if (status === 'in-progress') return '●';
    return null;
  };

  const getStatusColor = (status: string) => {
    if (status === 'completed') return 'text-green-600';
    if (status === 'in-progress') return 'text-yellow-600';
    return '';
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not completed';
    return new Date(dateString).toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">Loading your stats...</div>
      </div>
    );
  }

  if (scores.length === 0) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Your Stats</h1>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">No scores recorded yet. Complete your first week to see stats here!</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Your Stats</h1>
      
      <div className="grid gap-4">
        {scores.map((score) => (
          <Card key={score.id}>
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div>
                    <CardTitle className="text-lg">
                      Cycle {score.cycle}, Week {score.week_in_cycle}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      {score.action_statement}
                    </p>
                  </div>
                  {(() => {
                    const status = getCompletionStatus(score.confidence_score, score.performance_score);
                    const icon = getStatusIcon(status);
                    return icon ? (
                      <span className={`text-lg font-bold ${getStatusColor(status)}`}>
                        {icon}
                      </span>
                    ) : null;
                  })()}
                </div>
                <div className="flex gap-2">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Confidence</p>
                    <Badge variant={getScoreColor(score.confidence_score)}>
                      {score.confidence_score ?? 'N/A'}
                    </Badge>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground mb-1">Performance</p>
                    <Badge variant={getScoreColor(score.performance_score)}>
                      {score.performance_score ?? 'N/A'}
                    </Badge>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Confidence submitted:</span>
                  <p>{formatDate(score.confidence_date)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Performance submitted:</span>
                  <p>{formatDate(score.performance_date)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}