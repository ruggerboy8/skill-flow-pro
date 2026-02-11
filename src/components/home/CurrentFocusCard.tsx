import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Target, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getDomainColor } from '@/lib/domainColors';
import { quarterNum } from '@/lib/reviewPayload';

/**
 * Home card showing the staff member's currently selected quarterly focus ProMoves.
 * "Current" = focus rows tied to the evaluation with max(program_year, quarter)
 * among released evaluations for this staff member.
 */
export function CurrentFocusCard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['current-focus-card', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data: staff } = await supabase
        .from('staff')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!staff) return null;

      // Find the most recent released evaluation for this staff (by period, not released_at)
      const { data: evals, error: evalErr } = await supabase
        .from('evaluations')
        .select('id, quarter, program_year, viewed_at, acknowledged_at, focus_selected_at')
        .eq('staff_id', staff.id)
        .eq('status', 'submitted')
        .eq('is_visible_to_staff', true)
        .order('program_year', { ascending: false });

      if (evalErr || !evals || evals.length === 0) return null;

      // Sort by period descending and pick the newest
      const sorted = [...evals].sort((a, b) => {
        if (a.program_year !== b.program_year) return b.program_year - a.program_year;
        return quarterNum(b.quarter) - quarterNum(a.quarter);
      });
      const newestEval = sorted[0];

      // If no focus selected for this eval, check if we should prompt
      if (!newestEval.focus_selected_at) {
        // Only show prompt if eval is viewed but not acknowledged (or acknowledged without focus)
        if (newestEval.viewed_at) {
          return { type: 'prompt' as const, evalId: newestEval.id };
        }
        return null;
      }

      // Fetch focus rows with ProMove details
      const { data: focusRows, error: focusErr } = await supabase
        .from('staff_quarter_focus')
        .select('action_id, pro_moves!inner(action_statement, competency_id, competencies!fk_pro_moves_competency_id(domains!competencies_domain_id_fkey(domain_name)))')
        .eq('evaluation_id', newestEval.id)
        .eq('staff_id', staff.id);

      if (focusErr || !focusRows || focusRows.length === 0) return null;

      const items = focusRows.map(row => {
        const pm = row.pro_moves as any;
        const domainName = pm?.competencies?.domains?.domain_name ?? '';
        return {
          actionId: row.action_id,
          statement: pm?.action_statement ?? '',
          domainName,
        };
      });

      return { type: 'focus' as const, items, evalId: newestEval.id };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });

  if (!data) return null;

  if (data.type === 'prompt') {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="py-4 flex items-center gap-3">
          <Target className="w-4 h-4 text-muted-foreground shrink-0" />
          <p className="text-sm text-muted-foreground flex-1">
            Select your quarterly focus to keep your priorities front and center
          </p>
          <Button variant="outline" size="sm" onClick={() => navigate(`/evaluation/${data.evalId}/review`)}>
            Select Focus <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="w-4 h-4 text-primary" />
          My Quarterly Focus
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.items.map(item => (
          <div key={item.actionId} className="flex items-start gap-2 py-1.5">
            {item.domainName && (
              <Badge
                variant="outline"
                className="shrink-0 mt-0.5 text-xs"
                style={{ borderColor: getDomainColor(item.domainName) }}
              >
                {item.domainName}
              </Badge>
            )}
            <span className="text-sm leading-relaxed">{item.statement}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
