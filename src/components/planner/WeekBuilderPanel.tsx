import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ChevronLeft, ChevronRight, Loader2, Lock, Edit3, X } from 'lucide-react';
import { getChicagoMonday } from '@/lib/plannerUtils';
import { ProMovePickerDialog } from './ProMovePickerDialog';

interface WeekSlot {
  id?: number;
  displayOrder: 1 | 2 | 3;
  actionId: number | null;
  actionStatement?: string;
  domainName?: string;
  generatedBy?: string;
  updatedBy?: string;
  updatedAt?: string;
  isLocked: boolean;
  isLoading?: boolean;
}

interface WeekData {
  weekStart: string;
  slots: WeekSlot[];
}

interface WeekBuilderPanelProps {
  roleId: number;
  roleName: string;
  onRefreshHistory?: () => void;
}

export function WeekBuilderPanel({ roleId, roleName, onRefreshHistory }: WeekBuilderPanelProps) {
  const { toast } = useToast();
  const [weeks, setWeeks] = useState<WeekData[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseMonday, setBaseMonday] = useState<string>('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ weekStart: string; displayOrder: number } | null>(null);

  useEffect(() => {
    const today = new Date();
    const monday = getChicagoMonday(today);
    setBaseMonday(monday);
    loadWeeks(monday);
  }, [roleId]);

  const loadWeeks = async (startMonday: string) => {
    setLoading(true);
    const mondays = [
      startMonday,
      getNextMonday(startMonday),
    ];

    const weeksData: WeekData[] = [];

    for (const monday of mondays) {
      const slots = await loadSlotsForWeek(monday);
      weeksData.push({ weekStart: monday, slots });
    }

    setWeeks(weeksData);
    setLoading(false);
  };

  const loadSlotsForWeek = async (weekStart: string): Promise<WeekSlot[]> => {
    // Fetch existing plan rows
    const { data: planRows } = await supabase
      .from('weekly_plan')
      .select('id, display_order, action_id, generated_by, updated_by, updated_at')
      .is('org_id', null)
      .eq('role_id', roleId)
      .eq('week_start_date', weekStart)
      .order('display_order');

    const slots: WeekSlot[] = [1, 2, 3].map(order => ({
      displayOrder: order as 1 | 2 | 3,
      actionId: null,
      isLocked: false,
    }));

    if (planRows) {
      for (const row of planRows) {
        const idx = row.display_order - 1;
        if (idx >= 0 && idx < 3) {
          // Check if locked (has scores)
          const { count } = await supabase
            .from('weekly_scores')
            .select('*', { count: 'exact', head: true })
            .eq('weekly_focus_id', `plan:${row.id}`);

          const isLocked = (count || 0) > 0;

          // Fetch pro-move details if action_id exists
          let actionStatement = '';
          let domainName = '';
          if (row.action_id) {
            const { data: pmData } = await supabase
              .from('pro_moves')
              .select('action_statement, competencies(domains(domain_name))')
              .eq('action_id', row.action_id)
              .single();

            if (pmData) {
              actionStatement = pmData.action_statement || '';
              domainName = (pmData.competencies as any)?.domains?.domain_name || '';
            }
          }

          slots[idx] = {
            id: row.id,
            displayOrder: row.display_order as 1 | 2 | 3,
            actionId: row.action_id,
            actionStatement,
            domainName,
            generatedBy: row.generated_by,
            updatedBy: row.updated_by,
            updatedAt: row.updated_at,
            isLocked,
          };
        }
      }
    }

    return slots;
  };

  const getNextMonday = (monday: string): string => {
    const d = new Date(monday + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const getPrevMonday = (monday: string): string => {
    const d = new Date(monday + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleNavigatePrev = () => {
    const newBase = getPrevMonday(baseMonday);
    setBaseMonday(newBase);
    loadWeeks(newBase);
  };

  const handleNavigateNext = () => {
    const newBase = getNextMonday(baseMonday);
    setBaseMonday(newBase);
    loadWeeks(newBase);
  };

  const handleOpenPicker = (weekStart: string, displayOrder: number) => {
    setSelectedSlot({ weekStart, displayOrder });
    setPickerOpen(true);
  };

  const handleSelectProMove = async (actionId: number, weekStart?: string, displayOrder?: number) => {
    const targetWeek = weekStart || selectedSlot?.weekStart;
    const targetOrder = displayOrder || selectedSlot?.displayOrder;
    
    if (!targetWeek || !targetOrder) return;

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
      return;
    }

    // Call planner-upsert
    const { data, error } = await supabase.functions.invoke('planner-upsert', {
      body: {
        action: 'saveWeek',
        roleId,
        weekStartDate: targetWeek,
        picks: [{ displayOrder: targetOrder, actionId, generatedBy: 'manual' }],
        updaterUserId: user.id,
      }
    });

    if (error || !data?.ok) {
      toast({ title: 'Error', description: error?.message || 'Failed to save', variant: 'destructive' });
      return;
    }

    if (data.data.skippedLocked.length > 0) {
      toast({ title: 'Slot Locked', description: 'Cannot modify slot with submitted scores', variant: 'destructive' });
      return;
    }

    toast({ title: 'Saved', description: 'Pro-move assigned successfully' });
    loadWeeks(baseMonday);
    if (onRefreshHistory) onRefreshHistory();
    setPickerOpen(false);
  };

  const handleClearSlot = async (weekStart: string, displayOrder: number) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Set to null (clear)
    const { data, error } = await supabase.functions.invoke('planner-upsert', {
      body: {
        action: 'saveWeek',
        roleId,
        weekStartDate: weekStart,
        picks: [{ displayOrder, actionId: 0, generatedBy: 'manual' }],
        updaterUserId: user.id,
      }
    });

    if (error || !data?.ok || data.data.skippedLocked.length > 0) {
      toast({ title: 'Error', description: 'Cannot clear locked slot', variant: 'destructive' });
      return;
    }

    toast({ title: 'Cleared', description: 'Slot cleared successfully' });
    loadWeeks(baseMonday);
    if (onRefreshHistory) onRefreshHistory();
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
                          e.currentTarget.classList.add('ring-2', 'ring-primary');
                        }
                      }}
                      onDragLeave={(e) => {
                        e.currentTarget.classList.remove('ring-2', 'ring-primary');
                      }}
                      onDrop={async (e) => {
                        e.preventDefault();
                        e.currentTarget.classList.remove('ring-2', 'ring-primary');
                        
                        if (slot.isLocked) return;
                        
                        try {
                          const data = JSON.parse(e.dataTransfer.getData('application/json'));
                          await handleSelectProMove(data.actionId, week.weekStart, slot.displayOrder);
                        } catch (error) {
                          console.error('Drop error:', error);
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
                            <Badge variant="secondary" className="text-xs">
                              {slot.domainName}
                            </Badge>
                          )}
                          {!slot.isLocked && (
                            <div className="flex gap-1 pt-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleOpenPicker(week.weekStart, slot.displayOrder)}
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
                          onClick={() => handleOpenPicker(week.weekStart, slot.displayOrder)}
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
