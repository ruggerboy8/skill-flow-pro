import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { toast } from '@/hooks/use-toast';
import type { LeadMeetingRow, NewLeadMeetingInput, UpdateLeadMeetingInput } from '@/types/leadMeetings';

// Hand-typed table -- query through an untyped client per repo convention.
const sb = supabase as any;

const KEY = ['lead-meetings'];

/**
 * Ariyana's lead-meeting records (director side, "Meetings and Focus" tab).
 * Author-only via RLS -- nobody else, including super admins, can read these
 * rows (see the LRM-1 migration). Multiple meetings per week are allowed but
 * not expected, so this fetches everything and groups by week client-side,
 * the same shape as useLeadFocus.
 */
export function useLeadMeetings() {
  const qc = useQueryClient();
  const { data: staff } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const staffId = staff?.id ?? null;
  const orgId = staff?.organization_id ?? null;

  const meetingsQuery = useQuery({
    queryKey: KEY,
    enabled: !!staffId,
    queryFn: async (): Promise<LeadMeetingRow[]> => {
      const { data, error } = await sb
        .from('lead_meetings')
        .select('*')
        .order('meeting_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeadMeetingRow[];
    },
  });

  const createMeeting = useMutation({
    mutationFn: async (input: NewLeadMeetingInput) => {
      if (!staffId || !orgId) throw new Error('Missing staff profile');
      const { data, error } = await sb
        .from('lead_meetings')
        .insert({
          organization_id: orgId,
          created_by: staffId,
          meeting_date: input.meetingDate,
          week_start_date: input.weekStartDate,
          raw_transcript: input.rawTranscript || null,
          internal_summary: input.internalSummary || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as LeadMeetingRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: any) =>
      toast({ title: "Couldn't save the meeting", description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  const updateMeeting = useMutation({
    mutationFn: async ({ id, internalSummary }: UpdateLeadMeetingInput) => {
      const { error } = await sb
        .from('lead_meetings')
        .update({ internal_summary: internalSummary, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: any) =>
      toast({ title: "Couldn't save the summary", description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  return {
    meetings: meetingsQuery.data ?? [],
    isLoading: meetingsQuery.isLoading,
    staffId,
    orgId,
    createMeeting,
    updateMeeting,
  };
}
