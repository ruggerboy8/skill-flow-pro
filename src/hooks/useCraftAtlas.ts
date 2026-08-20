import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useResolvedRoleIds } from '@/hooks/useResolvedRoleIds';
import { mergeLeadCompetencies } from '@/lib/roleCompetencyMerge';
import { DOMAIN_ID_TO_NAME } from '@/lib/domainUtils';
import { format, parseISO } from 'date-fns';
import { quarterNum } from '@/lib/reviewPayload';
import type { ProMoveDetail } from '@/hooks/useDomainDetail';

export interface AtlasCompetency {
  competency_id: number;
  domainId: number;
  domainName: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  observerScore: number | null;
  observerNote: string | null;
  proMoves: ProMoveDetail[];
}

export interface CraftAtlasData {
  competencies: AtlasCompetency[];
  /** Non-null only when a released+visible evaluation was found. */
  periodLabel: string | null;
  evaluatorFirstName: string | null;
}

export interface EvalPeriodCandidate {
  eval_id: string;
  visible: boolean;
  program_year: number;
  quarter: string | null;
}

/**
 * Picks the eval_id of the most recently-visible evaluation by period
 * (program_year desc, then quarter desc) — NOT by any submitted/updated
 * timestamp. Extracted as a pure function so the ordering (the fix for the
 * "stale most-recent eval" bug) can be unit tested without mocking Supabase.
 */
export function pickMostRecentVisibleEvalId(candidates: EvalPeriodCandidate[]): string | null {
  let mostRecentEvalId: string | null = null;
  let mostRecentPeriod: { program_year: number; quarter: string | null } | null = null;

  for (const c of candidates) {
    if (!c.visible) continue;
    const isNewer =
      !mostRecentPeriod ||
      c.program_year > mostRecentPeriod.program_year ||
      (c.program_year === mostRecentPeriod.program_year && quarterNum(c.quarter) > quarterNum(mostRecentPeriod.quarter));
    if (isNewer) {
      mostRecentPeriod = { program_year: c.program_year, quarter: c.quarter };
      mostRecentEvalId = c.eval_id;
    }
  }

  return mostRecentEvalId;
}

/**
 * Data for the Craft Atlas (Explore tab): every competency across ALL
 * domains for the person's merged role(s), with active move counts and
 * the person's per-competency observer_score/observer_note from their
 * most recent released+visible evaluation. Powers both the atlas overview
 * (src/components/my-role/CraftAtlasOverview.tsx) and the area page
 * (src/pages/my-role/CraftAtlasArea.tsx) — both call this same hook so the
 * area page's lookup is a cache hit, not a second fetch.
 *
 * Role-resolution and the same-named lead/base merge are shared with
 * useDomainDetail via useResolvedRoleIds + mergeLeadCompetencies — see
 * docs/features/explore-my-role-build-instructions.md section D.
 */
