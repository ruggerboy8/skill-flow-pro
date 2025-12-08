import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { getDomainIdFromSlug, getDomainNameFromSlug } from '@/lib/domainUtils';

export interface CompetencyDetail {
  competency_id: number;
  code: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  observerScore: number | null;
  proMoveCount: number;
}

export interface DomainDetailData {
  domainName: string;
  domainId: number;
  competencies: CompetencyDetail[];
  averageScore: number | null;
}

export function useDomainDetail(domainSlug: string) {
  const { data: staffProfile, isLoading: profileLoading } = useStaffProfile({
    redirectToSetup: false,
    showErrorToast: false
  });

  const domainId = getDomainIdFromSlug(domainSlug);
  const domainName = getDomainNameFromSlug(domainSlug) || '';

  return useQuery({
    queryKey: ['domain-detail', domainSlug, staffProfile?.id, staffProfile?.role_id],
    queryFn: async (): Promise<DomainDetailData> => {
      if (!staffProfile?.id || !staffProfile?.role_id || !domainId) {
        return { domainName, domainId: domainId || 0, competencies: [], averageScore: null };
      }

      // 1. Fetch competencies for this domain and role
      const { data: competencies, error: compError } = await supabase
        .from('competencies')
        .select('competency_id, code, name, tagline, description')
        .eq('domain_id', domainId)
        .eq('role_id', staffProfile.role_id)
        .eq('status', 'Active')
        .order('competency_id');

      if (compError) throw compError;

      // 2. Get the user's most recent submitted evaluation
      const { data: evalData } = await supabase.rpc('get_evaluations_summary', {
        p_staff_id: staffProfile.id,
        p_only_submitted: true
      });

      // Find the most recent evaluation and extract scores by competency
      const competencyScores = new Map<number, number>();
      if (evalData && evalData.length > 0) {
        // Get the most recent evaluation
        const evalIds = [...new Set(evalData.map(r => r.eval_id))];
        let mostRecentEvalId: string | null = null;
        let mostRecentDate: Date | null = null;

        for (const row of evalData) {
          const dt = new Date(row.submitted_at);
          if (!mostRecentDate || dt > mostRecentDate) {
            mostRecentDate = dt;
            mostRecentEvalId = row.eval_id;
          }
        }

        if (mostRecentEvalId) {
          // Fetch detailed evaluation items for the most recent eval
          const { data: evalItems } = await supabase
            .from('evaluation_items')
            .select('competency_id, observer_score')
            .eq('evaluation_id', mostRecentEvalId);

          if (evalItems) {
            for (const item of evalItems) {
              if (item.observer_score != null) {
                competencyScores.set(item.competency_id, item.observer_score);
              }
            }
          }
        }
      }

      // 3. Get pro move counts per competency
      const compIds = (competencies || []).map(c => c.competency_id);
      const proMoveCounts = new Map<number, number>();

      if (compIds.length > 0) {
        const { data: proMoves } = await supabase
          .from('pro_moves')
          .select('competency_id')
          .in('competency_id', compIds)
          .eq('active', true);

        if (proMoves) {
          for (const pm of proMoves) {
            if (pm.competency_id) {
              proMoveCounts.set(pm.competency_id, (proMoveCounts.get(pm.competency_id) || 0) + 1);
            }
          }
        }
      }

      // 4. Build the competency details
      const competencyDetails: CompetencyDetail[] = (competencies || []).map(c => ({
        competency_id: c.competency_id,
        code: c.code || '',
        title: c.name || '',
        subtitle: c.tagline,
        description: c.description,
        observerScore: competencyScores.get(c.competency_id) ?? null,
        proMoveCount: proMoveCounts.get(c.competency_id) || 0
      }));

      // 5. Calculate average score for the domain
      const scores = competencyDetails.map(c => c.observerScore).filter((s): s is number => s !== null);
      const averageScore = scores.length > 0 
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null;

      return {
        domainName,
        domainId: domainId || 0,
        competencies: competencyDetails,
        averageScore
      };
    },
    enabled: !profileLoading && !!staffProfile?.id && !!domainId
  });
}
