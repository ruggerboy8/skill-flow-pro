export interface ResourceTypeRow {
  action_id: number;
  type: string;
}

/**
 * Groups a flat pro_move_resources rowset (action_id, type) into a map of
 * action_id -> the set of resource types that move has (script/audio/video/
 * link). Used by the Explore competency page (level 3) to show a small
 * materials icon row per move without a per-move fetch — see
 * docs/specs/mob-explore-rebuild.md §2 level 3. Pure so the grouping can be
 * tested without Supabase.
 */
export function groupResourceTypesByAction(rows: ResourceTypeRow[]): Record<number, Set<string>> {
  const map: Record<number, Set<string>> = {};
  for (const row of rows) {
    if (!map[row.action_id]) map[row.action_id] = new Set();
    map[row.action_id].add(row.type);
  }
  return map;
}
