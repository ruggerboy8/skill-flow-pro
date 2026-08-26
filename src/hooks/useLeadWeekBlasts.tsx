import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { toast } from '@/hooks/use-toast';
import type { LeadWeekBlastRow, NewLeadWeekBlastInput, UpdateLeadWeekBlastInput, LeadWeekBlastRecipient } from '@/types/leadWeekBlasts';

// Hand-typed table -- query through an untyped client per repo convention.
const sb = supabase as any;

const KEY = ['lead-week-blasts'];

/**
 * Ariyana's doctor-blast drafts and sends (director side, "Meetings and
 * Focus" tab, slot 3). Author-only via RLS -- nobody else, including super
 * admins, can read these rows (see the LRM-2 migration). One blast per
 * author per week, so this fetches everything and groups by week
 * client-side, the same shape as useLeadMeetings.
 */
export function useLeadWeekBlasts() {
  const qc = useQueryClient();
  const { data: staff } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const staffId = staff?.id ?? null;
  const orgId = staff?.organization_id ?? null;

  const blastsQuery = useQuery({
    queryKey: KEY,
    enabled: !!staffId,
    queryFn: async (): Promise<LeadWeekBlastRow[]> => {
      const { data, error } = await sb
        .from('lead_week_blasts')
        .select('*')
        .order('week_start_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as LeadWeekBlastRow[];
    },
  });

  const createBlast = useMutation({
    mutationFn: async (input: NewLeadWeekBlastInput) => {
      if (!staffId || !orgId) throw new Error('Missing staff profile');
      const { data, error } = await sb
        .from('lead_week_blasts')
        .insert({
          organization_id: orgId,
          created_by: staffId,
          week_start_date: input.weekStartDate,
          body: input.body,
          subject: input.subject,
        })
        .select()
        .single();
      if (error) throw error;
      return data as LeadWeekBlastRow;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: any) =>
      toast({ title: "Couldn't save the draft", description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  const updateBlastBody = useMutation({
    mutationFn: async ({ id, body, subject }: UpdateLeadWeekBlastInput) => {
      const { error } = await sb
        .from('lead_week_blasts')
        .update({ body, subject, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: any) =>
      toast({ title: "Couldn't save the draft", description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  /** Calls the lead-week-blast edge function's "draft" action. Does not write to the DB -- the caller saves the returned body/subject. */
  const generateDraft = useMutation({
    mutationFn: async (weekStartDate: string): Promise<{ body: string; subject: string }> => {
      const { data, error } = await supabase.functions.invoke('lead-week-blast', {
        body: { action: 'draft', week_start_date: weekStartDate },
      });
      if (error) throw error;
      const body = (data as any)?.body;
      if (!body) throw new Error('No draft produced');
      const subject = (data as any)?.subject ?? '';
      return { body, subject };
    },
    onError: (e: any) =>
      toast({ title: "Couldn't draft the blast", description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  /** Calls the lead-week-blast edge function's "recipients" action -- the review list's source of truth. */
  const fetchRecipients = useMutation({
    mutationFn: async (): Promise<LeadWeekBlastRecipient[]> => {
      const { data, error } = await supabase.functions.invoke('lead-week-blast', {
        body: { action: 'recipients' },
      });
      if (error) throw error;
      return ((data as any)?.recipients ?? []) as LeadWeekBlastRecipient[];
    },
    onError: (e: any) =>
      toast({ title: "Couldn't look up recipients", description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  /** Calls the lead-week-blast edge function's "send" action with the current exclusions, then refetches so the sent state reflects the server. */
  const sendBlast = useMutation({
    mutationFn: async ({ blastId, excludedStaffIds }: { blastId: string; excludedStaffIds: string[] }) => {
      const { data, error } = await supabase.functions.invoke('lead-week-blast', {
        body: { action: 'send', blast_id: blastId, excluded_staff_ids: excludedStaffIds },
      });
      if (error) throw error;
      return data as { sent: number; failed: number; recipient_count: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
    onError: (e: any) =>
      toast({ title: "Couldn't send the blast", description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  /** Calls the lead-week-blast edge function's "test_send" action -- one copy to the caller's own email, repeatable. */
  const testSendBlast = useMutation({
    mutationFn: async (blastId: string): Promise<{ email: string }> => {
      const { data, error } = await supabase.functions.invoke('lead-week-blast', {
        body: { action: 'test_send', blast_id: blastId },
      });
      if (error) throw error;
      const email = (data as any)?.email;
      if (!email) throw new Error('Test send did not return a destination email');
      return { email };
    },
    onError: (e: any) =>
      toast({ title: "Couldn't send the test", description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  return {
    blasts: blastsQuery.data ?? [],
    isLoading: blastsQuery.isLoading,
    staffId,
    orgId,
    createBlast,
    updateBlastBody,
    generateDraft,
    fetchRecipients,
    sendBlast,
    testSendBlast,
  };
}
