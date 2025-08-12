import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';
import { nowUtc, getAnchors, nextMondayStr } from '@/lib/centralTime';
interface Staff {
  id: string;
  role_id: number;
}

interface WeeklyFocus {
  id: string;
  display_order: number;
  action_statement: string;
  domain_name: string;
}

export default function WeekInfo() {
  const { cycle, week } = useParams();
  const [staff, setStaff] = useState<Staff | null>(null);
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [weeklyScores, setWeeklyScores] = useState<Array<{ weekly_focus_id: string; confidence_score: number | null; performance_score: number | null; selected_action_id: number | null }>>([]);
  const [selfSelectIds, setSelfSelectIds] = useState<Record<string, boolean>>({});
  const [hasConfidenceScores, setHasConfidenceScores] = useState(false);
  const [hasPerformanceScores, setHasPerformanceScores] = useState(false);
  const [carryoverPending, setCarryoverPending] = useState<{ cycle: number; week_in_cycle: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const cycleNum = parseInt(cycle || '1');
  const weekNum = parseInt(week || '1');

  // Thin redirect to canonical Week route
  const [redirected, setRedirected] = useState(false);
  useEffect(() => {
    if (!redirected) {
      setRedirected(true);
      navigate(`/week/${cycleNum}-${weekNum}`, { replace: true });
    }
  }, [redirected, cycleNum, weekNum, navigate]);

  const now = nowUtc();
  const { monCheckInZ, tueDueZ, thuStartZ } = getAnchors(now);
  const beforeCheckIn = now < monCheckInZ;
  const afterTueNoon = now >= tueDueZ;

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, cycle, week]);

  const loadData = async () => {
    if (!user) return;

    // Load staff profile
    const { data: staffData, error: staffError } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user.id)
      .single();

    if (staffError || !staffData) {
      navigate('/setup');
      return;
    }

    setStaff(staffData);

    // Load weekly focus using RPC to get domain information
    const { data: focusData, error: focusError } = await supabase.rpc('get_focus_cycle_week', {
      p_cycle: cycleNum,
      p_week: weekNum,
      p_role_id: staffData.role_id
    }) as { data: WeeklyFocus[] | null; error: any };

    if (focusError || !focusData || focusData.length === 0) {
      toast({
        title: "No Pro Moves",
        description: "No Pro Moves found for this week",
        variant: "destructive"
      });
      navigate('/');
      return;
    }

    setWeeklyFocus(focusData);

    // Load existing scores (including selected_action_id for self-selects)
    const focusIds = focusData.map(f => f.id);
    const { data: scoresData } = await supabase
      .from('weekly_scores')
      .select('weekly_focus_id, confidence_score, performance_score, selected_action_id')
      .eq('staff_id', staffData.id)
      .in('weekly_focus_id', focusIds);

    setWeeklyScores(scoresData || []);

    const confidenceScores = (scoresData || []).filter(s => s.confidence_score !== null);
    const performanceScores = (scoresData || []).filter(s => s.performance_score !== null);
    setHasConfidenceScores(confidenceScores.length === focusData.length);
    setHasPerformanceScores(performanceScores.length === focusData.length);

    // Load self-select flags for this week's focus items
    const { data: wfMeta } = await supabase
      .from('weekly_focus')
      .select('id, self_select')
      .in('id', focusIds);
    const selfSelectMap: Record<string, boolean> = {};
    (wfMeta || []).forEach((r: any) => { selfSelectMap[r.id] = !!r.self_select; });
    setSelfSelectIds(selfSelectMap);

    // Check for carryover (pending performance in most recent week)
    const { data: pending } = await supabase
      .from('weekly_scores')
      .select('updated_at, weekly_focus!inner(cycle, week_in_cycle, role_id)')
      .eq('staff_id', staffData.id)
      .eq('weekly_focus.role_id', staffData.role_id)
      .not('confidence_score', 'is', null)
      .is('performance_score', null)
      .order('updated_at', { ascending: false })
      .limit(1);
    const wf: any = pending && pending[0] && (pending[0] as any).weekly_focus;
    if (wf) {
      setCarryoverPending({ cycle: wf.cycle, week_in_cycle: wf.week_in_cycle });
      if (wf.week_in_cycle !== weekNum || wf.cycle !== cycleNum) {
        // Auto-redirect to carryover week performance
        navigate(`/performance/${wf.week_in_cycle}`, { state: { carryover: true } });
      }
    }

    setLoading(false);
  };

  // Helpers derived from loaded data
  const getScoreForFocus = (focusId: string) => weeklyScores.find(s => s.weekly_focus_id === focusId);
  const total = weeklyFocus.length;
  const confCount = weeklyFocus.filter(f => (getScoreForFocus(f.id)?.confidence_score ?? null) !== null).length;
  const perfCount = weeklyFocus.filter(f => (getScoreForFocus(f.id)?.performance_score ?? null) !== null).length;
  const firstIncompleteConfIndex = weeklyFocus.findIndex(f => (getScoreForFocus(f.id)?.confidence_score ?? null) === null);
  const firstIncompletePerfIndex = weeklyFocus.findIndex(f => (getScoreForFocus(f.id)?.confidence_score ?? null) !== null && (getScoreForFocus(f.id)?.performance_score ?? null) === null);

  const handleRateNext = () => {
    if (weeklyFocus.length === 0) return;

    // Confidence next
    if (!hasConfidenceScores) {
      if (afterTueNoon) {
        toast({ title: 'Confidence window closed', description: `You’ll get a fresh start on Mon, ${nextMondayStr(now)}.` });
        navigate('/week');
        return;
      }
      if (beforeCheckIn) {
        toast({ title: 'Confidence opens at 9:00 a.m. CT.', description: 'Please come back after the window opens.' });
        return;
      }
      const idx = firstIncompleteConfIndex === -1 ? 0 : firstIncompleteConfIndex;
      const startFocus = weeklyFocus[idx];
      navigate(`/confidence/${startFocus.id}/${idx + 1}`);
      return;
    }

    // Performance next
    if (!hasPerformanceScores) {
      if (now < thuStartZ) {
        toast({ title: 'Performance opens Thursday', description: 'Please come back on Thu 12:00 a.m. CT.' });
        return;
      }
      const idx = firstIncompletePerfIndex === -1 ? 0 : firstIncompletePerfIndex;
      const startFocus = weeklyFocus[idx];
      navigate(`/performance/${startFocus.id}/${idx + 1}`);
      return;
    }

    toast({ title: 'Week Complete', description: "You've already completed both confidence and performance ratings for this week." });
  };

  if (redirected) {
    return null;
  }

  return (
    <div className="min-h-screen p-4 bg-background">
      <div className="max-w-md mx-auto space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-center">Consider the following Pro Moves</CardTitle>
            <CardDescription className="text-center">
              Cycle {cycleNum} · Week {weekNum}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Next Up orientation */}
            {carryoverPending && (carryoverPending.week_in_cycle !== weekNum || carryoverPending.cycle !== cycleNum) ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-center">Finish last week before starting a new one</CardTitle>
                  <CardDescription className="text-center">You still need to submit performance for last week.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button
                    className="w-full h-12"
                    onClick={async () => {
                      if (!staff || !carryoverPending) return;
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
                      navigate(`/performance/${startFocus.id}/${idx + 1}`, { state: { carryover: true } });
                    }}
                  >
                    Finish Performance
                  </Button>
                </CardContent>
              </Card>
            ) : (
              (() => {
                const beforeThursday = now < thuStartZ;
                const partialConfidence = confCount > 0 && confCount < total;
                const allConfidence = total > 0 && confCount === total;
                const allDone = total > 0 && perfCount === total;
                const perfPending = allConfidence && perfCount < total;
                return (
                  <>
                    {allDone && (
                      <Badge variant="default" className="w-full justify-center py-2">
                        ✓ All set for this week. Great work!
                      </Badge>
                    )}

                    {beforeCheckIn && !allDone && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-center">Confidence opens at 9:00 a.m. CT.</CardTitle>
                        </CardHeader>
                      </Card>
                    )}

                    {!beforeCheckIn && afterTueNoon && !allConfidence && (
                      <div className="p-3 rounded-md border bg-muted">
                        <div className="font-medium">Confidence window closed</div>
                        <div className="text-sm text-muted-foreground">You’ll get a fresh start on Mon, {nextMondayStr(now)}.</div>
                      </div>
                    )}

                    {!beforeCheckIn && !afterTueNoon && !allConfidence && (
                      <>
                        <Button
                          onClick={() => {
                            const idx = firstIncompleteConfIndex === -1 ? 0 : firstIncompleteConfIndex;
                            const startFocus = weeklyFocus[idx];
                            navigate(`/confidence/${startFocus.id}/${idx + 1}`);
                          }}
                          className="w-full h-12"
                        >
                          {partialConfidence ? 'Finish Confidence' : 'Rate Confidence'}
                        </Button>
                        {partialConfidence && (
                          <div className="text-xs text-muted-foreground text-center mt-1">{confCount}/{total} complete.</div>
                        )}
                      </>
                    )}

                    {allConfidence && beforeThursday && (
                      <Button className="w-full h-12" variant="outline" disabled>
                        Performance opens Thursday
                      </Button>
                    )}

                    {allConfidence && !beforeThursday && perfPending && (
                      <Button
                        onClick={() => {
                          const idx = firstIncompletePerfIndex === -1 ? 0 : firstIncompletePerfIndex;
                          const startFocus = weeklyFocus[idx];
                          navigate(`/performance/${startFocus.id}/${idx + 1}`);
                        }}
                        className="w-full h-12"
                      >
                        Rate Performance
                      </Button>
                    )}
                  </>
                );
              })()
            )}

            {/* This Week's Pro Moves */}
            <div className="space-y-3">
              <h3 className="font-medium">This Week's Pro Moves:</h3>
              {weeklyFocus.map((focus, index) => {
                const score = getScoreForFocus(focus.id);
                const unchosenSelfSelect = !!selfSelectIds[focus.id] && (!score || score.selected_action_id == null);
                return (
                  <div key={focus.id} className="rounded-lg p-4 border" style={{ backgroundColor: getDomainColor(focus.domain_name) }}>
                    <Badge 
                      variant="secondary" 
                      className="text-xs font-semibold mb-2 bg-white/80 text-gray-900"
                    >
                      {focus.domain_name}
                    </Badge>
                    <p className="text-sm font-medium text-gray-900">{focus.action_statement}</p>
                    {unchosenSelfSelect && (
                      <div className="mt-1">
                        <Button variant="link" className="h-auto p-0 text-xs" onClick={() => navigate(`/confidence/${focus.id}/${index + 1}`)}>
                          Choose your Pro Move
                        </Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2 pt-2">
              <Button 
                variant="outline"
                onClick={() => navigate('/')}
                className="w-full"
              >
                Back to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}