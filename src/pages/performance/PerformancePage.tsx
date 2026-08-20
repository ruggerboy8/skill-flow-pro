import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { getDomainSlug } from '@/lib/domainUtils';
import { quarterNum } from '@/lib/reviewPayload';
import { reviewPath } from '@/lib/reviewRoute';
import { ConfidenceCard } from '@/components/performance/ConfidenceCard';
import { GlowHistory } from '@/components/performance/GlowHistory';
import OnTimeRateWidget from '@/components/coach/OnTimeRateWidget';

type DomainEvalRow = { domain_name: string; observer_score: number | null; self_score: number | null };

function scoreBucket(avg: number): 1 | 2 | 3 | 4 {
  if (avg >= 3.5) return 4;
  if (avg >= 2.5) return 3;
  if (avg >= 1.5) return 2;
  return 1;
}

function ScoreChip({ value }: { value: number }) {
  const bucket = scoreBucket(value);
  return (
    <span
      className="inline-flex items-center justify-center min-w-[32px] h-7 px-1.5 rounded-lg font-bold text-[13px]"
      style={{ backgroundColor: `hsl(var(--score-${bucket}-bg))`, color: `hsl(var(--score-${bucket}-ink))` }}
    >
      {value.toFixed(1)}
    </span>
  );
}

/**
 * Performance tab (E). Focus hero + evaluation scores + confidence/still-
 * building + participation. See
 * docs/features/mobile-build-instructions.md section E for the full spec.
 */
