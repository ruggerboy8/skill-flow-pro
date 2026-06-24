/**
 * Read-only types and helpers for the evaluation review payload (V2).
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
  /** Per-competency reinforcing / growth coaching text (v3+; null for legacy v2 payloads). */
  observer_glow: string | null;
  observer_grow: string | null;
  self_note: string | null;
  /** Client-enriched tagline (not from RPC) */
  tagline?: string | null;
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
  domain_summaries: DomainSummary[];
  top_candidates: ReviewPayloadItem[];
  bottom_candidates: ReviewPayloadItem[];
  top_used_fallback: boolean;
}

/** Current payload version this client expects */
export const CURRENT_PAYLOAD_VERSION = 3;

/**
 * Parse and validate a review payload from the stored JSONB.
 * Accepts v2 and v3 (v3 adds observer_glow/observer_grow per item; on a v2
 * payload those are simply absent and the UI falls back to observer_note).
 * Returns null if the payload is missing or malformed.
 */
export function parseReviewPayload(raw: unknown): ReviewPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Record<string, unknown>;

  // Must have top_candidates key (V2 marker)
  if (!Array.isArray(p.top_candidates)) return null;

  return {
    version: (p.version as number) ?? CURRENT_PAYLOAD_VERSION,
    computed_at: (p.computed_at as string) ?? '',
    sparse: (p.sparse as boolean) ?? false,
    domain_summaries: (p.domain_summaries as DomainSummary[]) ?? [],
    top_candidates: (p.top_candidates as ReviewPayloadItem[]) ?? [],
    bottom_candidates: (p.bottom_candidates as ReviewPayloadItem[]) ?? [],
    top_used_fallback: (p.top_used_fallback as boolean) ?? false,
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
