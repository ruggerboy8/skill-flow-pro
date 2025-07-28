import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, GripVertical } from 'lucide-react';
import { getDomainColor } from '@/lib/domainColors';

export interface SlotItem {
  id: string;
  action_id: number | null;
  action_statement: string;
  domain_name?: string;
  self_select: boolean;
  display_order: number;
}

interface SlotPreviewProps {
  slots: SlotItem[];
  onRemoveSlot: (id: string) => void;
  onReorderSlots: (newOrder: SlotItem[]) => void;
  selectedCycle: number | null;
  selectedWeek: number | null;
  selectedRole: string | null;
}

export function SlotPreview({ 
  slots, 
  onRemoveSlot, 
  onReorderSlots, 
  selectedCycle, 
  selectedWeek, 
  selectedRole 
}: SlotPreviewProps) {
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
    
    if (dragIndex === dropIndex) return;

    const newSlots = [...slots];
    const draggedSlot = newSlots[dragIndex];
    newSlots.splice(dragIndex, 1);
    newSlots.splice(dropIndex, 0, draggedSlot);
    
    // Update display orders
    const reorderedSlots = newSlots.map((slot, index) => ({
      ...slot,
      display_order: index + 1
    }));
    
    onReorderSlots(reorderedSlots);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          Week Preview ({slots.length}/3)
          {selectedCycle && selectedWeek && selectedRole && (
            <div className="text-sm font-normal text-muted-foreground">
              Week {selectedWeek} (Cycle {selectedCycle}) — {selectedRole}
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {[1, 2, 3].map(slotNumber => {
            const slot = slots.find(s => s.display_order === slotNumber);
            
            return (
              <div
                key={slotNumber}
                className={`
                  p-4 border-2 border-dashed rounded-lg min-h-[80px] flex items-center
                  ${slot ? 'border-solid bg-gray-50' : 'border-gray-300 bg-gray-100'}
                `}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, slotNumber - 1)}
              >
                {slot ? (
                  <div className="flex items-center gap-3 w-full">
                    <div
                      className="cursor-grab active:cursor-grabbing"
                      draggable
                      onDragStart={(e) => handleDragStart(e, slotNumber - 1)}
                    >
                      <GripVertical className="w-4 h-4 text-gray-400" />
                    </div>
                    
                    <span className="font-semibold text-sm text-gray-600">
                      {slotNumber}.
                    </span>
                    
                    <div className="flex-1">
                      {slot.self_select ? (
                        <Badge variant="outline" className="text-sm">
                          Self-Select
                        </Badge>
                      ) : (
                        <div className="space-y-1">
                          {slot.domain_name && (
                            <Badge 
                              variant="secondary" 
                              className="text-xs"
                              style={{ backgroundColor: getDomainColor(slot.domain_name) }}
                            >
                              {slot.domain_name}
                            </Badge>
                          )}
                          <p className="text-sm text-gray-700 leading-relaxed">
                            {slot.action_statement}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onRemoveSlot(slot.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-full text-muted-foreground">
                    <span className="text-sm">Slot {slotNumber} - Empty</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}