export default function PerformancePage() {
  const navigate = useNavigate();
  const { data: staffProfile } = useStaffProfile({ redirectToSetup: false, showErrorToast: false });
  const staffId = staffProfile?.id;

  const { data, isLoading } = useQuery({
    queryKey: ['performance-page', staffId],
    queryFn: async () => {
      if (!staffId) return null;

      // Newest released+visible evaluation — same shape as EvalReadyCard /
      // CurrentFocusCard (evaluations table, status+is_visible_to_staff).
      const { data: evals } = await supabase
        .from('evaluations')
        .select('id, type, quarter, program_year, evaluator_id, evaluator_note')
        .eq('staff_id', staffId)
        .eq('status', 'submitted')
        .eq('is_visible_to_staff', true);

      if (!evals || evals.length === 0) {
        return { state: 'new-hire' as const };
      }

      const sorted = [...evals].sort((a, b) => {
        if (a.program_year !== b.program_year) return b.program_year - a.program_year;
        return quarterNum(b.quarter) - quarterNum(a.quarter);
      });
      const newest = sorted[0];
      const periodLabel = newest.type === 'Baseline' ? `Baseline ${newest.program_year}` : `${newest.quarter} ${newest.program_year}`;

      const [{ data: focusRows }, { data: evalItems }, { data: evaluatorStaff }] = await Promise.all([
        supabase
          .from('staff_quarter_focus')
          .select(
            'action_id, pro_moves!inner(action_statement, competency_id, competencies!fk_pro_moves_competency_id(domains!competencies_domain_id_fkey(domain_name)))'
          )
          .eq('evaluation_id', newest.id)
          .eq('staff_id', staffId),
        supabase
          .from('evaluation_items')
          .select('domain_name, observer_score, self_score, competency_id, observer_grow')
          .eq('evaluation_id', newest.id),
        newest.evaluator_id
          ? supabase.from('staff').select('name').eq('id', newest.evaluator_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);

      const evaluatorFirstName = evaluatorStaff?.name?.split(' ')[0] ?? null;

      const domainRows: DomainEvalRow[] = (evalItems ?? []).map((r) => ({
        domain_name: r.domain_name ?? '',
        observer_score: r.observer_score,
        self_score: r.self_score,
      }));

      if (!focusRows || focusRows.length === 0) {
        return { state: 'no-focus' as const, evalId: newest.id, periodLabel, domainRows };
      }

      // TODO(build-review): staff_quarter_focus can hold more than one row;
      // the prototype/spec show a single focus move on this hero, so we take
      // the first. Revisit if multi-focus quarters become common.
      const focusRow = focusRows[0] as any;
      const pm = focusRow.pro_moves;
      const domainName: string = pm?.competencies?.domains?.domain_name ?? '';
      const competencyId: number | null = pm?.competency_id ?? null;

      const matchingItem = (evalItems ?? []).find((it) => it.competency_id === competencyId);
      const calloutBody: string | null = matchingItem?.observer_grow ?? newest.evaluator_note ?? null;

      return {
        state: 'chosen' as const,
        evalId: newest.id,
        periodLabel,
        domainRows,
        focus: {
          actionStatement: pm?.action_statement ?? '',
          domainName,
          domainSlug: getDomainSlug(domainName),
        },
        evaluatorFirstName,
        calloutBody,
      };
    },
    enabled: !!staffId,
    staleTime: 1000 * 60 * 2,
  });

  return (
    <div className="space-y-4">
      <p className="text-2xs font-bold uppercase tracking-widest text-muted-foreground">How you're doing</p>
      <h1 className="text-[22px] font-bold tracking-tight -mt-1">Performance</h1>

      {isLoading || !data ? (
        <div className="rounded-2xl border border-border bg-card p-4 h-40 animate-pulse" />
      ) : (
        <>
          {/* 1. Focus hero */}
          {data.state === 'new-hire' && (
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'hsl(var(--win-growth-bg))' }}>
              <p className="text-2xs font-bold uppercase tracking-widest" style={{ color: 'hsl(var(--muted-tint))' }}>
                Getting started
              </p>
              <h2 className="text-[17px] mt-1" style={{ fontWeight: 650 }}>
                Your first evaluation comes at the end of the quarter.
              </h2>
              <p className="text-[13px] mt-1.5" style={{ color: 'hsl(var(--muted-tint))' }}>
                Until then, this page fills in with what you rate each week. Keep checking in and out.
              </p>
            </div>
          )}

          {data.state === 'no-focus' && (
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'hsl(var(--win-growth-bg))' }}>
              <h2 className="text-[17px]" style={{ fontWeight: 650 }}>
                No focus chosen yet from your {data.periodLabel} evaluation.
              </h2>
              <p className="text-[13px] mt-1.5" style={{ color: 'hsl(var(--muted-tint))' }}>
                Picking one gives the quarter a direction.
              </p>
              <button
                type="button"
                onClick={() => navigate(reviewPath(data.evalId))}
                className="w-full mt-3 rounded-full py-3 min-h-[44px] font-semibold text-sm"
                style={{ backgroundColor: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}
              >
                Choose your focus
              </button>
            </div>
          )}

          {data.state === 'chosen' && (
            <div className="rounded-2xl p-4" style={{ backgroundColor: 'hsl(var(--win-growth-bg))' }}>
              <p className="text-2xs font-bold uppercase tracking-widest" style={{ color: 'hsl(var(--muted-tint))' }}>
                Your focus this quarter
              </p>
              <p className="text-[17px] mt-1" style={{ fontWeight: 650 }}>
                {data.focus.actionStatement}
              </p>
              <p className="text-[13px] mt-1.5" style={{ color: 'hsl(var(--muted-tint))' }}>
                You chose this from your {data.periodLabel} evaluation.
              </p>

              {data.calloutBody && (
                <div className="mt-3 pl-3" style={{ borderLeft: '3px solid hsl(var(--primary))' }}>
                  <p className="text-2xs font-bold uppercase tracking-widest" style={{ color: 'hsl(var(--muted-tint))' }}>
                    {data.evaluatorFirstName ? `${data.evaluatorFirstName}'s next step` : "Your evaluator's next step"}
                  </p>
                  <p className="text-[13px] mt-1" style={{ color: 'hsl(var(--muted-tint))' }}>
                    {data.calloutBody}
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => navigate(`/my-role/domain/${data.focus.domainSlug}`)}
                className="mt-3 text-[13px] font-semibold rounded-full px-3 py-2 min-h-[36px]"
                style={{ backgroundColor: 'hsl(var(--primary) / 0.08)', color: 'hsl(var(--primary))' }}
              >
                Learning resources for this move
              </button>
            </div>
          )}

          {/* 2. Evaluation scores — hidden entirely for new hires */}
          {data.state !== 'new-hire' && (
            <div className="rounded-2xl border border-border bg-card p-4">
              <h2 className="text-[15px] font-semibold">From your {data.periodLabel} evaluation</h2>
              <div className="mt-2">
                {Array.from(
                  data.domainRows.reduce((map, row) => {
                    const entry = map.get(row.domain_name) ?? { observerSum: 0, observerN: 0, selfSum: 0, selfN: 0 };
                    if (row.observer_score != null) {
                      entry.observerSum += row.observer_score;
                      entry.observerN += 1;
                    }
                    if (row.self_score != null) {
                      entry.selfSum += row.self_score;
                      entry.selfN += 1;
                    }
                    map.set(row.domain_name, entry);
                    return map;
                  }, new Map<string, { observerSum: number; observerN: number; selfSum: number; selfN: number }>())
                ).map(([domainName, agg]) => (
                  <div key={domainName} className="flex items-center gap-2 py-2 border-b border-border last:border-none">
                    <span className="flex-1 text-[13px]">{domainName}</span>
                    <div className="w-11 flex justify-center">
                      {agg.observerN > 0 ? <ScoreChip value={agg.observerSum / agg.observerN} /> : <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                    <div className="w-11 flex justify-center">
                      {agg.selfN > 0 ? <ScoreChip value={agg.selfSum / agg.selfN} /> : <span className="text-xs text-muted-foreground">—</span>}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground text-center mt-3">
                Your self-score is the average performance score you submitted during this quarter.
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => navigate(`/evaluation/${data.evalId}`)}
                  className="flex-1 text-[13px] font-semibold rounded-full py-2.5 min-h-[40px]"
                  style={{ backgroundColor: 'hsl(var(--primary) / 0.08)', color: 'hsl(var(--primary))' }}
                >
                  View full evaluation
                </button>
                <button
                  type="button"
                  onClick={() => navigate('/my-role/evaluations')}
                  className="flex-1 text-[13px] font-semibold rounded-full py-2.5 min-h-[40px]"
                  style={{ backgroundColor: 'hsl(var(--primary) / 0.08)', color: 'hsl(var(--primary))' }}
                >
                  All evaluations
                </button>
              </div>
            </div>
          )}

          {/* Recognition (MOB-5): glow history, after the focus hero and
              near/with ConfidenceCard — both key off domain. */}
          <GlowHistory staffId={staffId} />

          {/* 3. Confidence + still building */}
          <ConfidenceCard staffId={staffId} subject="you" />

          {/* 4. Participation */}
          {staffId && (
            <div>
              <OnTimeRateWidget staffId={staffId} />
              <button
                type="button"
                onClick={() => navigate('/my-role/practice-log')}
                className="w-full mt-2 text-[13px] font-semibold rounded-full py-2.5 min-h-[40px]"
                style={{ backgroundColor: 'hsl(var(--primary) / 0.08)', color: 'hsl(var(--primary))' }}
              >
                All weeks
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
