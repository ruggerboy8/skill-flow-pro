import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { quarterNum } from '@/lib/reviewPayload';

export interface CurrentFocusItem {
  actionId: number;
  statement: string;
  domainName: string;
}

export type CurrentFocusResult =
  | { type: 'prompt'; evalId: string }
  | { type: 'focus'; items: CurrentFocusItem[]; evalId: string; learnerNote: string | null }
  | null;

/**
 * Resolves the staff member's current quarterly focus ProMove(s).
 * "Current" = focus rows tied to the evaluation with max(program_year, quarter)
 * among released evaluations for this staff member.
 *
 * Shared by CurrentFocusCard and FocusMoveValueCard (MOB-3) so both cards
 * read the same query/cache instead of diverging.
 */
export function useCurrentFocus(staffId: string | undefined) {
  return useQuery({
    queryKey: ['current-focus-card', staffId],
    queryFn: async (): Promise<CurrentFocusResult> => {
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

      const items: CurrentFocusItem[] = focusRows.map(row => {
        const pm = row.pro_moves as any;
        const domainName = pm?.competencies?.domains?.domain_name ?? '';
        return {
          actionId: row.action_id,
          statement: pm?.action_statement ?? '',
          domainName,
        };
      });

      return {
        type: 'focus' as const,
        items,
        evalId: newestEval.id,
        learnerNote: (newestEval as any).learner_note as string | null,
      };
    },
    enabled: !!staffId,
    staleTime: 1000 * 60 * 5,
  });
}
