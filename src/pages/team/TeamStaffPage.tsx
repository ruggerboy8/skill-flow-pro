import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useMyWeeklyScores } from '@/hooks/useMyWeeklyScores';
import { quarterNum } from '@/lib/reviewPayload';
import { ConfidenceCard } from '@/components/performance/ConfidenceCard';
import OnTimeRateWidget from '@/components/coach/OnTimeRateWidget';
import { BackPill } from '@/components/mobile/BackPill';

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

function currentMonday(): string {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  return monday.toISOString().slice(0, 10);
}

/**
 * Staff detail (F.2): name + this-week pill, participation, latest
 * evaluation's domain scores, and the shared ConfidenceCard (subject='them').
 */
export default function TeamStaffPage() {
  const { staffId = '' } = useParams<{ staffId: string }>();
  const navigate = useNavigate();

  const { data: staffInfo } = useQuery({
    queryKey: ['team-staff-info', staffId],
    queryFn: async () => {
      const { data } = await supabase.from('staff').select('name').eq('id', staffId).maybeSingle();
      return data;
    },
    enabled: !!staffId,
  });

  const { rawData } = useMyWeeklyScores({ staffId });

  const weekPill = useMemo(() => {
    const monday = currentMonday();
    const thisWeek = rawData.filter((r) => r.week_of === monday);
    if (thisWeek.length === 0 || thisWeek.every((r) => r.confidence_score == null)) return 'missing' as const;
    const confDone = thisWeek.every((r) => r.confidence_score != null);
    const perfDone = thisWeek.every((r) => r.performance_score != null);
    if (confDone && perfDone) return 'in' as const;
    return 'open' as const;
  }, [rawData]);

  const PILL_CONFIG = {
    missing: { label: 'Missing', bg: '--status-missing-bg', ink: '--status-missing' },
    open: { label: 'Open', bg: '--status-late-bg', ink: '--status-late' },
    in: { label: 'In', bg: '--status-complete-bg', ink: '--status-complete' },
  } as const;

  const { data: evalData } = useQuery({
    queryKey: ['team-staff-latest-eval', staffId],
    queryFn: async () => {
      const { data: evals } = await supabase
        .from('evaluations')
        .select('id, type, quarter, program_year')
        .eq('staff_id', staffId)
        .eq('status', 'submitted');

      if (!evals || evals.length === 0) return null;

      const sorted = [...evals].sort((a, b) => {
        if (a.program_year !== b.program_year) return b.program_year - a.program_year;
        return quarterNum(b.quarter) - quarterNum(a.quarter);
      });
      const newest = sorted[0];
      const periodLabel = newest.type === 'Baseline' ? `Baseline ${newest.program_year}` : `${newest.quarter} ${newest.program_year}`;

      const { data: items } = await supabase
        .from('evaluation_items')
        .select('domain_name, observer_score, self_score')
        .eq('evaluation_id', newest.id);

      const domainRows: DomainEvalRow[] = (items ?? []).map((r) => ({
        domain_name: r.domain_name ?? '',
        observer_score: r.observer_score,
        self_score: r.self_score,
      }));

      return { evalId: newest.id, periodLabel, domainRows };
    },
    enabled: !!staffId,
  });

  return (
    <div className="space-y-4">
      <BackPill label="Your team" to="/team" />

      <div className="flex items-center justify-between gap-2">
        <h1 className="text-[22px] font-bold tracking-tight">{staffInfo?.name ?? 'Teammate'}</h1>
        <span
          className="text-2xs font-bold uppercase tracking-wide rounded-full px-2.5 py-1 flex-none"
          style={{ backgroundColor: `hsl(var(${PILL_CONFIG[weekPill].bg}))`, color: `hsl(var(${PILL_CONFIG[weekPill].ink}))` }}
        >
          {PILL_CONFIG[weekPill].label}
        </span>
      </div>

      <div>
        <h2 className="text-[15px] font-semibold mb-2">Participation</h2>
        <OnTimeRateWidget staffId={staffId} />
      </div>

      {evalData && (
        <div className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-[15px] font-semibold">From their {evalData.periodLabel} evaluation</h2>
          <div className="mt-2">
            {Array.from(
              evalData.domainRows.reduce((map, row) => {
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
          <button
            type="button"
            onClick={() => navigate(`/evaluation/${evalData.evalId}`)}
            className="w-full mt-3 text-[13px] font-semibold rounded-full py-2.5 min-h-[40px]"
            style={{ backgroundColor: 'hsl(var(--primary) / 0.08)', color: 'hsl(var(--primary))' }}
          >
            View full evaluation
          </button>
        </div>
      )}

      <ConfidenceCard staffId={staffId} subject="them" />
    </div>
  );
}
