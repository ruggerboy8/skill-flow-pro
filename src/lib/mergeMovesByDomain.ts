import { getDomainOrderIndex } from '@/lib/domainUtils';

// PML-1 Fix 2a: pickers mix org custom moves in with platform moves by
// domain, not in a separate section (John's scope decision on PML-1).
// Extracted as a pure function so the ordering is unit-testable without
// standing up SmartSlotPicker's Supabase queries.

export interface DomainGroupable {
  domain_name: string;
  action_statement: string;
}

/**
 * Merge platform and org custom moves into one list ordered by domain
 * (Clinical, Clerical, Cultural, Case Acceptance, then anything unrecognized
 * last), then alphabetically by statement within a domain. Does not care
 * which input array an item came from, satisfying the "mixed in, not a
 * separate section" requirement.
 */
export function mergeMovesByDomain<T extends DomainGroupable>(
  platformMoves: T[],
  orgMoves: T[]
): T[] {
  return [...platformMoves, ...orgMoves].sort((a, b) => {
    const orderA = getDomainOrderIndex(a.domain_name);
    const orderB = getDomainOrderIndex(b.domain_name);
    if (orderA !== orderB) return orderA - orderB;
    return a.action_statement.localeCompare(b.action_statement);
  });
}
