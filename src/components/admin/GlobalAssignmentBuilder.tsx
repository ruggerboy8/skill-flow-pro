import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { useRoleDisplayNames } from '@/hooks/useRoleDisplayNames';
import { useUserRole } from '@/hooks/useUserRole';
import { resolveNextMonday } from '@/lib/submissionPolicy';
import { formatInTimeZone } from 'date-fns-tz';
import { findScoredSlotsBlockingSave, type ExistingAssignmentSlot } from '@/lib/assignmentScoreGuard';
import { SlotCanvas } from './SlotCanvas';

// ASG-1 Fix 2: matches plannerUtils.PLANNER_TZ. Used only (a) transiently
// until organizations.timezone has been fetched for `organizationId`, or
// (b) permanently when there is genuinely no org in scope.
const PLANNER_FALLBACK_TZ = 'America/Chicago';

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
  const { resolve: resolveRole } = useRoleDisplayNames();
  const { organizationId } = useUserRole();
  
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<number | null>(roleFilter || null);
  const [weekStartDate, setWeekStartDate] = useState<string>('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // True once the admin has typed a week date themselves, so the async
  // org-timezone default (below) doesn't clobber it after the fact.
  const userEditedWeekRef = useRef(false);

  useEffect(() => {
    if (!roleFilter) {
      loadRoles();
    }
  }, [roleFilter]);

  // ASG-1 Fix 2: default the week-start date from the org's canonical
  // timezone (matching locationState.assembleWeek's read side), not
  // hardcoded America/Chicago. Re-runs when `organizationId` resolves from
  // undefined (still loading) to its real value.
  useEffect(() => {
    if (userEditedWeekRef.current) return;
    let cancelled = false;
    (async () => {
      let tz = PLANNER_FALLBACK_TZ;
      if (organizationId) {
        const { data } = await supabase
          .from('organizations')
          .select('timezone' as 'id')
          .eq('id', organizationId)
          .maybeSingle();
        if (cancelled) return;
        // organizations.timezone is a recent additive column; generated
        // types lag until Lovable's next regen, so the row is typed by hand
        // here (repo convention, see useAuth.tsx pwa_enabled).
        const row = data as unknown as { timezone: string } | null;
        tz = row?.timezone || PLANNER_FALLBACK_TZ;
      }
      if (cancelled || userEditedWeekRef.current) return;
      const nextMonday = formatInTimeZone(resolveNextMonday(new Date(), tz), tz, 'yyyy-MM-dd');
      setWeekStartDate(nextMonday);
    })();
    return () => { cancelled = true; };
  }, [organizationId]);

  useEffect(() => {
    if (selectedRole && weekStartDate) {
      loadExistingWeek();
    }
  }, [selectedRole, weekStartDate]);

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
        .eq('status', 'locked')
        .eq('org_id', organizationId)
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
      
      const actionMap = new Map<number, string>();
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
      
      const competencyMap = new Map<number, string>();
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
      const loadedSlots: Slot[] = assignments.map((item, index) => {
        const slot = {
          id: item.self_select ? `self-select-${index}` : `pro-move-${item.action_id}`,
          action_id: item.action_id || undefined,
          action_statement: item.action_id ? actionMap.get(item.action_id) : undefined,
          competency_id: item.competency_id || undefined,
          competency_name: item.competency_id ? competencyMap.get(item.competency_id) : undefined,
          self_select: item.self_select
        };
        console.log('🔍 Loaded slot:', slot);
        return slot;
      });

      console.log('📦 All slots loaded:', loadedSlots);
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
      // ASG-1 Fix 2 (fold-in): this save is about to supersede EVERY
      // existing row for this (role, week, org). Before doing that, check
      // whether any of those rows already has a submitted score. If so,
      // superseding it would orphan that score. Mirrors the "skippedLocked"
      // pattern in planner-upsert/sequencer-auto-assign, but here we BLOCK
      // the whole save rather than partially saving: this surface replaces
      // ALL slots at once with no per-slot picker, so there is no safe way
      // to "skip just the locked ones" the way the per-slot planner can.
      const { data: existingRows, error: existingError } = await supabase
        .from('weekly_assignments')
        .select('id, display_order')
        .eq('role_id', selectedRole)
        .eq('week_start_date', weekStartDate)
        .eq('org_id', organizationId)
        .is('superseded_at', null);

      if (existingError) throw existingError;

      const existingSlots: ExistingAssignmentSlot[] = existingRows ?? [];
      if (existingSlots.length > 0) {
        const assignmentIds = existingSlots.map((row) => `assign:${row.id}`);
        const { data: scoredRows, error: scoredError } = await supabase
          .from('weekly_scores')
          .select('assignment_id')
          .in('assignment_id', assignmentIds);

        if (scoredError) throw scoredError;

        const scoredAssignmentIds = new Set(
          (scoredRows ?? []).map((r) => r.assignment_id).filter((id): id is string => !!id)
        );
        const blockingSlots = findScoredSlotsBlockingSave(existingSlots, scoredAssignmentIds);

        if (blockingSlots.length > 0) {
          toast({
            title: "Can't save: slot already has scores",
            description: `Slot${blockingSlots.length > 1 ? 's' : ''} ${blockingSlots.join(', ')} already ${blockingSlots.length > 1 ? 'have' : 'has'} submitted scores and can't be replaced. Force-unlock the slot first if it truly needs to change.`,
            variant: "destructive"
          });
          setSaving(false);
          return;
        }
      }

      // Supersede existing assignments for this week/role
      const { error: supersededError } = await supabase
        .from('weekly_assignments')
        .update({ superseded_at: new Date().toISOString() })
        .eq('role_id', selectedRole)
        .eq('week_start_date', weekStartDate)
        .eq('org_id', organizationId)
        .is('superseded_at', null);

      if (supersededError) throw supersededError;

      // Insert new assignments
      const newAssignments = slots.map((slot, index) => ({
        role_id: selectedRole,
        week_start_date: weekStartDate,
        source: 'org' as const,
        status: 'locked',
        action_id: slot.action_id || null,
        competency_id: slot.competency_id || null,
        self_select: slot.self_select,
        display_order: index + 1,
        org_id: organizationId,
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
                    <option key={r.role_id} value={r.role_id}>{resolveRole(r.role_id, r.role_name)}</option>
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
                onChange={(e) => {
                  userEditedWeekRef.current = true;
                  setWeekStartDate(e.target.value);
                }}
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
