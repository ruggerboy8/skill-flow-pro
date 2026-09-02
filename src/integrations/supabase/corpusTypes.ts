// Hand-written types for the ASK-1 corpus + Ask Alcan chat tables.
//
// Like surveyTypes.ts, these live outside the generated `types.ts` (which
// Lovable manages and regenerates wholesale) so the feature stays typed
// without touching that file. Queries cast at the `.from()` boundary with
// `as any` and use these interfaces for the results.

export type CorpusDocumentStatus = 'unreviewed' | 'kept' | 'canon' | 'rejected';
export type CorpusSourceKind = 'basecamp' | 'authored' | 'external';

export interface CorpusExpertAreaRow {
  id: string;
  org_id: string;
  area_name: string;
  owner_staff_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface CorpusDocumentRow {
  id: string;
  org_id: string;
  title: string;
  body: string | null;
  summary: string | null;
  status: CorpusDocumentStatus;
  tier: 1 | 2 | 3 | null;
  expert_area_id: string | null;
  audience: string | null;
  source_kind: CorpusSourceKind;
  source_url: string | null;
  source_item_id: string | null;
  posted_at: string | null;
  stale_risk: boolean;
  location_scope: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AskConversationRow {
  id: string;
  staff_id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export type AskMessageRole = 'user' | 'assistant';

export interface AskMessageRow {
  id: string;
  conversation_id: string;
  role: AskMessageRole;
  content: string;
  cited_document_ids: string[];
  created_at: string;
}

/** One citation in an Ask Alcan answer. */
export interface AskCitation {
  document_id: string;
  title: string;
  source_url: string | null;
}

/**
 * FROZEN response contract of the ask-alcan edge function (ASK-2 additivity
 * guarantee): ASK-2 changes how documents are found, never this shape.
 */
export interface AskAlcanResponse {
  answer: string;
  citations: AskCitation[];
}
