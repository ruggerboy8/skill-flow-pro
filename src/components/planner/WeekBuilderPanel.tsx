import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Loader2, Lock, Edit3, X, Trash2, Unlock } from 'lucide-react';
import { normalizeToPlannerWeek, formatWeekOf } from '@/lib/plannerUtils';
import { ProMovePickerDialog } from './ProMovePickerDialog';
import { fetchProMoveMetaByIds } from '@/lib/proMoves';
import { getDomainColor } from '@/lib/domainColors';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { MonthView } from './MonthView';

interface WeekSlot {
  displayOrder: 1 | 2 | 3;
  actionId: number | null;
  actionStatement: string;
  domainName: string;
  status?: string;
  isLocked: boolean;
  planId?: number | null;
  rankSnapshot?: {
    parts: { C: number; R: number; E: number; D: number; T: number };
    final: number;
    reason_tags: string[];
    version: string;
  };
}

interface WeekAssignment {
  weekStart: string;
  slots: WeekSlot[];
}

interface WeekBuilderPanelProps {
  roleId: number;
  roleName: string;
}

export function WeekBuilderPanel({ 
  roleId, 
  roleName
}: WeekBuilderPanelProps) {
  const { toast } = useToast();
  const [viewMode, setViewMode] = useState<'week' | 'month'>('week');
  const [selectedMonday, setSelectedMonday] = useState(normalizeToPlannerWeek(new Date()));
  const [showTwoWeeks, setShowTwoWeeks] = useState(false);
  const [weeks, setWeeks] = useState<WeekAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<{ weekStart: string; displayOrder: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const [deleteWeekDialogOpen, setDeleteWeekDialogOpen] = useState(false);
  const [weekToDelete, setWeekToDelete] = useState<string | null>(null);
  const [unlockDialogOpen, setUnlockDialogOpen] = useState(false);
  const [slotToUnlock, setSlotToUnlock] = useState<{ weekStart: string; displayOrder: number; planId: number | null } | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  const currentMonday = normalizeToPlannerWeek(new Date());

  useEffect(() => {
    checkSuperAdmin();
  }, []);

  useEffect(() => {
    if (viewMode === 'month') return; // skip week fetching in month view
    loadWeeks(selectedMonday);
  }, [roleId, selectedMonday, showTwoWeeks, viewMode]);

  const checkSuperAdmin = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: staffData } = await supabase
      .from('staff')
      .select('is_super_admin')
      .eq('user_id', user.id)
      .single();

    setIsSuperAdmin(staffData?.is_super_admin || false);
  };

  const loadWeeks = async (startMonday: string) => {
    setLoading(true);
    
    const mondays = showTwoWeeks 
      ? [startMonday, getNextMonday(startMonday)]
      : [startMonday];

    console.log('🔍 [WeekBuilder] Loading weeks:', {
      startMonday,
      roleId,
      mondays
    });

    // Fetch all weekly_plan rows
    const { data: planRows, error: planError } = await supabase
      .from('weekly_plan')
      .select('id, display_order, action_id, status, week_start_date')
      .is('org_id', null)
      .eq('role_id', roleId)
      .in('week_start_date', mondays)
      .order('week_start_date')
      .order('display_order');

    console.log('📊 [WeekBuilder] Query result:', {
      planRowsCount: planRows?.length || 0,
      planRows,
      planError
    });

    // Check which slots are locked
    const planIds = (planRows || []).map(r => r.id);
    const scoresBySlot = new Map<string, boolean>();
    
    if (planIds.length > 0) {
      const { data: scores } = await supabase
        .from('weekly_scores')
        .select('weekly_focus_id')
        .in('weekly_focus_id', planIds.map(id => `plan:${id}`));

      (scores || []).forEach((s: any) => {
        const planId = s.weekly_focus_id.replace('plan:', '');
        const row = planRows?.find(r => r.id.toString() === planId);
        if (row) {
          const key = `${row.week_start_date}-${row.display_order}`;
          scoresBySlot.set(key, true);
        }
      });
    }

    // Collect all action IDs for batch fetch
    const allActionIds = new Set<number>();
    (planRows || []).forEach(row => {
      if (row.action_id) allActionIds.add(row.action_id);
    });

    // Build week structures
    const weeks: WeekAssignment[] = mondays.map(monday => ({
      weekStart: monday,
      slots: [1, 2, 3].map(order => ({
        displayOrder: order as 1 | 2 | 3,
        actionId: null,
        actionStatement: '',
        domainName: '',
        status: '',
        isLocked: false,
      }))
    }));

    // Fill in plan data
    for (const row of planRows || []) {
      if (row.action_id) {
        allActionIds.add(row.action_id);
      }

      const slot: WeekSlot = {
        displayOrder: row.display_order as 1 | 2 | 3,
        actionId: row.action_id,
        actionStatement: '',
        domainName: '',
        status: row.status,
        isLocked: false,
        planId: row.id,
      };

      const weekIdx = weeks.findIndex(w => w.weekStart === row.week_start_date);
      if (weekIdx >= 0) {
        weeks[weekIdx].slots[row.display_order - 1] = slot;
      }
    }

    // Batch fetch pro-move details
    if (allActionIds.size > 0) {
      const moveMap = await fetchProMoveMetaByIds(Array.from(allActionIds));

      for (const week of weeks) {
        for (const slot of week.slots) {
          if (slot.actionId) {
            const m = moveMap.get(slot.actionId);
            if (m) {
              slot.actionStatement = m.statement;
              slot.domainName = m.domain;
            }
          }
          const slotKey = `${week.weekStart}-${slot.displayOrder}`;
          slot.isLocked = scoresBySlot.has(slotKey);
        }
      }
    }

    setWeeks(weeks);
    setHasUnsavedChanges(false);
    setLoading(false);
  };

  const getNextMonday = (monday: string): string => {
    const d = new Date(monday + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  };

  const getPrevMonday = (monday: string): string => {
    const d = new Date(monday + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  };

  const handleNavigatePrev = () => {
    setSelectedMonday(getPrevMonday(selectedMonday));
  };

  const handleNavigateNext = () => {
    setSelectedMonday(getNextMonday(selectedMonday));
  };

  const formatMonthYear = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const getFirstMondayOfMonth = (dateStr: string): string => {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(1);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  };

  const getMonthStart = (dateStr: string): string => {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(1);
    return d.toISOString().split('T')[0];
  };

  const handleMonthPrev = () => {
    const d = new Date(selectedMonday + 'T12:00:00');
    d.setDate(1);
    d.setMonth(d.getMonth() - 1);
    setSelectedMonday(getFirstMondayOfMonth(d.toISOString().split('T')[0]));
  };

  const handleMonthNext = () => {
    const d = new Date(selectedMonday + 'T12:00:00');
    d.setDate(1);
    d.setMonth(d.getMonth() + 1);
    setSelectedMonday(getFirstMondayOfMonth(d.toISOString().split('T')[0]));
  };

  const handleSelectProMove = async (actionId: number, weekStart?: string, displayOrder?: number) => {
    const targetWeek = weekStart || selectedSlot?.weekStart;
    const targetOrder = displayOrder || selectedSlot?.displayOrder;
    
    if (!targetWeek || !targetOrder) return;

    // Fetch pro-move details using unified helper
    const metaMap = await fetchProMoveMetaByIds([actionId]);
    const meta = metaMap.get(actionId);

    // Update local state
    const updatedWeeks = weeks.map(w => 
      w.weekStart === targetWeek 
        ? {
            ...w,
            slots: w.slots.map(s => 
              s.displayOrder === targetOrder
                ? { 
                    ...s, 
                    actionId,
                    actionStatement: meta?.statement || '',
                    domainName: meta?.domain || ''
                  }
                : s
            )
          }
        : w
    );
    
    setWeeks(updatedWeeks);
    setHasUnsavedChanges(true);
    setPickerOpen(false);
  };

  const handleClearSlot = async (weekStart: string, displayOrder: number) => {
    const updatedWeeks = weeks.map(w => 
      w.weekStart === weekStart 
        ? {
            ...w,
            slots: w.slots.map(s => 
              s.displayOrder === displayOrder
                ? { ...s, actionId: null, actionStatement: '', domainName: '' }
                : s
            )
          }
        : w
    );
    
    setWeeks(updatedWeeks);
    setHasUnsavedChanges(true);
  };

  const handleSaveAll = async () => {
    setSavingChanges(true);
    try {
      // Check for locked weeks first
      const weekStartDates = weeks.map(w => w.weekStart);
      const { data: existingScores } = await supabase
        .from('weekly_scores')
        .select('weekly_focus_id')
        .ilike('weekly_focus_id', 'plan:%');

      // Get plan IDs that have scores
      const planIdsWithScores = new Set(
        (existingScores || [])
          .map((s: any) => s.weekly_focus_id?.replace('plan:', ''))
          .filter(Boolean)
      );

      // Check which weeks have scores
      const { data: existingPlans } = await supabase
        .from('weekly_plan')
        .select('id, week_start_date')
        .eq('role_id', roleId)
        .is('org_id', null)
        .in('week_start_date', weekStartDates);

      const lockedWeeks = (existingPlans || [])
        .filter((p: any) => planIdsWithScores.has(String(p.id)))
        .map((p: any) => p.week_start_date);

      const editableWeeks = weeks.filter(w => !lockedWeeks.includes(w.weekStart));

      if (editableWeeks.length === 0) {
        toast({
          title: 'Cannot save',
          description: 'All weeks have existing scores and cannot be modified',
          variant: 'destructive',
        });
        return;
      }

      if (lockedWeeks.length > 0) {
        toast({
          title: 'Some weeks locked',
          description: `${lockedWeeks.length} week(s) with scores skipped. Saving ${editableWeeks.length} editable week(s).`,
        });
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let successCount = 0;
      let errorCount = 0;

      for (const week of editableWeeks) {
        const picks = week.slots.map(s => ({ 
          displayOrder: s.displayOrder as 1 | 2 | 3, 
          actionId: s.actionId || null, 
          generatedBy: 'manual' as const,
          rankSnapshot: s.rankSnapshot || null,
        }));

        const { data, error } = await supabase.functions.invoke('planner-upsert', {
          body: {
            action: 'saveWeek',
            roleId,
            weekStartDate: week.weekStart,
            picks,
            updaterUserId: user.id,
          }
        });

        if (error || !data?.ok) {
          errorCount++;
          console.error(`Failed to save week ${week.weekStart}:`, error || data?.message);
        } else {
          if (data.data?.skippedLocked?.length > 0) {
            toast({
              title: 'Some slots locked',
              description: `${data.data.skippedLocked.length} slot(s) in ${week.weekStart} have scores`,
            });
          }
          successCount++;
        }
      }

      if (errorCount > 0) {
        toast({
          title: 'Partial save',
          description: `${successCount} week(s) saved, ${errorCount} failed`,
          variant: 'destructive'
        });
      } else {
        toast({ title: 'Saved', description: `${successCount} week(s) saved successfully` });
      }

      setHasUnsavedChanges(false);
      await loadWeeks(selectedMonday);
    } catch (error: any) {
      toast({
        title: 'Error saving changes',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSavingChanges(false);
    }
  };

  const handleDeleteWeek = async (weekStart: string) => {
    try {
      console.log('[WeekBuilderPanel] Attempting to delete week:', {
        weekStart,
        roleId,
        org_id: null,
      });

      // First verify user is super admin
      const { data: staffData, error: staffError } = await supabase
        .from('staff')
        .select('is_super_admin')
        .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
        .single();

      if (staffError || !staffData?.is_super_admin) {
        console.error('[WeekBuilderPanel] User not authorized:', { staffError, staffData });
        toast({
          title: 'Permission denied',
          description: 'You must be a super admin to delete weeks',
          variant: 'destructive',
        });
        return;
      }

      // Check what rows exist
      const { data: existingRows, error: checkError } = await supabase
        .from('weekly_plan')
        .select('id, action_id, display_order, status')
        .eq('role_id', roleId)
        .is('org_id', null)
        .eq('week_start_date', weekStart);

      if (checkError) {
        console.error('[WeekBuilderPanel] Error checking existing rows:', checkError);
        throw checkError;
      }

      console.log('[WeekBuilderPanel] Found rows to delete:', existingRows);

      if (!existingRows || existingRows.length === 0) {
        toast({
          title: 'Nothing to delete',
          description: 'No pro-moves found for this week',
        });
        setDeleteWeekDialogOpen(false);
        setWeekToDelete(null);
        return;
      }

      // Delete by IDs to ensure we're targeting the exact rows
      const idsToDelete = existingRows.map(r => r.id);
      const { error: deleteError, count } = await supabase
        .from('weekly_plan')
        .delete({ count: 'exact' })
        .in('id', idsToDelete);

      if (deleteError) {
        console.error('[WeekBuilderPanel] Delete error:', deleteError);
        throw deleteError;
      }

      console.log('[WeekBuilderPanel] Deleted rows count:', count);

      toast({
        title: 'Week cleared',
        description: `Removed ${count} pro-move(s) from week of ${formatDate(weekStart)}`,
      });

      // Reload weeks
      await loadWeeks(selectedMonday);
      setDeleteWeekDialogOpen(false);
      setWeekToDelete(null);
    } catch (error: any) {
      console.error('[WeekBuilderPanel] Delete operation failed:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete week',
        variant: 'destructive',
      });
    }
  };

  const handleForceUnlock = async () => {
    if (!slotToUnlock?.planId) return;

    try {
      const planIdStr = `plan:${slotToUnlock.planId}`;
      
      console.log('[WeekBuilderPanel] Force unlocking slot:', {
        planId: slotToUnlock.planId,
        planIdStr,
        weekStart: slotToUnlock.weekStart,
        displayOrder: slotToUnlock.displayOrder,
      });

      // Delete all scores for this plan ID
      const { error: deleteError, count } = await supabase
        .from('weekly_scores')
        .delete({ count: 'exact' })
        .eq('weekly_focus_id', planIdStr);

      if (deleteError) throw deleteError;

      console.log('[WeekBuilderPanel] Deleted scores count:', count);

      toast({
        title: 'Slot unlocked',
        description: `Removed ${count || 0} score(s) from slot #${slotToUnlock.displayOrder}`,
      });

      // Reload weeks
      await loadWeeks(selectedMonday);
      setUnlockDialogOpen(false);
      setSlotToUnlock(null);
    } catch (error: any) {
      console.error('[WeekBuilderPanel] Force unlock failed:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to unlock slot',
        variant: 'destructive',
      });
    }
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Week Builder</CardTitle>
              <CardDescription>Assign pro-moves for {roleName}</CardDescription>
            </div>
            {hasUnsavedChanges && (
              <Button 
                onClick={handleSaveAll} 
                size="sm"
                disabled={savingChanges}
              >
                {savingChanges ? 'Saving...' : '💾 Save Changes'}
              </Button>
            )}
          </div>

          {/* View Mode Controls */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as 'week' | 'month')}>
              <TabsList>
                <TabsTrigger value="week">Week View</TabsTrigger>
                <TabsTrigger value="month">Month View</TabsTrigger>
              </TabsList>
            </Tabs>

            {viewMode === 'week' ? (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleNavigatePrev}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium text-center whitespace-nowrap">
                    Week of {formatWeekOf(selectedMonday)}
                  </span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={handleNavigateNext}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
                <Separator orientation="vertical" className="h-6 hidden md:block" />
                <div className="flex items-center gap-2">
                  <Checkbox 
                    id="twoWeeks" 
                    checked={showTwoWeeks} 
                    onCheckedChange={(checked) => setShowTwoWeeks(!!checked)} 
                  />
                  <Label htmlFor="twoWeeks" className="text-sm whitespace-nowrap">Show 2 weeks</Label>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleMonthPrev}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium text-center whitespace-nowrap">
                  {formatMonthYear(getMonthStart(selectedMonday))}
                </span>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleMonthNext}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {viewMode === 'month' ? (
            <MonthView
              roleId={roleId}
              selectedMonthAnchor={getMonthStart(selectedMonday)}
              onSelectWeek={(monday) => {
                setSelectedMonday(monday);
                setViewMode('week');
              }}
            />
          ) : (
            <div className={`grid ${showTwoWeeks ? 'grid-cols-2' : 'grid-cols-1'} gap-4`}>
              {weeks.map((week) => {
              const isPastWeek = week.weekStart < currentMonday;
              
              return (
              <Card key={week.weekStart} className="border-primary/20">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-bold">
                      Week of {formatDate(week.weekStart)}
                    </CardTitle>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setWeekToDelete(week.weekStart);
                        setDeleteWeekDialogOpen(true);
                      }}
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {week.slots.map((slot) => (
                    <div
                      key={slot.displayOrder}
                      className="border rounded-lg p-3 space-y-2 bg-card"
                      onDragOver={(e) => {
                        if (!slot.isLocked) {
                          e.preventDefault();
                          e.currentTarget.classList.add('ring-2', 'ring-primary', 'bg-primary/5');
                        }
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove('ring-2', 'ring-primary', 'bg-primary/5');
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('ring-2', 'ring-primary', 'bg-primary/5');
                        
                        if (slot.isLocked) {
                          toast({ title: 'Locked', description: 'Slot has submitted scores', variant: 'destructive' });
                          return;
                        }
                        
                        try {
                          const raw = e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain');
                          const data = JSON.parse(raw);
                          
                          // Fetch pro-move details
                          const metaMap = await fetchProMoveMetaByIds([data.actionId]);
                          const meta = metaMap.get(data.actionId);
                          
                          // Update local state with rankSnapshot
                          const updatedWeeks = weeks.map(w => 
                            w.weekStart === week.weekStart 
                              ? {
                                  ...w,
                                  slots: w.slots.map(s => 
                                    s.displayOrder === slot.displayOrder
                                      ? { 
                                          ...s, 
                                          actionId: data.actionId,
                                          actionStatement: meta?.statement || data.actionStatement || '',
                                          domainName: meta?.domain || data.domainName || '',
                                          rankSnapshot: data.rankSnapshot || null,
                                        }
                                      : s
                                  )
                                }
                              : w
                          );
                          
                          setWeeks(updatedWeeks);
                          setHasUnsavedChanges(true);
                        } catch (error) {
                          console.error('Drop error:', error);
                          toast({ title: 'Error', description: 'Failed to assign pro-move', variant: 'destructive' });
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-xs font-medium text-muted-foreground">
                          Slot #{slot.displayOrder}
                        </div>
                        {slot.isLocked && (
                          <div className="flex items-center gap-1">
                            <Badge variant={isPastWeek ? "secondary" : "default"} className="text-xs gap-1">
                              <Lock className="h-3 w-3" />
                              {isPastWeek ? "Completed" : "In Use"}
                            </Badge>
                            {isSuperAdmin && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setSlotToUnlock({
                                    weekStart: week.weekStart,
                                    displayOrder: slot.displayOrder,
                                    planId: slot.planId || null,
                                  });
                                  setUnlockDialogOpen(true);
                                }}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-warning"
                                title="Force unlock (admin only)"
                              >
                                <Unlock className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        )}
                        {!slot.isLocked && slot.actionId && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Edit3 className="h-3 w-3" />
                            Editable
                          </Badge>
                        )}
                      </div>

                      {slot.actionId ? (
                        <div className="space-y-1">
                          <div className="text-sm font-medium line-clamp-2">
                            {slot.actionStatement || 'Pro-Move'}
                          </div>
                          {slot.domainName && (
                            <Badge 
                              variant="secondary" 
                              className={`text-xs ring-1 ring-border/50 text-foreground ${isPastWeek ? 'opacity-60' : ''}`}
                              style={{
                                backgroundColor: getDomainColor(slot.domainName),
                              }}
                            >
                              {slot.domainName}
                            </Badge>
                          )}
                          {!slot.isLocked && (
                            <div className="flex gap-1 pt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedSlot({ weekStart: week.weekStart, displayOrder: slot.displayOrder });
                                  setPickerOpen(true);
                                }}
                                className="h-7 text-xs"
                              >
                                Replace
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleClearSlot(week.weekStart, slot.displayOrder)}
                                className="h-7 text-xs"
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedSlot({ weekStart: week.weekStart, displayOrder: slot.displayOrder });
                            setPickerOpen(true);
                          }}
                          className="w-full text-xs"
                        >
                          Choose from Library
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
              );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {pickerOpen && (
        <ProMovePickerDialog
          open={pickerOpen}
          onClose={() => setPickerOpen(false)}
          roleId={roleId}
          onSelect={handleSelectProMove}
        />
      )}

      <AlertDialog open={deleteWeekDialogOpen} onOpenChange={setDeleteWeekDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all pro-moves for this week?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all assigned pro-moves for the week of {weekToDelete && formatDate(weekToDelete)}. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => weekToDelete && handleDeleteWeek(weekToDelete)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Week
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={unlockDialogOpen} onOpenChange={setUnlockDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Force unlock this slot?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete ALL submitted scores for slot #{slotToUnlock?.displayOrder} in the week of {slotToUnlock?.weekStart && formatDate(slotToUnlock.weekStart)}. 
              This affects all users who have scored this pro-move. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleForceUnlock}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Force Unlock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
