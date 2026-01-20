import { cn } from '@/lib/utils';

interface DistributionBarProps {
  distribution: {
    one: number;
    two: number;
    three: number;
    four: number;
    total: number;
  };
  showLabels?: boolean;
  className?: string;
}

export function DistributionBar({ distribution, showLabels = true, className }: DistributionBarProps) {
  const { one, two, three, four, total } = distribution;
  
  if (total === 0) {
    return <div className="text-xs text-muted-foreground">No data</div>;
  }
  
  const p1 = Math.round((one / total) * 100);
  const p2 = Math.round((two / total) * 100);
  const p3 = Math.round((three / total) * 100);
  const p4 = Math.round((four / total) * 100);
  
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex h-3 w-full rounded-sm overflow-hidden">
        {p1 > 0 && (
          <div 
            className="bg-red-500 transition-all" 
            style={{ width: `${p1}%` }}
            title={`1: ${p1}%`}
          />
        )}
        {p2 > 0 && (
          <div 
            className="bg-orange-400 transition-all" 
            style={{ width: `${p2}%` }}
            title={`2: ${p2}%`}
          />
        )}
        {p3 > 0 && (
          <div 
            className="bg-amber-300 transition-all" 
            style={{ width: `${p3}%` }}
            title={`3: ${p3}%`}
          />
        )}
        {p4 > 0 && (
          <div 
            className="bg-green-500 transition-all" 
            style={{ width: `${p4}%` }}
            title={`4: ${p4}%`}
          />
        )}
      </div>
      
      {showLabels && (
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>1: {p1}%</span>
          <span>2: {p2}%</span>
          <span>3: {p3}%</span>
          <span>4: {p4}%</span>
        </div>
      )}
    </div>
  );
}
