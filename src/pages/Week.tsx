// src/pages/Week.tsx
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { nowUtc, getAnchors, nextMondayStr } from '@/lib/centralTime';
import { getDomainColor } from '@/lib/domainColors';

interface Staff {
  id: string;
  role_id: number;
}

interface WeeklyFocus {
  id: string;
  display_order: number;
  action_statement: string;
  self_select?: boolean;
  competency_id?: number;
  domain_name?: string;
}

interface WeeklyScore {
  weekly_focus_id: string;
  confidence_score: number | null;
  performance_score: number | null;
  selected_action_id?: number | null;
}

export default function Week() {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [cycle, setCycle] = useState(1);
  const [weekInCycle, setWeekInCycle] = useState(1);

  // data
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [weeklyScores, setWeeklyScores] = useState<WeeklyScore[]>([]);
  const [carryoverPending, setCarryoverPending] = useState<{ cycle: number; week_in_cycle: number } | null>(null);

  // loading flags (separate “page loading” vs “banner decision ready”)
  const [pageLoading, setPageLoading] = useState(true);
  const [bannerReady, setBannerReady] = useState(false);

  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const params = useParams();

  // ---------- load staff + choose default week ----------
  useEffect(() => {
    if (user) {
      loadStaffProfile();
    }
  }, [user]);

  useEffect(() => {
    if (params.weekId) {
      const [cycleStr, weekStr] = params.weekId.split('-');
      setCycle(parseInt(cycleStr) || 1);
      setWeekInCycle(parseInt(weekStr) || 1);
    }
  }, [params.weekId]);

  useEffect(() => {
    if (staff && cycle && weekInCycle) {
      loadWeekData();
    }
  }, [staff, cycle, weekInCycle]);

  const loadStaffProfile = async () => {
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
  };

  const selectDefaultWeek = async (s: Staff) => {
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
    setCycle(1);
    setWeekInCycle(chosen);
  };

  // ---------- load week data ----------
  const loadWeekData = async () => {
    if (!staff) return;

    // Prevent “flash”: clear everything and keep pageLoading true until all decisions ready.
    setPageLoading(true);
    setBannerReady(false);
    setWeeklyFocus([]);
    setWeeklyScores([]);
    setCarryoverPending(null);

    // Focus (left joins: pro_moves for both site moves and self-select choices)
    const { data: focusData, error: focusError } = await supabase
      .from('weekly_focus')
      .select(`
        id,
        display_order,
        self_select,
        competency_id,
        action_id,
        pro_moves!weekly_focus_action_id_fkey ( action_statement ),
        competencies ( domains ( domain_name ) ),
        weekly_self_select (
          selected_pro_move_id,
          pro_moves!weekly_self_select_selected_pro_move_id_fkey ( action_statement, competencies ( domains ( domain_name ) ) )
        )
      `)
      .eq('cycle', cycle)
      .eq('week_in_cycle', weekInCycle)
      .eq('role_id', staff.role_id)
      .eq('weekly_self_select.user_id', user!.id)
      .order('display_order');

    if (focusError) {
      toast({
        title: 'Error',
        description: 'Failed to load Pro Moves for this week',
        variant: 'destructive',
      });
      setPageLoading(false);
      return;
    }

    const transformedFocus: WeeklyFocus[] = (focusData || []).map(item => {
      const isSelSelect = (item as any)?.self_select ?? false;
      const siteMove = (item as any)?.pro_moves;
      const selfSelectData = (item as any)?.weekly_self_select?.[0];
      const selectedMove = selfSelectData?.pro_moves;
      
      return {
        id: item.id,
        display_order: item.display_order,
        action_statement: isSelSelect 
          ? (selectedMove?.action_statement || 'Choose a pro-move')
          : (siteMove?.action_statement || 'Self-Select'),
        self_select: isSelSelect,
        competency_id: (item as any)?.competency_id ?? undefined,
        domain_name: isSelSelect 
          ? (selectedMove?.competencies?.domains?.domain_name || ((item as any)?.competencies?.domains as any)?.domain_name)
          : ((item as any)?.competencies?.domains as any)?.domain_name,
      };
    });

    // If no focus, stop here
    if (transformedFocus.length === 0) {
      setWeeklyFocus([]);
      setPageLoading(false);
      setBannerReady(true); // ready to render the “no pro moves” card
      return;
    }

    setWeeklyFocus(transformedFocus);

    // Scores
    const focusIds = transformedFocus.map(f => f.id);
    const { data: scoresData } = await supabase
      .from('weekly_scores')
      .select('weekly_focus_id, confidence_score, performance_score, selected_action_id')
      .eq('staff_id', staff.id)
      .in('weekly_focus_id', focusIds);

    setWeeklyScores(scoresData || []);

    // Carryover check (pending performance in the most recent week)
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
    if (wf) {
      setCarryoverPending({ cycle: wf.cycle, week_in_cycle: wf.week_in_cycle });
    }

    // All inputs for banner are present now → safe to render banner without flicker
    setBannerReady(true);
    setPageLoading(false);
  };

  // ---------- helpers / derived state ----------
  const getScoreForFocus = (focusId: string) =>
    weeklyScores.find(score => score.weekly_focus_id === focusId);

  const total = weeklyFocus.length;
  const confCount = weeklyFocus.filter(f => getScoreForFocus(f.id)?.confidence_score != null).length;
  const perfCount = weeklyFocus.filter(f => getScoreForFocus(f.id)?.performance_score != null).length;

  const firstIncompleteConfIndex = weeklyFocus.findIndex(
    f => (getScoreForFocus(f.id)?.confidence_score ?? null) === null
  );
  const firstIncompletePerfIndex = weeklyFocus.findIndex(
    f =>
      (getScoreForFocus(f.id)?.confidence_score ?? null) !== null &&
      (getScoreForFocus(f.id)?.performance_score ?? null) === null
  );

  // Central-Time gating (memoize so anchors don’t bounce during renders)
  const { now, monCheckInZ, tueDueZ, thuStartZ, beforeCheckIn, afterTueNoon, beforeThursday } = useMemo(() => {
    const n = nowUtc();
    const anchors = getAnchors(n);
    return {
      now: n,
      ...anchors,
      beforeCheckIn: n < anchors.monCheckInZ,
      afterTueNoon: n >= anchors.tueDueZ,
      beforeThursday: n < anchors.thuStartZ,
    };
  }, []);

  const partialConfidence = confCount > 0 && confCount < total;
  const allConfidence = total > 0 && confCount === total;
  const perfPending = allConfidence && perfCount < total;
  const allDone = total > 0 && perfCount === total;

  const carryoverConflict =
    !!carryoverPending &&
    (carryoverPending!.week_in_cycle !== weekInCycle || carryoverPending!.cycle !== cycle);

  type CtaConfig = { label: string; onClick: () => void; disabled?: boolean } | null;

  // Build banner content only when we’re fully ready (prevents flash)
  const { bannerMessage, bannerCta } = useMemo((): { bannerMessage: string; bannerCta: CtaConfig } => {
    if (!bannerReady) return { bannerMessage: '', bannerCta: null };

    // 1) Must finish last week's performance first
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
              .eq('role_id', staff!.role_id)
              .order('display_order');

            const focusIds = (focusData || []).map((f: any) => f.id);
            if (!focusIds.length) {
              navigate(`/performance/${carryoverPending.week_in_cycle}/step/1`, { state: { carryover: true } });
              return;
            }

            const { data: scores } = await supabase
              .from('weekly_scores')
              .select('weekly_focus_id, performance_score')
              .eq('staff_id', staff!.id)
              .in('weekly_focus_id', focusIds);

            const ordered = (focusData || []) as { id: string; display_order: number }[];
            const firstIdx = ordered.findIndex(
              (f) => !scores?.find((s) => s.weekly_focus_id === f.id)?.performance_score
            );
            const idx = firstIdx === -1 ? 0 : firstIdx;
            navigate(`/performance/${carryoverPending.week_in_cycle}/step/${idx + 1}`, { state: { carryover: true } });
          },
        },
      };
    }

    // 2) All done for the week
    if (allDone) {
      return {
        bannerMessage: 'Nice work! That\'s it for now, see you next week!',
        bannerCta: null,
      };
    }

    // 3) Before Monday 9 AM CT
    if (beforeCheckIn) {
      return {
        bannerMessage: 'Confidence opens at 9:00 a.m. CT.',
        bannerCta: null,
      };
    }

    // 4) Confidence window closed after Tue 12:00 CT (and not all confidence entered)
    if (afterTueNoon && !allConfidence) {
      return {
        bannerMessage: `Confidence window closed. You’ll get a fresh start on Mon, ${nextMondayStr(now)}.`,
        bannerCta: null,
      };
    }

    // 5) Confidence window open (Mon 9:00 → Tue 11:59) and not all confidence done
    if (!afterTueNoon && !allConfidence) {
      const label = partialConfidence ? 'Finish Confidence' : 'Rate Confidence';
      const idx = firstIncompleteConfIndex === -1 ? 0 : firstIncompleteConfIndex;
      return {
        bannerMessage: partialConfidence
          ? `You're midway through Monday check-in. Finish your confidence ratings (${confCount}/${total}).`
          : `Welcome back! Time to rate your confidence for this week’s Pro Moves.`,
        bannerCta: {
          label,
          onClick: () => navigate(`/confidence/${weekInCycle}/step/${idx + 1}`),
        },
      };
    }

    // 6) All confidence done; performance locked until Thursday (unless carryover)
    if (allConfidence && beforeThursday) {
      return {
        bannerMessage: 'Great! Come back Thursday to submit performance.',
        bannerCta: null, // no disabled buttons; simpler UX
      };
    }

    // 7) Performance open (Thu+) and still pending
    if (allConfidence && !beforeThursday && perfPending) {
      const idx = firstIncompletePerfIndex === -1 ? 0 : firstIncompletePerfIndex;
      return {
        bannerMessage:
          perfCount === 0
            ? 'Time to reflect. Rate your performance for this week’s Pro Moves.'
            : `Pick up where you left off (${perfCount}/${total} complete).`,
        bannerCta: {
          label: 'Rate Performance',
          onClick: () => navigate(`/performance/${weekInCycle}/step/${idx + 1}`),
        },
      };
    }

    // Fallback
    return { bannerMessage: 'Review your Pro Moves below.', bannerCta: null };
  }, [
    bannerReady,
    carryoverConflict,
    carryoverPending,
    staff,
    navigate,
    allDone,
    beforeCheckIn,
    afterTueNoon,
    allConfidence,
    now,
    weekInCycle,
    perfPending,
    perfCount,
    total,
    firstIncompleteConfIndex,
    firstIncompletePerfIndex,
    confCount,
    beforeThursday,
  ]);

  // ---------- render ----------
  if (pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">Loading...</div>
      </div>
    );
  }

  if (weeklyFocus.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle>No Pro Moves Set</CardTitle>
            <CardDescription>
              No Pro Moves have been configured for Cycle {cycle}, Week {weekInCycle}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button variant="outline" onClick={() => navigate('/')} className="w-full">
              Back to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-md mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-center">SkillCheck</CardTitle>
            <CardDescription className="text-center">
              Cycle {cycle}, Week {weekInCycle}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* This Week's Pro Moves */}
            <div className="space-y-3">
              <h3 className="font-medium">This Week&apos;s Pro Moves:</h3>

              {weeklyFocus.map((focus, index) => {
                const score = getScoreForFocus(focus.id);
                const unchosenSelfSelect =
                  !!focus.self_select && (!score || score.selected_action_id == null);

                return (
                  <div
                    key={focus.id}
                    className="rounded-lg p-4 border"
                    style={{ backgroundColor: getDomainColor(focus.domain_name) }}
                  >
                    {focus.domain_name && (
                      <Badge
                        variant="secondary"
                        className="text-xs font-semibold mb-2 bg-white/80 text-gray-900"
                      >
                        {focus.domain_name}
                      </Badge>
                    )}
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="text-xs">{index + 1}</Badge>
                      <p className="text-sm font-medium text-gray-900 flex-1">
                        {focus.action_statement}
                      </p>
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
                      {score?.confidence_score != null && (
                        <Badge variant="secondary" className="text-xs">
                          Confidence: {score.confidence_score}
                        </Badge>
                      )}
                      {score?.performance_score != null && (
                        <Badge variant="secondary" className="text-xs">
                          Performance: {score.performance_score}
                        </Badge>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* ↓↓↓ Moved the dynamic banner BELOW the list to live inside the Pro Moves box ↓↓↓ */}
              {bannerReady && (
                <div className="rounded-md border bg-muted p-3 mt-2">
                  <div className="font-medium text-sm text-foreground text-center">
                    {bannerMessage}
                  </div>
                  {/** Show CTA only when actionable (no disabled “Thursday” button) */}
                  {bannerCta && !bannerCta.disabled && (
                    <Button className="w-full h-12 mt-2" onClick={bannerCta.onClick}>
                      {bannerCta.label}
                    </Button>
                  )}
                  {/** Tiny progress hint if we’re mid-confidence window */}
                  {!carryoverConflict && !afterTueNoon && confCount > 0 && confCount < total && (
                    <div className="text-xs text-muted-foreground text-center mt-1">
                      {confCount}/{total} complete
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Back to main dashboard */}
            <div className="space-y-2 pt-2">
              <Button variant="outline" onClick={() => navigate('/')} className="w-full">
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}