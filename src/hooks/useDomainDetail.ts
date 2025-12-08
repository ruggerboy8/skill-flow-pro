import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { getDomainIdFromSlug, getDomainNameFromSlug } from '@/lib/domainUtils';
import { format, parseISO } from 'date-fns';

export interface ProMoveDetail {
  action_id: number;
  action_statement: string;
  lastPracticed: string | null; // Formatted date string or null
  avgConfidence: number | null; // 1-4 scale average or null
}

export interface CompetencyDetail {
  competency_id: number;
  code: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  observerScore: number | null;
  proMoves: ProMoveDetail[];
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
        .select('competency_id, code, name, tagline, friendly_description')
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

      // 3. Fetch all pro moves for this domain's competencies
      const compIds = (competencies || []).map(c => c.competency_id);
      const proMovesByCompetency = new Map<number, ProMoveDetail[]>();

      if (compIds.length > 0) {
        const { data: allProMoves } = await supabase
          .from('pro_moves')
          .select('action_id, action_statement, competency_id')
          .in('competency_id', compIds)
          .eq('active', true);

        // 4. Fetch user's weekly scores history (all-time)
        const { data: userScores } = await supabase
          .from('weekly_scores')
          .select('confidence_score, week_of, site_action_id, selected_action_id')
          .eq('staff_id', staffProfile.id)
          .not('confidence_score', 'is', null);

        // 5. Calculate stats for each pro move
        if (allProMoves) {
          for (const pm of allProMoves) {
            if (!pm.competency_id) continue;

            // Find matching scores for this pro move
            const matchingScores = (userScores || []).filter(
              s => s.site_action_id === pm.action_id || s.selected_action_id === pm.action_id
            );

            let lastPracticed: string | null = null;
            let avgConfidence: number | null = null;

            if (matchingScores.length > 0) {
              // Calculate average confidence
              const confScores = matchingScores
                .map(s => s.confidence_score)
                .filter((s): s is number => s !== null);
              
              if (confScores.length > 0) {
                avgConfidence = confScores.reduce((a, b) => a + b, 0) / confScores.length;
              }

              // Find most recent week_of
              const sortedByDate = matchingScores
                .filter(s => s.week_of)
                .sort((a, b) => new Date(b.week_of!).getTime() - new Date(a.week_of!).getTime());
              
              if (sortedByDate.length > 0 && sortedByDate[0].week_of) {
                lastPracticed = format(parseISO(sortedByDate[0].week_of), 'MMM d, yyyy');
              }
            }

            const proMoveDetail: ProMoveDetail = {
              action_id: pm.action_id,
              action_statement: pm.action_statement || '',
              lastPracticed,
              avgConfidence
            };

            const existing = proMovesByCompetency.get(pm.competency_id) || [];
            existing.push(proMoveDetail);
            proMovesByCompetency.set(pm.competency_id, existing);
          }
        }
      }

      // 6. Build the competency details
      const competencyDetails: CompetencyDetail[] = (competencies || []).map(c => ({
        competency_id: c.competency_id,
        code: c.code || '',
        title: c.name || '',
        subtitle: c.tagline,
        description: (c as any).friendly_description || null,
        observerScore: competencyScores.get(c.competency_id) ?? null,
        proMoves: proMovesByCompetency.get(c.competency_id) || []
      }));

      // 7. Calculate average score for the domain
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
