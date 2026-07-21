import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { getChicagoMonday } from '@/lib/plannerUtils';
import { toast } from '@/hooks/use-toast';
import type {
  HydratedFocusWeek, HydratedFocusItem, FocusOutcome, PublishFocusItem,
} from '@/types/leadFocus';

// Hand-typed tables — query through an untyped client per repo convention.
const sb = supabase as any;

/** Outcome shown in the record is derived from the sourcing issue, never stored. */
function deriveOutcome(issue: any): FocusOutcome {
  if (!issue) return 'pending';
  if (issue.status === 'retired' && issue.retired_outcome) return issue.retired_outcome as FocusOutcome;
  return 'pending';
}

function hydrateWeek(row: any): HydratedFocusWeek {
  const items: HydratedFocusItem[] = (row.lead_focus_items ?? [])
    .slice()
    .sort((a: any, b: any) => a.display_order - b.display_order)
    .map((it: any) => ({
      id: it.id,
      display_order: it.display_order,
      text: it.text,
      source_issue_id: it.source_issue_id,
      sourceIssueTitle: it.coaching_issues?.title ?? null,
      outcome: deriveOutcome(it.coaching_issues),
    }));
  return { ...row, items };
}

const KEY = ['lead-focus-weeks'];

/**
 * Ariyana's lead-focus data layer (director side). Weeks are author-scoped via RLS;
 * the /training surface itself is gated in the router. Publishing runs the atomic
 * publish_lead_focus_week RPC, which also advances sourcing issues to Communicated.
 */
export function useLeadFocus() {
  const qc = useQueryClient();
  const { data: staff } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const staffId = staff?.id ?? null;
  const orgId = staff?.organization_id ?? null;

  const weeksQuery = useQuery({
    queryKey: KEY,
    enabled: !!staffId,
    queryFn: async (): Promise<HydratedFocusWeek[]> => {
      const { data, error } = await sb
        .from('lead_focus_weeks')
        .select('*, lead_focus_items(*, coaching_issues:source_issue_id(id,title,status,retired_outcome,stage))')
        .order('week_start_date', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(hydrateWeek);
    },
  });

  const publishWeek = useMutation({
    mutationFn: async (input: { weekStart: string; framing: string; items: PublishFocusItem[] }) => {
      const { data, error } = await sb.rpc('publish_lead_focus_week', {
        p_week_start: input.weekStart,
        p_framing: input.framing ?? '',
        p_items: input.items,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      // sourcing issues moved to Communicated — refresh the workspace + its timeline
      qc.invalidateQueries({ queryKey: ['coaching-workspace-issues'] });
      qc.invalidateQueries({ queryKey: ['issue-events'] });
    },
    onError: (e: any) =>
      toast({ title: "Couldn't publish the focus", description: e?.message ?? 'Please try again.', variant: 'destructive' }),
  });

  return {
    weeks: weeksQuery.data ?? [],
    isLoading: weeksQuery.isLoading,
    staffId,
    orgId,
    currentMonday: getChicagoMonday(),
    publishWeek,
  };
}

/**
 * Lead-home read: the current week's published focus for the caller's org. Returns
 * null when Ariyana hasn't set this week yet. RLS gate: leads can read published weeks.
 */
export function useLeadFocusForLead(isLead: boolean | undefined) {
  return useQuery({
    queryKey: ['lead-focus-current', getChicagoMonday()],
    enabled: !!isLead,
    queryFn: async (): Promise<HydratedFocusWeek | null> => {
      const monday = getChicagoMonday();
      const { data, error } = await sb
        .from('lead_focus_weeks')
        .select('*, lead_focus_items(*)')
        .eq('status', 'published')
        .eq('week_start_date', monday)
        .limit(1);
      if (error) throw error;
      const row = (data ?? [])[0];
      return row ? hydrateWeek(row) : null;
    },
  });
}
