import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import type {
  CoachingIssue, CoachingIssueEvent, CoachingIssueRow, IssueStage, RetireOutcome, SourceType,
} from '@/types/coachingWorkspace';

// These tables are hand-typed (Lovable owns the generated types.ts), so query
// through an untyped client per the repo convention (see the survey_* tables).
const sb = supabase as any;

const KEY = ['coaching-workspace-issues'];

function hydrate(rows: any[]): CoachingIssue[] {
  return (rows ?? []).map((r) => ({
    ...(r as CoachingIssueRow),
    locationIds: (r.coaching_issue_locations ?? []).map((l: any) => l.location_id),
    sources: (r.coaching_issue_sources ?? []).map((s: any) => s.source_type as SourceType),
  }));
}

export interface NewIssueInput {
  title: string;
  detail?: string;
  isGlobal: boolean;
  locationIds: string[];
  sources: SourceType[];
}

/**
 * Ariyana's Coaching Workspace data layer. Per-owner via RLS (the surface itself is
 * super-admin gated in the router/nav). Every mutation also writes a
 * coaching_issue_events row so the issue timeline builds itself.
 */
export function useCoachingWorkspace() {
  const qc = useQueryClient();
  const { data: staff } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const staffId = staff?.id ?? null;
  const orgId = staff?.organization_id ?? null;

  const activeQuery = useQuery({
    queryKey: [...KEY, 'active'],
    enabled: !!staffId,
    queryFn: async (): Promise<CoachingIssue[]> => {
      const { data, error } = await sb
        .from('coaching_issues')
        .select('*, coaching_issue_locations(location_id), coaching_issue_sources(source_type)')
        .eq('status', 'active')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return hydrate(data as any[]);
    },
  });

  const archiveQuery = useQuery({
    queryKey: [...KEY, 'archive'],
    enabled: !!staffId,
    queryFn: async (): Promise<CoachingIssue[]> => {
      const { data, error } = await sb
        .from('coaching_issues')
        .select('*, coaching_issue_locations(location_id), coaching_issue_sources(source_type)')
        .eq('status', 'retired')
        .order('retired_at', { ascending: false });
      if (error) throw error;
      return hydrate(data as any[]);
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: KEY });

  const logEvent = async (issueId: string, kind: CoachingIssueEvent['kind'], body?: string) => {
    await sb.from('coaching_issue_events').insert({
      issue_id: issueId, kind, body: body ?? null, by_staff: staffId,
    } as any);
  };

  const createIssue = useMutation({
    mutationFn: async (input: NewIssueInput) => {
      const { data: issue, error } = await sb
        .from('coaching_issues')
        .insert({
          created_by: staffId, organization_id: orgId,
          title: input.title, detail: input.detail || null, is_global: input.isGlobal,
        } as any)
        .select('id')
        .single();
      if (error) throw error;
      const id = (issue as any).id as string;
      if (input.locationIds.length) {
        await sb.from('coaching_issue_locations').insert(
          input.locationIds.map((location_id) => ({ issue_id: id, location_id })) as any,
        );
      }
      if (input.sources.length) {
        await sb.from('coaching_issue_sources').insert(
          input.sources.map((source_type) => ({ issue_id: id, source_type })) as any,
        );
      }
      await logEvent(id, 'created', 'Added to workspace');
      return id;
    },
    onSuccess: invalidate,
  });

  const setStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: IssueStage }) => {
      const { error } = await sb.from('coaching_issues')
        .update({ stage, updated_at: new Date().toISOString() } as any).eq('id', id);
      if (error) throw error;
      await logEvent(id, 'stage_change', `Next step now: ${stage}`);
    },
    onSuccess: invalidate,
  });

  const addNote = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: string }) => {
      await logEvent(id, 'note', body);
    },
    onSuccess: invalidate,
  });

  const setPrivateNote = useMutation({
    mutationFn: async ({ id, note }: { id: string; note: string }) => {
      const { error } = await sb.from('coaching_issues')
        .update({ private_note: note } as any).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const retire = useMutation({
    mutationFn: async ({ id, outcome, note }: { id: string; outcome: RetireOutcome; note?: string }) => {
      const { error } = await sb.from('coaching_issues')
        .update({ status: 'retired', retired_outcome: outcome, retired_note: note || null, retired_at: new Date().toISOString() } as any)
        .eq('id', id);
      if (error) throw error;
      await logEvent(id, 'retired', note ? `Retired (${outcome}): ${note}` : `Retired (${outcome})`);
    },
    onSuccess: invalidate,
  });

  const reopen = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await sb.from('coaching_issues')
        .update({ status: 'active', stage: 'identified', retired_outcome: null, retired_at: null } as any)
        .eq('id', id);
      if (error) throw error;
      await logEvent(id, 'reopened', 'Reopened — hitting it again');
    },
    onSuccess: invalidate,
  });

  return {
    issues: activeQuery.data ?? [],
    archived: archiveQuery.data ?? [],
    isLoading: activeQuery.isLoading,
    staffId,
    createIssue, setStage, addNote, setPrivateNote, retire, reopen,
  };
}

export async function fetchIssueEvents(issueId: string): Promise<CoachingIssueEvent[]> {
  const { data, error } = await sb
    .from('coaching_issue_events')
    .select('*')
    .eq('issue_id', issueId)
    .order('at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CoachingIssueEvent[];
}
