import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { Trash2 } from 'lucide-react';

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
  const [loading, setLoading] = useState(true);
  const [staffData, setStaffData] = useState<{ id: string; role_id: number } | null>(null);
  const { user } = useAuth();

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

  const loadStaffData = async () => {
    if (!user) return;

    const { data } = await supabase
      .from('staff')
      .select('id, role_id')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setStaffData(data);
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
    } catch (error) {
      console.error('Error loading cycle data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadWeekData = async (cycle: number, week: number): Promise<WeekData[]> => {
    if (!staffData) return [];

    try {
      const { data } = await supabase.rpc('get_weekly_review', {
        p_cycle: cycle,
        p_week: week,
        p_role_id: staffData.role_id,
        p_staff_id: staffData.id
      });

      return data || [];
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

  return (
    <div className="space-y-4">
      {/* Status Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg">
        <span>✓ all done</span>
        <span>● in progress / late</span>
        <span>— not started</span>
      </div>
      
      <Accordion type="multiple" className="space-y-4">
        {cycles.map((cycle, cycleIndex) => (
          <AccordionItem
            key={cycle.cycle}
            value={`cycle-${cycle.cycle}`}
            className="border rounded-lg"
          >
            <AccordionTrigger 
              className={`px-4 sticky top-0 bg-white z-10 ${!cycle.hasAnyConfidence ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={!cycle.hasAnyConfidence}
            >
              <div className="flex items-center gap-3">
                <h3 className="text-lg font-semibold">Cycle {cycle.cycle}</h3>
                {!cycle.hasAnyConfidence && (
                  <span className="text-sm text-muted-foreground">Complete Week 1 confidence to unlock</span>
                )}
              </div>
            </AccordionTrigger>
            
            {cycle.hasAnyConfidence && (
              <AccordionContent className="px-4 pb-4">
                <Accordion type="multiple" className="space-y-2">
                  {Array.from(cycle.weekStatuses.keys()).map(week => (
                    <WeekAccordion
                      key={week}
                      cycle={cycle.cycle}
                      week={week}
                      staffData={staffData}
                      onExpand={() => onWeekExpand(cycleIndex, week)}
                      weekData={cycle.weeks.get(week) || []}
                      weekStatus={cycle.weekStatuses.get(week) || { total: 0, confCount: 0, perfCount: 0 }}
                      onWeekDeleted={() => loadCycleData()}
                    />
                  ))}
                </Accordion>
              </AccordionContent>
            )}
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
}

function WeekAccordion({ cycle, week, staffData, onExpand, weekData, weekStatus, onWeekDeleted }: WeekAccordionProps) {
  const [hasConfidence, setHasConfidence] = useState<boolean | null>(null);
  const [hasPerformance, setHasPerformance] = useState<boolean | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    checkConfidence();
  }, [cycle, week, staffData]);

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

  const checkConfidence = async () => {
    if (!staffData) return;

    const { data, error } = await supabase
      .from('weekly_scores')
      .select('confidence_score, performance_score, weekly_focus!inner(cycle, week_in_cycle)')
      .eq('staff_id', staffData.id)
      .eq('weekly_focus.cycle', cycle)
      .eq('weekly_focus.week_in_cycle', week);

    if (error) {
      console.error(error);
      return;
    }

    if (!data || data.length === 0) {
      setHasConfidence(false);
      setHasPerformance(false);
      return;
    }

    // Check if ALL items have confidence scores
    const allHaveConfidence = data.every(r => r.confidence_score !== null);
    // Check if ALL items have performance scores  
    const allHavePerformance = data.every(r => r.performance_score !== null);
    // Check if ANY items have confidence scores
    const someHaveConfidence = data.some(r => r.confidence_score !== null);
    // Check if ANY items have performance scores
    const someHavePerformance = data.some(r => r.performance_score !== null);

    // hasConfidence = true if at least some confidence scores exist (to show the week)
    setHasConfidence(someHaveConfidence);
    // hasPerformance = true only if ALL items are completely done (confidence + performance)
    setHasPerformance(allHaveConfidence && allHavePerformance);
  };

  const handleExpand = () => {
    if (hasConfidence && weekData.length === 0) {
      onExpand();
    }
  };

  if (hasConfidence === null) {
    return <div className="h-12 bg-gray-100 animate-pulse rounded" />;
  }

  const getStatusBadge = () => {
    const { total, confCount, perfCount } = weekStatus;
    if (total === 0) return null;
    if (confCount === 0) return null; // Grey
    if (perfCount === total) return <span className="text-green-600 text-lg font-bold">✓</span>; // Green
    if (confCount === total && perfCount < total) return <span className="text-yellow-600 text-lg font-bold">●</span>; // Yellow
    return null; // Grey for partial confidence
  };

  return (
    <>
      <AccordionItem value={`week-${cycle}-${week}`} className="border rounded">
        <AccordionTrigger 
          className={`px-3 py-2 text-sm ${!hasConfidence ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={!hasConfidence}
          onClick={handleExpand}
        >
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <span className="font-medium">Week {week}</span>
              {!hasConfidence && (
                <span className="text-xs text-muted-foreground">Submit confidence to unlock week</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {getStatusBadge()}
              {/* Super Admin Delete Button */}
              {isSuperAdmin && hasConfidence && (
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
        
        {hasConfidence && (
          <AccordionContent className="px-3 pb-3">
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
          </AccordionContent>
        )}
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