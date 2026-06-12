import { Bookmark, BookmarkCheck, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getDomainColor } from '@/lib/domainColors';

interface LibraryCardProps {
  actionId?: number;
  orgMoveId?: string;
  name: string;
  domainName: string;
  reason?: string;
  isOrgCustom?: boolean;
  isPinned?: boolean;
  onPin?: () => void;
  onSelect: () => void;
  hasActiveSlot?: boolean;
}

export function LibraryCard({
  actionId,
  orgMoveId,
  name,
  domainName,
  reason,
  isOrgCustom,
  isPinned,
  onPin,
  onSelect,
  hasActiveSlot,
}: LibraryCardProps) {
  const domainColor = getDomainColor(domainName);

  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'copy';
        e.dataTransfer.setData('application/json', JSON.stringify({
          actionId: actionId ?? null,
          orgMoveId: orgMoveId ?? null,
        }));
      }}
      className="group flex items-stretch gap-0 border rounded-lg bg-card hover:bg-muted/30 transition-colors cursor-grab active:cursor-grabbing overflow-hidden"
    >
      {/* Domain color edge */}
      <div
        className="w-1 flex-none"
        style={{ backgroundColor: domainColor }}
      />

      <div className="flex-1 min-w-0 p-3 space-y-1">
        {/* Domain label + custom marker */}
        <div className="flex items-center gap-1.5">
          <span
            className="text-2xs px-1.5 py-0.5 rounded font-medium"
            style={{ backgroundColor: domainColor }}
          >
            {domainName}
          </span>
          {isOrgCustom && (
            <span className="text-2xs px-1.5 py-0.5 rounded font-medium border border-primary/40 text-primary">
              Custom
            </span>
          )}
        </div>

        {/* Move name */}
        <p className="text-sm font-medium leading-snug line-clamp-2">{name}</p>

        {/* Reason line */}
        {reason && (
          <p className="text-xs text-muted-foreground italic leading-snug">{reason}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col items-center justify-center gap-1 px-2 flex-none">
        <GripVertical className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
        {onPin && (
          <button
            onClick={(e) => { e.stopPropagation(); onPin(); }}
            className="text-muted-foreground/50 hover:text-primary transition-colors"
            title={isPinned ? 'Remove from bench' : 'Pin to bench'}
          >
            {isPinned
              ? <BookmarkCheck className="h-4 w-4 text-primary" />
              : <Bookmark className="h-4 w-4" />
            }
          </button>
        )}
        <Button
          size="sm"
          variant={hasActiveSlot ? 'default' : 'outline'}
          className="h-6 text-xs px-2"
          onClick={onSelect}
        >
          Pick
        </Button>
      </div>
    </div>
  );
}
