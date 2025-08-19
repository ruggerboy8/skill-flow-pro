import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Plus, GripVertical, X, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ProMovePicker } from './ProMovePicker';

interface Slot {
  id: string;
  action_id?: number;
  action_statement?: string;
  competency_id?: number;
  competency_name?: string;
  self_select: boolean;
}

interface SlotCanvasProps {
  slots: Slot[];
  onUpdateSlots: (slots: Slot[]) => void;
  roleFilter: number;
  competencyFilter?: string;
}

export function SlotCanvas({ slots, onUpdateSlots, roleFilter, competencyFilter }: SlotCanvasProps) {
  const { toast } = useToast();
  const [showProMovePicker, setShowProMovePicker] = useState(false);
  const [addingToSlotIndex, setAddingToSlotIndex] = useState<number>(-1);

  const validateSlots = (newSlots: Slot[]) => {
    const selfSelectCount = newSlots.filter(s => s.self_select).length;
    const siteMovesCount = newSlots.filter(s => !s.self_select).length;
    
    if (newSlots.length > 3) {
      toast({
        title: "Too many moves",
        description: "Maximum 3 moves allowed per week.",
        variant: "destructive"
      });
      return false;
    }
    
    if (selfSelectCount > 2) {
      toast({
        title: "Too many self-select slots",
        description: "Maximum 2 self-select slots allowed per week.",
        variant: "destructive"
      });
      return false;
    }
    
    if (siteMovesCount < 1 && newSlots.length > 0) {
      toast({
        title: "Site move required",
        description: "At least 1 site move required per week.",
        variant: "destructive"
      });
      return false;
    }

    // Check for duplicates
    const actionIds = newSlots.filter(s => !s.self_select && s.action_id).map(s => s.action_id);
    const uniqueActionIds = [...new Set(actionIds)];
    if (actionIds.length !== uniqueActionIds.length) {
      toast({
        title: "Duplicate moves",
        description: "Duplicate pro-moves are not allowed in the same week.",
        variant: "destructive"
      });
      return false;
    }
    
    return true;
  };

  const addSiteMove = (slotIndex?: number) => {
    if (slots.length >= 3) {
      toast({
        title: "Maximum reached",
        description: "Maximum 3 moves allowed per week.",
        variant: "destructive"
      });
      return;
    }
    
    setAddingToSlotIndex(slotIndex ?? slots.length);
    setShowProMovePicker(true);
  };

  const addSelfSelect = (slotIndex?: number) => {
    if (slots.length >= 3) {
      toast({
        title: "Maximum reached",
        description: "Maximum 3 moves allowed per week.",
        variant: "destructive"
      });
      return;
    }

    const selfSelectCount = slots.filter(s => s.self_select).length;
    if (selfSelectCount >= 2) {
      toast({
        title: "Self-select limit reached",
        description: "Maximum 2 self-select slots allowed per week.",
        variant: "destructive"
      });
      return;
    }

    const newSlot: Slot = {
      id: `self-select-${Date.now()}`,
      self_select: true,
      competency_id: competencyFilter && competencyFilter !== 'all' ? parseInt(competencyFilter) : undefined
    };

    let newSlots;
    if (slotIndex !== undefined && slotIndex < slots.length) {
      newSlots = [...slots];
      newSlots.splice(slotIndex, 0, newSlot);
    } else {
      newSlots = [...slots, newSlot];
    }

    if (validateSlots(newSlots)) {
      onUpdateSlots(newSlots);
    }
  };

  const handleProMoveSelected = (proMove: any) => {
    // Check for duplicates
    if (slots.some(s => s.action_id === proMove.action_id)) {
      toast({
        title: "Duplicate move",
        description: "This pro-move is already selected for this week.",
        variant: "destructive"
      });
      return;
    }

    const newSlot: Slot = {
      id: `pro-move-${proMove.action_id}`,
      action_id: proMove.action_id,
      action_statement: proMove.action_statement,
      competency_id: proMove.competency_id,
      competency_name: proMove.competency_name,
      self_select: false
    };

    let newSlots;
    if (addingToSlotIndex < slots.length) {
      newSlots = [...slots];
      newSlots.splice(addingToSlotIndex, 0, newSlot);
    } else {
      newSlots = [...slots, newSlot];
    }

    if (validateSlots(newSlots)) {
      onUpdateSlots(newSlots);
    }
    
    setShowProMovePicker(false);
    setAddingToSlotIndex(-1);
  };

  const removeSlot = (index: number) => {
    const newSlots = slots.filter((_, i) => i !== index);
    onUpdateSlots(newSlots);
  };

  const convertToSiteMove = (index: number) => {
    setAddingToSlotIndex(index);
    removeSlot(index);
    setShowProMovePicker(true);
  };

  const moveSlot = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= slots.length || fromIndex === toIndex) return;
    
    const newSlots = [...slots];
    const [movedSlot] = newSlots.splice(fromIndex, 1);
    newSlots.splice(toIndex, 0, movedSlot);
    onUpdateSlots(newSlots);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Week Focus Slots</h3>
        <div className="text-sm text-muted-foreground">
          {slots.length}/3 moves ({slots.filter(s => s.self_select).length}/2 self-select)
        </div>
      </div>

      <div className="space-y-3">
        {slots.map((slot, index) => (
          <Card key={slot.id} className="p-4">
            <CardContent className="p-0">
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <GripVertical 
                    className="w-4 h-4 text-muted-foreground cursor-move" 
                    onMouseDown={() => {
                      // Simple reorder implementation
                      const handleKeyDown = (e: KeyboardEvent) => {
                        if (e.key === 'ArrowUp' && index > 0) {
                          moveSlot(index, index - 1);
                        } else if (e.key === 'ArrowDown' && index < slots.length - 1) {
                          moveSlot(index, index + 1);
                        }
                        document.removeEventListener('keydown', handleKeyDown);
                      };
                      document.addEventListener('keydown', handleKeyDown);
                    }}
                  />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                        {slot.self_select ? (
                          <Badge variant="secondary" className="bg-purple-100 text-purple-800">
                            Self-Select
                          </Badge>
                        ) : (
                          <Badge variant="default">Site Move</Badge>
                        )}
                      </div>
                      
                      {slot.action_statement ? (
                        <p className="text-sm">{slot.action_statement}</p>
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          Self-select placeholder - participant will choose their own pro-move
                        </p>
                      )}
                      
                      {slot.competency_name && (
                        <p className="text-xs text-muted-foreground">
                          Competency: {slot.competency_name}
                        </p>
                      )}
                    </div>
                    
                    <div className="flex gap-1">
                      {slot.self_select && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => convertToSiteMove(index)}
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Convert
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeSlot(index)}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        {slots.length < 3 && (
          <Card className="p-4 border-dashed">
            <CardContent className="p-0">
              <div className="flex items-center justify-center gap-4">
                <Button
                  variant="outline"
                  onClick={() => addSiteMove()}
                  disabled={slots.length >= 3}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Site Move
                </Button>
                <Button
                  variant="outline"
                  onClick={() => addSelfSelect()}
                  disabled={slots.length >= 3 || slots.filter(s => s.self_select).length >= 2}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add Self-Select
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {showProMovePicker && (
        <ProMovePicker
          roleFilter={roleFilter}
          competencyFilter={competencyFilter}
          excludeActionIds={slots.filter(s => s.action_id).map(s => s.action_id!)}
          onSelect={handleProMoveSelected}
          onClose={() => {
            setShowProMovePicker(false);
            setAddingToSlotIndex(-1);
          }}
        />
      )}
    </div>
  );
}