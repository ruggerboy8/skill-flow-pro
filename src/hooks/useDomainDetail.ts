import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useLeadRoleId } from '@/hooks/useLeadRoleId';
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
  lastEvaluated: Date | null;
}

export function useDomainDetail(domainSlug: string) {
  const { data: staffProfile, isLoading: profileLoading } = useStaffProfile({
    redirectToSetup: false,
    showErrorToast: false
  });
  const { data: leadRoleId, isLoading: leadRoleLoading } = useLeadRoleId();

  const domainId = getDomainIdFromSlug(domainSlug);
  const domainName = getDomainNameFromSlug(domainSlug) || '';

  // Determine which role IDs to query competencies for
  const roleIds: number[] = [];
  if (staffProfile?.role_id) roleIds.push(staffProfile.role_id);
  if (staffProfile?.is_lead && leadRoleId && !roleIds.includes(leadRoleId)) {
    roleIds.push(leadRoleId);
  }

  return useQuery({
    queryKey: ['domain-detail', domainSlug, staffProfile?.id, roleIds],
    queryFn: async (): Promise<DomainDetailData> => {
      if (!staffProfile?.id || roleIds.length === 0 || !domainId) {
        return { domainName, domainId: domainId || 0, competencies: [], averageScore: null, lastEvaluated: null };
      }

      // 1. Fetch competencies for this domain and ALL applicable roles
      const { data: competencies, error: compError } = await supabase
        .from('competencies')
        .select('competency_id, name, tagline, friendly_description, role_id')
        .eq('domain_id', domainId)
        .in('role_id', roleIds)
        .eq('status', 'Active')
        .order('competency_id');

      if (compError) throw compError;

      // 2. Get the user's most recent submitted AND VISIBLE evaluation
      const { data: evalData } = await supabase.rpc('get_evaluations_summary', {
        p_staff_id: staffProfile.id,
        p_only_submitted: true
      });

      // Find the most recent VISIBLE evaluation and extract scores by competency
      const competencyScores = new Map<number, number>();
      let mostRecentDate: Date | null = null;
      let mostRecentEvalId: string | null = null;
      
      if (evalData && evalData.length > 0) {
        // Get visibility status for each evaluation
        const evalIds = [...new Set(evalData.map(r => r.eval_id))];
        const { data: evalsWithVisibility } = await supabase
          .from('evaluations')
          .select('id, is_visible_to_staff')
          .in('id', evalIds);
        
        const visibilityMap = new Map<string, boolean>();
        if (evalsWithVisibility) {
          evalsWithVisibility.forEach(e => visibilityMap.set(e.id, e.is_visible_to_staff));
        }

        // Find the most recent visible evaluation
        for (const row of evalData) {
          // Skip non-visible evaluations
          if (!visibilityMap.get(row.eval_id)) continue;
          
          const dt = new Date(row.submitted_at);
          if (!mostRecentDate || dt > mostRecentDate) {
            mostRecentDate = dt;
            mostRecentEvalId = row.eval_id;
          }
        }

        if (mostRecentEvalId) {
          // Fetch detailed evaluation items for the most recent visible eval
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

      // 6. Build the competency details. Leads merge in competencies from
      // their lead role (see roleIds above). The Lead Dental Assistant role
      // (role_id 11) carries 16 competencies but only 1 still has an active
      // pro move (leftovers from the retired lead panel). Rather than let
      // that surviving move sit in its own orphaned lead-role competency
      // card next to an identically-named, richer base-role card, merge
      // same-named competencies first (trimmed/case-insensitive): a
      // lead-role competency's pro moves fold into the base-role
      // competency of the same name (deduped by action_id), and the lead
      // copy is dropped. The base competency's id/description/observer
      // score win, since evaluations key off the base role's competency
      // ids. A lead competency with no base-role name match stays as its
      // own entry (lead-exclusive competencies are legitimate if they ever
      // carry moves). Only after merging do we drop any remaining
      // competency, base or lead, left with zero pro moves.
      const baseRoleId = staffProfile.role_id;
      const normalizeTitle = (s: string) => s.trim().toLowerCase();

      const rawCompetencies = (competencies || []).map(c => ({
        competency_id: c.competency_id,
        role_id: c.role_id,
        title: c.name || '',
        subtitle: c.tagline,
        description: (c as any).friendly_description || null,
        observerScore: competencyScores.get(c.competency_id) ?? null,
        proMoves: proMovesByCompetency.get(c.competency_id) || []
      }));

      const baseByName = new Map<string, (typeof rawCompetencies)[number]>();
      for (const c of rawCompetencies) {
        if (c.role_id === baseRoleId) baseByName.set(normalizeTitle(c.title), c);
      }

      const mergedAwayIds = new Set<number>();
      for (const c of rawCompetencies) {
        if (c.role_id === baseRoleId) continue; // only fold lead rows into base
        const match = baseByName.get(normalizeTitle(c.title));
        if (!match) continue; // lead-exclusive competency: keep as its own entry

        const existingActionIds = new Set(match.proMoves.map(pm => pm.action_id));
        for (const pm of c.proMoves) {
          if (!existingActionIds.has(pm.action_id)) {
            match.proMoves.push(pm);
            existingActionIds.add(pm.action_id);
          }
        }
        mergedAwayIds.add(c.competency_id);
      }

      const competencyDetails: CompetencyDetail[] = rawCompetencies
        .filter(c => !mergedAwayIds.has(c.competency_id))
        .filter(c => c.proMoves.length > 0)
        .map(({ role_id, ...rest }) => rest);

      // 7. Calculate average score for the domain
      const scores = competencyDetails.map(c => c.observerScore).filter((s): s is number => s !== null);
      const averageScore = scores.length > 0 
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null;

      return {
        domainName,
        domainId: domainId || 0,
        competencies: competencyDetails,
        averageScore,
        lastEvaluated: mostRecentDate
      };
    },
    enabled: !profileLoading && !leadRoleLoading && !!staffProfile?.id && !!domainId
  });
}
