// Hand-written types for the Ask Alcan survey tables/RPCs.
//
// These live outside the generated `types.ts` (which Lovable manages and
// regenerates wholesale) so the survey feature stays fully typed without a
// 100k-line reformat of that file. Survey queries cast at the `.from()` /
// `.rpc()` boundary with `as any`, mirroring the existing pattern in the
// codebase, and use these interfaces for the results.

export type SurveyStatus = 'draft' | 'open' | 'closed';

export type SurveyQuestionType =
  | 'single_choice'
  | 'multi_choice'
  | 'free_text'
  | 'rating';

export interface SurveyRow {
  id: string;
  organization_id: string;
  created_by: string | null;
  title: string;
  description: string | null;
  status: SurveyStatus;
  is_anonymous: boolean;
  opens_at: string | null;
  closes_at: string | null;
  target_location_ids: string[];
  target_role_ids: number[];
  published_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type SurveyInsert = Pick<SurveyRow, 'organization_id' | 'title'> &
  Partial<
    Pick<
      SurveyRow,
      | 'created_by'
      | 'description'
      | 'is_anonymous'
      | 'opens_at'
      | 'closes_at'
      | 'target_location_ids'
      | 'target_role_ids'
    >
  >;

/** Config payload stored on a question. Shape depends on `type`. */
export interface SurveyQuestionConfig {
  /** choice options for single_choice / multi_choice */
  choices?: string[];
  /** rating bounds, e.g. NPS = 0..10 */
  min?: number;
  max?: number;
  minLabel?: string;
  maxLabel?: string;
}

export interface SurveyQuestionRow {
  id: string;
  survey_id: string;
  position: number;
  type: SurveyQuestionType;
  prompt: string;
  required: boolean;
  config: SurveyQuestionConfig;
  created_at: string;
}

export interface SurveyAssignmentRow {
  id: string;
  survey_id: string;
  staff_id: string;
  status: 'pending' | 'completed';
  assigned_at: string;
  completed_at: string | null;
}

export interface SurveyResponseRow {
  id: string;
  survey_id: string;
  staff_id: string | null;
  submitted_at: string;
}

/** A single answer value: choice array, free text, or rating number. */
export type SurveyAnswerValue = string[] | string | number | null;

export interface SurveyAnswerRow {
  id: string;
  response_id: string;
  question_id: string;
  value: SurveyAnswerValue;
}

/** Payload item passed to the submit_survey RPC. */
export interface SurveyAnswerInput {
  question_id: string;
  value: SurveyAnswerValue;
}

export const QUESTION_TYPE_LABELS: Record<SurveyQuestionType, string> = {
  single_choice: 'Multiple choice (pick one)',
  multi_choice: 'Multi-select (pick many)',
  free_text: 'Free response',
  rating: 'Rating scale',
};
