import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';
import ConfPerfDelta from '@/components/ConfPerfDelta';

interface ReviewData {
  domain_name: string;
  action_statement: string;
  confidence_score: number;
  performance_score: number;
}

interface Staff {
  id: string;
  role_id: number;
}

export default function Review() {
  const { cycle, week } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [reviewData, setReviewData] = useState<ReviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (user && cycle && week) {
      loadData();
    }
  }, [user, cycle, week]);

  const loadData = async () => {
    if (!user || !cycle || !week) return;

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

    // Load review data with domain information
    const { data, error } = await supabase.rpc('get_weekly_review', {
      p_cycle: parseInt(cycle),
      p_week: parseInt(week),
      p_role_id: staffData.role_id,
      p_staff_id: staffData.id
    });

    if (error) {
      console.error('RPC error, falling back to manual query:', error);
      
      // Fallback: manually construct the review data
      const { data: focusData } = await supabase
        .from('weekly_focus')
        .select(`
          id,
          display_order,
          self_select,
          action_id,
          pro_moves!weekly_focus_action_id_fkey ( action_statement ),
          competencies ( domains!competencies_domain_id_fkey ( domain_name ) )
        `)
        .eq('cycle', parseInt(cycle))
        .eq('week_in_cycle', parseInt(week))
        .eq('role_id', staffData.role_id)
        .order('display_order');

      if (!focusData || focusData.length === 0) {
        setReviewData([]);
        setLoading(false);
        return;
      }

      // Get self-select choices for this week
      const { data: selectionsData } = await supabase
        .from('weekly_self_select')
        .select(`
          weekly_focus_id,
          selected_pro_move_id
        `)
        .eq('user_id', user.id)
        .in('weekly_focus_id', focusData.map(f => f.id));

      // Get pro moves for selected actions
      const selectedProMoveIds = selectionsData?.map(s => s.selected_pro_move_id).filter(Boolean) || [];
      let proMovesData: any[] = [];
      
      if (selectedProMoveIds.length > 0) {
        const { data: pmData } = await supabase
          .from('pro_moves')
          .select(`
            action_id,
            action_statement,
            competencies ( domains!competencies_domain_id_fkey ( domain_name ) )
          `)
          .in('action_id', selectedProMoveIds);
        proMovesData = pmData || [];
      }

      // Get scores for this week
      const { data: scoresData } = await supabase
        .from('weekly_scores')
        .select('weekly_focus_id, confidence_score, performance_score, selected_action_id')
        .eq('staff_id', staffData.id)
        .in('weekly_focus_id', focusData.map(f => f.id));

      // Transform data manually
      const manualReviewData: ReviewData[] = focusData.map((focus: any) => {
        const isSelSelect = focus.self_select;
        const scores = scoresData?.find(s => s.weekly_focus_id === focus.id);
        
        let actionStatement = 'Unknown move';
        let domainName = 'Unknown';

        if (isSelSelect) {
          const userSelection = selectionsData?.find(s => s.weekly_focus_id === focus.id);
          if (userSelection?.selected_pro_move_id) {
            const selectedProMove = proMovesData.find(pm => pm.action_id === userSelection.selected_pro_move_id);
            if (selectedProMove) {
              actionStatement = selectedProMove.action_statement;
              domainName = selectedProMove.competencies?.domains?.domain_name || domainName;
            } else {
              actionStatement = 'Selected move not found';
            }
          } else {
            // Check if there's a score with selected_action_id as fallback
            const fallbackAction = scores?.selected_action_id;
            if (fallbackAction) {
              const fallbackProMove = proMovesData.find(pm => pm.action_id === fallbackAction);
              if (fallbackProMove) {
                actionStatement = fallbackProMove.action_statement;
                domainName = fallbackProMove.competencies?.domains?.domain_name || domainName;
              } else {
                actionStatement = 'No selection made';
              }
            } else {
              actionStatement = 'No selection made';
            }
            if (!fallbackAction) {
              domainName = focus.competencies?.domains?.domain_name || domainName;
            }
          }
        } else {
          actionStatement = focus.pro_moves?.action_statement || actionStatement;
          domainName = focus.competencies?.domains?.domain_name || domainName;
        }

        return {
          domain_name: domainName,
          action_statement: actionStatement,
          confidence_score: scores?.confidence_score || 0,
          performance_score: scores?.performance_score || 0
        };
      });

      setReviewData(manualReviewData);
    } else {
      setReviewData(data || []);
    }

    setLoading(false);
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
      <div className="max-w-4xl mx-auto space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-center">
              Week Complete - Cycle {cycle}, Week {week}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-4 gap-4 font-semibold text-sm bg-muted p-3 rounded-lg">
                <div>Domain</div>
                <div>Pro Move</div>
                <div>Confidence</div>
                <div>Performance</div>
              </div>
              {reviewData.length === 0 && (
                <div className="text-center text-muted-foreground py-6">No Pro Moves scheduled for this week.</div>
              )}
              {reviewData.map((item, index) => (
                <div 
                  key={index}
                  className="grid grid-cols-4 gap-4 p-4 rounded-lg border"
                >
                  <div className="flex items-center">
                    <Badge 
                      variant="secondary" 
                      className="text-xs font-semibold ring-1 ring-border/50"
                      style={{ backgroundColor: getDomainColor(item.domain_name) }}
                    >
                      {item.domain_name}
                    </Badge>
                  </div>
                  <div className="text-sm font-medium">
                    {item.action_statement}
                  </div>
                  <div className="col-span-2 flex items-end justify-end">
                    <ConfPerfDelta confidence={item.confidence_score} performance={item.performance_score} />
                  </div>
                </div>
              ))}
            </div>
            
            <div className="mt-8 text-center">
              <Button onClick={() => navigate('/')} size="lg">
                Back to Home
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}