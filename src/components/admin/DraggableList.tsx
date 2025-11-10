import { GripVertical, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface DraggableListProps<T extends { id?: string }> {
  items: T[];
  onReorder: (items: T[]) => void;
  onEdit: (item: T) => void;
  onDelete: (item: T) => void;
  renderItem: (item: T) => React.ReactNode;
}

export function DraggableList<T extends { id?: string }>({
  items,
  onReorder,
  onEdit,
  onDelete,
  renderItem,
}: DraggableListProps<T>) {
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndex = parseInt(e.dataTransfer.getData('text/plain'));
    
    if (dragIndex === dropIndex) return;
    
    const newItems = [...items];
    const [draggedItem] = newItems.splice(dragIndex, 1);
    newItems.splice(dropIndex, 0, draggedItem);
    
    onReorder(newItems);
  };

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No links added yet
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div
          key={item.id || index}
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, index)}
          className="flex items-center gap-2 p-3 border rounded-lg bg-background cursor-move hover:border-primary/50 transition-colors"
        >
          <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          
          <div className="flex-1 min-w-0">
            {renderItem(item)}
          </div>
          
          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onEdit(item)}
              className="h-8 w-8"
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onDelete(item)}
              className="h-8 w-8 text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
