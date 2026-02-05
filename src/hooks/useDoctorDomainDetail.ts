import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { getDomainIdFromSlug, getDomainNameFromSlug } from '@/lib/domainUtils';

export interface DoctorProMoveDetail {
  action_id: number;
  action_statement: string;
}

export interface DoctorCompetencyDetail {
  competency_id: number;
  code: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  proMoves: DoctorProMoveDetail[];
}

export interface DoctorDomainDetailData {
  domainName: string;
  domainId: number;
  competencies: DoctorCompetencyDetail[];
}

const DOCTOR_ROLE_ID = 4;

export function useDoctorDomainDetail(domainSlug: string) {
  const { data: staffProfile, isLoading: profileLoading } = useStaffProfile({
    redirectToSetup: false,
    showErrorToast: false
  });

  const domainId = getDomainIdFromSlug(domainSlug);
  const domainName = getDomainNameFromSlug(domainSlug) || '';

  return useQuery({
    queryKey: ['doctor-domain-detail', domainSlug, staffProfile?.id],
    queryFn: async (): Promise<DoctorDomainDetailData> => {
      if (!domainId) {
        return { domainName, domainId: 0, competencies: [] };
      }

      // 1. Fetch competencies for this domain and doctor role
      const { data: competencies, error: compError } = await supabase
        .from('competencies')
        .select('competency_id, code, name, tagline, friendly_description')
        .eq('domain_id', domainId)
        .eq('role_id', DOCTOR_ROLE_ID)
        .ilike('status', 'active')
        .order('competency_id');

      if (compError) throw compError;

      // 2. Fetch all pro moves for this domain's competencies
      const compIds = (competencies || []).map(c => c.competency_id);
      const proMovesByCompetency = new Map<number, DoctorProMoveDetail[]>();

      if (compIds.length > 0) {
        const { data: allProMoves } = await supabase
          .from('pro_moves')
          .select('action_id, action_statement, competency_id')
          .in('competency_id', compIds)
          .eq('active', true)
          .order('action_id');

        if (allProMoves) {
          for (const pm of allProMoves) {
            if (!pm.competency_id) continue;

            const proMoveDetail: DoctorProMoveDetail = {
              action_id: pm.action_id,
              action_statement: pm.action_statement || ''
            };

            const existing = proMovesByCompetency.get(pm.competency_id) || [];
            existing.push(proMoveDetail);
            proMovesByCompetency.set(pm.competency_id, existing);
          }
        }
      }

      // 3. Build the competency details (no scores - passive library)
      const competencyDetails: DoctorCompetencyDetail[] = (competencies || []).map(c => ({
        competency_id: c.competency_id,
        code: c.code || '',
        title: c.name || '',
        subtitle: c.tagline,
        description: (c as any).friendly_description || null,
        proMoves: proMovesByCompetency.get(c.competency_id) || []
      }));

      return {
        domainName,
        domainId: domainId || 0,
        competencies: competencyDetails
      };
    },
    enabled: !profileLoading && !!domainId
  });
}
