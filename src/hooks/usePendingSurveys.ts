import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useUserRole } from '@/hooks/useUserRole';
import type {
  SurveyRow,
  SurveyQuestionRow,
  SurveyAnswerInput,
} from '@/integrations/supabase/surveyTypes';

const sb = supabase as any;

/** True when an open survey is currently within its [opens_at, closes_at] window. */
function isWithinWindow(s: Pick<SurveyRow, 'status' | 'opens_at' | 'closes_at'>): boolean {
  if (s.status !== 'open') return false;
  const now = Date.now();
  if (s.opens_at && new Date(s.opens_at).getTime() > now) return false;
  if (s.closes_at && new Date(s.closes_at).getTime() < now) return false;
  return true;
}

export interface PendingSurvey {
  assignmentId: string;
  survey: SurveyRow;
}

/** Surveys assigned to the current staff member that are pending and open now. */
export function usePendingSurveys() {
  const { staffId } = useUserRole();
  return useQuery({
    queryKey: ['pending-surveys', staffId],
    enabled: !!staffId,
    // Re-check on focus so the card clears promptly after completing elsewhere.
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<PendingSurvey[]> => {
      const { data, error } = await sb
        .from('survey_assignments')
        .select('id, status, survey:surveys!inner(*)')
        .eq('staff_id', staffId)
        .eq('status', 'pending');
      if (error) throw error;
      return ((data ?? []) as { id: string; survey: SurveyRow }[])
        .filter((row) => row.survey && isWithinWindow(row.survey))
        .map((row) => ({ assignmentId: row.id, survey: row.survey }));
    },
  });
}

export interface SurveyForTaking {
  survey: SurveyRow;
  questions: SurveyQuestionRow[];
  alreadyCompleted: boolean;
}

/** Loads a survey + questions for a staff member to take. */
export function useSurveyForTaking(surveyId: string | undefined) {
  const { staffId } = useUserRole();
  return useQuery({
    queryKey: ['survey-taking', surveyId, staffId],
    enabled: !!surveyId && !!staffId,
    queryFn: async (): Promise<SurveyForTaking> => {
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

      const { data: assignment } = await sb
        .from('survey_assignments')
        .select('status')
        .eq('survey_id', surveyId)
        .eq('staff_id', staffId)
        .maybeSingle();

      return {
        survey: survey as SurveyRow,
        questions: (questions ?? []) as SurveyQuestionRow[],
        alreadyCompleted: (assignment as { status?: string } | null)?.status === 'completed',
      };
    },
  });
}

export function useSubmitSurvey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      surveyId,
      answers,
    }: {
      surveyId: string;
      answers: SurveyAnswerInput[];
    }) => {
      const { error } = await sb.rpc('submit_survey', {
        p_survey_id: surveyId,
        p_answers: answers,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-surveys'] });
    },
  });
}
