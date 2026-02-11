/**
 * Read-only types and helpers for the evaluation review payload.
 * The payload is computed server-side by the compute_and_store_review_payload RPC.
 * This file does NOT compute or persist the payload.
 */

export interface ReviewPayloadItem {
  competency_id: number;
  competency_name: string;
  domain_name: string;
  observer_score: number;
  self_score: number | null;
  gap: number | null;
  observer_note: string | null;
  self_note: string | null;
}

export interface DomainSummary {
  domain_name: string;
  observer_avg: number;
  self_avg: number | null;
  count_scored: number;
}

export interface ReviewPayload {
  version: number;
  computed_at: string;
  sparse: boolean;
  priorities: ReviewPayloadItem[];
  strengths: ReviewPayloadItem[];
  alignment: ReviewPayloadItem[];
  gaps: ReviewPayloadItem[];
  domain_summaries: DomainSummary[];
  recommended_competency_ids: number[];
}

/** Current payload version this client expects */
export const CURRENT_PAYLOAD_VERSION = 1;

/**
 * Parse and validate a review payload from the stored JSONB.
 * Returns null if the payload is missing, malformed, or wrong version.
 */
export function parseReviewPayload(raw: unknown): ReviewPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const payload = raw as Record<string, unknown>;
  if (payload.version !== CURRENT_PAYLOAD_VERSION) return null;
  // Trust the server-computed structure but ensure required arrays exist
  return {
    version: payload.version as number,
    computed_at: (payload.computed_at as string) ?? '',
    sparse: (payload.sparse as boolean) ?? false,
    priorities: (payload.priorities as ReviewPayloadItem[]) ?? [],
    strengths: (payload.strengths as ReviewPayloadItem[]) ?? [],
    alignment: (payload.alignment as ReviewPayloadItem[]) ?? [],
    gaps: (payload.gaps as ReviewPayloadItem[]) ?? [],
    domain_summaries: (payload.domain_summaries as DomainSummary[]) ?? [],
    recommended_competency_ids: (payload.recommended_competency_ids as number[]) ?? [],
  };
}

/**
 * Convert text quarter to numeric value for sorting.
 * Used wherever we need "newest evaluation" ordering client-side.
 */
export function quarterNum(q: string | null): number {
  return q === 'Q4' ? 4 : q === 'Q3' ? 3 : q === 'Q2' ? 2 : q === 'Q1' ? 1 : 0;
}

/**
 * Compare two evaluations by period (program_year, quarter) descending.
 * Returns negative if a is newer.
 */
export function compareEvalsByPeriod(
  a: { program_year: number; quarter: string | null },
  b: { program_year: number; quarter: string | null }
): number {
  if (a.program_year !== b.program_year) return b.program_year - a.program_year;
  return quarterNum(b.quarter) - quarterNum(a.quarter);
}
