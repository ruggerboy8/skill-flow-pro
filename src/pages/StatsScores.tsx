import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getDomainColor } from '@/lib/domainColors';
import ConfPerfDelta from '@/components/ConfPerfDelta';
import { Trash2 } from 'lucide-react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { useNow } from '@/providers/NowProvider';
import { getWeekAnchors } from '@/v2/time';

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
  const [showRepairTools, setShowRepairTools] = useState(false);
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
      <div className="flex items-center justify-between bg-muted/30 p-3 rounded-lg">
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>✓ all done</span>
          <span>● in progress / late</span>
          <span>— not started</span>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="repair-toggle" className="text-xs text-muted-foreground">
            Need to fix a past week?
          </Label>
          <Switch 
            id="repair-toggle"
            checked={showRepairTools}
            onCheckedChange={setShowRepairTools}
          />
        </div>
      </div>
      
      <Accordion type="multiple" className="space-y-4">
        {cycles.map((cycle, cycleIndex) => (
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
                      onExpand={() => onWeekExpand(cycleIndex, week)}
                      weekData={cycle.weeks.get(week) || []}
                      weekStatus={cycle.weekStatuses.get(week) || { total: 0, confCount: 0, perfCount: 0 }}
                      onWeekDeleted={() => loadCycleData()}
                      showRepairTools={showRepairTools}
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
  showRepairTools: boolean;
  location: any;
}

function WeekAccordion({ cycle, week, staffData, onExpand, weekData, weekStatus, onWeekDeleted, showRepairTools, location }: WeekAccordionProps) {
  const [hasConfidence, setHasConfidence] = useState<boolean | null>(null);
  const [hasPerformance, setHasPerformance] = useState<boolean | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [locationData, setLocationData] = useState<{ timezone: string } | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const now = useNow();

  useEffect(() => {
    checkConfidence();
  }, [cycle, week, staffData]);

  useEffect(() => {
    if (user) {
      checkSuperAdminStatus();
    }
  }, [user]);

  useEffect(() => {
    if (staffData) {
      loadLocationData();
    }
  }, [staffData]);

  async function loadLocationData() {
    if (!staffData) return;
    try {
      const { data: staff } = await supabase
        .from('staff')
        .select('primary_location_id')
        .eq('id', staffData.id)
        .single();
      
      if (staff?.primary_location_id) {
        const { data: loc } = await supabase
          .from('locations')
          .select('timezone')
          .eq('id', staff.primary_location_id)
          .single();
        
        if (loc) {
          setLocationData(loc);
        }
      }
    } catch (error) {
      console.error('Error loading location data:', error);
    }
  }

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
    if (weekData.length === 0) {
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

  // Check if this is a past week for repair functionality
  const isPastWeek = () => {
    if (!locationData || !now) return false;
    try {
      const timezone = locationData.timezone || 'America/Chicago';
      const { checkout_due } = getWeekAnchors(now, timezone);
      return now > checkout_due;
    } catch {
      return false;
    }
  };

  // Generate repair links
  const generateRepairLinks = () => {
    if (!showRepairTools || !isPastWeek() || !hasConfidence) return null;
    
    const anchorId = `wk-${cycle}-${week}`;
    const returnTo = encodeURIComponent(`${location.pathname}${location.search}#${anchorId}`);
    
    const { total, confCount, perfCount } = weekStatus;
    const shouldShowRepairConfidence = confCount < total;
    const shouldShowRepairPerformance = confCount === total && perfCount < total;

    if (!shouldShowRepairConfidence && !shouldShowRepairPerformance) return null;

    return (
      <div className="flex gap-2 text-xs">
        {shouldShowRepairConfidence && (
          <Link
            to={`/confidence/current?mode=repair&cycle=${cycle}&wk=${week}&returnTo=${returnTo}`}
            className="text-blue-600 underline opacity-70 hover:opacity-100"
            onClick={(e) => e.stopPropagation()}
          >
            Backfill Confidence
          </Link>
        )}
        {shouldShowRepairPerformance && (
          <Link
            to={`/performance/current?mode=repair&cycle=${cycle}&wk=${week}&returnTo=${returnTo}`}
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