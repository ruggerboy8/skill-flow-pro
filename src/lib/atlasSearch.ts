import type { AtlasCompetency } from '@/hooks/useCraftAtlas';
import type { ProMoveDetail } from '@/hooks/useDomainDetail';

export interface AtlasSearchResult {
  move: ProMoveDetail;
  competency: AtlasCompetency;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function queryTokens(rawQuery: string): string[] {
  return normalize(rawQuery).split(' ').filter(Boolean);
}

function fieldMatches(value: string | null | undefined, tokens: string[]): boolean {
  if (!value) return false;
  const haystack = normalize(value);
  return tokens.every((token) => haystack.includes(token));
}

/**
 * Client-side search over the already-loaded useCraftAtlas corpus — see
 * docs/specs/mob-6-craft-atlas.md "Effective search". No network request;
 * this runs on the array useCraftAtlas already fetched (query key
 * ['craft-atlas', staffId, roleIds]).
 *
 * Indexed fields: move `action_statement` + `description`, and competency
 * `title` / `subtitle` / `description` / `domainName`. A competency-level
 * or domain-level match surfaces every move under that competency, so
 * searching "Clinical" or a competency name reaches its moves directly
 * without walking the band -> tile -> area tap chain.
 *
 * Matching is a normalized, case-insensitive, whitespace-collapsed,
 * multi-token substring match (every token in the query must appear
 * somewhere in the field) — no fuzzy-search dependency, per the spec's
 * recommendation to keep the PWA bundle lean for a corpus this small.
 *
 * A competency with no domainName (the useCraftAtlas TODO(build-review):
 * a null domain_id competency isn't placed in any domain band and is
 * silently invisible in the browse view) is excluded here too, so search
 * never surfaces a move the user couldn't otherwise reach by browsing.
 */
export function searchAtlasMoves(competencies: AtlasCompetency[], rawQuery: string): AtlasSearchResult[] {
  const tokens = queryTokens(rawQuery);
  if (tokens.length === 0) return [];

  const results: AtlasSearchResult[] = [];

  for (const competency of competencies) {
    if (!competency.domainName) continue;

    const competencyMatches =
      fieldMatches(competency.title, tokens) ||
      fieldMatches(competency.subtitle, tokens) ||
      fieldMatches(competency.friendlyDescription, tokens) ||
      fieldMatches(competency.domainName, tokens);

    for (const move of competency.proMoves) {
      const moveMatches =
        competencyMatches || fieldMatches(move.action_statement, tokens) || fieldMatches(move.description, tokens);

      if (moveMatches) {
        results.push({ move, competency });
      }
    }
  }

  return results;
}
