// src/pages/Week.tsx
import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useStaffProfile } from '@/hooks/useStaffProfile';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { nowUtc, getAnchors, nextMondayStr } from '@/lib/centralTime';
import { getDomainColor } from '@/lib/domainColors';
import { format } from 'date-fns';
import { useWeeklyAssignmentsV2Enabled } from '@/lib/featureFlags';

interface WeeklyFocus {
  id: string;
  display_order: number;
  action_statement: string;
  self_select?: boolean;
  competency_id?: number;
  competency_name?: string;
  domain_name?: string;
}

interface WeeklyScore {
  weekly_focus_id: string;
  confidence_score: number | null;
  performance_score: number | null;
  selected_action_id?: number | null;
}

export default function Week() {
  const [cycle, setCycle] = useState(1);
  const [weekInCycle, setWeekInCycle] = useState(1);

  // data
  const [weeklyFocus, setWeeklyFocus] = useState<WeeklyFocus[]>([]);
  const [weeklyScores, setWeeklyScores] = useState<WeeklyScore[]>([]);
  const [competencyNameById, setCompetencyNameById] = useState<Record<string, string>>({});
  const [carryoverPending, setCarryoverPending] = useState<{ cycle: number; week_in_cycle: number } | null>(null);

  // loading flags (separate "page loading" vs "banner decision ready")
  const [pageLoading, setPageLoading] = useState(true);
  const [bannerReady, setBannerReady] = useState(false);

  const { user } = useAuth();
  const { data: staff } = useStaffProfile();
  const { toast } = useToast();
  const navigate = useNavigate();
  const params = useParams();
  const v2Enabled = useWeeklyAssignmentsV2Enabled;

  // ---------- load staff + choose default week ----------
  useEffect(() => {
    if (staff) {
      selectDefaultWeek(staff);
    }
  }, [staff]);

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

  // Optimized: Fetches all cycle 1 weekly_focus data in 2 bulk queries instead of 12 sequential queries
  // Note: Only handles Cycle 1 (weekly_focus). Cycle 4+ users land on current week via date calculation.
  const selectDefaultWeek = async (s: typeof staff) => {
    if (!s) return;
    // Query 1: Fetch ALL weekly_focus for cycle 1 (all 6 weeks) in one go
    const { data: allFocusRows, error: focusError } = await supabase
      .from('weekly_focus')
      .select('id, week_in_cycle')
      .eq('role_id', s.role_id)
      .eq('cycle', 1)
      .order('week_in_cycle', { ascending: true });

    if (focusError || !allFocusRows || allFocusRows.length === 0) {
      // No focus data, default to week 1
      setCycle(1);
      setWeekInCycle(1);
      return;
    }

    // Collect all focus IDs across all weeks
    const allFocusIds = allFocusRows.map(f => f.id);

    // Query 2: Fetch ALL weekly_scores for this user matching any focus ID
    const { data: allScoresData, error: scoresError } = await supabase
      .from('weekly_scores')
      .select('weekly_focus_id, confidence_score, performance_score')
      .eq('staff_id', s.id)
      .in('weekly_focus_id', allFocusIds);

    // Build a Map of scores for fast lookup
    const scoresMap = new Map<string, { conf: number | null; perf: number | null }>();
    (allScoresData || []).forEach((score: any) => {
      scoresMap.set(score.weekly_focus_id, {
        conf: score.confidence_score,
        perf: score.performance_score
      });
    });

    // In-memory computation: loop through weeks 1-6
    let carryoverWeek: number | null = null;
    let greyWeek: number | null = null;

    for (let w = 1; w <= 6; w++) {
      const focusIdsForWeek = allFocusRows.filter(f => f.week_in_cycle === w).map(f => f.id);
      if (focusIdsForWeek.length === 0) continue;

      const total = focusIdsForWeek.length;
      const hasAllConf = focusIdsForWeek.every(fid => {
        const score = scoresMap.get(fid);
        return score && score.conf !== null;
      });
      const hasAllPerf = focusIdsForWeek.every(fid => {
        const score = scoresMap.get(fid);
        return score && score.perf !== null;
      });

      // Carryover week: has all confidence but not all performance
      if (hasAllConf && !hasAllPerf && carryoverWeek === null) {
        carryoverWeek = w;
      }
      
      // Grey week: missing at least one confidence score
      if (!hasAllConf && greyWeek === null) {
        greyWeek = w;
      }
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

    console.log('=== WEEK.TSX DEBUG ===');
    console.log('Loading week data for:', { cycle, weekInCycle, staffRoleId: staff.role_id, userId: user!.id });
    
    let focusData: any[] | null = null;
    let focusError: any = null;

    // ========== PHASE 2: DUAL-READ PATH ==========
    if (v2Enabled) {
      console.log('🚀 [Week.tsx] Using weekly_assignments V2 (feature flag ON)');
      
      // Calculate current Monday
      const now = new Date();
      const dayOfWeek = now.getDay();
      const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() + daysToMonday);
      thisMonday.setHours(0, 0, 0, 0);
      const mondayStr = thisMonday.toISOString().split('T')[0];

      const { data: assignmentsData, error: assignmentsError } = await supabase
        .from('weekly_assignments')
        .select(`
          id,
          display_order,
          action_id,
          competency_id,
          self_select,
          source,
          pro_moves!weekly_assignments_action_id_fkey (
            action_statement
          ),
          competencies!weekly_assignments_competency_id_fkey (
            competency_id,
            name,
            domain_id,
            domains!competencies_domain_id_fkey (
              domain_id,
              domain_name,
              color_hex
            )
          )
        `)
        .eq('role_id', staff.role_id)
        .eq('week_start_date', mondayStr)
        .eq('status', 'locked')
        .is('superseded_at', null)
        .order('display_order');

      console.log('🔍 [Week.tsx V2] Weekly_assignments query:', {
        roleId: staff.role_id,
        mondayStr,
        assignmentsData,
        assignmentsError
      });

      if (assignmentsError) {
        focusError = assignmentsError;
      } else {
        // Transform to weekly_focus structure with assign: prefix
        focusData = (assignmentsData || []).map((item: any) => ({
          id: `assign:${item.id}`,
          action_id: item.action_id,
          display_order: item.display_order,
          self_select: item.self_select,
          competency_id: item.competency_id,
          competency_name: item.competencies?.name || 'Unknown',
          pro_moves: { action_statement: item.pro_moves?.action_statement || '' },
          competencies: {
            name: item.competencies?.name || 'Unknown',
            domains: {
              domain_id: item.competencies?.domains?.domain_id || 0,
              domain_name: item.competencies?.domains?.domain_name || 'Unknown',
              color_hex: item.competencies?.domains?.color_hex || '#666666'
            }
          }
        }));

        console.log(`📊 [Week.tsx V2] Loaded ${focusData.length} assignments from weekly_assignments`);
      }
    } else {
      // ========== LEGACY PATH (default) ==========
      console.log('📚 [Week.tsx] Using legacy weekly_plan/weekly_focus (V2 flag OFF)');
      const orgId = staff.locations?.organization_id;
      
      if (orgId) {
        // Calculate current Monday
        const now = new Date();
        const dayOfWeek = now.getDay();
        const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const thisMonday = new Date(now);
        thisMonday.setDate(now.getDate() + daysToMonday);
        thisMonday.setHours(0, 0, 0, 0);
        const mondayStr = thisMonday.toISOString().split('T')[0];

        console.log('Attempting weekly_plan query:', { orgId, roleId: staff.role_id, mondayStr });
        
        const { data: planData, error: planError } = await supabase
          .from('weekly_plan')
          .select(`
            id,
            display_order,
            action_id,
            competency_id,
            self_select,
            pro_moves!weekly_plan_action_id_fkey (
              action_statement
            ),
            competencies!weekly_plan_competency_id_fkey (
              competency_id,
              name,
              domain_id,
              domains!competencies_domain_id_fkey (
                domain_id,
                domain_name,
                color_hex
              )
            )
          `)
          .is('org_id', null)
          .eq('role_id', staff.role_id)
          .eq('week_start_date', mondayStr)
          .eq('status', 'locked')
          .order('display_order');

        console.log('🔍 [Week.tsx] Weekly_plan query:', {
          orgId: null,
          roleId: staff.role_id,
          mondayStr,
          cycle,
          planData,
          planError
        });

        if (planData && planData.length > 0) {
          console.log('📊 Using weekly_plan data source with direct joins');
          
          // Transform weekly_plan to weekly_focus structure
          focusData = planData.map((item: any) => {
            console.log('Transforming item:', {
              id: item.id,
              action_id: item.action_id,
              competency_id: item.competency_id,
              competencies: item.competencies
            });
            
            return {
              id: `plan:${item.id}`,
              action_id: item.action_id,
              display_order: item.display_order,
              self_select: item.self_select,
              competency_id: item.competency_id,
              competency_name: item.competencies?.name || 'Unknown',
              pro_moves: { action_statement: item.pro_moves?.action_statement || '' },
              competencies: {
                name: item.competencies?.name || 'Unknown',
                domains: {
                  domain_id: item.competencies?.domains?.domain_id || 0,
                  domain_name: item.competencies?.domains?.domain_name || 'Unknown',
                  color_hex: item.competencies?.domains?.color_hex || '#666666'
                }
              }
            };
          });
        } else if (cycle >= 4) {
          // For Cycle 4+, if no weekly_plan data exists, don't fall back to weekly_focus
          console.log('📊 No weekly_plan data for Cycle 4+ - showing no pro moves');
          setWeeklyFocus([]);
          setPageLoading(false);
          setBannerReady(true);
          return;
        }
      }

      // Fall back to weekly_focus only for Cycle 1-3
      if (!focusData) {
        console.log('📚 Using weekly_focus data source (fallback)');
        const result = await supabase
          .from('weekly_focus')
          .select(`
            id,
            display_order,
            self_select,
            competency_id,
            action_id,
            pro_moves!weekly_focus_action_id_fkey ( action_statement ),
            competencies ( domains!competencies_domain_id_fkey ( domain_name ) )
          `)
          .eq('cycle', cycle)
          .eq('week_in_cycle', weekInCycle)
          .eq('role_id', staff.role_id)
          .order('display_order');
        
        focusData = result.data;
        focusError = result.error;
      }
    }

    // ========== SHARED PROCESSING LOGIC ==========
    console.log('Focus data result:', { focusData, focusError });

    if (focusError) {
      toast({
        title: 'Error',
        description: 'Failed to load Pro Moves for this week',
        variant: 'destructive',
      });
      setPageLoading(false);
      return;
    }

    // Get self-select choices separately - check both weekly_self_select and weekly_scores
    const allFocusIds = (focusData || []).map(f => f.id);
    console.log('Focus IDs for parallel queries:', allFocusIds);
    
    // Collect all competency IDs upfront for parallel fetch
    const allCompetencyIds = (focusData || [])
      .map((f: any) => f.competency_id)
      .filter(Boolean);
    
    // Fire all queries in PARALLEL - no more waterfall!
    const [
      selectionsResult,
      scoresResult,
      carryoverResult,
      competenciesResult
    ] = await Promise.all([
      // Query 1: weekly_self_select
      supabase
        .from('weekly_self_select')
        .select(`
          weekly_focus_id,
          selected_pro_move_id,
          pro_moves ( action_statement, competencies ( domains!competencies_domain_id_fkey ( domain_name ) ) )
        `)
        .eq('user_id', user!.id)
        .in('weekly_focus_id', allFocusIds),
      
      // Query 2: weekly_scores (CONSOLIDATED - fetch once with all fields)
      supabase
        .from('weekly_scores')
        .select('weekly_focus_id, confidence_score, performance_score, selected_action_id')
        .eq('staff_id', staff.id)
        .in('weekly_focus_id', allFocusIds),
      
      // Query 3: Carryover check
      supabase
        .from('weekly_scores')
        .select('updated_at, weekly_focus!inner(cycle, week_in_cycle, role_id)')
        .eq('staff_id', staff.id)
        .eq('weekly_focus.role_id', staff.role_id)
        .not('confidence_score', 'is', null)
        .is('performance_score', null)
        .order('updated_at', { ascending: false })
        .limit(1),
      
      // Query 4: All competencies upfront
      allCompetencyIds.length > 0
        ? supabase
            .from('competencies')
            .select('competency_id, name')
            .in('competency_id', allCompetencyIds)
        : Promise.resolve({ data: [], error: null })
    ]);

    // Extract data with fallbacks
    const selectionsData = selectionsResult.data || [];
    const scoresData = scoresResult.data || [];
    const carryoverData = carryoverResult.data || [];
    const competencyData = competenciesResult.data || [];

    console.log('Parallel queries complete:', { 
      selections: selectionsData.length, 
      scores: scoresData.length,
      carryover: carryoverData.length,
      competencies: competencyData.length
    });

    // Secondary query: Get pro moves for any selected_action_ids not already in selectionsData
    const selectedActionIds = scoresData
      .map(s => s.selected_action_id)
      .filter(Boolean);
    
    let actionProMovesData: any[] = [];
    if (selectedActionIds.length > 0) {
      const { data: pmData } = await supabase
        .from('pro_moves')
        .select(`
          action_id,
          action_statement,
          competencies ( domains!competencies_domain_id_fkey ( domain_name ) )
        `)
        .in('action_id', selectedActionIds);
      actionProMovesData = pmData || [];
    }

    const transformedFocus: WeeklyFocus[] = (focusData || []).map(item => {
      const isSelSelect = (item as any)?.self_select ?? false;
      const siteMove = (item as any)?.pro_moves;
      const itemData = item as any;
      
      // Find user's selection - check weekly_self_select first, then fall back to weekly_scores
      let userSelection = null;
      let selectedMove = null;
      
      if (isSelSelect) {
        // First try weekly_self_select
        userSelection = selectionsData?.find(s => s.weekly_focus_id === item.id);
        if (userSelection) {
          selectedMove = userSelection.pro_moves as any;
        } else {
          // Fall back to selected_action_id from weekly_scores
          const scoreRecord = scoresData?.find(s => s.weekly_focus_id === item.id);
          if (scoreRecord?.selected_action_id) {
            selectedMove = actionProMovesData.find(pm => pm.action_id === scoreRecord.selected_action_id);
          }
        }
      }
      
      // Get domain name - try multiple paths
      const domainName = isSelSelect 
        ? (selectedMove?.competencies?.domains?.domain_name || itemData?.competencies?.domains?.domain_name)
        : (itemData?.competencies?.domains?.domain_name || siteMove?.competencies?.domains?.domain_name);
      
      // Get competency name - try multiple paths
      const competencyName = itemData?.competency_name || itemData?.competencies?.name || siteMove?.competencies?.name;
      
      return {
        id: item.id,
        display_order: item.display_order,
        action_statement: isSelSelect 
          ? (selectedMove?.action_statement || 'Choose a pro-move')
          : (siteMove?.action_statement || 'Unknown move'),
        self_select: isSelSelect,
        competency_id: itemData?.competency_id ?? undefined,
        competency_name: competencyName,
        domain_name: domainName,
      };
    });

    console.log('Transformed focus data:', transformedFocus);

    // If no focus, stop here
    if (transformedFocus.length === 0) {
      setWeeklyFocus([]);
      setPageLoading(false);
      setBannerReady(true); // ready to render the "no pro moves" card
      return;
    }

    console.log('Transformed focus data:', transformedFocus);
    setWeeklyFocus(transformedFocus);

    // Build competency name map using pre-fetched competency data
    const compNameMap: Record<string, string> = {};
    transformedFocus.forEach(focus => {
      if (focus.competency_name) {
        compNameMap[focus.id] = focus.competency_name;
      } else if (focus.competency_id) {
        const comp = competencyData.find(c => c.competency_id === focus.competency_id);
        if (comp) {
          compNameMap[focus.id] = comp.name;
        }
      }
    });
    
    setCompetencyNameById(compNameMap);

    // Set scores (already fetched in parallel)
    setWeeklyScores(scoresData);

    // Set carryover (already fetched in parallel)
    const wf: any = carryoverData[0]?.weekly_focus;
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

  // Calculate week start date from cycle/week
  const getWeekLabel = () => {
    // Calculate current Monday
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const thisMonday = new Date(now);
    thisMonday.setDate(now.getDate() + daysToMonday);
    thisMonday.setHours(0, 0, 0, 0);
    
    return `Week of ${format(thisMonday, 'MMM d')}`;
  };

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

  // Central-Time gating (memoize so anchors don't bounce during renders)
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

  // Build banner content only when we're fully ready (prevents flash)
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

    // 4) Confidence window closed after Tue 12:00 CT but allow late completion during performance window
    if (afterTueNoon && !allConfidence) {
      // If it's during performance window (Thursday+), allow late confidence submission
      if (!beforeThursday) {
        const label = partialConfidence ? 'Complete Late Confidence' : 'Submit Late Confidence';
        const idx = firstIncompleteConfIndex === -1 ? 0 : firstIncompleteConfIndex;
        return {
          bannerMessage: partialConfidence
            ? `Complete your confidence ratings to unlock performance (${confCount}/${total}). These will be marked as late.`
            : `Complete confidence ratings first to rate performance. These will be marked as late.`,
          bannerCta: {
            label,
            onClick: () => navigate(`/confidence/${weekInCycle}/step/${idx + 1}`),
          },
        };
      } else {
        // Before Thursday, show the regular closed message
        return {
          bannerMessage: `Confidence window closed. You'll get a fresh start on Mon, ${nextMondayStr(now)}.`,
          bannerCta: null,
        };
      }
    }

    // 5) Confidence window open (Mon 9:00 → Tue 11:59) and not all confidence done
    if (!afterTueNoon && !allConfidence) {
      const label = partialConfidence ? 'Finish Confidence' : 'Rate Confidence';
      const idx = firstIncompleteConfIndex === -1 ? 0 : firstIncompleteConfIndex;
      return {
        bannerMessage: partialConfidence
          ? `You're midway through Monday check-in. Finish your confidence ratings (${confCount}/${total}).`
          : `Welcome back! Time to rate your confidence for this week's Pro Moves.`,
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
            ? 'Time to reflect. Rate your performance for this week\'s Pro Moves.'
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
              No Pro Moves have been configured for {getWeekLabel()}
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
            <CardTitle className="text-center">ProMoves</CardTitle>
            <CardDescription className="text-center">
              {getWeekLabel()}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* This Week's Pro Moves */}
            <div className="space-y-3">
              <h3 className="font-medium">This Week&apos;s Pro Moves:</h3>

              {weeklyFocus.map((focus, index) => {
                const score = getScoreForFocus(focus.id);
                const unchosenSelfSelect =
                  !!focus.self_select && focus.action_statement === 'Choose a pro-move';

                return (
                  <div
                    key={focus.id}
                    className="rounded-lg p-4 border"
                    style={{ backgroundColor: getDomainColor(focus.domain_name) }}
                  >
                     {focus.domain_name && (
                       <div className="flex gap-2 mb-2">
                         <Badge
                           variant="secondary"
                           className="text-xs font-semibold bg-white/80 text-gray-900"
                         >
                           {focus.domain_name}
                         </Badge>
                         {focus.competency_id && competencyNameById[focus.id] && (
                           <Badge 
                             variant="outline" 
                             className="text-xs font-semibold bg-white/20 text-gray-700 border-white/30"
                           >
                             {competencyNameById[focus.id]}
                           </Badge>
                         )}
                       </div>
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
                  {/** Show CTA only when actionable (no disabled "Thursday" button) */}
                  {bannerCta && !bannerCta.disabled && (
                    <Button className="w-full h-12 mt-2" onClick={bannerCta.onClick}>
                      {bannerCta.label}
                    </Button>
                  )}
                  {/** Tiny progress hint if we're mid-confidence window */}
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
