import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ClipboardList } from 'lucide-react';

interface BaselineSummaryPanelProps {
  staffId: string;
  assessmentId?: string;
  status?: string;
}

interface BaselineItem {
  action_id: number;
  self_score: number | null;
  self_note: string | null;
  pro_moves: {
    action_statement: string;
    competencies: {
      competency_id: number;
      name: string;
      domains: {
        domain_id: number;
        domain_name: string;
        color_hex: string;
      } | null;
    } | null;
  } | null;
}

interface GroupedItems {
  [domainName: string]: {
    color: string;
    items: BaselineItem[];
  };
}

export function BaselineSummaryPanel({ staffId, assessmentId, status }: BaselineSummaryPanelProps) {
  const { data: items, isLoading } = useQuery({
    queryKey: ['baseline-items', assessmentId],
    queryFn: async () => {
      if (!assessmentId) return [];
      
      const { data, error } = await supabase
        .from('doctor_baseline_items')
        .select(`
          action_id,
          self_score,
          self_note,
          pro_moves!doctor_baseline_items_action_id_fkey (
            action_statement,
            competencies!fk_pro_moves_competency_id (
              competency_id,
              name,
              domains!competencies_domain_id_fkey (
                domain_id,
                domain_name,
                color_hex
              )
            )
          )
        `)
        .eq('assessment_id', assessmentId);
      
      if (error) throw error;
      return data as unknown as BaselineItem[];
    },
    enabled: !!assessmentId,
  });

  // Get total doctor ProMoves for progress calculation
  const { data: totalProMoves } = useQuery({
    queryKey: ['doctor-pro-moves-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('pro_moves')
        .select('*', { count: 'exact', head: true })
        .eq('role_id', 4)
        .eq('active', true);
      
      if (error) throw error;
      return count || 0;
    },
  });

  if (!assessmentId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Baseline Assessment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            The doctor has not yet started their baseline assessment.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Baseline Assessment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const completedCount = items?.filter(i => i.self_score !== null).length || 0;
  const progressPct = totalProMoves ? Math.round((completedCount / totalProMoves) * 100) : 0;

  // Group items by domain
  const grouped: GroupedItems = {};
  items?.forEach(item => {
    const domainName = item.pro_moves?.competencies?.domains?.domain_name || 'Unknown';
    const color = item.pro_moves?.competencies?.domains?.color_hex || '#6b7280';
    
    if (!grouped[domainName]) {
      grouped[domainName] = { color, items: [] };
    }
    grouped[domainName].items.push(item);
  });

  const getScoreLabel = (score: number | null) => {
    if (score === null) return '—';
    switch (score) {
      case 1: return 'Developing';
      case 2: return 'Emerging';
      case 3: return 'Proficient';
      case 4: return 'Mastery';
      default: return score.toString();
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'bg-muted text-muted-foreground';
    switch (score) {
      case 1: return 'bg-red-100 text-red-800';
      case 2: return 'bg-amber-100 text-amber-800';
      case 3: return 'bg-blue-100 text-blue-800';
      case 4: return 'bg-green-100 text-green-800';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5" />
            Baseline Assessment
          </CardTitle>
          <Badge variant={status === 'completed' ? 'default' : 'secondary'}>
            {status === 'completed' ? 'Complete' : 'In Progress'}
          </Badge>
        </div>
        {status !== 'completed' && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span>{completedCount} of {totalProMoves} Pro Moves</span>
            </div>
            <Progress value={progressPct} className="h-2" />
          </div>
        )}
      </CardHeader>
      <CardContent>
        {Object.keys(grouped).length === 0 ? (
          <p className="text-muted-foreground">No ratings recorded yet.</p>
        ) : (
          <div className="space-y-6">
            {Object.entries(grouped).map(([domainName, { color, items: domainItems }]) => (
              <div key={domainName}>
                <div className="flex items-center gap-2 mb-3">
                  <div 
                    className="w-3 h-3 rounded-full" 
                    style={{ backgroundColor: color }}
                  />
                  <h3 className="font-semibold">{domainName}</h3>
                  <span className="text-sm text-muted-foreground">
                    ({domainItems.filter(i => i.self_score !== null).length}/{domainItems.length})
                  </span>
                </div>
                <div className="space-y-2">
                  {domainItems.map((item) => (
                    <div 
                      key={item.action_id}
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                    >
                      <p className="text-sm flex-1 mr-4">
                        {item.pro_moves?.action_statement || `Pro Move ${item.action_id}`}
                      </p>
                      <Badge className={getScoreColor(item.self_score)}>
                        {item.self_score !== null ? (
                          <span className="flex items-center gap-1">
                            <span className="font-bold">{item.self_score}</span>
                            <span className="text-xs opacity-80">
                              {getScoreLabel(item.self_score)}
                            </span>
                          </span>
                        ) : (
                          '—'
                        )}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}