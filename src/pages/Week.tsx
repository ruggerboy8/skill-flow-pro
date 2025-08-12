import { useState, useEffect } from 'react';
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
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [weeklyScores, setWeeklyScores] = useState<WeeklyScore[]>([]);
  const [carryoverPending, setCarryoverPending] = useState<{ cycle: number; week_in_cycle: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const params = useParams();

  useEffect(() => {
    if (user) {
      loadStaffProfile();
    }
  }, [user]);

  useEffect(() => {
    // Parse cycle and week from URL params (format: "1-2" for cycle 1, week 2)
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

  const loadWeekData = async () => {
    if (!staff) return;
    
    setLoading(true);
    
    // Load weekly focus with pro moves and domain data (left joins to support self-select)
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
      toast({
        title: "Error",
        description: "Failed to load Pro Moves for this week",
        variant: "destructive"
      });
      setLoading(false);
      return;
    }

    const transformedFocus = (focusData || []).map(item => ({
      id: item.id,
      display_order: item.display_order,
      action_statement: (item.pro_moves as any)?.action_statement || 'Self-Select',
      self_select: (item as any)?.self_select ?? false,
      competency_id: (item as any)?.competency_id ?? undefined,
      domain_name: ((item as any)?.competencies?.domains as any)?.domain_name ?? undefined,
    }));

    setWeeklyFocus(transformedFocus);

    // Load existing scores
    if (focusData && focusData.length > 0) {
      const focusIds = focusData.map(f => f.id);
      const { data: scoresData } = await supabase
        .from('weekly_scores')
        .select('weekly_focus_id, confidence_score, performance_score, selected_action_id')
        .eq('staff_id', staff.id)
        .in('weekly_focus_id', focusIds);

      setWeeklyScores(scoresData || []);

      // Check for carryover (pending performance in most recent week)
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
          // Auto-route directly to carryover performance wizard first incomplete step
          const { data: focusData } = await supabase
            .from('weekly_focus')
            .select('id, display_order')
            .eq('cycle', wf.cycle)
            .eq('week_in_cycle', wf.week_in_cycle)
            .eq('role_id', staff.role_id)
            .order('display_order');
          const focusIds = (focusData || []).map((f: any) => f.id);
          if (!focusIds.length) return navigate(`/week/${wf.cycle}-${wf.week_in_cycle}`);
          const { data: scores } = await supabase
            .from('weekly_scores')
            .select('weekly_focus_id, performance_score')
            .eq('staff_id', staff.id)
            .in('weekly_focus_id', focusIds);
          const ordered = (focusData || []) as { id: string; display_order: number }[];
          const firstIdx = ordered.findIndex((f) => !scores?.find((s) => s.weekly_focus_id === f.id)?.performance_score);
          const idx = firstIdx === -1 ? 0 : firstIdx;
          navigate(`/performance/${wf.week_in_cycle}/step/${idx + 1}`, { state: { carryover: true } });
          return;
        }
    }
    
    setLoading(false);
  };

  const getScoreForFocus = (focusId: string) => {
    return weeklyScores.find(score => score.weekly_focus_id === focusId);
  };

  const canRateConfidence = () => {
    return weeklyFocus.every(focus => {
      const score = getScoreForFocus(focus.id);
      return !score || score.confidence_score === null;
    });
  };

  const canRatePerformance = () => {
    return weeklyFocus.every(focus => {
      const score = getScoreForFocus(focus.id);
      return score && score.confidence_score !== null && score.performance_score === null;
    });
  };

  const isWeekComplete = () => {
    return weeklyFocus.every(focus => {
      const score = getScoreForFocus(focus.id);
      return score && score.confidence_score !== null && score.performance_score !== null;
    });
  };

// Central Time gating + state
  const now = nowUtc();
  const { monCheckInZ, tueDueZ, thuStartZ } = getAnchors(now);
  const confCount = weeklyFocus.filter(f => getScoreForFocus(f.id)?.confidence_score != null).length;
  const perfCount = weeklyFocus.filter(f => getScoreForFocus(f.id)?.performance_score != null).length;
  const total = weeklyFocus.length;

  const beforeCheckIn = now < monCheckInZ;
  const afterTueNoon = now >= tueDueZ;
  const beforeThursday = now < thuStartZ;

  const partialConfidence = confCount > 0 && confCount < total;
  const allConfidence = total > 0 && confCount === total;
  const perfPending = allConfidence && perfCount === 0;
  const allDone = total > 0 && perfCount === total;

  const carryoverConflict = !!carryoverPending && (carryoverPending!.week_in_cycle !== weekInCycle || carryoverPending!.cycle !== cycle);

  const showSoftReset = !carryoverConflict && afterTueNoon && !allConfidence;
  const showConfidenceCTA = !carryoverConflict && !beforeCheckIn && !afterTueNoon && confCount < total;
  const showPerfLocked = !carryoverConflict && allConfidence && beforeThursday;
  const showPerformanceCTA = !carryoverConflict && !beforeThursday && perfPending;


  if (loading) {
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
            {/* Next Up orientation */}
            {carryoverConflict ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-center">Finish last week before starting a new one</CardTitle>
                  <CardDescription className="text-center">You still need to submit performance for last week.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    className="w-full h-12"
                    onClick={async () => {
                      if (!carryoverPending || !staff) return;
                      // Fetch the carryover week's focus and find first incomplete performance item
                      const { data: focusData } = await supabase
                        .from('weekly_focus')
                        .select('id, display_order')
                        .eq('cycle', carryoverPending.cycle)
                        .eq('week_in_cycle', carryoverPending.week_in_cycle)
                        .eq('role_id', staff.role_id)
                        .order('display_order');
                      const focusIds = (focusData || []).map((f: any) => f.id);
                      if (!focusIds.length) return navigate(`/performance/${carryoverPending.week_in_cycle}`, { state: { carryover: true } });
                      const { data: scores } = await supabase
                        .from('weekly_scores')
                        .select('weekly_focus_id, performance_score')
                        .eq('staff_id', staff.id)
                        .in('weekly_focus_id', focusIds);
                      const ordered = (focusData || []) as { id: string; display_order: number }[];
                      const firstIdx = ordered.findIndex((f) => !scores?.find((s) => s.weekly_focus_id === f.id)?.performance_score);
                      const idx = firstIdx === -1 ? 0 : firstIdx;
                      const startFocus = ordered[idx];
                      navigate(`/performance/${carryoverPending.week_in_cycle}/step/${idx + 1}`, { state: { carryover: true } });
                    }}
                  >
                    Finish Performance
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Completed state */}
                {allDone && (
                  <Badge variant="default" className="w-full justify-center py-2">
                    ✓ Completed for Cycle {cycle}, Week {weekInCycle}
                  </Badge>
                )}

                {/* Before check-in */}
                {beforeCheckIn && !allDone && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-center">Confidence opens at 9:00 a.m. CT.</CardTitle>
                    </CardHeader>
                  </Card>
                )}

                {/* Confidence window closed */}
                {!beforeCheckIn && afterTueNoon && !allConfidence && (
                  <div className="p-3 rounded-md border bg-muted">
                    <div className="font-medium">Confidence window closed</div>
                    <div className="text-sm text-muted-foreground">You’ll get a fresh start on Mon, {nextMondayStr(now)}.</div>
                  </div>
                )}

                {/* Confidence CTA (rate or finish) */}
                {!beforeCheckIn && !afterTueNoon && !allConfidence && (
                  <>
                    <Button
                      onClick={() => {
                        const firstIdx = weeklyFocus.findIndex((f) => {
                          const s = getScoreForFocus(f.id);
                          return !s || s.confidence_score == null;
                        });
                        const idx = firstIdx === -1 ? 0 : firstIdx;
                        navigate(`/confidence/${weekInCycle}/step/${idx + 1}`);
                      }}
                      className="w-full h-12"
                    >
                      {partialConfidence ? 'Finish Confidence' : 'Rate Confidence'}
                    </Button>
                    {partialConfidence && (
                      <div className="text-xs text-muted-foreground text-center mt-1">{confCount}/{total} complete</div>
                    )}
                  </>
                )}

                {/* Performance locked until Thu */}
                {allConfidence && beforeThursday && (
                  <Button className="w-full h-12" variant="outline" disabled>
                    Performance opens Thursday
                  </Button>
                )}

                {/* Performance CTA */}
                {allConfidence && !beforeThursday && perfPending && (
                  <Button
                    onClick={() => {
                      const firstIdx = weeklyFocus.findIndex((f) => {
                        const s = getScoreForFocus(f.id);
                        return s && s.performance_score == null;
                      });
                      const idx = firstIdx === -1 ? 0 : firstIdx;
                      navigate(`/performance/${weekInCycle}/step/${idx + 1}`);
                    }}
                    className="w-full h-12"
                  >
                    Rate Performance
                  </Button>
                )}
              </>
            )}

            {/* This Week's Pro Moves */}
            <div className="space-y-3">
              <h3 className="font-medium">This Week's Pro Moves:</h3>
              {weeklyFocus.map((focus, index) => {
                const score = getScoreForFocus(focus.id);
                const unchosenSelfSelect = !!focus.self_select && (!score || score.selected_action_id == null);
                return (
                  <div key={focus.id} className="p-3 bg-muted rounded-lg">
                    <div className="flex items-start gap-2">
                      <Badge variant="outline" className="text-xs">{index + 1}</Badge>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          {focus.domain_name && (
                            <span className="inline-flex items-center rounded px-2 py-0.5 text-[10px]" style={{ backgroundColor: getDomainColor(focus.domain_name) }}>
                              {focus.domain_name}
                            </span>
                          )}
                          <p className="text-sm flex-1">{focus.action_statement}</p>
                        </div>
                        {unchosenSelfSelect && (
                          <div className="mt-1">
                            <Button variant="link" className="h-auto p-0 text-xs" onClick={() => navigate(`/confidence/${weekInCycle}/step/${index + 1}`)}>
                              Choose your Pro Move
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2 mt-2">
                      {score?.confidence_score != null && (
                        <Badge variant="secondary" className="text-xs">Confidence: {score.confidence_score}</Badge>
                      )}
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
      </div>
    </div>
  );
}