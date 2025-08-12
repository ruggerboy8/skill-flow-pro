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
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocusRow[]>([]);
  const [weeklyScores, setWeeklyScores] = useState<WeeklyScoreRow[]>([]);
  const [carryoverPending, setCarryoverPending] = useState<{ cycle: number; week_in_cycle: number } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [carryoverChecked, setCarryoverChecked] = useState<boolean>(false);

  useEffect(() => {
    if (user) loadStaff();
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
    if (staff) loadWeekData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staff, weekInCycle]);

  async function loadWeekData() {
    if (!staff) return;
    setLoading(true);
    setCarryoverChecked(false);

    // Load focus rows with optional joins for action/domain
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
      return;
    }

    const transformed = (focusData || []).map((item: any) => ({
      id: item.id,
      display_order: item.display_order,
      self_select: item.self_select ?? false,
      competency_id: item.competency_id ?? undefined,
      pro_moves: item.pro_moves ?? null,
      competencies: item.competencies ?? null,
    })) as WeeklyFocusRow[];
    setWeeklyFocus(transformed);

    if ((focusData || []).length > 0) {
      const focusIds = (focusData || []).map((f: any) => f.id);
      const { data: scores } = await supabase
        .from('weekly_scores')
        .select('weekly_focus_id, confidence_score, performance_score, selected_action_id')
        .eq('staff_id', staff.id)
        .in('weekly_focus_id', focusIds);

      setWeeklyScores(scores || []);

      // Determine carryover (most recent week with perf pending)
      const { data: pending } = await supabase
        .from('weekly_scores')
        .select('updated_at, weekly_focus!inner(cycle, week_in_cycle, role_id)')
        .eq('staff_id', staff.id)
        .eq('weekly_focus.role_id', staff.role_id)
        .not('confidence_score', 'is', null)
        .is('performance_score', null)
        .order('updated_at', { ascending: false })
        .limit(1);

      const wf: any = pending && pending[0] && (pending[0] as any).weekly_focus;
      if (wf) setCarryoverPending({ cycle: wf.cycle, week_in_cycle: wf.week_in_cycle });
      else setCarryoverPending(null);
    } else {
      setWeeklyScores([]);
      setCarryoverPending(null);
    }

    setCarryoverChecked(true);
    setLoading(false);
  }

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

  // Central-Time anchors
  const now = nowUtc();
  const { monCheckInZ, tueDueZ, thuStartZ } = getAnchors(now);
  const beforeCheckIn = now < monCheckInZ;
  const afterTueNoon = now >= tueDueZ;
  const beforeThursday = now < thuStartZ;

  const partialConfidence = confCount > 0 && confCount < total;
  const allConfidence = total > 0 && confCount === total;
  const perfPending = allConfidence && perfCount < total;
  const allDone = total > 0 && perfCount === total;
  const carryoverConflict = !!carryoverPending && (carryoverPending.week_in_cycle !== weekInCycle || carryoverPending.cycle !== cycle);

  type CtaConfig = { label: string; onClick: () => void } | null;

  function buildBanner(): { message: string; cta: CtaConfig } {
    if (carryoverChecked && carryoverConflict && carryoverPending) {
      return {
        message: 'You still need to submit performance for last week before starting a new one.',
        cta: {
          label: 'Finish Performance',
          onClick: async () => {
            if (!staff) return;
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

    if (allDone) return { message: '✓ All set for this week. Great work!', cta: null };
    if (beforeCheckIn) return { message: 'Confidence opens at 9:00 a.m. CT.', cta: null };
    if (afterTueNoon && !allConfidence) {
      return { message: `Confidence window closed. You’ll get a fresh start on Mon, ${nextMondayStr(now)}.`, cta: null };
    }

    if (!afterTueNoon && !allConfidence) {
      const label = partialConfidence ? 'Finish Confidence' : 'Rate Confidence';
      return {
        message: partialConfidence
          ? `You're midway through Monday check-in. Finish your confidence ratings (${confCount}/${total}).`
          : `Welcome back! Time to rate your confidence for this week’s Pro Moves.`,
        cta: {
          label,
          onClick: () => {
            const idx = firstIncompleteConfIndex === -1 ? 0 : firstIncompleteConfIndex;
            navigate(`/confidence/${weekInCycle}/step/${idx + 1}`);
          }
        }
      };
    }

    if (allConfidence && beforeThursday) {
      return { message: 'Great! Come back Thursday to submit performance.', cta: null };
    }

    if (allConfidence && !beforeThursday && perfPending) {
      return {
        message: perfCount === 0
          ? 'Time to reflect. Rate your performance for this week’s Pro Moves.'
          : `Pick up where you left off (${perfCount}/${total} complete).`,
        cta: {
          label: 'Rate Performance',
          onClick: () => {
            const idx = firstIncompletePerfIndex === -1 ? 0 : firstIncompletePerfIndex;
            navigate(`/performance/${weekInCycle}/step/${idx + 1}`);
          }
        }
      };
    }

    return { message: 'Review your Pro Moves below.', cta: null };
  }

  const { message: bannerMessage, cta: bannerCta } = buildBanner();

  if (loading) {
    return (
      <div className="p-6 bg-primary/10 rounded-lg border border-primary/20"><div>Loading...</div></div>
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

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">This Week&apos;s Pro Moves:</h3>
            <span className="text-xs text-muted-foreground">Confidence</span>
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
                  <div className="text-sm font-medium tabular-nums">
                    {score?.confidence_score != null ? score.confidence_score : ''}
                  </div>
                </div>

                {unchosenSelfSelect && (
                  <div className="mt-1">
                    <Button variant="link" className="h-auto p-0 text-xs" onClick={() => navigate(`/confidence/${weekInCycle}/step/${index + 1}`)}>
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
      </CardContent>
    </Card>
  );
}
