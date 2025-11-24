import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
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

interface GlobalAssignmentBuilderProps {
  roleFilter?: number;
}

/**
 * Builder for weekly_assignments table (replaces SimpleFocusBuilder which used weekly_focus)
 */
export function GlobalAssignmentBuilder({ roleFilter }: GlobalAssignmentBuilderProps) {
  const { toast } = useToast();
  
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<number | null>(roleFilter || null);
  const [weekStartDate, setWeekStartDate] = useState<string>('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!roleFilter) {
      loadRoles();
    }
    // Set default to next Monday
    const nextMonday = getNextMonday();
    setWeekStartDate(nextMonday);
  }, [roleFilter]);

  useEffect(() => {
    if (selectedRole && weekStartDate) {
      loadExistingWeek();
    }
  }, [selectedRole, weekStartDate]);

  const getNextMonday = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const daysToMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextMon = new Date(now);
    nextMon.setDate(now.getDate() + daysToMonday);
    return nextMon.toISOString().split('T')[0];
  };

  const loadRoles = async () => {
    const { data } = await supabase
      .from('roles')
      .select('role_id, role_name')
      .order('role_name');
    
    if (data) setRoles(data);
  };

  const loadExistingWeek = async () => {
    if (!selectedRole || !weekStartDate) return;
    
    setLoading(true);
    try {
      // First get the assignments
      const { data: assignments, error: assignError } = await supabase
        .from('weekly_assignments')
        .select('id, action_id, competency_id, self_select, display_order')
        .eq('role_id', selectedRole)
        .eq('week_start_date', weekStartDate)
        .eq('source', 'global')
        .eq('status', 'locked')
        .is('org_id', null)
        .is('location_id', null)
        .is('superseded_at', null)
        .order('display_order');

      if (assignError) throw assignError;

      if (!assignments || assignments.length === 0) {
        setSlots([]);
        return;
      }

      // Get action details for non-self-select slots
      const actionIds = assignments
        .filter(a => !a.self_select && a.action_id)
        .map(a => a.action_id!);
      
      let actionMap = new Map<number, string>();
      if (actionIds.length > 0) {
        const { data: moves } = await supabase
          .from('pro_moves')
          .select('action_id, action_statement')
          .in('action_id', actionIds);
        
        (moves || []).forEach(m => {
          actionMap.set(m.action_id, m.action_statement || '');
        });
      }

      // Get competency details for self-select slots
      const competencyIds = assignments
        .filter(a => a.competency_id)
        .map(a => a.competency_id!);
      
      let competencyMap = new Map<number, string>();
      if (competencyIds.length > 0) {
        const { data: comps } = await supabase
          .from('competencies')
          .select('competency_id, name')
          .in('competency_id', competencyIds);
        
        (comps || []).forEach(c => {
          competencyMap.set(c.competency_id, c.name || '');
        });
      }

      // Build slots
      const loadedSlots: Slot[] = assignments.map((item, index) => ({
        id: item.self_select ? `self-select-${index}` : `pro-move-${item.action_id}`,
        action_id: item.action_id || undefined,
        action_statement: item.action_id ? actionMap.get(item.action_id) : undefined,
        competency_id: item.competency_id || undefined,
        competency_name: item.competency_id ? competencyMap.get(item.competency_id) : undefined,
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
    if (!selectedRole || !weekStartDate) {
      toast({
        title: "Missing selection",
        description: "Please select role and week before saving.",
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
      // First, supersede existing assignments for this week/role
      const { error: supersededError } = await supabase
        .from('weekly_assignments')
        .update({ superseded_at: new Date().toISOString() })
        .eq('role_id', selectedRole)
        .eq('week_start_date', weekStartDate)
        .eq('source', 'global')
        .is('org_id', null)
        .is('location_id', null)
        .is('superseded_at', null);

      if (supersededError) throw supersededError;

      // Insert new assignments
      const newAssignments = slots.map((slot, index) => ({
        role_id: selectedRole,
        week_start_date: weekStartDate,
        source: 'global',
        status: 'locked',
        action_id: slot.action_id || null,
        competency_id: slot.competency_id || null,
        self_select: slot.self_select,
        display_order: index + 1,
        org_id: null,
        location_id: null
      }));

      const { error: insertError } = await supabase
        .from('weekly_assignments')
        .insert(newAssignments);

      if (insertError) throw insertError;

      toast({
        title: "Success",
        description: `Week assignments saved successfully! ${slots.length} moves configured.`,
      });

      // Reload to show new IDs
      loadExistingWeek();

    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to save week assignments.",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const canSave = () => {
    return selectedRole && weekStartDate && validateSlots();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Global Weekly Assignments</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {!roleFilter && (
              <div>
                <label className="text-sm font-medium">Role</label>
                <select 
                  className="w-full mt-1 p-2 border rounded"
                  value={selectedRole || ''}
                  onChange={(e) => setSelectedRole(Number(e.target.value))}
                >
                  <option value="">Select role...</option>
                  {roles.map(r => (
                    <option key={r.role_id} value={r.role_id}>{r.role_name}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Week Start (Monday)</label>
              <input 
                type="date"
                className="w-full mt-1 p-2 border rounded"
                value={weekStartDate}
                onChange={(e) => setWeekStartDate(e.target.value)}
              />
            </div>
          </div>

          {selectedRole && weekStartDate && (
            <>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                <SlotCanvas
                  slots={slots}
                  onUpdateSlots={setSlots}
                  roleFilter={selectedRole}
                />
              )}
            </>
          )}
        </CardContent>
      </Card>

      {selectedRole && weekStartDate && (
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
