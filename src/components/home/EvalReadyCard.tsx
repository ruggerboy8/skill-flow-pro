import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardCheck, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { quarterNum } from '@/lib/reviewPayload';

/**
 * Home notification card for unreviewd evaluations.
 * Shows when a staff member has released evaluations they haven't acknowledged.
 */
export function EvalReadyCard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['eval-ready-card', user?.id],
    queryFn: async () => {
      if (!user) return null;

      const { data: staff } = await supabase
        .from('staff')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!staff) return null;

      const { data: evals, error } = await supabase
        .from('evaluations')
        .select('id, type, quarter, program_year, viewed_at, acknowledged_at')
        .eq('staff_id', staff.id)
        .eq('status', 'submitted')
        .eq('is_visible_to_staff', true)
        .is('acknowledged_at', null);

      if (error || !evals || evals.length === 0) return null;

      // Sort by period descending (newest first)
      const sorted = [...evals].sort((a, b) => {
        if (a.program_year !== b.program_year) return b.program_year - a.program_year;
        return quarterNum(b.quarter) - quarterNum(a.quarter);
      });

      const newest = sorted[0];
      const isViewed = !!newest.viewed_at;
      const periodLabel = newest.type === 'Baseline'
        ? `Baseline ${newest.program_year}`
        : `${newest.quarter} ${newest.program_year}`;

      return {
        evalId: newest.id,
        periodLabel,
        isViewed,
        totalCount: sorted.length,
      };
    },
    enabled: !!user,
    staleTime: 1000 * 60 * 2,
  });

  if (!data) return null;

  // State 1: Released, not viewed (prominent)
  if (!data.isViewed) {
    return (
      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="py-4 flex items-center gap-4">
          <div className="rounded-full bg-primary/10 p-2.5 shrink-0">
            <ClipboardCheck className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">
              Your {data.periodLabel} evaluation is ready
            </p>
            {data.totalCount > 1 && (
              <p className="text-xs text-muted-foreground">
                You have {data.totalCount} evaluations to review
              </p>
            )}
          </div>
          <Button size="sm" onClick={() => navigate(`/evaluation/${data.evalId}/review`)}>
            Start Review <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  // State 2: Viewed, not acknowledged (smaller reminder)
  return (
    <Card className="border-muted">
      <CardContent className="py-3 flex items-center gap-3">
        <ClipboardCheck className="w-4 h-4 text-muted-foreground shrink-0" />
        <p className="text-sm text-muted-foreground flex-1">
          You have an evaluation review in progress
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate(`/evaluation/${data.evalId}/review`)}>
          Continue Review
        </Button>
      </CardContent>
    </Card>
  );
}
