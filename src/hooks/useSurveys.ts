import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import type {
  SurveyRow,
  SurveyQuestionRow,
  SurveyAssignmentRow,
} from '@/integrations/supabase/surveyTypes';

// The survey_* tables are not in the generated Database type (see surveyTypes.ts),
// so queries cast through `any` at the client boundary, then back to our types.
const sb = supabase as any;

export interface SurveyWithCounts extends SurveyRow {
  assigned_count: number;
  completed_count: number;
}

/** All surveys for the current admin's org, with completion counts. */
export function useSurveyList() {
  return useQuery({
    queryKey: ['surveys', 'list'],
    queryFn: async (): Promise<SurveyWithCounts[]> => {
      const { data: surveys, error } = await sb
        .from('surveys')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;

      const rows = (surveys ?? []) as SurveyRow[];
      const ids = rows.map((s) => s.id);
      const counts = new Map<string, { assigned: number; completed: number }>();

      if (ids.length) {
        const { data: assignments } = await sb
          .from('survey_assignments')
          .select('survey_id, status')
          .in('survey_id', ids);
        for (const a of (assignments ?? []) as Pick<SurveyAssignmentRow, 'survey_id' | 'status'>[]) {
          const c = counts.get(a.survey_id) ?? { assigned: 0, completed: 0 };
          c.assigned += 1;
          if (a.status === 'completed') c.completed += 1;
          counts.set(a.survey_id, c);
        }
      }

      return rows.map((s) => ({
        ...s,
        assigned_count: counts.get(s.id)?.assigned ?? 0,
        completed_count: counts.get(s.id)?.completed ?? 0,
      }));
    },
  });
}

export interface SurveyDetail {
  survey: SurveyRow;
  questions: SurveyQuestionRow[];
}

/** A single survey plus its ordered questions. */
export function useSurvey(surveyId: string | undefined) {
  return useQuery({
    queryKey: ['surveys', 'detail', surveyId],
    enabled: !!surveyId,
    queryFn: async (): Promise<SurveyDetail> => {
      const { data: survey, error } = await sb
        .from('surveys')
        .select('*')
        .eq('id', surveyId)
        .single();
      if (error) throw error;

      const { data: questions, error: qErr } = await sb
        .from('survey_questions')
        .select('*')
        .eq('survey_id', surveyId)
        .order('position', { ascending: true });
      if (qErr) throw qErr;

      return {
        survey: survey as SurveyRow,
        questions: (questions ?? []) as SurveyQuestionRow[],
      };
    },
  });
}

export interface DraftQuestion {
  id?: string; // present when editing an existing row
  type: SurveyQuestionRow['type'];
  prompt: string;
  required: boolean;
  config: SurveyQuestionRow['config'];
}

export interface SurveyDraftInput {
  title: string;
  description: string | null;
  is_anonymous: boolean;
  opens_at: string | null;
  closes_at: string | null;
  target_location_ids: string[];
  target_role_ids: number[];
  questions: DraftQuestion[];
}

