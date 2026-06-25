import type {
  SurveyQuestionRow,
  SurveyAnswerValue,
} from '@/integrations/supabase/surveyTypes';

// Below this many responses, anonymous surveys show only the response count —
// not per-question breakdowns — so a small targeted group can't be
// reverse-identified from "anonymous" aggregates.
export const SURVEY_MIN_ANON_N = 4;

export interface AnswerRecord {
  response_id: string;
  question_id: string;
  value: SurveyAnswerValue;
}

export interface ResponseRecord {
  id: string;
  staff_id: string | null;
  submitted_at: string;
}

export interface ChoiceTally {
  option: string;
  count: number;
  pct: number; // share of responses that have any answer to this question
}

export interface QuestionSummary {
  question: SurveyQuestionRow;
  answered: number;
  // choice questions
  choices?: ChoiceTally[];
  // rating questions
  average?: number | null;
  distribution?: { value: number; count: number }[];
  nps?: number | null;
  // free text
  texts?: string[];
}

function asArray(v: SurveyAnswerValue): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (v === null || v === undefined || v === '') return [];
  return [String(v)];
}

/** Summarize answers for one question. */
export function summarizeQuestion(
  question: SurveyQuestionRow,
  answers: AnswerRecord[],
): QuestionSummary {
  const mine = answers.filter((a) => a.question_id === question.id);

  if (question.type === 'single_choice' || question.type === 'multi_choice') {
    const opts = question.config.choices ?? [];
    const tally = new Map<string, number>(opts.map((o) => [o, 0]));
    let answered = 0;
    for (const a of mine) {
      const selected = asArray(a.value);
      if (selected.length) answered += 1;
      for (const s of selected) tally.set(s, (tally.get(s) ?? 0) + 1);
    }
    const choices: ChoiceTally[] = [...tally.entries()].map(([option, count]) => ({
      option,
      count,
      pct: answered ? Math.round((count / answered) * 100) : 0,
    }));
    return { question, answered, choices };
  }

  if (question.type === 'rating') {
    const nums = mine
      .map((a) => (typeof a.value === 'number' ? a.value : Number(a.value)))
      .filter((n) => Number.isFinite(n)) as number[];
    const answered = nums.length;
    const average = answered ? nums.reduce((s, n) => s + n, 0) / answered : null;
    const distMap = new Map<number, number>();
    for (const n of nums) distMap.set(n, (distMap.get(n) ?? 0) + 1);
    const distribution = [...distMap.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => a.value - b.value);

    // NPS only meaningful on a 0..10 scale.
    let nps: number | null = null;
    if (question.config.min === 0 && question.config.max === 10 && answered) {
      const promoters = nums.filter((n) => n >= 9).length;
      const detractors = nums.filter((n) => n <= 6).length;
      nps = Math.round(((promoters - detractors) / answered) * 100);
    }
    return { question, answered, average, distribution, nps };
  }

  // free_text
  const texts = mine
    .map((a) => (typeof a.value === 'string' ? a.value : a.value == null ? '' : String(a.value)))
    .filter((t) => t.trim().length > 0);
  return { question, answered: texts.length, texts };
}

/** Render a single answer value for a CSV cell (newlines flattened). */
export function answerToCell(value: SurveyAnswerValue): string {
  if (value === null || value === undefined) return '';
  const text = Array.isArray(value) ? value.join('; ') : String(value);
  return text.replace(/\r?\n/g, ' ').trim();
}

/**
 * Build CSV rows (one per response). Identity columns are included only when
 * the survey is attributed (not anonymous).
 */
export function buildResponseCsvRows(params: {
  isAnonymous: boolean;
  questions: SurveyQuestionRow[];
  responses: ResponseRecord[];
  answers: AnswerRecord[];
  staffNames: Map<string, string>;
}): Record<string, string>[] {
  const { isAnonymous, questions, responses, answers, staffNames } = params;
  const byResponse = new Map<string, Map<string, SurveyAnswerValue>>();
  for (const a of answers) {
    if (!byResponse.has(a.response_id)) byResponse.set(a.response_id, new Map());
    byResponse.get(a.response_id)!.set(a.question_id, a.value);
  }

  // Disambiguate duplicate prompts with a trailing index.
  const header = (q: SurveyQuestionRow, i: number) => `Q${i + 1}. ${q.prompt}`;

  return responses.map((r) => {
    const row: Record<string, string> = {};
    // Identity and precise timing are omitted for anonymous surveys so the CSV
    // can't be used to re-identify responders.
    if (!isAnonymous) {
      row['Respondent'] = r.staff_id ? staffNames.get(r.staff_id) ?? '(unknown)' : '';
      row['Submitted'] = new Date(r.submitted_at).toLocaleString();
    }
    const amap = byResponse.get(r.id);
    questions.forEach((q, i) => {
      row[header(q, i)] = amap ? answerToCell(amap.get(q.id) ?? null) : '';
    });
    return row;
  });
}
