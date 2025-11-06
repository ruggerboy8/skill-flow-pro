import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CycleWeekGrid } from './CycleWeekGrid';
import { SlotCanvas } from './SlotCanvas';

interface Role {
  role_id: number;
  role_name: string;
}

interface Slot {
  id: string;
  action_id?: number;
  action_statement?: string;
  competency_id?: number;
  competency_name?: string;
  self_select: boolean;
}

interface SimpleFocusBuilderProps {
  roleFilter?: number;
}

export function SimpleFocusBuilder({ roleFilter }: SimpleFocusBuilderProps) {
  const { toast } = useToast();
  
  // State management
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedCycle, setSelectedCycle] = useState<number | null>(null);
  const [selectedWeek, setSelectedWeek] = useState<number | null>(null);
  const [selectedRole, setSelectedRole] = useState<number | null>(roleFilter || null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load roles on mount
  useEffect(() => {
    if (!roleFilter) {
      loadRoles();
    }
  }, [roleFilter]);

  // Load existing week data when cycle/week/role selected
  useEffect(() => {
    if (selectedCycle && selectedWeek && selectedRole) {
      loadExistingWeek();
    }
  }, [selectedCycle, selectedWeek, selectedRole]);

  const loadRoles = async () => {
    const { data } = await supabase
      .from('roles')
      .select('role_id, role_name')
      .order('role_name');
    
    if (data) setRoles(data);
  };

  const loadExistingWeek = async () => {
    if (!selectedCycle || !selectedWeek || !selectedRole) return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('weekly_focus')
        .select(`
          action_id,
          competency_id,
          self_select,
          display_order,
          pro_moves!action_id(action_statement),
          competencies!competency_id(name)
        `)
        .eq('cycle', selectedCycle)
        .eq('week_in_cycle', selectedWeek)
        .eq('role_id', selectedRole)
        .order('display_order');

      if (error) throw error;

      const loadedSlots: Slot[] = (data || []).map((item, index) => ({
        id: item.self_select ? `self-select-${index}` : `pro-move-${item.action_id}`,
        action_id: item.action_id || undefined,
        action_statement: item.self_select ? undefined : (item.pro_moves as any)?.action_statement,
        competency_id: item.competency_id || undefined,
        competency_name: (item.competencies as any)?.name,
        self_select: item.self_select
      }));

      setSlots(loadedSlots);
    } catch (error) {
      console.error('Error loading existing week:', error);
      toast({
        title: "Error",
        description: "Failed to load existing week data.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleWeekSelect = (cycle: number, week: number) => {
    // Toggle: if clicking the same week, deselect it
    if (selectedCycle === cycle && selectedWeek === week) {
      setSelectedCycle(null);
      setSelectedWeek(null);
      setSlots([]);
    } else {
      setSelectedCycle(cycle);
      setSelectedWeek(week);
      // Don't reset slots here - loadExistingWeek will handle it
    }
  };

  const validateSlots = () => {
    if (slots.length < 1 || slots.length > 3) return false;
    
    const selfSelectCount = slots.filter(s => s.self_select).length;
    
    if (selfSelectCount > 2) return false;
    
    // Check for duplicates
    const actionIds = slots.filter(s => !s.self_select && s.action_id).map(s => s.action_id);
    const uniqueActionIds = [...new Set(actionIds)];
    if (actionIds.length !== uniqueActionIds.length) return false;
    
    return true;
  };

  const handleSave = async () => {
    if (!selectedCycle || !selectedWeek || !selectedRole) {
      toast({
        title: "Missing selection",
        description: "Please select cycle, week, and role before saving.",
        variant: "destructive"
      });
      return;
    }

    if (!validateSlots()) {
      toast({
        title: "Invalid configuration",
        description: "Please check your slots configuration.",
        variant: "destructive"
      });
      return;
    }

    setSaving(true);
    try {
      // Prepare slots data for RPC
      const slotsData = slots.map((slot, index) => ({
        action_id: slot.action_id || null,
        competency_id: slot.competency_id || null,
        self_select: slot.self_select,
        display_order: index + 1
      }));

      const { data, error } = await supabase.rpc('replace_weekly_focus', {
        p_cycle: selectedCycle,
        p_week_in_cycle: selectedWeek,
        p_role_id: selectedRole,
        p_slots: slotsData
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: `Week focus saved successfully! ${(data as any)?.inserted || slots.length} moves configured.`,
      });

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save week focus.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const canSave = () => {
    return selectedCycle && selectedWeek && selectedRole && validateSlots();
  };

  const getRoleName = () => {
    if (roleFilter) {
      const role = roles.find(r => r.role_id === roleFilter);
      return role?.role_name || 'Unknown Role';
    }
    if (selectedRole) {
      const role = roles.find(r => r.role_id === selectedRole);
      return role?.role_name || 'Unknown Role';
    }
    return 'No Role Selected';
  };

  return (
    <div className="space-y-4">
      {/* Week Selection Grid */}
      <CycleWeekGrid 
        onWeekSelect={handleWeekSelect}
        selectedRole={selectedRole}
        selectedCycle={selectedCycle}
        selectedWeek={selectedWeek}
      />

      {/* Slot Canvas - Only shown when week is selected */}
      {selectedCycle && selectedWeek && selectedRole && (
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              Week Focus Slots - Cycle {selectedCycle}, Week {selectedWeek}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Loading existing week data...</div>
            ) : (
              <SlotCanvas
                slots={slots}
                onUpdateSlots={setSlots}
                roleFilter={selectedRole}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Save Footer */}
      {selectedCycle && selectedWeek && selectedRole && (
        <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
          <div className="text-sm text-muted-foreground">
            Week has {slots.length} of 1–3 moves (max 2 self-select)
          </div>
          <Button
            onClick={handleSave}
            disabled={!canSave() || saving}
            className="min-w-[120px]"
          >
            {saving ? "Saving..." : "Save Week"}
          </Button>
        </div>
      )}
    </div>
  );
}