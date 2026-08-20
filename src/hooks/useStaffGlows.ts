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
        .select('id, evaluator_id, observed_at, created_at')
        .eq('staff_id', staffId)
        .eq('status', 'submitted')
        .eq('is_visible_to_staff', true);

      if (evalErr || !evals || evals.length === 0) return [];

      const evalById = new Map(evals.map((e) => [e.id, e]));
      const evalIds = evals.map((e) => e.id);

      // glow_source_staff_id/glow_source_type are additive columns from
      // MOB-4 (supabase/migrations/20260820200000_mob4_glow_source_columns.sql)
      // and not yet in generated types.ts — hand-typed here per
      // CLAUDE.md/mobile-build-instructions.md conventions (same pattern as
      // useAuth.tsx's pwa_enabled).
      const { data: rawItems, error: itemsErr } = await supabase
        .from('evaluation_items')
        .select(
          'evaluation_id, observer_glow, domain_id, domain_name, competency_name_snapshot, glow_source_staff_id, glow_source_type' as 'evaluation_id'
        )
        .in('evaluation_id', evalIds)
        .not('observer_glow', 'is', null);

      if (itemsErr || !rawItems) return [];

      const items = rawItems as unknown as EvalItemRow[];

      // Resolve giver names: glow_source_staff_id first, falling back to the
      // eval's evaluator_id (pre-MOB-4 glows have no source; they still
      // render, attributed to the evaluator, so old glows aren't stranded —
      // spec acceptance criterion 6). Batched into one lookup.
      const sourceIds = new Set<string>();
      for (const item of items) {
        const sourceId = item.glow_source_staff_id ?? evalById.get(item.evaluation_id)?.evaluator_id ?? null;
        if (sourceId) sourceIds.add(sourceId);
      }

      let nameById = new Map<string, string>();
      if (sourceIds.size > 0) {
        const { data: staffRows } = await supabase
          .from('staff')
          .select('id, name')
          .in('id', Array.from(sourceIds));
        nameById = new Map((staffRows ?? []).map((s) => [s.id, s.name]));
      }

      const glows: StaffGlow[] = items
        .filter((item): item is EvalItemRow & { observer_glow: string } => !!item.observer_glow)
        .map((item) => {
          const evalRow = evalById.get(item.evaluation_id);
          const sourceId = item.glow_source_staff_id ?? evalRow?.evaluator_id ?? null;
          // Never guess: if neither the source id nor the evaluator id
          // resolves to a name, giverName stays null and callers render
          // without a name (spec risk mitigation: "Attribution correctness").
          const giverName = sourceId ? nameById.get(sourceId) ?? null : null;
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
