import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Live doctor-coach mentee list for a coach.
 *
 * The staff profile caches mentee assignments for 5 minutes, so a coach kept
 * seeing doctors that a clinical director had just un-assigned. Any surface
 * that gates content on assignments should read them fresh from here.
 */
export function useDoctorMenteeIds(coachStaffId?: string | null) {
  return useQuery({
    queryKey: ['doctor-mentee-ids', coachStaffId],
    queryFn: async (): Promise<string[]> => {
      if (!coachStaffId) return [];
      const { data, error } = await supabase
        .from('doctor_coach_assignments')
        .select('doctor_staff_id')
        .eq('coach_staff_id', coachStaffId);
      if (error) throw error;
      return (data ?? []).map((row: any) => row.doctor_staff_id as string);
    },
    enabled: !!coachStaffId,
    staleTime: 0,
    refetchOnMount: 'always',
  });
}
