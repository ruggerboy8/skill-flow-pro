import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { format, addWeeks, startOfWeek } from 'date-fns';
import { ProMovePicker } from './ProMovePicker';
import { Badge } from '@/components/ui/badge';
import { GripVertical, X } from 'lucide-react';

interface WeekPlan {
  id: number;
  action_id: number | null;
  display_order: number;
  self_select: boolean;
  overridden: boolean;
  status: string;
  pro_moves?: { action_statement: string };
}

interface EditNextWeekModalProps {
  open: boolean;
  onClose: () => void;
  orgId: string;
  roleId: number;
  existingWeek: WeekPlan[];
  onSave: () => void;
}

export function EditNextWeekModal({
  open,
  onClose,
  orgId,
  roleId,
  existingWeek,
  onSave,
}: EditNextWeekModalProps) {
  const { toast } = useToast();
  const [slots, setSlots] = useState<Array<{ action_id: number | null; self_select: boolean; display_order: number; action_statement?: string }>>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [editingSlot, setEditingSlot] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (open && existingWeek.length > 0) {
      setSlots(
        existingWeek.map((w) => ({
          action_id: w.action_id,
          self_select: w.self_select,
          display_order: w.display_order,
          action_statement: w.pro_moves?.action_statement,
        }))
      );
    } else if (open) {
      // Initialize with 3 empty slots
      setSlots([
        { action_id: null, self_select: false, display_order: 1 },
        { action_id: null, self_select: false, display_order: 2 },
        { action_id: null, self_select: false, display_order: 3 },
      ]);
    }
  }, [open, existingWeek]);

  const handleSelectProMove = (proMove: any) => {
    if (editingSlot !== null) {
      const newSlots = [...slots];
      newSlots[editingSlot] = {
        action_id: proMove.action_id,
        self_select: false,
        display_order: editingSlot + 1,
        action_statement: proMove.action_statement,
      };
      setSlots(newSlots);
    }
    setShowPicker(false);
    setEditingSlot(null);
  };

  const handleDragStart = (index: number) => {
    setDraggedIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newSlots = [...slots];
    const draggedSlot = newSlots[draggedIndex];
    
    // Remove dragged item
    newSlots.splice(draggedIndex, 1);
    // Insert at new position
    newSlots.splice(dropIndex, 0, draggedSlot);
    
    // Update display_order
    newSlots.forEach((slot, idx) => {
      slot.display_order = idx + 1;
    });
    
    setSlots(newSlots);
    setDraggedIndex(null);
  };

  const handleToggleSelfSelect = (index: number) => {
    const newSlots = [...slots];
    newSlots[index] = {
      action_id: null,
      self_select: !newSlots[index].self_select,
      display_order: index + 1,
    };
    setSlots(newSlots);
  };

  const handleRemoveSlot = (index: number) => {
    const newSlots = [...slots];
    newSlots[index] = {
      action_id: null,
      self_select: false,
      display_order: index + 1,
    };
    setSlots(newSlots);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const nextMonday = format(addWeeks(startOfWeek(new Date(), { weekStartsOn: 1 }), 1), 'yyyy-MM-dd');

      // Delete existing rows for next week
      await supabase
        .from('weekly_plan' as any)
        .delete()
        .eq('org_id', orgId)
        .eq('role_id', roleId)
        .eq('week_start_date', nextMonday);

      // Insert new rows with overridden flag
      const rows = slots
        .filter((s) => s.action_id !== null || s.self_select)
        .map((s) => ({
          org_id: orgId,
          role_id: roleId,
          week_start_date: nextMonday,
          display_order: s.display_order,
          action_id: s.action_id,
          self_select: s.self_select,
          status: 'proposed',
          generated_by: 'manual',
          overridden: true,
          overridden_at: new Date().toISOString(),
        }));

      if (rows.length > 0) {
        const { error } = await supabase.from('weekly_plan' as any).insert(rows);
        if (error) throw error;
      }

      onSave();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const getExcludedActionIds = () => {
    return slots.filter((s) => s.action_id !== null).map((s) => s.action_id!);
  };

  return (
    <>
      <Dialog open={open && !showPicker} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Next Week</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            {slots.map((slot, index) => (
              <div
                key={index}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                className="flex items-center gap-3 p-4 border rounded-lg cursor-move hover:bg-accent/50 transition-colors"
              >
                <GripVertical className="h-4 w-4 text-muted-foreground" />
                <span className="font-semibold text-sm">{index + 1}.</span>

                {slot.self_select ? (
                  <Badge variant="outline">Self-Select</Badge>
                ) : slot.action_id ? (
                  <span className="text-sm flex-1">
                    {slot.action_statement || 'Pro Move'}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground flex-1">Empty slot</span>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingSlot(index);
                      setShowPicker(true);
                    }}
                  >
                    {slot.action_id ? 'Change' : 'Add Pro Move'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleToggleSelfSelect(index)}
                  >
                    {slot.self_select ? 'Remove Self-Select' : 'Make Self-Select'}
                  </Button>
                  {(slot.action_id || slot.self_select) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleRemoveSlot(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showPicker && (
        <ProMovePicker
          roleFilter={roleId}
          excludeActionIds={getExcludedActionIds()}
          onSelect={handleSelectProMove}
          onClose={() => {
            setShowPicker(false);
            setEditingSlot(null);
          }}
        />
      )}
    </>
  );
}