export function useSurveyMutations() {
  const qc = useQueryClient();
  const { organizationId, staffId } = useUserRole();

  const invalidate = (surveyId?: string) => {
    qc.invalidateQueries({ queryKey: ['surveys', 'list'] });
    if (surveyId) qc.invalidateQueries({ queryKey: ['surveys', 'detail', surveyId] });
  };

  /** Create a draft survey and return its id. */
  const createDraft = useMutation({
    mutationFn: async (input: SurveyDraftInput): Promise<string> => {
      const { data: survey, error } = await sb
        .from('surveys')
        .insert({
          organization_id: organizationId,
          created_by: staffId ?? null,
          title: input.title,
          description: input.description,
          is_anonymous: input.is_anonymous,
          opens_at: input.opens_at,
          closes_at: input.closes_at,
          target_location_ids: input.target_location_ids,
          target_role_ids: input.target_role_ids,
        })
        .select('id')
        .single();
      if (error) throw error;
      const surveyId = (survey as { id: string }).id;
      await replaceQuestions(surveyId, input.questions);
      invalidate(surveyId);
      return surveyId;
    },
  });

  /** Save edits to a draft survey (questions are replaced wholesale). */
  const saveDraft = useMutation({
    mutationFn: async ({ surveyId, input }: { surveyId: string; input: SurveyDraftInput }) => {
      const { error } = await sb
        .from('surveys')
        .update({
          title: input.title,
          description: input.description,
          is_anonymous: input.is_anonymous,
          opens_at: input.opens_at,
          closes_at: input.closes_at,
          target_location_ids: input.target_location_ids,
          target_role_ids: input.target_role_ids,
        })
        .eq('id', surveyId);
      if (error) throw error;
      await replaceQuestions(surveyId, input.questions);
      invalidate(surveyId);
    },
  });

  /** Snapshot recipients and open the survey. */
  const publish = useMutation({
    mutationFn: async (surveyId: string) => {
      const { error } = await sb.rpc('publish_survey', { p_survey_id: surveyId });
      if (error) throw error;
      invalidate(surveyId);
    },
  });

  /** Close a survey early. */
  const close = useMutation({
    mutationFn: async (surveyId: string) => {
      const { error } = await sb
        .from('surveys')
        .update({ status: 'closed', closed_at: new Date().toISOString() })
        .eq('id', surveyId);
      if (error) throw error;
      invalidate(surveyId);
    },
  });

  /** Delete a draft survey. */
  const remove = useMutation({
    mutationFn: async (surveyId: string) => {
      const { error } = await sb.from('surveys').delete().eq('id', surveyId);
      if (error) throw error;
      invalidate(surveyId);
    },
  });

  /** Duplicate a survey into a fresh editable draft. Returns the new id. */
  const duplicate = useMutation({
    mutationFn: async (surveyId: string): Promise<string> => {
      const { data: src, error } = await sb.from('surveys').select('*').eq('id', surveyId).single();
      if (error) throw error;
      const s = src as SurveyRow;
      const { data: created, error: cErr } = await sb
        .from('surveys')
        .insert({
          organization_id: s.organization_id,
          created_by: staffId ?? null,
          title: `${s.title} (copy)`,
          description: s.description,
          is_anonymous: s.is_anonymous,
          target_location_ids: s.target_location_ids,
          target_role_ids: s.target_role_ids,
        })
        .select('id')
        .single();
      if (cErr) throw cErr;
      const newId = (created as { id: string }).id;

      const { data: questions } = await sb
        .from('survey_questions')
        .select('*')
        .eq('survey_id', surveyId)
        .order('position', { ascending: true });
      const qRows = (questions ?? []) as SurveyQuestionRow[];
      if (qRows.length) {
        const { error: insErr } = await sb.from('survey_questions').insert(
          qRows.map((q, i) => ({
            survey_id: newId,
            position: i,
            type: q.type,
            prompt: q.prompt,
            required: q.required,
            config: { ...q.config },
          })),
        );
        if (insErr) throw insErr;
      }
      invalidate(newId);
      return newId;
    },
  });

  return { createDraft, saveDraft, publish, close, remove, duplicate };
}

/** Replace all questions for a survey with the given drafts (delete + insert). */
async function replaceQuestions(surveyId: string, questions: DraftQuestion[]) {
  const { error: delErr } = await sb.from('survey_questions').delete().eq('survey_id', surveyId);
  if (delErr) throw delErr;
  if (!questions.length) return;
  const { error: insErr } = await sb.from('survey_questions').insert(
    questions.map((q, i) => ({
      survey_id: surveyId,
      position: i,
      type: q.type,
      prompt: q.prompt,
      required: q.required,
      config: q.config,
    })),
  );
  if (insErr) throw insErr;
}
