import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';

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

    // Load review data
    const { data: fallbackData, error: fallbackError } = await supabase
      .from('v_weekly_focus')
      .select(`
        action_statement,
        weekly_scores!inner(confidence_score, performance_score)
      `)
      .eq('cycle', parseInt(cycle))
      .eq('week_in_cycle', parseInt(week))
      .eq('role_id', staffData.role_id)
      .eq('weekly_scores.staff_id', staffData.id)
      .order('display_order');

    if (fallbackError) {
      toast({
        title: "Error",
        description: "Failed to load review data",
        variant: "destructive"
      });
      navigate('/');
      return;
    }

    // Transform data - we'll set domain as "Unknown" for now (will enhance later)
    const transformedData = fallbackData?.map(item => ({
      domain_name: "Unknown",
      action_statement: item.action_statement,
      confidence_score: item.weekly_scores[0]?.confidence_score || 0,
      performance_score: item.weekly_scores[0]?.performance_score || 0
    })) || [];

    setReviewData(transformedData);

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
              
              {reviewData.map((item, index) => (
                <div 
                  key={index}
                  className="grid grid-cols-4 gap-4 p-4 rounded-lg border"
                  style={{ backgroundColor: getDomainColor(item.domain_name) }}
                >
                  <div className="flex items-center">
                    <Badge 
                      variant="secondary" 
                      className="text-xs font-semibold bg-white/80 text-gray-900"
                    >
                      {item.domain_name}
                    </Badge>
                  </div>
                  <div className="text-sm text-gray-900 font-medium">
                    {item.action_statement}
                  </div>
                  <div className="text-center font-semibold text-gray-900">
                    {item.confidence_score}/4
                  </div>
                  <div className="text-center font-semibold text-gray-900">
                    {item.performance_score}/4
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