import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useLowestConfidenceDomain } from './useLowestConfidenceDomain';
import { selectFeaturedGlow, type GlowCandidate } from '@/lib/selectFeaturedGlow';

export interface StaffGlow extends GlowCandidate {
  evaluationId: string;
  competencyNameSnapshot: string;
}

interface EvalItemRow {
  evaluation_id: string;
  observer_glow: string | null;
  domain_id: number | null;
  domain_name: string | null;
  competency_name_snapshot: string;
  glow_source_staff_id: string | null;
  glow_source_type: string | null;
  glow_source_name: string | null;
}

/**
 * First-name-only giver display, matching the recognition card's
 * "Ariyana noticed" style (same convention as useCraftAtlas's
 * evaluatorFirstName). Reads the glow_source_name snapshot captured at
 * evaluation-capture time (supabase/migrations/20260820200000_mob4_glow_source_columns.sql)
 * instead of a live `staff` table join — a plain participant's RLS only
 * lets them read their OWN staff row, so a live join resolves to nothing
 * for the feature's normal audience. Pre-MOB-4 glows have no snapshot and
 * correctly resolve to null (rendered without a name, same as before MOB-4).
 */
export function resolveGiverFirstName(glowSourceName: string | null): string | null {
  const trimmed = glowSourceName?.trim();
  return trimmed ? trimmed.split(' ')[0] : null;
}

/**
 * Released-eval glow fetch + source-name resolution + featured-glow
 * selection (MOB-5). Single source of truth for both the Home recognition
 * card and the Performance glow history — both call this hook so they can
 * never diverge. See docs/specs/mob-5-recognition-card.md.
 *
 * Only glows from released evals (`status = 'submitted'` AND
 * `is_visible_to_staff = true`) are fetched — a glow on an unreleased draft
 * must never surface (spec acceptance criterion 3).
 */
export function useStaffGlows(staffId: string | undefined) {
  const { lowestConfidenceDomain, loading: lowestConfidenceLoading } = useLowestConfidenceDomain(staffId);

  const query = useQuery({
    queryKey: ['staff-glows', staffId],
    queryFn: async (): Promise<StaffGlow[]> => {
      if (!staffId) return [];

      const { data: evals, error: evalErr } = await supabase
        .from('evaluations')
        .select('id, observed_at, created_at')
        .eq('staff_id', staffId)
        .eq('status', 'submitted')
        .eq('is_visible_to_staff', true);

      if (evalErr || !evals || evals.length === 0) return [];

      const evalById = new Map(evals.map((e) => [e.id, e]));
      const evalIds = evals.map((e) => e.id);

      // glow_source_staff_id/glow_source_type/glow_source_name are additive
      // columns from MOB-4 (supabase/migrations/20260820200000_mob4_glow_source_columns.sql)
      // and not yet in generated types.ts — hand-typed here per
      // CLAUDE.md/mobile-build-instructions.md conventions (same pattern as
      // useAuth.tsx's pwa_enabled).
      //
      // giverName is resolved directly from glow_source_name (a snapshot
      // captured at evaluation-capture time), NOT via a live `staff` table
      // join — a plain participant's RLS only lets them read their OWN
      // staff row, so a join-based lookup returns nothing for this
      // feature's normal (participant) audience. See resolveGiverFirstName.
      const { data: rawItems, error: itemsErr } = await supabase
        .from('evaluation_items')
        .select(
          'evaluation_id, observer_glow, domain_id, domain_name, competency_name_snapshot, glow_source_staff_id, glow_source_type, glow_source_name' as 'evaluation_id'
        )
        .in('evaluation_id', evalIds)
        .not('observer_glow', 'is', null);

      if (itemsErr || !rawItems) return [];

      const items = rawItems as unknown as EvalItemRow[];

      const glows: StaffGlow[] = items
        .filter((item): item is EvalItemRow & { observer_glow: string } => !!item.observer_glow)
        .map((item) => {
          const evalRow = evalById.get(item.evaluation_id);
          // Pre-MOB-4 glows have no glow_source_name snapshot; giverName
          // stays null for those and they render without a name, exactly
          // as before this fix (spec risk mitigation: "Attribution
          // correctness" — never guess a name).
          const giverName = resolveGiverFirstName(item.glow_source_name);
          const recencyDate = evalRow?.observed_at ?? evalRow?.created_at ?? new Date(0).toISOString();

          return {
            evaluationId: item.evaluation_id,
            observerGlow: item.observer_glow,
            domainName: item.domain_name,
            competencyNameSnapshot: item.competency_name_snapshot,
            giverName,
            recencyDate,
          };
        })
        .sort((a, b) => new Date(b.recencyDate).getTime() - new Date(a.recencyDate).getTime());

      return glows;
    },
    enabled: !!staffId,
    staleTime: 1000 * 60 * 2,
  });

  const glows = query.data ?? [];
  const featuredGlow = selectFeaturedGlow(glows, lowestConfidenceDomain);

  return {
    glows,
    featuredGlow,
    isLoading: query.isLoading || lowestConfidenceLoading,
  };
}
