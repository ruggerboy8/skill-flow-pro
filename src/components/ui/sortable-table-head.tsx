import React from 'react';
import { TableHead } from '@/components/ui/table';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { SortOrder } from '@/hooks/useTableSort';
import { cn } from '@/lib/utils';

interface SortableTableHeadProps {
  children: React.ReactNode;
  sortKey: string;
  currentSortKey: string;
  sortOrder: SortOrder;
  onSort: (key: string) => void;
  className?: string;
}

export function SortableTableHead({
  children,
  sortKey,
  currentSortKey,
  sortOrder,
  onSort,
  className,
}: SortableTableHeadProps) {
  const isActive = currentSortKey === sortKey;
  
  return (
    <TableHead
      className={cn(
        "cursor-pointer select-none hover:bg-muted/50 transition-colors",
        className
      )}
      onClick={() => onSort(sortKey)}
    >
      <div className="flex items-center justify-between">
        <span>{children}</span>
        <div className="ml-2 w-4 h-4 flex items-center justify-center">
          {isActive && sortOrder === 'asc' && (
            <ChevronUp className="h-3 w-3 text-muted-foreground" />
          )}
          {isActive && sortOrder === 'desc' && (
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          )}
          {(!isActive || sortOrder === null) && (
            <div className="h-3 w-3" /> // Placeholder to maintain spacing
          )}
        </div>
      </div>
    </TableHead>
  );
}