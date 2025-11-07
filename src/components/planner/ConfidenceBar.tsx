import { cn } from '@/lib/utils';

interface ConfidenceBarProps {
  value: number | null; // 1-10 scale
  className?: string;
}

export function ConfidenceBar({ value, className }: ConfidenceBarProps) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  // Map 1-10 to 1-4 segments (1-2.5 = 1, 2.5-5 = 2, 5-7.5 = 3, 7.5-10 = 4)
  const segments = Math.min(4, Math.max(1, Math.ceil(value / 2.5)));

  return (
    <div className={cn("flex gap-0.5 items-center", className)}>
      {[1, 2, 3, 4].map((seg) => (
        <div
          key={seg}
          className={cn(
            "h-2 w-3 rounded-sm transition-colors",
            seg <= segments 
              ? "bg-primary" 
              : "bg-muted"
          )}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">
        {value.toFixed(1)}
      </span>
    </div>
  );
}
