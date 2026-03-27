import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';

/**
 * For staff with is_lead === true, resolves the lead_dental_assistant role_id
 * for their organization's practice_type. Returns null for non-lead staff.
 */
export function useLeadRoleId() {
  const { data: staff } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });

  const practiceType = staff?.locations?.practice_groups?.organizations?.practice_type;
  const isLead = staff?.is_lead === true;

  return useQuery({
    queryKey: ['lead-role-id', practiceType],
    queryFn: async () => {
      const { data } = await supabase
        .from('roles')
        .select('role_id')
        .eq('archetype_code', 'lead_dental_assistant')
        .eq('practice_type', practiceType!)
        .eq('active', true)
        .maybeSingle();
      return data?.role_id ?? null;
    },
    enabled: isLead && !!practiceType,
    staleTime: 30 * 60 * 1000, // Cache 30 min — roles rarely change
  });
}