export function useCraftAtlas() {
  const { staffProfile, roleIds, isLoading: roleIdsLoading } = useResolvedRoleIds();

  return useQuery({
    queryKey: ['craft-atlas', staffProfile?.id, roleIds],
    queryFn: async (): Promise<CraftAtlasData> => {
      if (!staffProfile?.id || roleIds.length === 0) {
        return { competencies: [], periodLabel: null, evaluatorFirstName: null };
      }

      // 1. Competencies across ALL domains for the merged roles.
      const { data: competencies, error: compError } = await supabase
        .from('competencies')
        .select('competency_id, name, tagline, friendly_description, role_id, domain_id')
        .in('role_id', roleIds)
        .eq('status', 'Active')
        .order('competency_id');

      if (compError) throw compError;

      // 2. Most recent submitted AND VISIBLE evaluation — same selection
      // pattern as useDomainDetail (get_evaluations_summary + a visibility
      // check against `evaluations`), extended here to also carry the
      // period label and evaluator, which the area page's coach card needs.
      const { data: evalData } = await supabase.rpc('get_evaluations_summary', {
        p_staff_id: staffProfile.id,
        p_only_submitted: true,
      });

      const competencyScores = new Map<number, number>();
      const competencyNotes = new Map<number, string>();
      let mostRecentEvalId: string | null = null;
      let periodLabel: string | null = null;
      let evaluatorFirstName: string | null = null;

      if (evalData && evalData.length > 0) {
        const evalIds = [...new Set(evalData.map((r) => r.eval_id))];
        const { data: evalsWithMeta } = await supabase
          .from('evaluations')
          .select('id, is_visible_to_staff, type, quarter, program_year, evaluator_id')
          .in('id', evalIds);

        const visibilityMap = new Map<string, boolean>();
        const metaMap = new Map<
          string,
          { type: string; quarter: string | null; program_year: number; evaluator_id: string | null }
        >();
        if (evalsWithMeta) {
          evalsWithMeta.forEach((e) => {
            visibilityMap.set(e.id, e.is_visible_to_staff);
            metaMap.set(e.id, {
              type: e.type,
              quarter: e.quarter,
              program_year: e.program_year,
              evaluator_id: e.evaluator_id,
            });
          });
        }

        // Pick the most recent eval by period (program_year, then quarter),
        // NOT by row.submitted_at — that field is actually evaluations.updated_at
        // (see get_evaluations_summary), which bumps whenever the staff member
        // opens/acknowledges ANY older evaluation and would surface stale data.
        // Same ordering as PerformancePage.tsx and useCurrentFocus.ts.
        const candidates: EvalPeriodCandidate[] = [];
        for (const row of evalData) {
          const meta = metaMap.get(row.eval_id);
          if (!meta) continue;
          candidates.push({
            eval_id: row.eval_id,
            visible: !!visibilityMap.get(row.eval_id),
            program_year: meta.program_year,
            quarter: meta.quarter,
          });
        }
        mostRecentEvalId = pickMostRecentVisibleEvalId(candidates);

        if (mostRecentEvalId) {
          const meta = metaMap.get(mostRecentEvalId);
          if (meta) {
            periodLabel =
              meta.type === 'Baseline' ? `Baseline ${meta.program_year}` : `${meta.quarter} ${meta.program_year}`;

            if (meta.evaluator_id) {
              const { data: evaluator } = await supabase
                .from('staff')
                .select('name')
                .eq('id', meta.evaluator_id)
                .maybeSingle();
              evaluatorFirstName = evaluator?.name?.split(' ')[0] ?? null;
            }
          }

          const { data: evalItems } = await supabase
            .from('evaluation_items')
            .select('competency_id, observer_score, observer_note')
            .eq('evaluation_id', mostRecentEvalId);

          if (evalItems) {
            for (const item of evalItems) {
              if (item.observer_score != null) competencyScores.set(item.competency_id, item.observer_score);
              if (item.observer_note) competencyNotes.set(item.competency_id, item.observer_note);
            }
          }
        }
      }

      // 3. Active pro moves for these competencies + the user's all-time
      // weekly scores, same shape useDomainDetail builds per-domain.
      const compIds = (competencies || []).map((c) => c.competency_id);
      const proMovesByCompetency = new Map<number, ProMoveDetail[]>();

      if (compIds.length > 0) {
        const { data: allProMoves } = await supabase
          .from('pro_moves')
          .select('action_id, action_statement, description, competency_id')
          .in('competency_id', compIds)
          .eq('active', true);

        const { data: userScores } = await supabase
          .from('weekly_scores')
          .select('confidence_score, week_of, site_action_id, selected_action_id')
          .eq('staff_id', staffProfile.id)
          .not('confidence_score', 'is', null);

        if (allProMoves) {
          for (const pm of allProMoves) {
            if (!pm.competency_id) continue;

            const matchingScores = (userScores || []).filter(
              (s) => s.site_action_id === pm.action_id || s.selected_action_id === pm.action_id
            );

            let lastPracticed: string | null = null;
            let avgConfidence: number | null = null;

            if (matchingScores.length > 0) {
              const confScores = matchingScores
                .map((s) => s.confidence_score)
                .filter((s): s is number => s !== null);

              if (confScores.length > 0) {
                avgConfidence = confScores.reduce((a, b) => a + b, 0) / confScores.length;
              }

              const sortedByDate = matchingScores
                .filter((s) => s.week_of)
                .sort((a, b) => new Date(b.week_of!).getTime() - new Date(a.week_of!).getTime());

              if (sortedByDate.length > 0 && sortedByDate[0].week_of) {
                lastPracticed = format(parseISO(sortedByDate[0].week_of), 'MMM d, yyyy');
              }
            }

            const detail: ProMoveDetail = {
              action_id: pm.action_id,
              action_statement: pm.action_statement || '',
              description: pm.description || null,
              lastPracticed,
              avgConfidence,
            };

            const existing = proMovesByCompetency.get(pm.competency_id) || [];
            existing.push(detail);
            proMovesByCompetency.set(pm.competency_id, existing);
          }
        }
      }

      // 4. Merge same-named lead competencies into base (shared logic —
      // see src/lib/roleCompetencyMerge.ts).
      const baseRoleId = staffProfile.role_id;

      const rawCompetencies = (competencies || []).map((c) => {
        // TODO(build-review): competencies.domain_id is nullable in the
        // schema; a null/unmapped domain_id here means the competency
        // can't be placed in a DOMAIN_ORDER band and is silently excluded
        // from the atlas (never observed in practice — the four domains
        // are fixed platform data).
        const domainName = c.domain_id != null ? DOMAIN_ID_TO_NAME[c.domain_id] ?? '' : '';
        return {
          competency_id: c.competency_id,
          role_id: c.role_id,
          domainId: c.domain_id ?? 0,
          domainName,
          title: c.name || '',
          subtitle: c.tagline,
          description: (c as any).friendly_description || null,
          observerScore: competencyScores.get(c.competency_id) ?? null,
          observerNote: competencyNotes.get(c.competency_id) ?? null,
          proMoves: proMovesByCompetency.get(c.competency_id) || [],
        };
      });

      const merged = mergeLeadCompetencies(rawCompetencies, baseRoleId);

      return {
        competencies: merged as AtlasCompetency[],
        periodLabel,
        evaluatorFirstName,
      };
    },
    enabled: !roleIdsLoading && !!staffProfile?.id,
  });
}
