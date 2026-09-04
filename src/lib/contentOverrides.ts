import { supabase } from '@/integrations/supabase/client';

// PML-2b: participant-facing rewording. One resolution rule everywhere a
// client reads pro_moves.action_statement directly: the org's custom
// statement wins over the platform statement when an override exists.
// Overrides apply to platform moves only (an org edits its own org_custom
// moves directly, not through an override row). See
// docs/specs/pml-2-tenant-content-unification.md PML-2b.

/**
 * Resolves the statement a member of `orgId` should see for a platform move:
 * the org's custom_statement if one exists, otherwise the platform text.
 * Pure: takes an already-fetched override map, does no I/O, so callers can
 * batch-fetch overrides once per screen instead of once per move.
 *
 * `actionId` is nullable because org-custom moves (fetched via
 * fetchOrgProMoveMetaByIds) and self-select slots pass through here too;
 * overrides never apply to those, so they fall straight through to
 * `platformStatement`.
 */
export function resolveStatement(
  actionId: number | null | undefined,
  platformStatement: string,
  overrides: Map<number, string>
): string {
  if (actionId == null) return platformStatement;
  return overrides.get(actionId) ?? platformStatement;
}

/**
 * Fetches this org's content overrides for a set of platform action_ids,
 * mapped action_id -> custom_statement. Empty rows (no org, no ids, or a
 * blank custom_statement) never populate the map, so `resolveStatement`
 * falls back to the platform text for them exactly as if no override row
 * existed.
 */
export async function fetchContentOverrides(
  orgId: string | null | undefined,
  actionIds: number[]
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const ids = Array.from(new Set(actionIds.filter((id): id is number => id != null)));
  if (!orgId || ids.length === 0) return map;

  const { data } = await (supabase as any)
    .from('organization_pro_move_content_overrides')
    .select('pro_move_id, custom_statement')
    .eq('org_id', orgId)
    .in('pro_move_id', ids);

  (data ?? []).forEach((row: { pro_move_id: number; custom_statement: string | null }) => {
    if (row.custom_statement) map.set(row.pro_move_id, row.custom_statement);
  });
  return map;
}
