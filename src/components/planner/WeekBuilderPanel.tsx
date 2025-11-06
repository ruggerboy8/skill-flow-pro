import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Loader2, Lock, Edit3, X } from 'lucide-react';
import { normalizeToPlannerWeek } from '@/lib/plannerUtils';
import { ProMovePickerDialog } from './ProMovePickerDialog';
import { fetchProMoveMetaByIds } from '@/lib/proMoves';
import { getDomainColor } from '@/lib/domainColors';

interface WeekSlot {
  displayOrder: 1 | 2 | 3;
  actionId: number | null;
  actionStatement: string;
  domainName: string;
  status?: string;
  isLocked: boolean;
}

interface WeekAssignment {
  weekStart: string;
  slots: WeekSlot[];
}

interface WeekBuilderPanelProps {
  roleId: number;
  roleName: string;
  onUsedActionIdsChange?: (actionIds: number[]) => void;
}

export function WeekBuilderPanel({ roleId, roleName, onUsedActionIdsChange }: WeekBuilderPanelProps) {
  const { toast } = useToast();
  const [weeks, setWeeks] = useState<WeekAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSlot, setSelectedSlot] = useState<{ weekStart: string; displayOrder: number } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingChanges, setSavingChanges] = useState(false);
  const baseMonday = normalizeToPlannerWeek(new Date());
  const [displayedBaseMonday, setDisplayedBaseMonday] = useState(baseMonday);

  useEffect(() => {
    loadWeeks(displayedBaseMonday);
  }, [roleId, displayedBaseMonday]);

  const loadWeeks = async (startMonday: string) => {
    setLoading(true);
    
    const monday2 = getNextMonday(startMonday);
    const mondays = [startMonday, monday2];

    // Fetch all weekly_plan rows
    const { data: planRows } = await supabase
      .from('weekly_plan')
      .select('id, display_order, action_id, status, week_start_date')
      .is('org_id', null)
      .eq('role_id', roleId)
      .in('week_start_date', mondays)
      .order('week_start_date')
      .order('display_order');

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
    
    // Calculate used action IDs
    const used = weeks.flatMap(w => w.slots.map(s => s.actionId).filter(Boolean) as number[]);
    if (onUsedActionIdsChange) {
      onUsedActionIdsChange(used);
    }
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
    setDisplayedBaseMonday(getPrevMonday(displayedBaseMonday));
  };

  const handleNavigateNext = () => {
    setDisplayedBaseMonday(getNextMonday(displayedBaseMonday));
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
    
    // Update used IDs
    const used = updatedWeeks.flatMap(w => w.slots.map(s => s.actionId).filter(Boolean) as number[]);
    if (onUsedActionIdsChange) {
      onUsedActionIdsChange(used);
    }
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
    
    const used = updatedWeeks.flatMap(w => w.slots.map(s => s.actionId).filter(Boolean) as number[]);
    if (onUsedActionIdsChange) {
      onUsedActionIdsChange(used);
    }
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
          generatedBy: 'manual' as const
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
      await loadWeeks(displayedBaseMonday);
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
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Week Builder</CardTitle>
              <CardDescription>Assign pro-moves to upcoming weeks for {roleName}</CardDescription>
            </div>
            <div className="flex gap-2">
              {hasUnsavedChanges && (
                <Button 
                  onClick={handleSaveAll} 
                  size="sm"
                  disabled={savingChanges}
                >
                  {savingChanges ? 'Saving...' : '💾 Save Changes'}
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={handleNavigatePrev}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleNavigateNext}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            {weeks.map((week) => (
              <Card key={week.weekStart} className="border-primary/20">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-bold">
                    Week of {formatDate(week.weekStart)}
                  </CardTitle>
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
                          await handleSelectProMove(data.actionId, week.weekStart, slot.displayOrder);
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
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Lock className="h-3 w-3" />
                            In Use
                          </Badge>
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
                              className="text-xs"
                              style={{
                                backgroundColor: `hsl(${getDomainColor(slot.domainName)})`,
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
            ))}
          </div>
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
    </>
  );
}
