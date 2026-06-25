import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SurveyRow, SurveyQuestionRow } from '@/integrations/supabase/surveyTypes';
import type { AnswerRecord, ResponseRecord } from '@/lib/surveyResults';

const sb = supabase as any;

export interface SurveyResults {
  survey: SurveyRow;
  questions: SurveyQuestionRow[];
  assignedCount: number;
  completedCount: number;
  responses: ResponseRecord[];
  answers: AnswerRecord[];
  staffNames: Map<string, string>;
}

export function useSurveyResults(surveyId: string | undefined) {
  return useQuery({
    queryKey: ['survey-results', surveyId],
    enabled: !!surveyId,
    queryFn: async (): Promise<SurveyResults> => {
      const { data: survey, error } = await sb.from('surveys').select('*').eq('id', surveyId).single();
      if (error) throw error;

      const { data: questions } = await sb
        .from('survey_questions')
        .select('*')
        .eq('survey_id', surveyId)
        .order('position', { ascending: true });

      const { data: assignments } = await sb
        .from('survey_assignments')
        .select('status')
        .eq('survey_id', surveyId);
      const aRows = (assignments ?? []) as { status: string }[];

      const { data: responses } = await sb
        .from('survey_responses')
        .select('id, staff_id, submitted_at')
        .eq('survey_id', surveyId);
      const rRows = (responses ?? []) as ResponseRecord[];

      const responseIds = rRows.map((r) => r.id);
      let ansRows: AnswerRecord[] = [];
      if (responseIds.length) {
        const { data: answers } = await sb
          .from('survey_answers')
          .select('response_id, question_id, value')
          .in('response_id', responseIds);
        ansRows = (answers ?? []) as AnswerRecord[];
      }

      // Names only needed for attributed surveys.
      const staffNames = new Map<string, string>();
      const staffIds = [...new Set(rRows.map((r) => r.staff_id).filter(Boolean))] as string[];
      if (!survey.is_anonymous && staffIds.length) {
        const { data: staff } = await sb.from('staff').select('id, name').in('id', staffIds);
        for (const s of (staff ?? []) as { id: string; name: string }[]) staffNames.set(s.id, s.name);
      }

      return {
        survey: survey as SurveyRow,
        questions: (questions ?? []) as SurveyQuestionRow[],
        assignedCount: aRows.length,
        completedCount: aRows.filter((a) => a.status === 'completed').length,
        responses: rRows,
        answers: ansRows,
        staffNames,
      };
    },
  });
}
