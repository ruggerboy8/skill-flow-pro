// src/components/ThisWeekPanel.tsx
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { nowUtc, getAnchors, nextMondayStr } from '@/lib/centralTime';
import { getDomainColor } from '@/lib/domainColors';

interface Staff { id: string; role_id: number; }
interface WeeklyFocusRow {
  id: string;
  display_order: number;
  self_select?: boolean;
  competency_id?: number;
  pro_moves?: { action_statement?: string } | null;
  competencies?: { domains?: { domain_name?: string } | null } | null;
}
interface WeeklyScoreRow {
  weekly_focus_id: string;
  confidence_score: number | null;
  performance_score: number | null;
  selected_action_id?: number | null;
}

export default function ThisWeekPanel() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [staff, setStaff] = useState<Staff | null>(null);
  const [cycle] = useState<number>(1);
  const [weekInCycle, setWeekInCycle] = useState<number>(1);

  // Data state
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocusRow[]>([]);
  const [weeklyScores, setWeeklyScores] = useState<WeeklyScoreRow[]>([]);
  const [carryoverPending, setCarryoverPending] = useState<{ cycle: number; week_in_cycle: number } | null>(null);

  // Loading/gating state
  const [loading, setLoading] = useState<boolean>(true);
  const [readyForBanner, setReadyForBanner] = useState<boolean>(false);

  // ---------------- load staff + pick default week ----------------
  useEffect(() => {
    if (user) void loadStaff();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function loadStaff() {
    const { data, error } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user!.id)
      .maybeSingle();

    if (error || !data) {
      navigate('/setup');
      return;
    }

    setStaff(data);
    await selectDefaultWeek(data);
  }

  // Choose default week: carryover (confidence done, perf pending) else first grey week
  async function selectDefaultWeek(s: Staff) {
    let carryoverWeek: number | null = null;
    let greyWeek: number | null = null;

    for (let w = 1; w <= 6; w++) {
      const { data: focusRows } = await supabase
        .from('weekly_focus')
        .select('id')
        .eq('role_id', s.role_id)
        .eq('cycle', 1)
        .eq('week_in_cycle', w);

      const focusIds = (focusRows || []).map((f: any) => f.id);
      if (focusIds.length === 0) continue;

      const { data: scoresData } = await supabase
        .from('weekly_scores')
        .select('weekly_focus_id, confidence_score, performance_score')
        .eq('staff_id', s.id)
        .in('weekly_focus_id', focusIds);

      const total = focusIds.length;
      const hasAllConf = (scoresData || []).length === total && (scoresData || []).every((r: any) => r.confidence_score !== null);
      const hasAllPerf = (scoresData || []).length === total && (scoresData || []).every((r: any) => r.performance_score !== null);

      if (hasAllConf && !hasAllPerf && carryoverWeek === null) carryoverWeek = w;
      if (!hasAllConf && greyWeek === null) greyWeek = w;
    }

    const chosen = carryoverWeek ?? greyWeek ?? 1;
    setWeekInCycle(chosen);
  }

  useEffect(() => {
    if (staff) void loadWeekData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, weekInCycle]);

  // ---------------- load week data (batched to avoid flicker) ----------------
  async function loadWeekData() {
    if (!staff) return;

    // Clear stale and hold UI until all decisions are computed
    setLoading(true);
    setReadyForBanner(false);
    setWeeklyFocus([]);
    setWeeklyScores([]);
    setCarryoverPending(null);

    // 1) Focus rows
    const { data: focusData, error: focusError } = await supabase
      .from('weekly_focus')
      .select(`
        id,
        display_order,
        self_select,
        competency_id,
        pro_moves ( action_statement ),
        competencies ( domains ( domain_name ) )
      `)
      .eq('cycle', cycle)
      .eq('week_in_cycle', weekInCycle)
      .eq('role_id', staff.role_id)
      .order('display_order');

    if (focusError) {
      toast({ title: 'Error', description: 'Failed to load Pro Moves', variant: 'destructive' });
      setLoading(false);
      setReadyForBanner(true); // render empty state safely
      return;
    }

    const transformed: WeeklyFocusRow[] = (focusData || []).map((item: any) => ({
      id: item.id,
      display_order: item.display_order,
      self_select: item.self_select ?? false,
      competency_id: item.competency_id ?? undefined,
      pro_moves: item.pro_moves ?? null,
      competencies: item.competencies ?? null,
    }));

    // If no focus, finalize right away
    if (transformed.length === 0) {
      setWeeklyFocus([]);
      setWeeklyScores([]);
      setCarryoverPending(null);
      setReadyForBanner(true);
      setLoading(false);
      return;
    }

    // 2) Scores + carryover (do not set state until we have both)
    const focusIds = transformed.map(f => f.id);

    const [{ data: scores }, { data: pending }] = await Promise.all([
      supabase
        .from('weekly_scores')
        .select('weekly_focus_id, confidence_score, performance_score, selected_action_id')
        .eq('staff_id', staff.id)
        .in('weekly_focus_id', focusIds),
      supabase
        .from('weekly_scores')
        .select('updated_at, weekly_focus!inner(cycle, week_in_cycle, role_id)')
        .eq('staff_id', staff.id)
        .eq('weekly_focus.role_id', staff.role_id)
        .not('confidence_score', 'is', null)
        .is('performance_score', null)
        .order('updated_at', { ascending: false })
        .limit(1),
    ]);

    const wf: any = pending && pending[0] && (pending[0] as any).weekly_focus;
    const carry = wf ? { cycle: wf.cycle, week_in_cycle: wf.week_in_cycle } : null;

    // Single commit to state → avoids intermediate renders
    setWeeklyFocus(transformed);
    setWeeklyScores(scores || []);
    setCarryoverPending(carry);
    setReadyForBanner(true);
    setLoading(false);
  }

  // ---------------- derived state ----------------
  const total = weeklyFocus.length;
  const confCount = useMemo(
    () => weeklyFocus.filter(f => (weeklyScores.find(s => s.weekly_focus_id === f.id)?.confidence_score ?? null) != null).length,
    [weeklyFocus, weeklyScores]
  );
  const perfCount = useMemo(
    () => weeklyFocus.filter(f => (weeklyScores.find(s => s.weekly_focus_id === f.id)?.performance_score ?? null) != null).length,
    [weeklyFocus, weeklyScores]
  );

  const firstIncompleteConfIndex = useMemo(
    () => weeklyFocus.findIndex(f => (weeklyScores.find(s => s.weekly_focus_id === f.id)?.confidence_score ?? null) === null),
    [weeklyFocus, weeklyScores]
  );
  const firstIncompletePerfIndex = useMemo(
    () => weeklyFocus.findIndex(f => (weeklyScores.find(s => s.weekly_focus_id === f.id)?.confidence_score ?? null) !== null && (weeklyScores.find(s => s.weekly_focus_id === f.id)?.performance_score ?? null) === null),
    [weeklyFocus, weeklyScores]
  );

  // Memoize time anchors so gates don’t “bounce” mid-render
  const { now, monCheckInZ, tueDueZ, thuStartZ, beforeCheckIn, afterTueNoon, beforeThursday } = useMemo(() => {
    const n = nowUtc();
    const a = getAnchors(n);
    return {
      now: n,
      ...a,
      beforeCheckIn: n < a.monCheckInZ,
      afterTueNoon: n >= a.tueDueZ,
      beforeThursday: n < a.thuStartZ,
    };
  }, []);

  const partialConfidence = confCount > 0 && confCount < total;
  const allConfidence = total > 0 && confCount === total;
  const perfPending = allConfidence && perfCount < total;
  const allDone = total > 0 && perfCount === total;
  const carryoverConflict = !!carryoverPending && (carryoverPending.week_in_cycle !== weekInCycle || carryoverPending.cycle !== cycle);

  type CtaConfig = { label: string; onClick: () => void } | null;

  // Build banner only when fully ready (prevents flash)
  const { bannerMessage, bannerCta }: { bannerMessage: string; bannerCta: CtaConfig } = useMemo(() => {
    if (!readyForBanner || !staff) return { bannerMessage: '', bannerCta: null };

    if (carryoverConflict && carryoverPending) {
      return {
        bannerMessage: 'You still need to submit performance for last week before starting a new one.',
        bannerCta: {
          label: 'Finish Performance',
          onClick: async () => {
            const { data: focusData } = await supabase
              .from('weekly_focus')
              .select('id, display_order')
              .eq('cycle', carryoverPending.cycle)
              .eq('week_in_cycle', carryoverPending.week_in_cycle)
              .eq('role_id', staff.role_id)
              .order('display_order');

            const focusIds = (focusData || []).map((f: any) => f.id);
            if (!focusIds.length) {
              navigate(`/performance/${carryoverPending.week_in_cycle}/step/1`, { state: { carryover: true } });
              return;
            }

            const { data: scores } = await supabase
              .from('weekly_scores')
              .select('weekly_focus_id, performance_score')
              .eq('staff_id', staff.id)
              .in('weekly_focus_id', focusIds);

            const ordered = (focusData || []) as { id: string; display_order: number }[];
            const firstIdx = ordered.findIndex((f) => !scores?.find((s) => s.weekly_focus_id === f.id)?.performance_score);
            const idx = firstIdx === -1 ? 0 : firstIdx;
            navigate(`/performance/${carryoverPending.week_in_cycle}/step/${idx + 1}`, { state: { carryover: true } });
          }
        }
      };
    }

    if (allDone) return { bannerMessage: '✓ All set for this week. Great work!', bannerCta: null };
    if (beforeCheckIn) return { bannerMessage: 'Confidence opens at 9:00 a.m. CT.', bannerCta: null };
    if (afterTueNoon && !allConfidence) {
      return { bannerMessage: `Confidence window closed. You’ll get a fresh start on Mon, ${nextMondayStr(now)}.`, bannerCta: null };
    }

    if (!afterTueNoon && !allConfidence) {
      const label = partialConfidence ? 'Finish Confidence' : 'Rate Confidence';
      return {
        bannerMessage: partialConfidence
          ? `You're midway through Monday check-in. Finish your confidence ratings (${confCount}/${total}).`
          : `Welcome back! Time to rate your confidence for this week’s Pro Moves.`,
        bannerCta: {
          label,
          onClick: () => {
            const idx = firstIncompleteConfIndex === -1 ? 0 : firstIncompleteConfIndex;
            navigate(`/confidence/${weekInCycle}/step/${idx + 1}`);
          }
        }
      };
    }

    if (allConfidence && beforeThursday) {
      return { bannerMessage: 'Great! Come back Thursday to submit performance.', bannerCta: null };
    }

    if (allConfidence && !beforeThursday && perfPending) {
      return {
        bannerMessage: perfCount === 0
          ? 'Time to reflect. Rate your performance for this week’s Pro Moves.'
          : `Pick up where you left off (${perfCount}/${total} complete).`,
        bannerCta: {
          label: 'Rate Performance',
          onClick: () => {
            const idx = firstIncompletePerfIndex === -1 ? 0 : firstIncompletePerfIndex;
            navigate(`/performance/${weekInCycle}/step/${idx + 1}`);
          }
        }
      };
    }

    return { bannerMessage: 'Review your Pro Moves below.', bannerCta: null };
  }, [
    readyForBanner,
    staff,
    carryoverConflict,
    carryoverPending,
    navigate,
    allDone,
    beforeCheckIn,
    afterTueNoon,
    allConfidence,
    partialConfidence,
    confCount,
    total,
    firstIncompleteConfIndex,
    allConfidence,
    beforeThursday,
    perfPending,
    perfCount,
    firstIncompletePerfIndex,
    weekInCycle,
    now
  ]);

  // ---------------- render ----------------
  if (loading || !readyForBanner || !staff) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>This Week&apos;s Pro Moves</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-24 rounded-md bg-muted animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (weeklyFocus.length === 0) {
    return (
      <Card className="overflow-hidden">
        <CardHeader>
          <CardTitle>This Week&apos;s Pro Moves</CardTitle>
          <CardDescription>No Pro Moves found. Please check back later.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" className="w-full" onClick={() => navigate('/')}>Back to Dashboard</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle>This Week&apos;s Pro Moves</CardTitle>
        <CardDescription>These are the 3 actions you’ll focus on this week.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Pro Moves list */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">This Week&apos;s Pro Moves:</h3>
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Confidence</span>
          </div>

          {weeklyFocus.map((focus, index) => {
            const score = weeklyScores.find(s => s.weekly_focus_id === focus.id);
            const unchosenSelfSelect = !!focus.self_select && (!score || score.selected_action_id == null);
            const domainName = focus.competencies?.domains?.domain_name;
            const bgColor = domainName ? getDomainColor(domainName) : undefined;

            return (
              <div key={focus.id} className="rounded-lg p-4 border" style={bgColor ? { backgroundColor: bgColor } : undefined}>
                {domainName && (
                  <Badge variant="secondary" className="text-xs font-semibold mb-2 bg-white/80 text-gray-900" aria-label={`Domain: ${domainName}`}>
                    {domainName}
                  </Badge>
                )}

                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <p className="text-sm font-medium flex-1">{focus.pro_moves?.action_statement || 'Self-Select'}</p>
                  </div>
                  <div className="min-w-12 flex justify-end">
                    {score?.confidence_score != null ? (
                      <span
                        className="inline-flex items-center justify-center w-8 h-6 rounded-md bg-primary/10 text-primary text-sm font-semibold tabular-nums"
                        aria-label={`Confidence ${score.confidence_score}`}
                      >
                        {score.confidence_score}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </div>
                </div>

                {unchosenSelfSelect && (
                  <div className="mt-1">
                    <Button
                      variant="link"
                      className="h-auto p-0 text-xs"
                      onClick={() => navigate(`/confidence/${weekInCycle}/step/${index + 1}`)}
                    >
                      Choose your Pro Move
                    </Button>
                  </div>
                )}

                <div className="flex gap-2 mt-2">
                  {score?.performance_score != null && (
                    <Badge variant="secondary" className="text-xs">Performance: {score.performance_score}</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Dynamic message + CTA — moved to BOTTOM of the panel */}
        <div className="rounded-md border bg-muted p-3">
          <div className="font-medium text-sm text-foreground text-center">{bannerMessage}</div>
          {bannerCta && (
            <Button className="w-full h-12 mt-2" onClick={bannerCta.onClick} aria-label="Next action">
              {bannerCta.label}
            </Button>
          )}
          {!carryoverPending && !afterTueNoon && confCount > 0 && confCount < total && (
            <div className="text-xs text-muted-foreground text-center mt-1">{confCount}/{total} complete</div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}