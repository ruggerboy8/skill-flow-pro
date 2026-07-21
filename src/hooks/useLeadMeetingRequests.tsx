import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { toast } from '@/hooks/use-toast';
import type { LeadMeetingRequest } from '@/types/leadFocus';

const sb = supabase as any;

export interface LeadOption { id: string; name: string }

/**
 * Director side: the leads she can nudge, the nudges she has sent (with sent →
 * opened → booked status), and the send action (which emails the lead + records
 * the in-app request via the lead-request-meeting edge function).
 */
export function useLeadMeetingRequests() {
  const qc = useQueryClient();
  const { data: staff } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const staffId = staff?.id ?? null;
  const orgId = staff?.organization_id ?? null;

  const leadsQuery = useQuery({
    queryKey: ['org-leads', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<LeadOption[]> => {
      const { data, error } = await supabase
        .from('staff')
        .select('id, name')
        .eq('is_lead', true)
        .eq('organization_id', orgId)
        .order('name');
      if (error) throw error;
      return (data ?? []) as LeadOption[];
    },
  });

  const sentQuery = useQuery({
    queryKey: ['lead-meeting-requests', 'sent', staffId],
    enabled: !!staffId,
    queryFn: async (): Promise<LeadMeetingRequest[]> => {
      const { data, error } = await sb
        .from('lead_meeting_requests')
        .select('*')
        .eq('created_by', staffId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeadMeetingRequest[];
    },
  });

  const sendRequest = useMutation({
    mutationFn: async (input: { leadStaffId: string; note: string }) => {
      const { data, error } = await supabase.functions.invoke('lead-request-meeting', {
        body: { lead_staff_id: input.leadStaffId, note: input.note },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-meeting-requests'] }),
    onError: (e: any) =>
      toast({ title: "Couldn't send the nudge", description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  return {
    leads: leadsQuery.data ?? [],
    sent: sentQuery.data ?? [],
    isLoading: sentQuery.isLoading,
    sendRequest,
  };
}

/**
 * Lead side (home): the latest open request from the director, plus mark-opened
 * (fires when the card renders, so the director sees "opened") and mark-booked
 * (when the lead taps through to the booking link).
 */
export function useLeadIncomingRequest(staffId: string | null | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['lead-incoming-request', staffId],
    enabled: !!staffId,
    queryFn: async (): Promise<LeadMeetingRequest | null> => {
      const { data, error } = await sb
        .from('lead_meeting_requests')
        .select('*')
        .eq('lead_staff_id', staffId)
        .neq('status', 'booked')
        .order('created_at', { ascending: false })
        .limit(1);
      if (error) throw error;
      return ((data ?? [])[0] ?? null) as LeadMeetingRequest | null;
    },
  });

  const markOpened = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from('lead_meeting_requests')
        .update({ status: 'opened', opened_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', 'sent'); // only the first view flips sent → opened
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-incoming-request'] }),
  });

  const markBooked = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb
        .from('lead_meeting_requests')
        .update({ status: 'booked', booked_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['lead-incoming-request'] }),
  });

  return { request: query.data ?? null, markOpened, markBooked };
}
