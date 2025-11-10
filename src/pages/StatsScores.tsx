import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { Trash2 } from 'lucide-react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { getLocationWeekContext } from '@/lib/locationState';

interface WeekData {
  domain_name: string;
  action_statement: string;
  confidence_score: number | null;
  performance_score: number | null;
}

interface CycleData {
  cycle: number;
  weeks: Map<number, WeekData[]>;
  weekStatuses: Map<number, { total: number; confCount: number; perfCount: number }>;
  hasAnyConfidence: boolean;
}

export default function StatsScores() {
  const [cycles, setCycles] = useState<CycleData[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [staffData, setStaffData] = useState<{ id: string; role_id: number } | null>(null);
  const [currentCycle, setCurrentCycle] = useState<number | null>(null);
  const [currentWeek, setCurrentWeek] = useState<number | null>(null);
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      loadStaffData();
    }
  }, [user]);

  useEffect(() => {
    if (staffData) {
      loadCycleData();
    }
  }, [staffData]);

  // Handle return from repair with auto-scroll
  useEffect(() => {
    if (location.state?.repairJustSubmitted && location.hash) {
      const id = location.hash.slice(1);
      setTimeout(() => {
        const element = document.getElementById(id);
        if (element) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
          // Clear the state
          navigate(location.pathname + location.search + location.hash, { 
            replace: true, 
            state: undefined 
          });
        }
      }, 100);
    }
  }, [location.state, location.hash, location.pathname, location.search, navigate]);

  const loadStaffData = async () => {
    if (!user) return;

    const { data: staffRow } = await supabase
      .from('staff')
      .select('id, role_id, primary_location_id')
      .eq('user_id', user.id)
      .single();

    if (staffRow) {
      setStaffData({ id: staffRow.id, role_id: staffRow.role_id });

      if (staffRow.primary_location_id) {
        const ctx = await getLocationWeekContext(staffRow.primary_location_id, new Date());
        setCurrentCycle(ctx.cycleNumber);
        setCurrentWeek(ctx.weekInCycle);
      }
    }
  };

  const loadCycleData = async () => {
    if (!staffData) return;
    setLoading(true);
    
    try {
      // 1: discover cycles for this role (unchanged)
      const { data: cycleRows } = await supabase
        .from('weekly_focus')
        .select('cycle')
        .eq('role_id', staffData.role_id)
        .order('cycle');
      const cyclesUnique = [...new Set((cycleRows ?? []).map(c => c.cycle))];

      // 2: bulk status per week via RPC
      const { data: statusRows } = await supabase.rpc('get_cycle_week_status', {
        p_staff_id: staffData.id,
        p_role_id: staffData.role_id
      });

      const byCycle = new Map<number, { weeks: Map<number, any>, hasAnyConfidence: boolean }>();
      for (const c of cyclesUnique) {
        byCycle.set(c, { weeks: new Map(), hasAnyConfidence: false });
      }

      for (const r of (statusRows ?? [])) {
        const bucket = byCycle.get(r.cycle);
        if (!bucket) continue;
        bucket.weeks.set(r.week_in_cycle, {
          total: r.total,
          confCount: r.conf_count,
          perfCount: r.perf_count
        });
        if (r.conf_count > 0) bucket.hasAnyConfidence = true;
      }

      const result = cyclesUnique.map(cycle => ({
        cycle,
        weeks: new Map<number, WeekData[]>(), // Start empty for lazy loading
        weekStatuses: byCycle.get(cycle)?.weeks ?? new Map(),
        hasAnyConfidence: byCycle.get(cycle)?.hasAnyConfidence ?? false
      }));

      setCycles(result);
      
      // Set default selected cycle and auto-expand
      if (result.length > 0) {
        try {
          const { data: progressData } = await supabase.rpc('get_last_progress_week', {
            p_staff_id: staffData.id
          });
          
          let defaultCycle = currentCycle || Math.max(...cyclesUnique);
          if (progressData?.[0]?.last_cycle) {
            defaultCycle = progressData[0].last_cycle;
          }
          
          setSelectedCycle(defaultCycle);
        } catch (error) {
          console.log('Could not get progress data:', error);
          setSelectedCycle(currentCycle || Math.max(...cyclesUnique));
        }
      }
    } catch (error) {
      console.error('Error loading cycle data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWeekData = async (cycle: number, week: number): Promise<WeekData[]> => {
    if (!staffData) return [];

    try {
      // Skip RPC for current week (shows "no pro moves" issue), use fallback directly
      const isCurrentWeek = cycle === currentCycle && week === currentWeek;
      
      if (!isCurrentWeek) {
        // Try RPC first for historical weeks (works fine when scores exist)
        const { data: rpcRows } = await supabase.rpc('get_weekly_review', {
          p_cycle: cycle,
          p_week: week,
          p_role_id: staffData.role_id,
          p_staff_id: staffData.id
        });

        if (rpcRows && rpcRows.length) {
          return rpcRows as WeekData[];
        }
      }

      // Fallback: compose from weekly_focus + optional scores
      // 1) Pull focus rows for this role/cycle/week
      const { data: focus } = await supabase
        .from('weekly_focus')
        .select(`
          id,
          display_order,
          self_select,
          competency_id,
          pro_moves(action_statement, competency_id)
        `)
        .eq('cycle', cycle)
        .eq('week_in_cycle', week)
        .eq('role_id', staffData.role_id)
        .order('display_order');

      const focusIds = (focus ?? []).map((f: any) => f.id);

      // 2) Get user selections for self-select items
      const { data: userSelections } = await supabase
        .from('weekly_self_select')
        .select(`
          weekly_focus_id,
          selected_pro_move_id,
          pro_moves(action_statement, competency_id)
        `)
        .eq('user_id', user?.id)
        .in('weekly_focus_id', (focus ?? []).map((f: any) => String(f.id)));

      const selectionsMap: Record<string, any> = {};
      (userSelections ?? []).forEach((sel: any) => {
        selectionsMap[sel.weekly_focus_id] = sel;
      });

      // 3) Map competency -> domain name (for both pro_moves and self-select)
      const allCompIds = Array.from(
        new Set([
          ...(focus ?? []).map((f: any) => f.pro_moves?.competency_id).filter(Boolean),
          ...(focus ?? []).map((f: any) => f.competency_id).filter(Boolean),
          ...(userSelections ?? []).map((sel: any) => sel.pro_moves?.competency_id).filter(Boolean)
        ])
      ) as number[];
      let domainMap: Record<number, string> = {};
      if (allCompIds.length) {
        const { data: comps } = await supabase
          .from('competencies')
          .select('competency_id, domain_id')
          .in('competency_id', allCompIds);

        const domainIds = Array.from(new Set((comps ?? []).map(c => c.domain_id).filter(Boolean)));
        if (domainIds.length) {
          const { data: domains } = await supabase
            .from('domains')
            .select('domain_id, domain_name')
            .in('domain_id', domainIds);
          const idName: Record<number, string> = {};
          (domains ?? []).forEach(d => { idName[d.domain_id] = d.domain_name; });
          (comps ?? []).forEach(c => {
            if (c.domain_id && idName[c.domain_id]) {
              domainMap[c.competency_id] = idName[c.domain_id];
            }
          });
        }
      }

      // 4) Overlay any existing scores (if any)
      let scoreMap: Record<string, { confidence_score: number|null, performance_score: number|null }> = {};
      if (focusIds.length) {
        const { data: scores } = await supabase
          .from('weekly_scores')
          .select('weekly_focus_id, confidence_score, performance_score')
          .eq('staff_id', staffData.id)
          .in('weekly_focus_id', focusIds.map(String));
        (scores ?? []).forEach((s: any) => {
          scoreMap[s.weekly_focus_id] = {
            confidence_score: s.confidence_score,
            performance_score: s.performance_score
          };
        });
      }

      // 5) Build view rows even if all scores are null
      const rows: WeekData[] = (focus ?? []).map((f: any) => {
        let action_statement = 'Pro Move';
        let compId: number | null = null;
        
        if (f.self_select) {
          // Self-select item
          const selection = selectionsMap[f.id];
          if (selection?.pro_moves) {
            action_statement = selection.pro_moves.action_statement;
            compId = selection.pro_moves.competency_id;
          } else {
            action_statement = 'Self-Select';
            compId = f.competency_id; // Use focus competency_id for domain
          }
        } else {
          // Regular pro move
          action_statement = f.pro_moves?.action_statement || 'Pro Move';
          compId = f.pro_moves?.competency_id;
        }
        
        const domain_name = compId ? (domainMap[compId] || 'General') : 'General';
        const sc = scoreMap[f.id] || { confidence_score: null, performance_score: null };
        
        return {
          domain_name,
          action_statement,
          confidence_score: sc.confidence_score,
          performance_score: sc.performance_score
        };
      });

      console.log(`Fallback logic returned ${rows.length} rows for C${cycle}W${week}:`, rows);
      return rows;
    } catch (error) {
      console.error('Error loading week data:', error);
      return [];
    }
  };

  const hasWeekConfidence = async (cycle: number, week: number): Promise<boolean> => {
    if (!staffData) return false;

    const { data } = await supabase
      .from('weekly_scores')
      .select('confidence_score, weekly_focus!inner(cycle, week_in_cycle)')
      .eq('staff_id', staffData.id)
      .eq('weekly_focus.cycle', cycle)
      .eq('weekly_focus.week_in_cycle', week)
      .not('confidence_score', 'is', null)
      .single();

    return !!data;
  };

  const onWeekExpand = async (cycleIndex: number, week: number) => {
    const cycle = cycles[cycleIndex];
    if (!cycle) return;

    const weekData = await loadWeekData(cycle.cycle, week);
    
    setCycles(prev => {
      const updated = [...prev];
      updated[cycleIndex].weeks.set(week, weekData);
      return updated;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">Loading scores...</div>
      </div>
    );
  }

  if (cycles.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <p className="text-muted-foreground">No score data available yet.</p>
        </CardContent>
      </Card>
    );
  }

  // Filter cycles to show only selected cycle
  const filteredCycles = selectedCycle ? cycles.filter(cycle => cycle.cycle === selectedCycle) : cycles;

  return (
    <div className="space-y-4 max-w-full overflow-x-hidden">
      {/* Status Legend */}
      <div className="flex items-center justify-center bg-muted/30 p-3 rounded-lg">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>✓ all done</span>
          <span>● in progress / late</span>
          <span>— not started</span>
        </div>
      </div>
      
      {/* Cycle Selector */}
      {cycles.length > 1 && (
        <Select value={selectedCycle?.toString() || ""} onValueChange={(value) => setSelectedCycle(parseInt(value))}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Select cycle" />
          </SelectTrigger>
          <SelectContent>
            {cycles.map(cycle => (
              <SelectItem key={cycle.cycle} value={cycle.cycle.toString()}>
                Cycle {cycle.cycle}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      
      <Accordion type="multiple" className="space-y-4">
        {filteredCycles.map((cycle, cycleIndex) => (
          <AccordionItem
            key={cycle.cycle}
            value={`cycle-${cycle.cycle}`}
            className="border rounded-lg"
          >
            <AccordionTrigger 
              className="px-4 sticky top-0 bg-white z-10"
            >
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Cycle {cycle.cycle}</h3>
              </div>
            </AccordionTrigger>
            
            <AccordionContent className="px-4 pb-4">
                <Accordion type="multiple" className="space-y-2">
                  {Array.from(cycle.weekStatuses.keys()).map(week => (
                     <WeekAccordion
                       key={week}
                       cycle={cycle.cycle}
                       week={week}
                       staffData={staffData}
                       onExpand={() => onWeekExpand(cycles.findIndex(c => c.cycle === cycle.cycle), week)}
                       weekData={cycle.weeks.get(week) || []}
                       weekStatus={cycle.weekStatuses.get(week) || { total: 0, confCount: 0, perfCount: 0 }}
                       onWeekDeleted={() => loadCycleData()}
                       currentCycle={currentCycle}
                       currentWeek={currentWeek}
                       location={location}
                     />
                  ))}
                </Accordion>
              </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

interface WeekAccordionProps {
  cycle: number;
  week: number;
  staffData: { id: string; role_id: number } | null;
  onExpand: () => void;
  weekData: WeekData[];
  weekStatus: { total: number; confCount: number; perfCount: number };
  onWeekDeleted: () => void;
  currentCycle: number | null;
  currentWeek: number | null;
  location: any;
}

function WeekAccordion({ cycle, week, staffData, onExpand, weekData, weekStatus, onWeekDeleted, currentCycle, currentWeek, location }: WeekAccordionProps) {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      checkSuperAdminStatus();
    }
  }, [user]);


  async function checkSuperAdminStatus() {
    if (!user) return;
    try {
      const { data } = await supabase.rpc('is_super_admin', { _user_id: user.id });
      setIsSuperAdmin(!!data);
    } catch (error) {
      console.error('Error checking super admin status:', error);
    }
  }

  // Delete this specific week's data function
  async function handleDeleteThisWeek() {
    if (!user || !staffData) return;
    
    setDeleteLoading(true);
    try {
      const { data, error } = await supabase.rpc('delete_week_data', {
        p_staff_id: staffData.id,
        p_role_id: staffData.role_id,
        p_cycle: cycle,
        p_week: week
      });

      if (error) throw error;

      toast({ 
        title: 'Success', 
        description: (data as any)?.message || `Deleted data for Cycle ${cycle}, Week ${week}.` 
      });
      
      onWeekDeleted(); // Refresh parent data
    } catch (error: any) {
      console.error('Error deleting week data:', error);
      toast({ 
        title: 'Error', 
        description: error.message || 'Failed to delete week data', 
        variant: 'destructive' 
      });
    } finally {
      setDeleteLoading(false);
      setShowDeleteDialog(false);
    }
  }


  const handleExpand = () => {
    // Always call onExpand to ensure data is loaded, especially for current week
    onExpand();
  };

  const getStatusBadge = () => {
    const { total, confCount, perfCount } = weekStatus;
    if (total === 0) return null;
    if (confCount === 0) return null; // Grey
    if (perfCount === total) return <span className="text-green-600 text-lg font-bold">✓</span>; // Green
    if (confCount === total && perfCount < total) return <span className="text-yellow-600 text-lg font-bold">●</span>; // Yellow
    return null; // Grey for partial confidence
  };

  // Check if this is a past week for repair functionality
  const isPastWeek = () => {
    if (currentCycle == null || currentWeek == null) return false;
    return cycle < currentCycle || (cycle === currentCycle && week < currentWeek);
  };

  // Generate repair links
  const generateRepairLinks = () => {
    if (!isPastWeek()) return null;

    const anchorId = `wk-${cycle}-${week}`;
    const returnTo = encodeURIComponent(`${location.pathname}${location.search}#${anchorId}`);

    const { total, confCount, perfCount } = weekStatus;

    // Conditions:
    // - If any confidence is missing → show Backfill Confidence
    // - If all confidence is present but some performance missing → show Backfill Performance
    const showConf = total > 0 && confCount < total;
    const showPerf = total > 0 && confCount === total && perfCount < total;

    if (!showConf && !showPerf) return null;

    console.log('Generating repair links for:', { cycle, week, total, confCount, perfCount, showConf, showPerf });

    return (
      <div className="flex gap-2 text-xs">
        {showConf && (
          <Link
            to={`/confidence/current/step/1?mode=repair&cycle=${cycle}&wk=${week}&returnTo=${returnTo}`}
            className="text-blue-600 underline opacity-70 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              console.log('Repair link clicked:', { cycle, week, url: `/confidence/current/step/1?mode=repair&cycle=${cycle}&wk=${week}&returnTo=${returnTo}` });
            }}
          >
            Backfill Confidence
          </Link>
        )}
        {showPerf && (
          <Link
            to={`/performance/current/step/1?mode=repair&cycle=${cycle}&wk=${week}&returnTo=${returnTo}`}
            className="text-blue-600 underline opacity-70 hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            Backfill Performance
          </Link>
        )}
      </div>
    );
  };

  return (
    <>
      <AccordionItem value={`week-${cycle}-${week}`} className="border rounded" id={`wk-${cycle}-${week}`}>
        <AccordionTrigger 
          className="px-3 py-2 text-sm"
          onClick={handleExpand}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <span className="font-medium">Week {week}</span>
              {/* Current Week Pill */}
              {cycle === currentCycle && week === currentWeek && (
                <Badge variant="outline" className="text-xs">
                  Current Week
                </Badge>
              )}
              {generateRepairLinks()}
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              {/* Super Admin Delete Button */}
              {isSuperAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-red-600 hover:text-red-800 hover:bg-red-50"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteDialog(true);
                  }}
                  disabled={deleteLoading}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </AccordionTrigger>
        
        <AccordionContent className="px-3 pb-3">
          {weekData.length > 0 ? (
            <div className="space-y-2">
              {weekData.map((item, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 rounded-lg"
                >
                  <Badge 
                    className="text-xs font-semibold ring-1 ring-border/50"
                    style={{ backgroundColor: getDomainColor(item.domain_name) }}
                  >
                    {item.domain_name}
                  </Badge>
                  <span className="flex-1 text-sm">
                    {item.action_statement}
                  </span>
                  <ConfPerfDelta confidence={item.confidence_score} performance={item.performance_score} />
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground py-4">Loading...</p>
          )}
        </AccordionContent>
      </AccordionItem>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Week Data</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all confidence and performance scores, as well as any self-selection data 
              for Cycle {cycle}, Week {week}. This action cannot be undone.
              
              Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteThisWeek}
              disabled={deleteLoading}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteLoading ? 'Deleting...' : 'Delete Week'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}