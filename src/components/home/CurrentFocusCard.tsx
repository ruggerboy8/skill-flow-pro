import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DomainBadge } from '@/components/ui/domain-badge';
import { Button } from '@/components/ui/button';
import { Target, ArrowRight, ExternalLink } from 'lucide-react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { quarterNum } from '@/lib/reviewPayload';

/**
 * Home card showing the staff member's currently selected quarterly focus ProMoves.
 * "Current" = focus rows tied to the evaluation with max(program_year, quarter)
 * among released evaluations for this staff member.
 */
export function CurrentFocusCard() {
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const navigate = useNavigate();
  const staffId = staffProfile?.id;

  const { data } = useQuery({
    queryKey: ['current-focus-card', staffId],
    queryFn: async () => {
      if (!staffId) return null;

      // Find the most recent released evaluation for this staff (by period, not released_at)
      const { data: evals, error: evalErr } = await supabase
        .from('evaluations')
        .select('id, quarter, program_year, viewed_at, acknowledged_at, focus_selected_at, learner_note')
        .eq('staff_id', staffId)
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
        .eq('staff_id', staffId);

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

      return { type: 'focus' as const, items, evalId: newestEval.id, learnerNote: (newestEval as any).learner_note as string | null };
    },
    enabled: !!staffId,
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
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            My Quarterly Focus
          </CardTitle>
          <Link 
            to={`/evaluation/${data.evalId}/review`}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            View Evaluation <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {data.learnerNote && (
          <div className="bg-muted/50 rounded-lg p-3 border-l-4 border-primary/40 mb-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">My note</p>
            <p className="text-sm italic text-foreground leading-relaxed">{data.learnerNote}</p>
          </div>
        )}
        {data.items.map(item => (
          <div key={item.actionId} className="flex items-start gap-2 py-1.5">
            <DomainBadge domain={item.domainName} className="mt-0.5" />
            <span className="text-sm leading-relaxed">{item.statement}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
